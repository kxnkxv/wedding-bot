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

function inviteUrl(siteUrl, guestId) {
  return `${siteUrl}/?id=${guestId}`;
}

function buildRsvpKeyboard(currentStatus, guestId) {
  const buttons = STATUSES.map((s) => {
    const label = (s === currentStatus ? '● ' : '') + STATUS_EMOJI[s] + ' ' + STATUS_TEXT[s];
    return Markup.button.callback(label, `rsvp:${guestId}:${s}`);
  });
  return Markup.inlineKeyboard([buttons]);
}

module.exports = function registerCommands(bot) {
  bot.command('start', async (ctx) => {
    const { guests, admins } = ctx.services;
    const siteUrl = ctx.siteUrl;
    const telegramId = ctx.from.id;
    const username = ctx.from.username || null;
    const payload = ctx.message.text.split(' ')[1] || '';

    if (payload) {
      const guestId = payload.trim();
      const guest = guests.getById(guestId);

      if (!guest) {
        return ctx.reply('Приглашение не найдено. Обратитесь к организаторам.');
      }

      const conflict = guests.checkBindingConflict(guestId, 'telegram', telegramId);
      if (conflict) {
        await notifyAdmins({
          adminService: admins,
          telegram: ctx.telegram,
          text: `⚠️ Конфликт привязки! Гость "${guest.name}" (id: ${guestId}) уже привязан к другому аккаунту. Новый пользователь: @${username || telegramId} (id: ${telegramId})`,
        });
        return ctx.reply('Это приглашение уже привязано к другому аккаунту. Организаторы уведомлены.');
      }

      guests.bindTelegram(guestId, telegramId, username);
      const url = inviteUrl(siteUrl, guestId);

      return ctx.reply(
        `💌 ${guest.name}, спасибо, что открыл(а) приглашение!\n\nМы — Артём и Полина — приглашаем тебя на нашу свадьбу 1 августа 2026 года.`,
        Markup.inlineKeyboard([
          [Markup.button.url('🎉 Открыть приглашение', url)],
        ])
      );
    }

    // No payload
    const boundGuest = guests.findByTelegramId(telegramId);
    if (boundGuest) {
      const url = inviteUrl(siteUrl, boundGuest.id);
      return ctx.reply(
        `С возвращением, ${boundGuest.name}! 💒`,
        Markup.inlineKeyboard([
          [Markup.button.url('🎉 Открыть приглашение', url)],
        ])
      );
    }

    if (admins.isTelegramAdmin(telegramId)) {
      return ctx.reply(
        '👋 Панель управления\n\n' +
        '📋 Гости:\n' +
        '/addguest — добавить гостя\n' +
        '/import — массовый импорт\n' +
        '/guests — список гостей\n' +
        '/search — поиск по имени\n' +
        '/filter — фильтр (accepted/pending/telegram/vk)\n' +
        '/info — подробная карточка гостя\n' +
        '/remove — удалить гостя\n\n' +
        '📊 Статистика:\n' +
        '/stats — общая статистика RSVP\n' +
        '/export — выгрузить CSV\n\n' +
        '🔗 Ссылки:\n' +
        '/link — ссылки для гостя\n' +
        '/unbind — отвязать аккаунт\n\n' +
        '📢 Рассылки:\n' +
        '/broadcast — отправить всем\n' +
        '/remind — напомнить не ответившим\n' +
        '/templates — шаблоны рассылок\n\n' +
        '📊 Опросы:\n' +
        '/addpoll — создать опрос\n' +
        '/polls — список опросов\n' +
        '/closepoll — закрыть опрос\n\n' +
        '🏷 Теги и заметки:\n' +
        '/tag — добавить тег гостю\n' +
        '/tags — просмотр тегов\n' +
        '/note — добавить заметку\n' +
        '/notes — просмотр заметок\n\n' +
        '🪑 Рассадка:\n' +
        '/seat — посадить за стол\n' +
        '/seating — план рассадки\n\n' +
        '✅ Чеклист:\n' +
        '/checklist — просмотр\n' +
        '/check /uncheck — отметить пункт\n' +
        '/addtask /removetask — свои пункты\n\n' +
        '👤 Админы:\n' +
        '/addadmin — добавить админа\n' +
        '/removeadmin — удалить\n' +
        '/myid — узнать свой ID\n' +
        '/backup — скачать базу данных'
      );
    }

    return ctx.reply(
      'Нет приглашения. Если у тебя есть приглашение — перейди по ссылке.',
      Markup.inlineKeyboard([
        [Markup.button.callback('✉️ Написать организаторам', 'request_access')],
      ])
    );
  });

  bot.command('status', async (ctx) => {
    const { guests } = ctx.services;
    const telegramId = ctx.from.id;
    const guest = guests.findByTelegramId(telegramId);

    if (!guest) {
      return ctx.reply('Ты не привязан(а) к приглашению. Используй ссылку-приглашение.');
    }

    const statusLine = `${STATUS_EMOJI[guest.status]} ${STATUS_TEXT[guest.status]}`;
    return ctx.reply(
      `Привет, ${guest.name}!\nТвой статус: ${statusLine}`,
      buildRsvpKeyboard(guest.status, guest.id)
    );
  });

  bot.command('myid', async (ctx) => {
    return ctx.reply(`Твой Telegram ID: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
  });

  bot.command('link_account', async (ctx) => {
    const { guests } = ctx.services;
    const guest = guests.findByTelegramId(ctx.from.id);
    if (!guest) return ctx.reply('Ты не привязан(а) ни к одному приглашению.');

    const code = guests.generateLinkCode(guest.id);
    await ctx.reply(
      `🔗 Код для привязки аккаунта: *${code}*\n\n` +
      `Чтобы привязать VK:\n` +
      `1. Откройте VK-бота\n` +
      `2. Отправьте команду: /link ${code}\n\n` +
      `⏱ Код действует 5 минут.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('link', async (ctx) => {
    const { guests } = ctx.services;
    const code = ctx.message.text.replace('/link', '').trim();
    if (!code) return ctx.reply('Формат: /link XXXXXX');

    const result = guests.redeemLinkCode(code, 'telegram', ctx.from.id);
    if (result.success) {
      await ctx.reply(`✅ Аккаунт привязан! Добро пожаловать, ${result.guest.name}!`);
    } else {
      await ctx.reply(`❌ ${result.error}`);
    }
  });
};
