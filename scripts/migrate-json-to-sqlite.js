#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createDb } = require('../db/index.js');

const paths = [
  path.join(__dirname, '..', 'guests.json'),
  path.join(__dirname, '..', '..', 'guests.json'),
];

let jsonPath = null;
for (const p of paths) {
  if (fs.existsSync(p)) { jsonPath = p; break; }
}

if (!jsonPath) { console.log('No guests.json found. Nothing to migrate.'); process.exit(0); }

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
const entries = Object.values(data);

if (entries.length === 0) { console.log('guests.json is empty.'); process.exit(0); }

const db = createDb();
let migrated = 0;

for (const entry of entries) {
  const exists = db.prepare('SELECT id FROM guests WHERE id = ?').get(entry.id);
  if (exists) { console.log(`Skip (exists): ${entry.name} [${entry.id}]`); continue; }

  db.prepare(`
    INSERT INTO guests (id, name, personal_text, status, telegram_id, telegram_username, responded_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.name,
    entry.personalText || null,
    entry.status || 'pending',
    entry.telegramId || null,
    entry.telegramUsername || null,
    entry.respondedAt || null,
    entry.createdAt || new Date().toISOString()
  );
  migrated++;
  console.log(`Migrated: ${entry.name} [${entry.id}] — ${entry.status}`);
}

db.close();
console.log(`\nDone! Migrated ${migrated} guests.`);
