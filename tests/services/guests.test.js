const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../../db/index.js');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../../db/test.db');

describe('Database initialization', () => {
  afterEach(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('creates all tables', () => {
    const db = createDb(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    assert.ok(tables.includes('guests'));
    assert.ok(tables.includes('polls'));
    assert.ok(tables.includes('poll_answers'));
    assert.ok(tables.includes('admins'));
    assert.ok(tables.includes('checklist_items'));
    db.close();
  });

  it('is idempotent — calling createDb twice does not error', () => {
    const db1 = createDb(TEST_DB);
    db1.close();
    const db2 = createDb(TEST_DB);
    const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    assert.ok(tables.length >= 5);
    db2.close();
  });
});

const { createGuestService } = require('../../services/guests.js');

describe('Guest service', () => {
  let db, guests;
  beforeEach(() => { db = createDb(TEST_DB); guests = createGuestService(db); });
  afterEach(() => { db.close(); try { fs.unlinkSync(TEST_DB); } catch {} });

  it('creates a guest with 12-char id', () => {
    const guest = guests.create('Мария Иванова', 'Дорогая Маша!');
    assert.ok(guest.id);
    assert.equal(guest.id.length, 12);
    assert.equal(guest.name, 'Мария Иванова');
    assert.equal(guest.personal_text, 'Дорогая Маша!');
    assert.equal(guest.status, 'pending');
  });
  it('gets a guest by id', () => { const c = guests.create('Алексей'); assert.equal(guests.getById(c.id).name, 'Алексей'); });
  it('returns null for unknown id', () => { assert.equal(guests.getById('nonexistent'), null); });
  it('lists all guests sorted by status', () => { guests.create('1'); guests.create('2'); assert.equal(guests.listAll().length, 2); });
  it('updates RSVP status', () => { const g = guests.create('T'); const u = guests.updateRsvp(g.id, 'accepted'); assert.equal(u.status, 'accepted'); assert.ok(u.responded_at); });
  it('binds telegram_id', () => { const g = guests.create('T'); const r = guests.bindTelegram(g.id, 111, 'testuser'); assert.equal(r.telegram_id, 111); assert.ok(r.bound_at); });
  it('detects telegram binding conflict', () => { const g = guests.create('T'); guests.bindTelegram(g.id, 111, 'u1'); assert.equal(guests.checkBindingConflict(g.id, 'telegram', 222), true); });
  it('no conflict if same user', () => { const g = guests.create('T'); guests.bindTelegram(g.id, 111, 'u1'); assert.equal(guests.checkBindingConflict(g.id, 'telegram', 111), false); });
  it('binds vk_id', () => { const g = guests.create('T'); assert.equal(guests.bindVk(g.id, 555).vk_id, 555); });
  it('generates and validates session token', () => { const g = guests.create('T'); const t = guests.generateSessionToken(g.id); assert.ok(t); assert.equal(guests.validateSessionToken(g.id, t), true); assert.equal(guests.validateSessionToken(g.id, 'wrong'), false); });
  it('unbinds a guest', () => { const g = guests.create('T'); guests.bindTelegram(g.id, 111, 'u'); guests.unbind(g.id); const f = guests.getById(g.id); assert.equal(f.telegram_id, null); assert.equal(f.vk_id, null); assert.equal(f.session_token, null); });
  it('removes a guest', () => { const g = guests.create('T'); guests.remove(g.id); assert.equal(guests.getById(g.id), null); });
  it('finds by telegram_id', () => { const g = guests.create('T'); guests.bindTelegram(g.id, 111, 'u'); assert.equal(guests.findByTelegramId(111).id, g.id); });
  it('finds by vk_id', () => { const g = guests.create('T'); guests.bindVk(g.id, 555); assert.equal(guests.findByVkId(555).id, g.id); });
  it('rejects invalid RSVP status', () => { const g = guests.create('T'); assert.throws(() => guests.updateRsvp(g.id, 'invalid'), /Invalid status/); });
  it('returns stats', () => { guests.create('A'); const g2 = guests.create('B'); guests.updateRsvp(g2.id, 'accepted'); const s = guests.getStats(); assert.equal(s.total, 2); assert.equal(s.accepted, 1); assert.equal(s.pending, 1); });
});
