function createPollService(db) {
  const create = (question, options, multiple = false) => {
    const result = db.prepare('INSERT INTO polls (question, options, multiple) VALUES (?, ?, ?)').run(question, JSON.stringify(options), multiple ? 1 : 0);
    return getById(result.lastInsertRowid);
  };
  const getById = (id) => db.prepare('SELECT * FROM polls WHERE id = ?').get(id) || null;
  const listActive = () => db.prepare('SELECT * FROM polls WHERE active = 1 ORDER BY created_at').all();
  const listAll = () => db.prepare('SELECT * FROM polls ORDER BY created_at').all();
  const close = (id) => db.prepare('UPDATE polls SET active = 0 WHERE id = ?').run(id);

  const answer = (pollId, guestId, selected) => {
    const poll = getById(pollId);
    if (!poll || !poll.active) throw new Error('Poll is closed');
    db.prepare(`INSERT INTO poll_answers (poll_id, guest_id, selected, answered_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(poll_id, guest_id) DO UPDATE SET selected = excluded.selected, answered_at = excluded.answered_at
    `).run(pollId, guestId, JSON.stringify(selected));
  };

  const getAnswers = (pollId) => db.prepare('SELECT * FROM poll_answers WHERE poll_id = ?').all(pollId);
  const getGuestAnswers = (guestId) => db.prepare('SELECT * FROM poll_answers WHERE guest_id = ?').all(guestId);

  const getResults = (pollId) => {
    const poll = getById(pollId);
    if (!poll) return null;
    const options = JSON.parse(poll.options);
    const answers = getAnswers(pollId);
    const counts = {};
    for (const opt of options) counts[opt] = 0;
    for (const a of answers) {
      for (const s of JSON.parse(a.selected)) {
        if (counts[s] !== undefined) counts[s]++;
      }
    }
    return counts;
  };

  return { create, getById, listActive, listAll, close, answer, getAnswers, getGuestAnswers, getResults };
}
module.exports = { createPollService };
