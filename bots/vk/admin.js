module.exports = function registerAdminCommands(vk, ctx) {
  const { siteUrl, guestService, pollService, adminService, checklistService } = ctx;

  async function reply(context, message, opts = {}) {
    const peerId = context.peerId || context.senderId;
    if (!peerId) return;
    await vk.api.messages.send({
      peer_id: peerId,
      message,
      random_id: Math.floor(Math.random() * 1e15),
      ...opts,
    });
  }

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

  function guestWebLink(guest) {
    if (!siteUrl) return null;
    return `${siteUrl}/?id=${guest.id}`;
  }

  function chunkMessage(text, maxLen = 4096) {
    const chunks = [];
    while (text.length > maxLen) {
      let idx = text.lastIndexOf('\n', maxLen);
      if (idx <= 0) idx = maxLen;
      chunks.push(text.substring(0, idx));
      text = text.substring(idx).trimStart();
    }
    if (text.length) chunks.push(text);
    return chunks;
  }

  async function sendChunked(context, text) {
    const chunks = chunkMessage(text);
    for (const chunk of chunks) {
      await reply(context,chunk);
    }
  }

  vk.updates.on('message_new', async (context, next) => {
    const userId = context.senderId;
    if (!adminService.isVkAdmin(userId)) return next();

    const text = (context.text || '').trim();

    // ── /addguest Имя | Текст ────────────────────────────────────────────────
    if (text.startsWith('/addguest')) {
      const arg = text.replace('/addguest', '').trim();
      if (!arg) {
        await reply(context,
          '📝 Формат:\n/addguest Имя | Персональный текст\n\n' +
          'Пример:\n/addguest Мария Иванова | Дорогая Маша, ждём тебя!\n/addguest Алексей Смирнов'
        );
        return;
      }

      const parts = arg.split('|').map(s => s.trim());
      const name = parts[0];
      const personalText = parts[1] || null;

      const guest = guestService.create(name, personalText);
      const link = guestWebLink(guest);

      let msg = `✅ Гость добавлен!\n\n👤 ${guest.name}\nID: ${guest.id}`;
      if (personalText) msg += `\n💬 ${personalText}`;
      if (link) msg += `\n\n🔗 Ссылка:\n${link}`;

      await reply(context,msg);
      return;
    }

    // ── /guests ──────────────────────────────────────────────────────────────
    if (text === '/guests') {
      const guests = guestService.listAll();
      if (!guests.length) {
        await reply(context,'Список гостей пуст. Добавьте гостей через /addguest');
        return;
      }

      let msg = `📋 Гости (${guests.length}):\n\n`;
      for (const g of guests) {
        const emoji = STATUS_EMOJI[g.status] || '❓';
        const vkMark = g.vk_id ? ' [VK]' : '';
        msg += `${emoji} ${g.name}${vkMark}\n   ID: ${g.id} | ${STATUS_TEXT[g.status] || g.status}\n\n`;
      }

      await sendChunked(context, msg);
      return;
    }

    // ── /stats ───────────────────────────────────────────────────────────────
    if (text === '/stats') {
      const stats = guestService.getStats();
      const total = stats.total;
      const pct = total ? Math.round(((total - stats.pending) / total) * 100) : 0;

      await reply(context,
        `📊 Статистика RSVP\n\n` +
        `Всего гостей: ${total}\n\n` +
        `✅ Придут: ${stats.accepted}\n` +
        `🤔 Думают: ${stats.maybe}\n` +
        `❌ Не придут: ${stats.declined}\n` +
        `⏳ Не ответили: ${stats.pending}\n\n` +
        `Процент ответивших: ${pct}%`
      );
      return;
    }

    // ── /link <id> ───────────────────────────────────────────────────────────
    if (text.startsWith('/link')) {
      const guestId = text.replace('/link', '').trim();
      if (!guestId) {
        await reply(context,'Укажите ID гостя: /link <id>');
        return;
      }

      const guest = guestService.getById(guestId);
      if (!guest) {
        await reply(context,'Гость не найден. Проверьте ID.');
        return;
      }

      const link = guestWebLink(guest);
      let msg = `🔗 Ссылка для ${guest.name}:`;
      if (link) msg += `\n${link}`;
      else msg += '\n(siteUrl не настроен)';

      await reply(context,msg);
      return;
    }

    // ── /remove <id> ─────────────────────────────────────────────────────────
    if (text.startsWith('/remove')) {
      const guestId = text.replace('/remove', '').trim();
      if (!guestId) {
        await reply(context,'Укажите ID гостя: /remove <id>');
        return;
      }

      const guest = guestService.getById(guestId);
      if (!guest) {
        await reply(context,'Гость не найден.');
        return;
      }

      guestService.remove(guestId);
      await reply(context,`🗑 Гость "${guest.name}" удалён.`);
      return;
    }

    // ── /unbind <id> ─────────────────────────────────────────────────────────
    if (text.startsWith('/unbind')) {
      const guestId = text.replace('/unbind', '').trim();
      if (!guestId) {
        await reply(context,'Укажите ID гостя: /unbind <id>');
        return;
      }

      const guest = guestService.getById(guestId);
      if (!guest) {
        await reply(context,'Гость не найден.');
        return;
      }

      guestService.unbind(guestId);
      await reply(context,`🔓 Привязка для "${guest.name}" снята.`);
      return;
    }

    // ── /broadcast Текст ─────────────────────────────────────────────────────
    if (text.startsWith('/broadcast')) {
      const msg = text.replace('/broadcast', '').trim();
      if (!msg) {
        await reply(context,'Формат: /broadcast Текст сообщения');
        return;
      }

      const guests = guestService.listAll().filter(g => g.vk_id);
      let sent = 0;
      const failedNames = [];

      for (const guest of guests) {
        try {
          await vk.api.messages.send({
            peer_id: guest.vk_id,
            message: `💌 ${msg}`,
            random_id: Math.floor(Math.random() * 1e9),
          });
          sent++;
        } catch (e) {
          failedNames.push(guest.name);
        }
      }

      let report = `📢 Рассылка завершена!\n✅ Доставлено: ${sent}`;
      if (failedNames.length) {
        report += `\n❌ Не доставлено (${failedNames.length}):\n${failedNames.join(', ')}`;
      }

      await reply(context,report);
      return;
    }

    // ── /addpoll [--multi] Вопрос | Вариант1, Вариант2 ───────────────────────
    if (text.startsWith('/addpoll')) {
      let arg = text.replace('/addpoll', '').trim();
      let multiple = false;

      if (arg.startsWith('--multi')) {
        multiple = true;
        arg = arg.replace('--multi', '').trim();
      }

      if (!arg || !arg.includes('|')) {
        await reply(context,
          'Формат: /addpoll [--multi] Вопрос | Вариант1, Вариант2\n\n' +
          'Пример:\n/addpoll Выберите меню | Мясо, Рыба, Вегетарианское'
        );
        return;
      }

      const sepIdx = arg.indexOf('|');
      const question = arg.substring(0, sepIdx).trim();
      const optionsRaw = arg.substring(sepIdx + 1).trim();
      const options = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);

      if (!question || options.length < 2) {
        await reply(context,'Нужен вопрос и минимум 2 варианта ответа.');
        return;
      }

      const poll = pollService.create(question, options, multiple);
      await reply(context,
        `✅ Опрос создан!\nID: ${poll.id}\nВопрос: ${poll.question}\nВарианты: ${options.join(', ')}\n${multiple ? '(множественный выбор)' : ''}\n\n📤 Рассылаю гостям...`
      );

      // Рассылка опроса всем VK-гостям
      const { Keyboard } = require('vk-io');
      const allGuests = guestService.listAll().filter(g => g.vk_id);
      let sent = 0;
      const failedNames = [];
      for (const g of allGuests) {
        try {
          const kb = Keyboard.builder();
          for (const opt of options) {
            kb.textButton({ label: opt, payload: { action: 'poll_answer', poll_id: poll.id, guest_id: g.id, selected: [opt] }, color: 'secondary' });
          }
          await vk.api.messages.send({
            peer_id: g.vk_id,
            message: `📊 Новый опрос!\n\n${question}${multiple ? '\n(можно выбрать несколько)' : ''}`,
            keyboard: kb.oneTime(),
            random_id: Math.floor(Math.random() * 1e9),
          });
          sent++;
        } catch { failedNames.push(g.name); }
      }

      let report = `📤 Опрос разослан в VK: ${sent} из ${allGuests.length}`;
      if (failedNames.length) report += `\n❌ Не доставлено: ${failedNames.join(', ')}`;
      await reply(context,report);
      return;
    }

    // ── /polls ───────────────────────────────────────────────────────────────
    if (text === '/polls') {
      const polls = pollService.listAll();
      if (!polls.length) {
        await reply(context,'Опросов нет.');
        return;
      }

      let msg = `📊 Опросы (${polls.length}):\n\n`;
      for (const poll of polls) {
        const status = poll.active ? '🟢 активен' : '🔴 закрыт';
        msg += `[${poll.id}] ${status}\n${poll.question}\n`;

        const results = pollService.getResults(poll.id);
        if (results) {
          for (const [opt, count] of Object.entries(results)) {
            msg += `  • ${opt}: ${count}\n`;
          }
        }
        msg += '\n';
      }

      await sendChunked(context, msg);
      return;
    }

    // ── /closepoll <id> ──────────────────────────────────────────────────────
    if (text.startsWith('/closepoll')) {
      const pollIdStr = text.replace('/closepoll', '').trim();
      const pollId = Number(pollIdStr);
      if (!pollIdStr || isNaN(pollId)) {
        await reply(context,'Укажите ID опроса: /closepoll <id>');
        return;
      }

      const poll = pollService.getById(pollId);
      if (!poll) {
        await reply(context,'Опрос не найден.');
        return;
      }

      pollService.close(pollId);
      await reply(context,`🔒 Опрос "${poll.question}" закрыт.`);
      return;
    }

    // ── /addadmin [Имя] ──────────────────────────────────────────────────────
    if (text.startsWith('/addadmin')) {
      const name = text.replace('/addadmin', '').trim() || null;
      const admin = adminService.addVk(userId, name);
      await reply(context,`✅ VK-администратор добавлен!\nID записи: ${admin.id}\nVK ID: ${userId}${name ? `\nИмя: ${name}` : ''}`);
      return;
    }

    // ── /removeadmin <id> ────────────────────────────────────────────────────
    if (text.startsWith('/removeadmin')) {
      const adminIdStr = text.replace('/removeadmin', '').trim();
      const adminId = Number(adminIdStr);
      if (!adminIdStr || isNaN(adminId)) {
        await reply(context,'Укажите ID записи администратора: /removeadmin <id>');
        return;
      }

      adminService.remove(adminId);
      await reply(context,`🗑 Администратор с ID ${adminId} удалён.`);
      return;
    }

    // ── /myid ─────────────────────────────────────────────────────────────────
    if (text === '/myid') {
      await reply(context,`Ваш VK ID: ${userId}`);
      return;
    }

    // ── /checklist [tab] ─────────────────────────────────────────────────────
    if (text.startsWith('/checklist')) {
      if (!checklistService) {
        await reply(context,'Сервис чеклиста недоступен.');
        return;
      }

      const tab = text.replace('/checklist', '').trim() || null;
      const items = tab ? checklistService.listByTab(tab) : checklistService.listAll();

      if (!items || !items.length) {
        await reply(context,'Чеклист пуст.');
        return;
      }

      let msg = `📋 Чеклист${tab ? ` [${tab}]` : ''}:\n\n`;
      for (const item of items) {
        const done = item.done ? '✅' : '⬜';
        msg += `${done} [${item.id}] ${item.category ? `(${item.category}) ` : ''}${item.text}`;
        if (item.note) msg += ` — ${item.note}`;
        msg += '\n';
      }

      await sendChunked(context, msg);
      return;
    }

    // ── /check <id> ──────────────────────────────────────────────────────────
    if (text.startsWith('/check ') || text === '/check') {
      if (!checklistService) {
        await reply(context,'Сервис чеклиста недоступен.');
        return;
      }

      const itemId = text.replace('/check', '').trim();
      if (!itemId) {
        await reply(context,'Укажите ID задачи: /check <id>');
        return;
      }

      checklistService.setDone(itemId, true);
      await reply(context,`✅ Задача ${itemId} отмечена как выполненная.`);
      return;
    }

    // ── /uncheck <id> ────────────────────────────────────────────────────────
    if (text.startsWith('/uncheck ') || text === '/uncheck') {
      if (!checklistService) {
        await reply(context,'Сервис чеклиста недоступен.');
        return;
      }

      const itemId = text.replace('/uncheck', '').trim();
      if (!itemId) {
        await reply(context,'Укажите ID задачи: /uncheck <id>');
        return;
      }

      checklistService.setDone(itemId, false);
      await reply(context,`⬜ Задача ${itemId} отмечена как невыполненная.`);
      return;
    }

    // ── /addtask tab | cat | text | note ────────────────────────────────────
    if (text.startsWith('/addtask')) {
      if (!checklistService) {
        await reply(context,'Сервис чеклиста недоступен.');
        return;
      }

      const arg = text.replace('/addtask', '').trim();
      if (!arg) {
        await reply(context,'Формат: /addtask вкладка | категория | текст | заметка');
        return;
      }

      const parts = arg.split('|').map(s => s.trim());
      const [tab, category, taskText, note] = parts;

      if (!tab || !taskText) {
        await reply(context,'Укажите минимум вкладку и текст задачи: /addtask вкладка | категория | текст');
        return;
      }

      const item = checklistService.addCustom({ tab, category: category || null, text: taskText, note: note || null });
      await reply(context,`✅ Задача добавлена! ID: ${item.id}\n${tab} / ${category || '—'}: ${taskText}`);
      return;
    }

    // ── /removetask <id> ─────────────────────────────────────────────────────
    if (text.startsWith('/removetask')) {
      if (!checklistService) {
        await reply(context,'Сервис чеклиста недоступен.');
        return;
      }

      const itemId = text.replace('/removetask', '').trim();
      if (!itemId) {
        await reply(context,'Укажите ID задачи: /removetask <id>');
        return;
      }

      checklistService.removeCustom(itemId);
      await reply(context,`🗑 Задача ${itemId} удалена.`);
      return;
    }

    // ── /remind ──────────────────────────────────────────────────────────────
    if (text === '/remind') {
      const pending = guestService.listAll().filter(g => g.status === 'pending' && g.vk_id);

      if (pending.length === 0) {
        await reply(context,'🎉 Все гости ответили!');
        return;
      }

      await reply(context,`📤 Отправляю напоминания ${pending.length} гостям...`);

      const { Keyboard } = require('vk-io');
      let sent = 0;
      const failedNames = [];

      for (const g of pending) {
        const webLink = siteUrl + '/?id=' + g.id;
        const msg = '💌 Напоминаем о приглашении на свадьбу Артёма и Полины!\n\n' +
          '1 августа 2026 года мы ждём вас.\n\n' +
          'Пожалуйста, подтвердите своё присутствие:\n' + webLink;

        try {
          const kb = Keyboard.builder();
          kb.textButton({ label: '✅ Приду!', payload: { action: 'rsvp', guest_id: g.id, status: 'accepted' }, color: 'positive' });
          kb.textButton({ label: '🤔 Думаю', payload: { action: 'rsvp', guest_id: g.id, status: 'maybe' }, color: 'secondary' });
          kb.textButton({ label: '❌ Не смогу', payload: { action: 'rsvp', guest_id: g.id, status: 'declined' }, color: 'negative' });
          await vk.api.messages.send({
            peer_id: g.vk_id,
            message: msg,
            keyboard: kb.oneTime(),
            random_id: Math.floor(Math.random() * 1e9),
          });
          sent++;
        } catch { failedNames.push(g.name + ' (VK)'); }
      }

      let report = '📤 Напоминания отправлены: ' + sent + ' из ' + pending.length;
      if (failedNames.length) report += '\n❌ Не доставлено:\n' + failedNames.join('\n');
      await reply(context,report);
      return;
    }

    // Not an admin command — pass to next handler
    return next();
  });
};
