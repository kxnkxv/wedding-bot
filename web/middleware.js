const crypto = require('crypto');

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return hmac === hash;
}

function authMiddleware(guestService, botToken) {
  return (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'];
    if (initData && verifyTelegramInitData(initData, botToken)) {
      req.authSource = 'telegram';
      return next();
    }
    const sessionToken = req.headers['x-session-token'];
    const guestId = req.params.id || req.params.guestId || req.body?.guest_id;
    if (sessionToken && guestId && guestService.validateSessionToken(guestId, sessionToken)) {
      req.authSource = 'web';
      return next();
    }
    req.authSource = 'none';
    next();
  };
}

module.exports = { verifyTelegramInitData, authMiddleware };
