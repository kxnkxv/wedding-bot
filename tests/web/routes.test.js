const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { createDb } = require('../../db/index.js');
const { createGuestService } = require('../../services/guests.js');
const { createPollService } = require('../../services/polls.js');
const { createAdminService } = require('../../services/admin.js');
const { createRoutes } = require('../../web/routes.js');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../../db/test-routes.db');

function fetch(server, method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = {
      hostname: '127.0.0.1', port: addr.port, path: urlPath, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('API routes', () => {
  let db, server, guestService, pollService;

  beforeEach((_, done) => {
    db = createDb(TEST_DB);
    guestService = createGuestService(db);
    pollService = createPollService(db);
    const adminService = createAdminService(db);
    const app = express();
    app.use(createRoutes({ guestService, pollService, adminService, botToken: 'test', siteUrl: 'http://localhost' }));
    server = app.listen(0, done);
  });

  afterEach((_, done) => {
    server.close(() => { db.close(); try { fs.unlinkSync(TEST_DB); } catch {} done(); });
  });

  it('GET /api/guest/:id returns guest data', async () => {
    const guest = guestService.create('Тест', 'Привет!');
    const res = await fetch(server, 'GET', `/api/guest/${guest.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Тест');
  });

  it('GET /api/guest/unknown returns 404', async () => {
    const res = await fetch(server, 'GET', '/api/guest/nonexistent');
    assert.equal(res.status, 404);
  });

  it('POST /api/rsvp/:id updates status', async () => {
    const guest = guestService.create('Тест');
    const res = await fetch(server, 'POST', `/api/rsvp/${guest.id}`, { status: 'accepted' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.ok(res.body.session_token);
  });

  it('POST /api/rsvp/:id rejects invalid status', async () => {
    const guest = guestService.create('Тест');
    const res = await fetch(server, 'POST', `/api/rsvp/${guest.id}`, { status: 'invalid' });
    assert.equal(res.status, 400);
  });

  it('GET /api/polls returns active polls', async () => {
    pollService.create('Q1', ['A', 'B'], false);
    pollService.create('Q2', ['C', 'D'], true);
    const res = await fetch(server, 'GET', '/api/polls');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[1].multiple, true);
  });

  it('POST /api/polls/:id/answer records answer', async () => {
    const poll = pollService.create('Q', ['A', 'B'], false);
    const guest = guestService.create('Тест');
    const res = await fetch(server, 'POST', `/api/polls/${poll.id}/answer`, { guest_id: guest.id, selected: ['A'] });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});
