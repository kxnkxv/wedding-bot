const { Telegraf } = require('telegraf');

function createTelegramBot({ botToken, webhookSecret, siteUrl, guestService, pollService, adminService, checklistService, db }) {
  const bot = new Telegraf(botToken);

  // Global error handler — don't crash on errors
  bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err.message);
  });

  bot.use((ctx, next) => {
    ctx.services = { guests: guestService, polls: pollService, admins: adminService, checklist: checklistService, db: db };
    ctx.siteUrl = siteUrl;
    return next();
  });

  require('./commands.js')(bot);
  require('./callbacks.js')(bot);
  require('./admin.js')(bot);

  // Set command suggestions for autocomplete
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'guests', description: 'Список гостей' },
    { command: 'stats', description: 'Статистика RSVP' },
    { command: 'addguest', description: 'Добавить гостя' },
    { command: 'polls', description: 'Опросы' },
    { command: 'checklist', description: 'Чеклист подготовки' },
    { command: 'budget', description: 'Бюджет свадьбы' },
    { command: 'broadcast', description: 'Рассылка гостям' },
    { command: 'remind', description: 'Напомнить не ответившим' },
    { command: 'export', description: 'Экспорт CSV' },
    { command: 'backup', description: 'Скачать базу данных' },
  ]).catch(() => {});

  return bot;
}

module.exports = { createTelegramBot };
