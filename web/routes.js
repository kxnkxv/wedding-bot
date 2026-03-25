const express = require('express');
const path = require('path');
const { authMiddleware } = require('./middleware.js');

function createRoutes({ guestService, pollService, adminService, checklistService, botToken, siteUrl, db }) {
  const db_raw = () => db;
  const router = express.Router();
  const auth = authMiddleware(guestService, botToken);

  function sanitize(str, maxLen = 500) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
  }

  // PWA routes
  router.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.json')));
  router.get('/sw.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Page routes — всё в корне
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'invite.html'));
  });
  // Legacy redirects
  router.get('/invite', (req, res) => {
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(301, '/' + query);
  });
  router.get('/app', (req, res) => {
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(301, '/' + query);
  });
  router.get('/checklist', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checklist.html'));
  });
  router.get('/wishes', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'wishes.html'));
  });

  // Checklist API (admin only - simplified: no auth check for now, will be checked client-side)
  if (checklistService) {
    router.get('/api/checklist/:tab', (req, res) => {
      const grouped = checklistService.listGrouped(req.params.tab);
      const progress = checklistService.getProgress(req.params.tab);
      res.json({ groups: grouped, progress });
    });

    router.post('/api/checklist/:id/check', (req, res) => {
      checklistService.check(Number(req.params.id));
      res.json({ ok: true });
    });

    router.post('/api/checklist/:id/uncheck', (req, res) => {
      checklistService.uncheck(Number(req.params.id));
      res.json({ ok: true });
    });

    router.post('/api/checklist/add', express.json(), (req, res) => {
      const { tab, category, text, note } = req.body;
      if (!tab || !category || !text) return res.status(400).json({ error: 'tab, category, text required' });
      const item = checklistService.addCustom(tab, category, text, note || null);
      res.json(item);
    });

    router.delete('/api/checklist/:id', (req, res) => {
      try {
        checklistService.removeCustom(Number(req.params.id));
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });

    router.get('/api/checklist/progress/all', (req, res) => {
      res.json({
        registration: checklistService.getProgress('registration'),
        wedding: checklistService.getProgress('wedding'),
      });
    });
  }

  // API routes
  router.get('/api/guest/:id', auth, (req, res) => {
    const guest = guestService.getById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const answers = pollService.getGuestAnswers(guest.id);
    res.json({
      id: guest.id, name: guest.name, personal_text: guest.personal_text,
      status: guest.status,
      dietary: guest.dietary || '',
      comment: guest.comment || '',
      answers: answers.map(a => ({ poll_id: a.poll_id, selected: JSON.parse(a.selected) })),
    });
  });

  router.post('/api/rsvp/:id', express.json(), auth, (req, res) => {
    const { status } = req.body;
    if (!['accepted', 'declined', 'maybe'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const guest = guestService.getById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    let token = null;
    if (req.authSource === 'none' && !guest.session_token) {
      token = guestService.generateSessionToken(guest.id);
    } else if (req.authSource === 'none' && guest.session_token) {
      return res.status(403).json({ error: 'Session token required' });
    }

    const updated = guestService.updateRsvp(req.params.id, status);
    const response = { status: updated.status, responded_at: updated.responded_at };
    if (token) response.session_token = token;
    res.json(response);
  });

  router.get('/api/polls', auth, (req, res) => {
    const active = pollService.listActive();
    res.json(active.map(p => ({
      id: p.id, question: p.question, options: JSON.parse(p.options), multiple: !!p.multiple,
    })));
  });

  router.post('/api/polls/:pollId/answer', express.json(), auth, (req, res) => {
    const { guest_id, selected } = req.body;
    if (!guest_id || !Array.isArray(selected)) {
      return res.status(400).json({ error: 'guest_id and selected[] required' });
    }
    try {
      pollService.answer(Number(req.params.pollId), guest_id, selected);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Poll results (for guests to see after voting)
  router.get('/api/polls/:pollId/results', (req, res) => {
    const results = pollService.getResults(Number(req.params.pollId));
    if (!results) return res.status(404).json({ error: 'Poll not found' });
    res.json(results);
  });

  router.post('/api/link-code/:id', express.json(), auth, (req, res) => {
    const guest = guestService.getById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const code = guestService.generateLinkCode(guest.id);
    res.json({ code, expires_in: 300 });
  });

  router.post('/api/dietary/:id', express.json(), auth, (req, res) => {
    const { dietary } = req.body;
    const guest = guestService.getById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const updated = guestService.updateDietary(req.params.id, dietary || '');
    res.json({ dietary: updated.dietary });
  });

  router.get('/api/wishes', (req, res) => {
    res.json(guestService.getWishes());
  });

  router.post('/api/wishes', express.json(), auth, (req, res) => {
    const { guest_id, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
    guestService.addWish(guest_id, sanitize(text, 1000));
    res.json({ ok: true });
  });

  // ── Song requests ─────────────────────────────────────────────────────
  router.get('/api/songs', (req, res) => {
    const songs = db_raw().prepare('SELECT * FROM song_requests ORDER BY votes DESC, created_at').all();
    res.json(songs);
  });
  router.post('/api/songs', express.json(), auth, (req, res) => {
    const { guest_id, artist, title } = req.body;
    if (!artist || !title) return res.status(400).json({ error: 'artist and title required' });
    const guest = guestService.getById(guest_id);
    const name = guest ? guest.name : 'Гость';
    db_raw().prepare('INSERT INTO song_requests (guest_id, guest_name, artist, title) VALUES (?, ?, ?, ?)').run(guest_id, name, artist.trim(), title.trim());
    res.json({ ok: true });
  });
  router.post('/api/songs/:id/vote', (req, res) => {
    db_raw().prepare('UPDATE song_requests SET votes = votes + 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Quiz ──────────────────────────────────────────────────────────────
  router.get('/api/quiz', (req, res) => {
    const questions = db_raw().prepare('SELECT id, question, options FROM quiz_questions ORDER BY id').all();
    res.json(questions.map(q => ({ ...q, options: JSON.parse(q.options) })));
  });
  router.post('/api/quiz/:qId/answer', express.json(), auth, (req, res) => {
    const { guest_id, selected } = req.body;
    const q = db_raw().prepare('SELECT * FROM quiz_questions WHERE id = ?').get(Number(req.params.qId));
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const isCorrect = selected === q.correct ? 1 : 0;
    db_raw().prepare('INSERT OR REPLACE INTO quiz_answers (question_id, guest_id, selected, correct, answered_at) VALUES (?, ?, ?, ?, datetime("now"))').run(q.id, guest_id, selected, isCorrect);
    res.json({ correct: isCorrect, correctAnswer: q.correct });
  });
  router.get('/api/quiz/scores', (req, res) => {
    const scores = db_raw().prepare(`
      SELECT g.name, COUNT(*) as total, SUM(qa.correct) as score
      FROM quiz_answers qa JOIN guests g ON qa.guest_id = g.id
      GROUP BY qa.guest_id ORDER BY score DESC
    `).all();
    res.json(scores);
  });

  // ── Predictions ───────────────────────────────────────────────────────
  router.get('/api/predictions', (req, res) => {
    res.json(db_raw().prepare('SELECT * FROM predictions ORDER BY created_at DESC').all());
  });
  router.post('/api/predictions', express.json(), auth, (req, res) => {
    const { guest_id, question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'question and answer required' });
    const guest = guestService.getById(guest_id);
    const name = guest ? guest.name : 'Гость';
    db_raw().prepare('INSERT OR REPLACE INTO predictions (guest_id, guest_name, question, answer) VALUES (?, ?, ?, ?)').run(guest_id, name, question, answer);
    res.json({ ok: true });
  });

  // ── Time capsule ──────────────────────────────────────────────────────
  router.post('/api/timecapsule', express.json(), auth, (req, res) => {
    const { guest_id, message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const guest = guestService.getById(guest_id);
    const name = guest ? guest.name : 'Гость';
    db_raw().prepare('INSERT INTO time_capsule (guest_id, guest_name, message) VALUES (?, ?, ?)').run(guest_id, name, message.trim());
    res.json({ ok: true });
  });

  // ── Seating ───────────────────────────────────────────────────────────
  router.get('/api/seating/:guestId', (req, res) => {
    const seat = db_raw().prepare('SELECT table_name FROM seating WHERE guest_id = ?').get(req.params.guestId);
    res.json(seat || { table_name: null });
  });

  // ── Guest tags (admin) ────────────────────────────────────────────────
  router.get('/api/tags/:guestId', (req, res) => {
    const tags = db_raw().prepare('SELECT tag FROM guest_tags WHERE guest_id = ?').all(req.params.guestId);
    res.json(tags.map(t => t.tag));
  });
  router.post('/api/tags/:guestId', express.json(), (req, res) => {
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag required' });
    db_raw().prepare('INSERT OR IGNORE INTO guest_tags (guest_id, tag) VALUES (?, ?)').run(req.params.guestId, tag.trim());
    res.json({ ok: true });
  });

  // ── Admin notes ───────────────────────────────────────────────────────
  router.get('/api/notes/:guestId', (req, res) => {
    const notes = db_raw().prepare('SELECT * FROM admin_notes WHERE guest_id = ? ORDER BY created_at DESC').all(req.params.guestId);
    res.json(notes);
  });
  router.post('/api/notes/:guestId', express.json(), (req, res) => {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'note required' });
    db_raw().prepare('INSERT INTO admin_notes (guest_id, note) VALUES (?, ?)').run(req.params.guestId, note.trim());
    res.json({ ok: true });
  });

  // ── RSVP comment ──────────────────────────────────────────────────────
  router.post('/api/comment/:id', express.json(), auth, (req, res) => {
    const { comment } = req.body;
    const guest = guestService.getById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    db_raw().prepare('UPDATE guests SET comment = ? WHERE id = ?').run(comment || '', req.params.id);
    res.json({ ok: true });
  });

  // QR code page
  router.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr.html'));
  });

  router.get('/songs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'songs.html')));
  router.get('/quiz', (req, res) => res.sendFile(path.join(__dirname, 'public', 'quiz.html')));
  router.get('/predictions', (req, res) => res.sendFile(path.join(__dirname, 'public', 'predictions.html')));
  router.get('/capsule', (req, res) => res.sendFile(path.join(__dirname, 'public', 'capsule.html')));
  router.get('/bingo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bingo.html')));
  router.get('/challenge', (req, res) => res.sendFile(path.join(__dirname, 'public', 'challenge.html')));
  router.get('/test', (req, res) => res.sendFile(path.join(__dirname, 'public', 'test.html')));
  router.get('/facts', (req, res) => res.sendFile(path.join(__dirname, 'public', 'facts.html')));

  // ── Admin dashboard ───────────────────────────────────────────────────
  router.get('/api/admin/stats', (req, res) => {
    const all = guestService.listAll();
    res.json({
      total: all.length,
      accepted: all.filter(g => g.status === 'accepted').length,
      declined: all.filter(g => g.status === 'declined').length,
      maybe: all.filter(g => g.status === 'maybe').length,
      pending: all.filter(g => g.status === 'pending').length,
      withTelegram: all.filter(g => g.telegram_id).length,
      withVk: all.filter(g => g.vk_id).length,
      withDietary: all.filter(g => g.dietary).length,
    });
  });

  router.get('/api/admin/guests', (req, res) => {
    const all = guestService.listAll();
    res.json(all.map(g => ({
      id: g.id, name: g.name, status: g.status,
      telegram: g.telegram_username || null,
      vk_id: g.vk_id || null,
      dietary: g.dietary || '',
      comment: g.comment || '',
      responded_at: g.responded_at,
    })));
  });

  router.post('/api/admin/addguest', express.json(), (req, res) => {
    const { name, personal_text } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const guest = guestService.create(name.trim(), personal_text ? personal_text.trim() : null);
    res.json({ id: guest.id, name: guest.name });
  });

  // ── Admin poll management ──────────────────────────────────
  router.post('/api/admin/addpoll', express.json(), (req, res) => {
    const { question, options, multiple } = req.body;
    if (!question || !options || options.length < 2) return res.status(400).json({ error: 'Invalid poll data' });
    const poll = pollService.create(question, options, !!multiple);
    res.json(poll);
  });

  router.post('/api/admin/closepoll/:id', (req, res) => {
    pollService.close(Number(req.params.id));
    res.json({ ok: true });
  });

  router.get('/api/admin/polls', (req, res) => {
    const all = pollService.listAll();
    res.json(all.map(p => ({
      ...p,
      options: JSON.parse(p.options),
      results: pollService.getResults(p.id),
    })));
  });

  // ── Admin budget ─────────────────────────────────────────────
  router.get('/api/admin/budget', (req, res) => {
    const items = db.prepare('SELECT * FROM budget ORDER BY category, item').all();
    res.json(items);
  });

  router.post('/api/admin/budget', express.json(), (req, res) => {
    const { category, item, amount, note } = req.body;
    if (!category || !item || !amount) return res.status(400).json({ error: 'category, item, amount required' });
    db.prepare('INSERT INTO budget (category, item, amount, note) VALUES (?, ?, ?, ?)').run(category, item, Number(amount), note || null);
    res.json({ ok: true });
  });

  router.post('/api/admin/budget/:id/pay', (req, res) => {
    db.prepare('UPDATE budget SET paid = 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.delete('/api/admin/budget/:id', (req, res) => {
    db.prepare('DELETE FROM budget WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Admin vendors ────────────────────────────────────────────
  router.get('/api/admin/vendors', (req, res) => {
    res.json(db.prepare('SELECT * FROM vendors ORDER BY role').all());
  });

  router.post('/api/admin/vendors', express.json(), (req, res) => {
    const { role, name, phone, note } = req.body;
    if (!role || !name) return res.status(400).json({ error: 'role and name required' });
    db.prepare('INSERT INTO vendors (role, name, phone, note) VALUES (?, ?, ?, ?)').run(role, name, phone || null, note || null);
    res.json({ ok: true });
  });

  router.delete('/api/admin/vendors/:id', (req, res) => {
    db.prepare('DELETE FROM vendors WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Admin guest actions ──────────────────────────────────────
  router.post('/api/admin/guest/:id/status', express.json(), (req, res) => {
    const { status } = req.body;
    const updated = guestService.updateRsvp(req.params.id, status);
    res.json(updated);
  });

  router.delete('/api/admin/guest/:id', (req, res) => {
    guestService.remove(req.params.id);
    res.json({ ok: true });
  });

  // ── Admin seating ────────────────────────────────────────────
  router.get('/api/admin/seating', (req, res) => {
    res.json(guestService.getAllSeating());
  });

  router.post('/api/admin/seating', express.json(), (req, res) => {
    const { guest_id, table_name } = req.body;
    guestService.setSeating(guest_id, table_name);
    res.json({ ok: true });
  });

  // ── Admin broadcast ──────────────────────────────────────────
  router.post('/api/admin/broadcast', express.json(), async (req, res) => {
    const { text, platform } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const all = guestService.listAll();
    const targets = all.filter(g => {
      if (platform === 'telegram') return g.telegram_id;
      if (platform === 'vk') return g.vk_id;
      return g.telegram_id || g.vk_id;
    });
    res.json({ targets: targets.length, message: text });
  });

  router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  router.get('/coordinator', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'coordinator.html'));
  });

  // Emoji reactions (live during wedding)
  router.post('/api/react', express.json(), (req, res) => {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji required' });
    // Store in-memory (resets on restart - that's fine for a one-day event)
    if (!global._reactions) global._reactions = {};
    global._reactions[emoji] = (global._reactions[emoji] || 0) + 1;
    res.json({ ok: true, counts: global._reactions });
  });

  router.get('/api/reactions', (req, res) => {
    res.json(global._reactions || {});
  });

  // Static files
  router.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '7d' }));
  router.use('/config.js', express.static(path.join(__dirname, 'public', 'config.js'), { maxAge: '1h' }));

  return router;
}

module.exports = { createRoutes };
