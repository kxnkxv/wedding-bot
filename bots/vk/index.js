const { VK } = require('vk-io');

function createVkBot({ vkToken, vkGroupId, vkConfirmation, vkSecret, siteUrl, guestService, pollService, adminService, checklistService }) {
  const vk = new VK({
    token: vkToken,
    apiVersion: '5.199',
  });

  // Configure webhook confirmation
  vk.updates.use(async (context, next) => {
    // Attach services to every context
    return next();
  });

  const context = { vk, siteUrl, guestService, pollService, adminService, checklistService };

  require('./commands.js')(vk, context);
  require('./admin.js')(vk, context);

  // Use vk-io's built-in webhook callback
  function callbackMiddleware(req, res) {
    const body = req.body;

    // Confirmation — handle manually (vk-io doesn't handle this)
    if (body.type === 'confirmation' && Number(body.group_id) === Number(vkGroupId)) {
      return res.send(vkConfirmation);
    }

    // Log incoming event for debugging
    console.log('VK event:', body.type, JSON.stringify(body).slice(0, 200));

    // Pass to vk-io
    vk.updates.handleWebhookUpdate(body)
      .then(() => {})
      .catch(err => console.error('VK handler error:', err.message));
    res.send('ok');
  }

  return { vk, callbackMiddleware };
}

module.exports = { createVkBot };
