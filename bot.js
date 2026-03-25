const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ─── Конфигурация ───────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => Number(id.trim())).filter(Boolean);
const SITE_URL = process.env.SITE_URL || 'https://your-site.com/wedding-invitation.html';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан! Укажи его в .env или переменных окружения.');
  process.exit(1);
}

if (ADMIN_IDS.length === 0) {
  console.warn('⚠️  ADMIN_IDS не задан. Используй /myid чтобы узнать свой ID.');
}

const bot = new Telegraf(BOT_TOKEN);

// ─── Хранилище гостей ───────────────────────────────────────
const GUESTS_FILE = path.join(__dirname, 'guests.json');

function loadGuests() {
  try {
    if (fs.existsSync(GUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(GUESTS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Ошибка чтения guests.json:', e.message);
  }
  return {};
}

function saveGuests(guests) {
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2), 'utf-8');
}

function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

function isAdmin(ctx) {
  return ADMIN_IDS.includes(ctx.from.id);
}

// ─── Форматирование ─────────────────────────────────────────
const STATUS_EMOJI = {
  pending: '⏳',
  accepted: '✅',
  declined: '❌',
  maybe: '🤔'
};

const STATUS_TEXT = {
  pending: 'Ожидает ответа',
  accepted: 'Придёт',
  declined: 'Не придёт',
  maybe: 'Пока не уверен(а)'
};

// ─── /start — для гостей (deep link) и общий ────────────────
bot.start(async (ctx) => {
  const payload = ctx.startPayload; // guest ID из deep link

  if (payload) {
    const guests = loadGuests();
    const guest = guests[payload];

    if (!guest) {
      return ctx.reply('Приглашение не найдено. Возможно, ссылка устарела.');
    }

    // Сохраняем Telegram ID гостя
    guest.telegramId = ctx.from.id;
    guest.telegramUsername = ctx.from.username || null;
    saveGuests(guests);

    const greeting = guest.name ? `${guest.name}, ` : '';

    await ctx.reply(
      `💌 ${greeting}спасибо, что открыли приглашение!\n\n` +
      `Мы — Артём и Полина — приглашаем вас на нашу свадьбу 1 августа 2026 года.\n\n` +
      `Пожалуйста, подтвердите своё присутствие:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ С радостью приду!', `rsvp:${payload}:accepted`)],
        [Markup.button.callback('🤔 Пока не уверен(а)', `rsvp:${payload}:maybe`)],
        [Markup.button.callback('❌ К сожалению, не смогу', `rsvp:${payload}:declined`)],
      ])
    );
    return;
  }

  // Обычный /start без payload
  if (isAdmin(ctx)) {
    await ctx.reply(
      `👋 Привет! Ты в панели управления свадебным ботом.\n\n` +
      `📋 Команды:\n` +
      `/addguest — добавить гостя\n` +
      `/guests — список всех гостей\n` +
      `/stats — статистика ответов\n` +
      `/link — получить ссылку для гостя\n` +
      `/remove — удалить гостя\n` +
      `/myid — узнать свой Telegram ID`
    );
  } else {
    await ctx.reply(
      `💒 Свадьба Артёма и Полины\n1 августа 2026\n\n` +
      `Если вы получили персональную ссылку — перейдите по ней, чтобы подтвердить присутствие.`
    );
  }
});

// ─── RSVP callback ──────────────────────────────────────────
bot.action(/^rsvp:(.+):(.+)$/, async (ctx) => {
  const guestId = ctx.match[1];
  const status = ctx.match[2];

  const guests = loadGuests();
  const guest = guests[guestId];

  if (!guest) {
    return ctx.answerCbQuery('Гость не найден');
  }

  const previousStatus = guest.status;
  guest.status = status;
  guest.respondedAt = new Date().toISOString();
  saveGuests(guests);

  const emoji = STATUS_EMOJI[status];
  const text = STATUS_TEXT[status];

  await ctx.editMessageText(
    `${emoji} ${guest.name}, ваш ответ записан: ${text}\n\n` +
    `Если передумаете — просто нажмите нужную кнопку:`,
    Markup.inlineKeyboard([
      [Markup.button.callback(
        `${status === 'accepted' ? '● ' : ''}✅ С радостью приду!`,
        `rsvp:${guestId}:accepted`
      )],
      [Markup.button.callback(
        `${status === 'maybe' ? '● ' : ''}🤔 Пока не уверен(а)`,
        `rsvp:${guestId}:maybe`
      )],
      [Markup.button.callback(
        `${status === 'declined' ? '● ' : ''}❌ К сожалению, не смогу`,
        `rsvp:${guestId}:declined`
      )],
    ])
  );

  await ctx.answerCbQuery(`Ответ сохранён: ${text}`);

  // Уведомляем админов
  if (previousStatus !== status) {
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(
          adminId,
          `📩 Обновление RSVP!\n\n` +
          `Гость: ${guest.name}\n` +
          `Статус: ${emoji} ${text}\n` +
          `${guest.telegramUsername ? `Telegram: @${guest.telegramUsername}` : ''}`
        );
      } catch (e) {
        // Админ мог не начать чат с ботом
      }
    }
  }
});

// ─── /addguest — добавить гостя ─────────────────────────────
bot.command('addguest', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const text = ctx.message.text.replace('/addguest', '').trim();

  if (!text) {
    return ctx.reply(
      `📝 Формат:\n` +
      `/addguest Имя | Персональный текст\n\n` +
      `Примеры:\n` +
      `/addguest Мария Иванова | Дорогая Маша, мы так ждём тебя!\n` +
      `/addguest Семья Петровых | Дорогие Петровы, ждём вас всей семьёй!\n` +
      `/addguest Алексей Смирнов\n\n` +
      `Персональный текст — необязательно.`
    );
  }

  const parts = text.split('|').map(s => s.trim());
  const name = parts[0];
  const personalText = parts[1] || '';

  const id = generateId();
  const guests = loadGuests();

  guests[id] = {
    id,
    name,
    personalText,
    status: 'pending',
    createdAt: new Date().toISOString(),
    telegramId: null,
    telegramUsername: null,
    respondedAt: null
  };

  saveGuests(guests);

  const link = `${SITE_URL}?id=${id}&name=${encodeURIComponent(name)}&text=${encodeURIComponent(personalText)}`;
  const botLink = `https://t.me/${(await bot.telegram.getMe()).username}?start=${id}`;

  await ctx.reply(
    `✅ Гость добавлен!\n\n` +
    `👤 ${name}\n` +
    `${personalText ? `💬 ${personalText}\n` : ''}` +
    `🆔 ${id}\n\n` +
    `🔗 Ссылка на приглашение:\n${link}\n\n` +
    `🤖 Прямая ссылка на бота:\n${botLink}`
  );
});

// ─── /guests — список гостей ────────────────────────────────
bot.command('guests', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const guests = loadGuests();
  const list = Object.values(guests);

  if (list.length === 0) {
    return ctx.reply('Список гостей пуст. Добавьте гостей через /addguest');
  }

  // Сортируем: сначала pending, потом accepted, maybe, declined
  const order = { pending: 0, accepted: 1, maybe: 2, declined: 3 };
  list.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  let message = `📋 Гости (${list.length}):\n\n`;

  for (const g of list) {
    const emoji = STATUS_EMOJI[g.status] || '❓';
    const username = g.telegramUsername ? ` (@${g.telegramUsername})` : '';
    message += `${emoji} ${g.name}${username}\n`;
    message += `   ID: ${g.id} | ${STATUS_TEXT[g.status]}\n\n`;
  }

  // Разбиваем на части если сообщение длинное
  if (message.length > 4000) {
    const chunks = message.match(/[\s\S]{1,4000}/g);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } else {
    await ctx.reply(message);
  }
});

// ─── /stats — статистика ────────────────────────────────────
bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const guests = loadGuests();
  const list = Object.values(guests);

  const total = list.length;
  const accepted = list.filter(g => g.status === 'accepted').length;
  const declined = list.filter(g => g.status === 'declined').length;
  const maybe = list.filter(g => g.status === 'maybe').length;
  const pending = list.filter(g => g.status === 'pending').length;

  await ctx.reply(
    `📊 Статистика RSVP\n\n` +
    `Всего гостей: ${total}\n\n` +
    `✅ Придут: ${accepted}\n` +
    `🤔 Думают: ${maybe}\n` +
    `❌ Не придут: ${declined}\n` +
    `⏳ Не ответили: ${pending}\n\n` +
    `Процент ответивших: ${total ? Math.round(((total - pending) / total) * 100) : 0}%`
  );
});

// ─── /link — получить ссылку ────────────────────────────────
bot.command('link', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const guestId = ctx.message.text.replace('/link', '').trim();

  if (!guestId) {
    const guests = loadGuests();
    const list = Object.values(guests);

    if (list.length === 0) {
      return ctx.reply('Список гостей пуст.');
    }

    // Показываем кнопки для выбора гостя
    const buttons = list.map(g => [
      Markup.button.callback(`${STATUS_EMOJI[g.status]} ${g.name}`, `getlink:${g.id}`)
    ]);

    return ctx.reply('Выберите гостя:', Markup.inlineKeyboard(buttons));
  }

  const guests = loadGuests();
  const guest = guests[guestId];

  if (!guest) {
    return ctx.reply('Гость не найден. Проверьте ID.');
  }

  const link = `${SITE_URL}?id=${guest.id}&name=${encodeURIComponent(guest.name)}&text=${encodeURIComponent(guest.personalText || '')}`;
  const botUsername = (await bot.telegram.getMe()).username;
  const botLink = `https://t.me/${botUsername}?start=${guest.id}`;

  await ctx.reply(
    `🔗 Ссылки для ${guest.name}:\n\n` +
    `Приглашение:\n${link}\n\n` +
    `Прямая ссылка на бота:\n${botLink}`
  );
});

bot.action(/^getlink:(.+)$/, async (ctx) => {
  const guestId = ctx.match[1];
  const guests = loadGuests();
  const guest = guests[guestId];

  if (!guest) {
    return ctx.answerCbQuery('Гость не найден');
  }

  const link = `${SITE_URL}?id=${guest.id}&name=${encodeURIComponent(guest.name)}&text=${encodeURIComponent(guest.personalText || '')}`;
  const botUsername = (await bot.telegram.getMe()).username;
  const botLink = `https://t.me/${botUsername}?start=${guest.id}`;

  await ctx.editMessageText(
    `🔗 Ссылки для ${guest.name}:\n\n` +
    `Приглашение:\n${link}\n\n` +
    `Прямая ссылка на бота:\n${botLink}`
  );
  await ctx.answerCbQuery();
});

// ─── /remove — удалить гостя ────────────────────────────────
bot.command('remove', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const guestId = ctx.message.text.replace('/remove', '').trim();

  if (!guestId) {
    return ctx.reply('Укажите ID гостя: /remove abc123\nID можно узнать в /guests');
  }

  const guests = loadGuests();

  if (!guests[guestId]) {
    return ctx.reply('Гость не найден. Проверьте ID.');
  }

  const name = guests[guestId].name;
  delete guests[guestId];
  saveGuests(guests);

  await ctx.reply(`🗑 Гость "${name}" удалён.`);
});

// ─── /myid — узнать свой ID ─────────────────────────────────
bot.command('myid', async (ctx) => {
  await ctx.reply(`Ваш Telegram ID: ${ctx.from.id}\n\nДобавьте его в ADMIN_IDS в .env файле.`);
});

// ─── /broadcast — рассылка напоминания ──────────────────────
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const text = ctx.message.text.replace('/broadcast', '').trim();

  if (!text) {
    return ctx.reply(
      `📢 Рассылка сообщения всем гостям.\n\n` +
      `Формат: /broadcast Текст сообщения\n\n` +
      `Пример:\n/broadcast Напоминаем — свадьба уже через неделю! Ждём вас 1 августа в 15:00 ❤️`
    );
  }

  const guests = loadGuests();
  const list = Object.values(guests).filter(g => g.telegramId);
  let sent = 0;
  let failed = 0;

  for (const guest of list) {
    try {
      await bot.telegram.sendMessage(guest.telegramId, `💌 ${text}`);
      sent++;
    } catch (e) {
      failed++;
    }
  }

  await ctx.reply(`📢 Рассылка завершена!\n✅ Доставлено: ${sent}\n❌ Не доставлено: ${failed}`);
});

// ─── Запуск ─────────────────────────────────────────────────
bot.launch()
  .then(() => {
    console.log('🤖 Бот запущен!');
    return bot.telegram.getMe();
  })
  .then(botInfo => {
    console.log(`📛 Username: @${botInfo.username}`);
    console.log(`🔗 Пример deep link: https://t.me/${botInfo.username}?start=GUEST_ID`);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
