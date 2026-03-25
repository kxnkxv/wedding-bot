const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../../db/index.js');
const { createPollService } = require('../../services/polls.js');
const { createGuestService } = require('../../services/guests.js');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../../db/test-polls.db');

describe('Poll service', () => {
  let db, polls, guests;
  beforeEach(() => { db = createDb(TEST_DB); polls = createPollService(db); guests = createGuestService(db); });
  afterEach(() => { db.close(); try { fs.unlinkSync(TEST_DB); } catch {} });

  it('creates a single-choice poll', () => {
    const poll = polls.create('Блюдо', ['Мясо', 'Рыба', 'Вег'], false);
    assert.ok(poll.id);
    assert.equal(poll.question, 'Блюдо');
    assert.deepEqual(JSON.parse(poll.options), ['Мясо', 'Рыба', 'Вег']);
    assert.equal(poll.multiple, 0);
  });
  it('creates a multiple-choice poll', () => { assert.equal(polls.create('A', ['X', 'Y'], true).multiple, 1); });
  it('lists active polls only', () => {
    polls.create('Q1', ['A', 'B'], false);
    const p2 = polls.create('Q2', ['C', 'D'], false);
    polls.close(p2.id);
    assert.equal(polls.listActive().length, 1);
  });
  it('records and replaces guest answer', () => {
    const poll = polls.create('Q', ['A', 'B'], false);
    const guest = guests.create('T');
    polls.answer(poll.id, guest.id, ['A']);
    polls.answer(poll.id, guest.id, ['B']);
    const answers = polls.getAnswers(poll.id);
    assert.equal(answers.length, 1);
    assert.deepEqual(JSON.parse(answers[0].selected), ['B']);
  });
  it('rejects answer to closed poll', () => {
    const poll = polls.create('Q', ['A'], false);
    const guest = guests.create('T');
    polls.close(poll.id);
    assert.throws(() => polls.answer(poll.id, guest.id, ['A']), /closed/);
  });
  it('counts results correctly', () => {
    const poll = polls.create('Q', ['A', 'B', 'C'], false);
    const g1 = guests.create('1'), g2 = guests.create('2'), g3 = guests.create('3');
    polls.answer(poll.id, g1.id, ['A']);
    polls.answer(poll.id, g2.id, ['A']);
    polls.answer(poll.id, g3.id, ['B']);
    const r = polls.getResults(poll.id);
    assert.equal(r.A, 2); assert.equal(r.B, 1); assert.equal(r.C, 0);
  });
  it('gets guest answers across polls', () => {
    const p1 = polls.create('Q1', ['A'], false), p2 = polls.create('Q2', ['B'], false);
    const guest = guests.create('T');
    polls.answer(p1.id, guest.id, ['A']);
    polls.answer(p2.id, guest.id, ['B']);
    assert.equal(polls.getGuestAnswers(guest.id).length, 2);
  });
});
