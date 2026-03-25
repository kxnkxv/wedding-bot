const Database = require('better-sqlite3');
const path = require('path');

// Bothost.ru uses /app/data for persistent storage; fallback to local
const fs = require('fs');
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : __dirname;
const DEFAULT_PATH = path.join(DATA_DIR, 'wedding.db');

function createDb(dbPath = DEFAULT_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guests (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      personal_text     TEXT,
      status            TEXT DEFAULT 'pending',
      source            TEXT,
      telegram_id       INTEGER,
      telegram_username TEXT,
      vk_id             INTEGER,
      session_token     TEXT,
      dietary           TEXT,
      comment           TEXT,
      table_number      TEXT,
      bound_at          TEXT,
      responded_at      TEXT,
      created_at        TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS polls (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      question  TEXT NOT NULL,
      options   TEXT NOT NULL,
      multiple  INTEGER DEFAULT 0,
      active    INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS poll_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id     INTEGER REFERENCES polls(id),
      guest_id    TEXT REFERENCES guests(id),
      selected    TEXT NOT NULL,
      answered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, guest_id)
    );

    CREATE TABLE IF NOT EXISTS admins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER,
      vk_id       INTEGER,
      name        TEXT
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tab         TEXT NOT NULL,
      category    TEXT NOT NULL,
      text        TEXT NOT NULL,
      note        TEXT,
      checked     INTEGER DEFAULT 0,
      position    INTEGER DEFAULT 0,
      is_custom   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS link_codes (
      code        TEXT PRIMARY KEY,
      guest_id    TEXT REFERENCES guests(id),
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      guest_name  TEXT NOT NULL,
      text        TEXT NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS photos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      guest_name  TEXT NOT NULL,
      url         TEXT NOT NULL,
      caption     TEXT,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS song_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      guest_name  TEXT NOT NULL,
      artist      TEXT NOT NULL,
      title       TEXT NOT NULL,
      votes       INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question    TEXT NOT NULL,
      options     TEXT NOT NULL,
      correct     INTEGER NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER REFERENCES quiz_questions(id),
      guest_id    TEXT REFERENCES guests(id),
      selected    INTEGER NOT NULL,
      correct     INTEGER NOT NULL,
      answered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, guest_id)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      guest_name  TEXT NOT NULL,
      question    TEXT NOT NULL,
      answer      TEXT NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question, guest_id)
    );

    CREATE TABLE IF NOT EXISTS bingo_cards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      items       TEXT NOT NULL,
      checked     TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_capsule (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      guest_name  TEXT NOT NULL,
      message     TEXT NOT NULL,
      open_date   TEXT DEFAULT '2027-08-01',
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guest_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      tag         TEXT NOT NULL,
      UNIQUE(guest_id, tag)
    );

    CREATE TABLE IF NOT EXISTS admin_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id    TEXT REFERENCES guests(id),
      note        TEXT NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seating (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name  TEXT NOT NULL,
      guest_id    TEXT REFERENCES guests(id),
      UNIQUE(guest_id)
    );

    CREATE TABLE IF NOT EXISTS budget (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL,
      item        TEXT NOT NULL,
      amount      REAL NOT NULL,
      paid        INTEGER DEFAULT 0,
      note        TEXT,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      role        TEXT NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT,
      note        TEXT,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_config (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add columns to existing guests table if they don't exist yet (migration)
  try { db.exec(`ALTER TABLE guests ADD COLUMN comment TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE guests ADD COLUMN table_number TEXT`); } catch (_) {}

  return db;
}

function seedQuiz(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM quiz_questions').get().c;
  if (count > 0) return;
  const questions = [
    { q: 'Где познакомились Артём и Полина?', opts: ['В университете', 'В кафе', 'На работе', 'Через друзей'], correct: 0 },
    { q: 'Куда пара поехала в первый совместный отпуск?', opts: ['Турция', 'Италия', 'Грузия', 'Сочи'], correct: 2 },
    { q: 'Какое любимое блюдо пары?', opts: ['Пицца', 'Суши', 'Паста', 'Хинкали'], correct: 3 },
    { q: 'Какой фильм пара пересматривала больше всех?', opts: ['Интерстеллар', 'Один дома', 'Титаник', 'Форрест Гамп'], correct: 0 },
    { q: 'Кто сказал "я тебя люблю" первым?', opts: ['Артём', 'Полина', 'Одновременно', 'Никто не помнит'], correct: 0 },
  ];
  const insert = db.prepare('INSERT INTO quiz_questions (question, options, correct) VALUES (?, ?, ?)');
  for (const q of questions) insert.run(q.q, JSON.stringify(q.opts), q.correct);
}

function seedConfig(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM site_config').get().c;
  if (count > 0) return;

  const defaults = {
    'couple.groom': 'Артём',
    'couple.bride': 'Полина',
    'couple.date': '1 августа 2026',
    'couple.date_iso': '2026-08-01T15:00:00',
    'couple.hashtag': '#АртёмИПолина2026',

    'hero.label': 'Приглашение на свадьбу',
    'hero.date': '01 · августа · 2026',

    'invite.label': 'Дорогие друзья',
    'invite.title': 'Мы приглашаем тебя!',
    'invite.text': 'В этот особенный день мы хотим, чтобы рядом были самые близкие и дорогие нам люди. Будем счастливы разделить с тобой нашу радость, смех, танцы и самые тёплые моменты.',

    'story.label': 'Наша история',
    'story.title': 'Как всё началось',
    'story.quote': 'Иногда одна встреча меняет всё. Мы нашли друг друга — и поняли, что хотим идти по жизни вместе, рука об руку.',

    'schedule.label': 'Расписание',
    'schedule.title': 'Программа дня',

    'timeline.1.time': '15:00',
    'timeline.1.title': 'Фуршет',
    'timeline.1.desc': 'Встреча гостей',
    'timeline.2.time': '16:00',
    'timeline.2.title': 'Церемония',
    'timeline.2.desc': 'Торжественная часть',
    'timeline.3.time': '17:00',
    'timeline.3.title': 'Банкет',
    'timeline.3.desc': 'Праздничный ужин',
    'timeline.4.time': '20:00',
    'timeline.4.title': 'Первый танец',
    'timeline.4.desc': 'Танцы, торт и веселье',
    'timeline.5.time': '23:00',
    'timeline.5.title': 'Финал вечера',
    'timeline.5.desc': 'Бенгальские огни',

    'venue.name': 'Название площадки',
    'venue.address': 'Адрес будет уточнён',
    'venue.map_url': 'https://yandex.ru/maps/',
    'venue.parking': 'Бесплатная парковка на территории',
    'venue.transfer': 'Подробности о трансфере будут позже',
    'venue.coordinator': 'Координатор',
    'venue.coordinator_phone': '+7 (XXX) XXX-XX-XX',

    'dresscode.text': 'Вечерний / коктейльный',
    'dresscode.palette_text': 'Будем рады, если твой наряд будет в палитре нашей свадьбы:',

    'wishes.label': 'Пожелания',
    'wishes.title': 'Вместо цветов',
    'wishes.text1': 'Вместо цветов мы будем рады бутылке хорошего вина или виски — чтобы вместе вспоминать этот день ещё долгие годы. 🥂',
    'wishes.text2': 'А лучший подарок для нас — это твоё присутствие и тёплые пожелания. Если хочешь порадовать чем-то ещё — мы будем признательны за вклад в наше совместное будущее. 💌',

    'rsvp.label': 'Подтверждение',
    'rsvp.title': 'Ждём твой ответ',
    'rsvp.text': 'Пожалуйста, подтверди присутствие до 1 июля 2026',
    'rsvp.btn_accept': '✅ С радостью приду!',
    'rsvp.btn_maybe': '🤔 Пока не уверен(а)',
    'rsvp.btn_decline': '❌ К сожалению, не смогу',

    'footer.text': 'Ждём тебя с любовью',

    'afterparty.text': 'Для самых стойких — продолжение вечера! Подробности объявим ближе к дате. 🎶',
  };

  const insert = db.prepare('INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
  });
  tx();
}

module.exports = { createDb, seedQuiz, seedConfig };
