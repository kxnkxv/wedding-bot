const { Keyboard } = require('vk-io');
const { notifyAdmins } = require('../../utils/notify.js');

const STATUS_EMOJI = {
  pending: '⏳',
  accepted: '✅',
  declined: '❌',
  maybe: '🤔',
};

const STATUS_TEXT = {
  pending: 'Ожидает ответа',
  accepted: 'Придёт',
  declined: 'Не придёт',
  maybe: 'Пока не уверен(а)',
};

function buildRsvpKeyboard(guestId) {
  return Keyboard.builder()
    .textButton({ label: '✅ Приду', payload: { action: 'rsvp', guest_id: guestId, status: 'accepted' }, color: 'positive' })
    .textButton({ label: '🤔 Думаю', payload: { action: 'rsvp', guest_id: guestId, status: 'maybe' }, color: 'primary' })
    .textButton({ label: '❌ Не смогу', payload: { action: 'rsvp', guest_id: guestId, status: 'declined' }, color: 'negative' })
    .oneTime();
}

async function sendNextPoll(ctx, userId, guestId) {
  const { vk, pollService } = ctx;
  if (!pollService) return;

  const activePolls = pollService.listActive();
  if (!activePolls.length) return;

  const answered = pollService.getGuestAnswers(guestId).map(a => a.poll_id);
  const unanswered = activePolls.filter(p => !answered.includes(p.id));
  if (!unanswered.length) return;

  const poll = unanswered[0];
  const options = JSON.parse(poll.options);

  const kb = Keyboard.builder();
  for (const opt of options) {
    kb.textButton({
      label: opt.length > 40 ? opt.substring(0, 37) + '...' : opt,
      payload: { action: 'poll_answer', poll_id: poll.id, guest_id: guestId, selected: [opt] },
      color: 'secondary',
    });
    kb.row();
  }
  kb.oneTime();

  await vk.api.messages.send({
    peer_id: userId,
    message: `📊 Вопрос: ${poll.question}`,
    keyboard: kb.toString(),
    random_id: Math.floor(Math.random() * 1e15),
  });
}

module.exports = function registerCommands(vk, ctx) {
  const { siteUrl, guestService, pollService, adminService } = ctx;

  // Helper: send message with explicit peer_id (context.send() may fail with handleWebhookUpdate)
  async function reply(context, message, opts = {}) {
    const peerId = context.peerId || context.senderId;
    if (!peerId) {
      console.error('VK reply: no peerId/senderId', JSON.stringify(context));
      return;
    }
    await vk.api.messages.send({
      peer_id: peerId,
      message,
      random_id: Math.floor(Math.random() * 1e15),
      ...opts,
    });
  }

  vk.updates.on('message_new', async (context, next) => {
    console.log('VK message_new from:', context.senderId, 'peerId:', context.peerId, 'text:', context.text);
    const userId = context.senderId;
    const text = (context.text || '').trim();

    let payload = null;
    try {
      payload = context.messagePayload || null;
    } catch (e) {
      payload = null;
    }

    // ── RSVP payload ──────────────────────────────────────────────────────────
    if (payload && payload.action === 'rsvp') {
      const { guest_id: guestId, status } = payload;
      const guest = guestService.getById(guestId);
      if (!guest) {
        await reply(context,'Гость не найден.');
        return;
      }

      guestService.updateRsvp(guestId, status);

      const emoji = STATUS_EMOJI[status] || '';
      const statusText = STATUS_TEXT[status] || status;

      await reply(context,`${emoji} Ваш ответ записан: ${statusText}\n\nСпасибо!`);

      await notifyAdmins({
        adminService,
        vk: vk.api,
        text: `📩 RSVP обновление (VK)!\n\nГость: ${guest.name}\nСтатус: ${emoji} ${statusText}`,
      });

      await sendNextPoll(ctx, userId, guestId);
      return;
    }

    // ── Poll answer payload ───────────────────────────────────────────────────
    if (payload && payload.action === 'poll_answer') {
      const { poll_id: pollId, guest_id: guestId, selected } = payload;
      const guest = guestService.getById(guestId);
      if (!guest) {
        await reply(context,'Гость не найден.');
        return;
      }

      try {
        pollService.answer(pollId, guestId, selected);
        await reply(context,`✅ Ответ записан: ${selected.join(', ')}`);
      } catch (e) {
        await reply(context,`Не удалось записать ответ: ${e.message}`);
        return;
      }

      await sendNextPoll(ctx, userId, guestId);
      return;
    }

    // ── Ref deep link (referralValue as guest_id) ─────────────────────────────
    if (context.referralValue) {
      const guestId = context.referralValue;
      const guest = guestService.getById(guestId);

      if (!guest) {
        await reply(context,'Приглашение не найдено. Возможно, ссылка устарела.');
        return;
      }

      const hasConflict = guestService.checkBindingConflict(guestId, 'vk', userId);
      if (hasConflict) {
        await reply(context,'Это приглашение уже привязано к другому аккаунту ВКонтакте.');
        return;
      }

      guestService.bindVk(guestId, userId);

      const greeting = guest.name ? `${guest.name}, ` : '';
      const personalPart = guest.personal_text ? `\n\n${guest.personal_text}` : '';

      await reply(context,
        `💌 ${greeting}спасибо, что открыли приглашение!${personalPart}\n\n` +
        `Мы — Артём и Полина — приглашаем вас на нашу свадьбу 1 августа 2026 года.\n\n` +
        `Пожалуйста, подтвердите своё присутствие:`,
        { keyboard: buildRsvpKeyboard(guestId).toString() }
      );
      return;
    }

    // ── 12-char code fallback ─────────────────────────────────────────────────
    if (/^[a-zA-Z0-9_-]{12}$/.test(text)) {
      const guest = guestService.getById(text);
      if (guest) {
        const hasConflict = guestService.checkBindingConflict(text, 'vk', userId);
        if (hasConflict) {
          await reply(context,'Это приглашение уже привязано к другому аккаунту ВКонтакте.');
          return;
        }

        guestService.bindVk(text, userId);

        const greeting = guest.name ? `${guest.name}, ` : '';
        const personalPart = guest.personal_text ? `\n\n${guest.personal_text}` : '';

        await reply(context,
          `💌 ${greeting}спасибо, что открыли приглашение!${personalPart}\n\n` +
          `Мы — Артём и Полина — приглашаем вас на нашу свадьбу 1 августа 2026 года.\n\n` +
          `Пожалуйста, подтвердите своё присутствие:`,
          { keyboard: buildRsvpKeyboard(text).toString() }
        );
        return;
      }
    }

    // ── Returning guest ───────────────────────────────────────────────────────
    const existingGuest = guestService.findByVkId(userId);
    if (existingGuest) {
      const webLink = siteUrl
        ? `${siteUrl}/?id=${existingGuest.id}`
        : null;

      let msg = `👋 С возвращением, ${existingGuest.name}!\n\nВаш текущий статус: ${STATUS_EMOJI[existingGuest.status] || ''} ${STATUS_TEXT[existingGuest.status] || existingGuest.status}`;
      if (webLink) msg += `\n\n🔗 Ваше приглашение:\n${webLink}`;

      await reply(context,msg, { keyboard: buildRsvpKeyboard(existingGuest.id).toString() });
      return;
    }

    // ── /link_account command ─────────────────────────────────────────────────
    if (text === '/link_account') {
      const guest = guestService.findByVkId(userId);
      if (!guest) { await reply(context,'Вы не привязаны ни к одному приглашению.'); return; }
      const code = guestService.generateLinkCode(guest.id);
      await reply(context,`🔗 Код для привязки: ${code}\n\nОтправьте этот код в Telegram-боте командой /link ${code}\n\n⏱ Код действует 5 минут.`);
      return;
    }

    // ── /link <code> command ──────────────────────────────────────────────────
    if (text.startsWith('/link ')) {
      const code = text.replace('/link ', '').trim();
      const result = guestService.redeemLinkCode(code, 'vk', userId);
      if (result.success) {
        await reply(context,`✅ Аккаунт привязан! Теперь вы будете получать уведомления и здесь.\n\nДобро пожаловать, ${result.guest.name}!`);
      } else {
        await reply(context,`❌ ${result.error}`);
      }
      return;
    }

    // ── Unknown user (not admin) ──────────────────────────────────────────────
    if (!adminService.isVkAdmin(userId)) {
      await reply(context,
        '💒 Свадьба Артёма и Полины\n1 августа 2026\n\n' +
        'У нас нет вашего приглашения. Отправьте код приглашения или перейдите по персональной ссылке.'
      );
      return;
    }

    return next();
  });
};
