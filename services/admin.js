function createAdminService(db) {
  const seedFromEnv = (adminIdsStr) => {
    if (!adminIdsStr) return;
    const ids = adminIdsStr.split(',').map(s => Number(s.trim())).filter(Boolean);
    for (const id of ids) {
      const exists = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(id);
      if (!exists) db.prepare('INSERT INTO admins (telegram_id) VALUES (?)').run(id);
    }
  };
  const isTelegramAdmin = (tgId) => !!db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(tgId);
  const isVkAdmin = (vkId) => !!db.prepare('SELECT id FROM admins WHERE vk_id = ?').get(vkId);
  const addTelegram = (tgId, name) => {
    const r = db.prepare('INSERT INTO admins (telegram_id, name) VALUES (?, ?)').run(tgId, name);
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(r.lastInsertRowid);
  };
  const addVk = (vkId, name) => {
    const r = db.prepare('INSERT INTO admins (vk_id, name) VALUES (?, ?)').run(vkId, name);
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(r.lastInsertRowid);
  };
  const remove = (id) => db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  const listAll = () => db.prepare('SELECT * FROM admins').all();
  const getAllTelegramIds = () => db.prepare('SELECT telegram_id FROM admins WHERE telegram_id IS NOT NULL').all().map(r => r.telegram_id);
  const getAllVkIds = () => db.prepare('SELECT vk_id FROM admins WHERE vk_id IS NOT NULL').all().map(r => r.vk_id);

  return { seedFromEnv, isTelegramAdmin, isVkAdmin, addTelegram, addVk, remove, listAll, getAllTelegramIds, getAllVkIds };
}
module.exports = { createAdminService };
