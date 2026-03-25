const { Markup } = require('telegraf');
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

const STATUSES = ['accepted', 'declined', 'maybe'];

function buildRsvpKeyboard(currentStatus, guestId) {
  const buttons = STATUSES.map((s) => {
    const label = (s === currentStatus ? '● ' : '') + STATUS_EMOJI[s] + ' ' + STATUS_TEXT[s];
    return Markup.button.callback(label, `rsvp:${guestId}:${s}`);
  });
  return Markup.inlineKeyboard([buttons]);
}

module.exports = function registerCallbacks(bot) {
  bot.action(/^rsvp:(.+):(.+)$/, async (ctx) => {
    const { guests, admins } = ctx.services;
    const [, guestId, status] = ctx.match;

    const guest = guests.getById(guestId);
    if (!guest) {
      await ctx.answerCbQuery('Гость не найден.');
      return;
    }

    // Verify the caller is actually the bound guest
    if (guest.telegram_id !== ctx.from.id) {
      await ctx.answerCbQuery('Это не твоё приглашение.');
      return;
    }

    try {
      const updated = guests.updateRsvp(guestId, status);
      const statusLine = `${STATUS_EMOJI[status]} ${STATUS_TEXT[status]}`;

      await ctx.editMessageText(
        `Привет, ${updated.name}!\nТвой статус: ${statusLine}`,
        buildRsvpKeyboard(status, guestId)
      );

      const lateFlag = guests.isLateRsvp() ? ' ⚠️ (после дедлайна)' : '';
      await notifyAdmins({
        adminService: admins,
        telegram: ctx.telegram,
        text: `${STATUS_EMOJI[status]} Гость "${updated.name}" изменил статус на "${STATUS_TEXT[status]}"${lateFlag}`,
      });

      await ctx.answerCbQuery('Статус обновлён!');
    } catch (e) {
      await ctx.answerCbQuery('Ошибка при обновлении статуса.');
    }
  });

  bot.action('request_access', async (ctx) => {
    const { admins } = ctx.services;
    const user = ctx.from;
    const userInfo = user.username ? `@${user.username}` : `id: ${user.id}`;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

    await notifyAdmins({
      adminService: admins,
      telegram: ctx.telegram,
      text: `📩 Запрос доступа от ${fullName} (${userInfo}).\nНажмите "Одобрить" для создания приглашения.`,
      keyboard: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Одобрить', `approve:${user.id}`),
          Markup.button.callback('❌ Отклонить', `deny:${user.id}`),
        ],
      ]).reply_markup,
    });

    await ctx.answerCbQuery('Запрос отправлен');
    await ctx.reply('Запрос отправлен организаторам. Ожидайте ответа.');
  });

  // Poll answer via inline button: poll_answer:<pollId>:<guestId>:<option>
  bot.action(/^poll_answer:(\d+):(.+):(.+)$/, async (ctx) => {
    const pollId = Number(ctx.match[1]);
    const guestId = ctx.match[2];
    const option = ctx.match[3];
    const { polls } = ctx.services;

    try {
      polls.answer(pollId, guestId, [option]);
      const poll = polls.getById(pollId);
      const options = JSON.parse(poll.options);

      // Rebuild buttons with selected one marked
      const buttons = options.map(opt => {
        const label = opt === option ? `● ${opt}` : opt;
        return [Markup.button.callback(label, `poll_answer:${pollId}:${guestId}:${opt}`)];
      });

      await ctx.editMessageText(
        `📊 ${poll.question}\n\n✅ Твой ответ: ${option}`,
        Markup.inlineKeyboard(buttons)
      );
      await ctx.answerCbQuery(`Ответ: ${option}`);
    } catch (e) {
      await ctx.answerCbQuery(e.message);
    }
  });
};
