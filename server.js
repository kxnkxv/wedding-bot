require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const logger = require('./utils/logger.js');
const { createDb, seedQuiz } = require('./db/index.js');
const { createGuestService } = require('./services/guests.js');
const { createPollService } = require('./services/polls.js');
const { createAdminService } = require('./services/admin.js');
const { createTelegramBot } = require('./bots/telegram/index.js');
const { createVkBot } = require('./bots/vk/index.js');
const { createRoutes } = require('./web/routes.js');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'default-secret';
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

if (!BOT_TOKEN) { console.error('BOT_TOKEN is required'); process.exit(1); }

// Database & services
const db = createDb();
seedQuiz(db);
const guestService = createGuestService(db);
const pollService = createPollService(db);
const adminService = createAdminService(db);

// Try to load checklist service (may not exist yet)
let checklistService = null;
try {
  const { createChecklistService } = require('./services/checklist.js');
  checklistService = createChecklistService(db);
  checklistService.seedPresets();
  logger.info('Checklist service loaded');
} catch (e) {
  logger.info('Checklist service not available yet');
}

adminService.seedFromEnv(process.env.ADMIN_IDS);

// Telegram bot
const tgBot = createTelegramBot({
  botToken: BOT_TOKEN, webhookSecret: WEBHOOK_SECRET, siteUrl: SITE_URL,
  guestService, pollService, adminService, checklistService,
});

// VK bot
let vkBot = null;
if (process.env.VK_TOKEN) {
  vkBot = createVkBot({
    vkToken: process.env.VK_TOKEN,
    vkGroupId: process.env.VK_GROUP_ID,
    vkConfirmation: process.env.VK_CONFIRMATION,
    vkSecret: process.env.VK_APP_SECRET,
    siteUrl: SITE_URL,
    guestService, pollService, adminService, checklistService,
  });
  logger.info('VK bot initialized');
} else {
  logger.warn('VK_TOKEN not set — VK bot disabled');
}

// Express
const app = express();
app.set('trust proxy', 1); // Behind bothost.ru reverse proxy
app.use(compression());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/', rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use(express.json());

// Telegram webhook
app.use(`/webhook/telegram/${WEBHOOK_SECRET}`, tgBot.webhookCallback(`/webhook/telegram/${WEBHOOK_SECRET}`));

// VK webhook
if (vkBot) app.post('/webhook/vk', vkBot.callbackMiddleware);

// Web routes
app.use(createRoutes({ guestService, pollService, adminService, checklistService, botToken: BOT_TOKEN, siteUrl: SITE_URL, db }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const { notifyAdmins } = require('./utils/notify.js');
  notifyAdmins({ adminService, telegram: tgBot.telegram, text: `🚨 Server error: ${err.message}` }).catch(() => {});
  res.status(500).json({ error: 'Произошла ошибка, попробуйте позже' });
});

app.listen(PORT, '0.0.0.0', async () => {
  logger.info('Server started', { port: PORT });

  const useWebhook = SITE_URL.startsWith('https://');

  if (useWebhook) {
    try {
      const webhookUrl = `${SITE_URL}/webhook/telegram/${WEBHOOK_SECRET}`;
      await tgBot.telegram.setWebhook(webhookUrl);
      const me = await tgBot.telegram.getMe();
      logger.info('Telegram bot connected via webhook', { username: me.username, webhook: webhookUrl });
    } catch (e) {
      logger.warn('Webhook setup failed, falling back to polling', { error: e.message });
      await tgBot.telegram.deleteWebhook().catch(() => {});
      tgBot.launch();
      const me = await tgBot.telegram.getMe();
      logger.info('Telegram bot connected via polling', { username: me.username });
    }
  } else {
    // HTTP only — use polling
    await tgBot.telegram.deleteWebhook().catch(() => {});
    tgBot.launch();
    const me = await tgBot.telegram.getMe();
    logger.info('Telegram bot connected via polling', { username: me.username });
  }
});

process.once('SIGINT', () => { tgBot.stop('SIGINT'); db.close(); });
process.once('SIGTERM', () => { tgBot.stop('SIGTERM'); db.close(); });
