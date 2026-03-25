const { Telegraf } = require('telegraf');

function createTelegramBot({ botToken, webhookSecret, siteUrl, guestService, pollService, adminService, checklistService }) {
  const bot = new Telegraf(botToken);

  // Global error handler — don't crash on errors
  bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err.message);
  });

  bot.use((ctx, next) => {
    ctx.services = { guests: guestService, polls: pollService, admins: adminService, checklist: checklistService };
    ctx.siteUrl = siteUrl;
    return next();
  });

  require('./commands.js')(bot);
  require('./callbacks.js')(bot);
  require('./admin.js')(bot);

  return bot;
}

module.exports = { createTelegramBot };
