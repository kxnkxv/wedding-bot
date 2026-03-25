const { nanoid } = require('nanoid');

function createGuestService(db) {
  const VALID_STATUSES = ['pending', 'accepted', 'declined', 'maybe'];
  const RSVP_DEADLINE = new Date('2026-07-01');

  const create = (name, personalText = null) => {
    const id = nanoid(12);
    db.prepare('INSERT INTO guests (id, name, personal_text) VALUES (?, ?, ?)').run(id, name, personalText);
    return getById(id);
  };

  const getById = (id) => db.prepare('SELECT * FROM guests WHERE id = ?').get(id) || null;

  const listAll = () => db.prepare(`SELECT * FROM guests ORDER BY
    CASE status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'maybe' THEN 2 WHEN 'declined' THEN 3 END
  `).all();

  const updateRsvp = (id, status) => {
    if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
    db.prepare("UPDATE guests SET status = ?, responded_at = datetime('now') WHERE id = ?").run(status, id);
    return getById(id);
  };

  const isLateRsvp = () => new Date() > RSVP_DEADLINE;

  const bindTelegram = (id, telegramId, username = null) => {
    db.prepare("UPDATE guests SET telegram_id = ?, telegram_username = ?, source = COALESCE(source, 'telegram'), bound_at = datetime('now') WHERE id = ?").run(telegramId, username, id);
    return getById(id);
  };

  const bindVk = (id, vkId) => {
    db.prepare("UPDATE guests SET vk_id = ?, source = COALESCE(source, 'vk'), bound_at = datetime('now') WHERE id = ?").run(vkId, id);
    return getById(id);
  };

  const checkBindingConflict = (guestId, platform, userId) => {
    const guest = getById(guestId);
    if (!guest) return false;
    const field = platform === 'telegram' ? 'telegram_id' : 'vk_id';
    const currentId = guest[field];
    if (currentId === null) return false;
    return currentId !== userId;
  };

  const generateSessionToken = (id) => {
    const token = nanoid(32);
    db.prepare('UPDATE guests SET session_token = ? WHERE id = ?').run(token, id);
    return token;
  };

  const validateSessionToken = (id, token) => {
    const guest = getById(id);
    if (!guest || !guest.session_token) return false;
    return guest.session_token === token;
  };

  const unbind = (id) => {
    db.prepare('UPDATE guests SET telegram_id = NULL, telegram_username = NULL, vk_id = NULL, session_token = NULL, bound_at = NULL WHERE id = ?').run(id);
  };

  const remove = (id) => {
    db.prepare('DELETE FROM poll_answers WHERE guest_id = ?').run(id);
    db.prepare('DELETE FROM guests WHERE id = ?').run(id);
  };

  const updateDietary = (id, dietary) => {
    db.prepare('UPDATE guests SET dietary = ? WHERE id = ?').run(dietary, id);
    return getById(id);
  };

  const addWish = (guestId, text) => {
    const guest = getById(guestId);
    const name = guest ? guest.name : 'Гость';
    db.prepare('INSERT INTO wishes (guest_id, guest_name, text) VALUES (?, ?, ?)').run(guestId, name, text.trim());
  };

  const getWishes = () => {
    return db.prepare('SELECT guest_name, text, created_at FROM wishes ORDER BY created_at DESC').all();
  };

  const generateLinkCode = (guestId) => {
    // 6-digit numeric code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    // Delete old codes for this guest
    db.prepare('DELETE FROM link_codes WHERE guest_id = ?').run(guestId);
    db.prepare('INSERT INTO link_codes (code, guest_id) VALUES (?, ?)').run(code, guestId);
    return code;
  };

  const redeemLinkCode = (code, platform, platformUserId) => {
    const row = db.prepare('SELECT * FROM link_codes WHERE code = ?').get(code);
    if (!row) return { success: false, error: 'Код не найден' };

    // Check if code is expired (5 minutes)
    const created = new Date(row.created_at);
    if (Date.now() - created.getTime() > 5 * 60 * 1000) {
      db.prepare('DELETE FROM link_codes WHERE code = ?').run(code);
      return { success: false, error: 'Код истёк. Запросите новый.' };
    }

    const guest = getById(row.guest_id);
    if (!guest) return { success: false, error: 'Гость не найден' };

    // Bind to the new platform
    if (platform === 'telegram') {
      bindTelegram(row.guest_id, platformUserId);
    } else if (platform === 'vk') {
      bindVk(row.guest_id, platformUserId);
    }

    // Delete used code
    db.prepare('DELETE FROM link_codes WHERE code = ?').run(code);
    return { success: true, guest };
  };

  const findByTelegramId = (tgId) => db.prepare('SELECT * FROM guests WHERE telegram_id = ?').get(tgId) || null;
  const findByVkId = (vkId) => db.prepare('SELECT * FROM guests WHERE vk_id = ?').get(vkId) || null;

  const getStats = () => {
    const all = listAll();
    return {
      total: all.length,
      accepted: all.filter(g => g.status === 'accepted').length,
      declined: all.filter(g => g.status === 'declined').length,
      maybe: all.filter(g => g.status === 'maybe').length,
      pending: all.filter(g => g.status === 'pending').length,
    };
  };

  const addTag = (guestId, tag) => {
    db.prepare('INSERT OR IGNORE INTO guest_tags (guest_id, tag) VALUES (?, ?)').run(guestId, tag.trim());
  };
  const getTags = (guestId) => {
    return db.prepare('SELECT tag FROM guest_tags WHERE guest_id = ?').all(guestId).map(r => r.tag);
  };
  const removeTag = (guestId, tag) => {
    db.prepare('DELETE FROM guest_tags WHERE guest_id = ? AND tag = ?').run(guestId, tag.trim());
  };
  const addNote = (guestId, note) => {
    db.prepare('INSERT INTO admin_notes (guest_id, note) VALUES (?, ?)').run(guestId, note.trim());
  };
  const getNotes = (guestId) => {
    return db.prepare('SELECT * FROM admin_notes WHERE guest_id = ? ORDER BY created_at DESC').all(guestId);
  };
  const setSeating = (guestId, tableName) => {
    db.prepare('INSERT OR REPLACE INTO seating (guest_id, table_name) VALUES (?, ?)').run(guestId, tableName);
  };
  const getSeating = (guestId) => {
    const row = db.prepare('SELECT table_name FROM seating WHERE guest_id = ?').get(guestId);
    return row ? row.table_name : null;
  };
  const getAllSeating = () => {
    return db.prepare('SELECT s.table_name, g.name, g.id FROM seating s JOIN guests g ON s.guest_id = g.id ORDER BY s.table_name').all();
  };

  return {
    create, getById, listAll, updateRsvp, isLateRsvp,
    bindTelegram, bindVk, checkBindingConflict,
    generateSessionToken, validateSessionToken,
    unbind, remove, findByTelegramId, findByVkId, getStats,
    generateLinkCode, redeemLinkCode,
    updateDietary, addWish, getWishes,
    addTag, getTags, removeTag, addNote, getNotes,
    setSeating, getSeating, getAllSeating,
  };
}

module.exports = { createGuestService };
