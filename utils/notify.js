/**
 * Sends a notification to all admins across both platforms.
 * @param {object} opts
 * @param {object} opts.adminService - admin service instance
 * @param {object} [opts.telegram] - Telegraf bot.telegram instance
 * @param {object} [opts.vk] - vk-io API instance
 * @param {string} opts.text - message text
 * @param {object} [opts.keyboard] - inline keyboard for Telegram (reply_markup)
 * @param {object} [opts.vkKeyboard] - keyboard for VK
 */
async function notifyAdmins({ adminService, telegram, vk, text, keyboard, vkKeyboard }) {
  const results = { sent: 0, failed: [] };

  if (telegram) {
    const tgIds = adminService.getAllTelegramIds();
    for (const id of tgIds) {
      try {
        const opts = keyboard ? { reply_markup: keyboard } : {};
        await telegram.sendMessage(id, text, opts);
        results.sent++;
      } catch (e) {
        results.failed.push({ platform: 'telegram', id, error: e.message });
      }
    }
  }

  if (vk) {
    const vkIds = adminService.getAllVkIds();
    for (const id of vkIds) {
      try {
        await vk.messages.send({
          user_id: id,
          message: text,
          random_id: Math.floor(Math.random() * 1e9),
          ...(vkKeyboard ? { keyboard: JSON.stringify(vkKeyboard) } : {}),
        });
        results.sent++;
      } catch (e) {
        results.failed.push({ platform: 'vk', id, error: e.message });
      }
    }
  }

  return results;
}

module.exports = { notifyAdmins };
