const { VK } = require('vk-io');

function createVkBot({ vkToken, vkGroupId, vkConfirmation, vkSecret, siteUrl, guestService, pollService, adminService, checklistService }) {
  const vk = new VK({ token: vkToken });
  const context = { vk, siteUrl, guestService, pollService, adminService, checklistService };

  require('./commands.js')(vk, context);
  require('./admin.js')(vk, context);

  function callbackMiddleware(req, res) {
    const body = req.body;
    // Confirmation request (no secret check — VK sends it without secret)
    if (body.type === 'confirmation' && Number(body.group_id) === Number(vkGroupId)) {
      return res.send(vkConfirmation);
    }
    // For other events, check secret if configured in VK community settings
    if (vkSecret && body.secret && body.secret !== vkSecret) {
      return res.status(403).send('Invalid secret');
    }
    vk.updates.handleWebhookUpdate(body).catch(console.error);
    res.send('ok');
  }

  return { vk, callbackMiddleware };
}

module.exports = { createVkBot };
