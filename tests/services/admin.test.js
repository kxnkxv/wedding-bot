const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../../db/index.js');
const { createAdminService } = require('../../services/admin.js');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../../db/test-admin.db');

describe('Admin service', () => {
  let db, admins;
  beforeEach(() => { db = createDb(TEST_DB); admins = createAdminService(db); });
  afterEach(() => { db.close(); try { fs.unlinkSync(TEST_DB); } catch {} });

  it('seeds from ADMIN_IDS env string', () => { admins.seedFromEnv('111,222'); assert.equal(admins.listAll().length, 2); });
  it('does not duplicate on re-seed', () => { admins.seedFromEnv('111'); admins.seedFromEnv('111'); assert.equal(admins.listAll().length, 1); });
  it('checks telegram admin', () => { admins.seedFromEnv('111'); assert.equal(admins.isTelegramAdmin(111), true); assert.equal(admins.isTelegramAdmin(999), false); });
  it('checks vk admin', () => { admins.addVk(555, 'V'); assert.equal(admins.isVkAdmin(555), true); assert.equal(admins.isVkAdmin(999), false); });
  it('adds and removes admin', () => { const a = admins.addTelegram(111, 'A'); assert.equal(a.telegram_id, 111); admins.remove(a.id); assert.equal(admins.listAll().length, 0); });
  it('gets all platform ids', () => {
    admins.addTelegram(111, 'A'); admins.addTelegram(222, 'B'); admins.addVk(333, 'C');
    assert.deepEqual(admins.getAllTelegramIds(), [111, 222]);
    assert.deepEqual(admins.getAllVkIds(), [333]);
  });
});
