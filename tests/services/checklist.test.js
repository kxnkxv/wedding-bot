const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../../db/index.js');
const { createChecklistService } = require('../../services/checklist.js');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../../db/test-checklist.db');

describe('Checklist service', () => {
  let db, checklist;
  beforeEach(() => { db = createDb(TEST_DB); checklist = createChecklistService(db); });
  afterEach(() => { db.close(); try { fs.unlinkSync(TEST_DB); } catch {} });

  it('seeds preset items', () => {
    checklist.seedPresets();
    const items = checklist.listByTab('registration');
    assert.ok(items.length > 0);
    assert.equal(items[0].is_custom, 0);
  });
  it('does not duplicate on re-seed', () => {
    checklist.seedPresets();
    const c1 = checklist.listAll().length;
    checklist.seedPresets();
    assert.equal(checklist.listAll().length, c1);
  });
  it('adds a custom item', () => {
    const item = checklist.addCustom('wedding', 'Не забыть', 'Взять зонтик', 'На всякий случай');
    assert.ok(item.id);
    assert.equal(item.is_custom, 1);
    assert.equal(item.text, 'Взять зонтик');
  });
  it('toggles checked state', () => {
    const item = checklist.addCustom('wedding', 'Тест', 'Пункт');
    checklist.check(item.id);
    assert.equal(checklist.getById(item.id).checked, 1);
    checklist.uncheck(item.id);
    assert.equal(checklist.getById(item.id).checked, 0);
  });
  it('removes only custom items', () => {
    checklist.seedPresets();
    const presetId = checklist.listAll()[0].id;
    assert.throws(() => checklist.removeCustom(presetId), /preset/i);
    const custom = checklist.addCustom('wedding', 'T', 'Del');
    checklist.removeCustom(custom.id);
    assert.equal(checklist.getById(custom.id), null);
  });
  it('returns progress stats', () => {
    checklist.addCustom('wedding', 'C', 'I1');
    const i2 = checklist.addCustom('wedding', 'C', 'I2');
    checklist.check(i2.id);
    const s = checklist.getProgress('wedding');
    assert.equal(s.total, 2);
    assert.equal(s.checked, 1);
  });
  it('lists grouped by category', () => {
    checklist.seedPresets();
    const grouped = checklist.listGrouped('registration');
    assert.ok(Object.keys(grouped).length > 0);
    for (const items of Object.values(grouped)) {
      assert.ok(Array.isArray(items));
      assert.ok(items.length > 0);
    }
  });
});
