const { Markup } = require('telegraf');
const { notifyAdmins } = require('../../utils/notify.js');

const STATUS_EMOJI = {
  pending: '⏳',
  accepted: '✅',
  declined: '❌',
  maybe: '🤔',
};

const STATUS_TEXT = {
  pending: 'Ожидает ответа',
  accepted: 'Придёт',
  declined: 'Не придёт',
  maybe: 'Пока не уверен(а)',
};

function requireAdmin(ctx) {
  return ctx.services.admins.isTelegramAdmin(ctx.from.id);
}

async function sendLong(ctx, text) {
  const MAX = 4000;
  if (text.length <= MAX) {
    return ctx.reply(text);
  }
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, MAX));
    remaining = remaining.slice(MAX);
  }
  for (const part of parts) {
    await ctx.reply(part);
  }
}

module.exports = function registerAdmin(bot) {
  // In-memory map: adminTelegramId -> pendingUserId
  bot._pendingApprovals = {};

  // /addguest Имя | Текст
  bot.command('addguest', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const args = ctx.message.text.replace(/^\/addguest\s*/, '').trim();
    const parts = args.split('|').map((s) => s.trim());
    const name = parts[0];
    const personalText = parts[1] || null;

    if (!name) {
      return ctx.reply('Использование: /addguest Имя | Текст');
    }

    const guest = guests.create(name, personalText);
    const groupId = process.env.VK_GROUP_ID;
    const tgLink = `https://t.me/${ctx.botInfo.username}?start=${guest.id}`;
    const webLink = `${ctx.siteUrl}/?id=${guest.id}`;
    const vkLink = groupId ? `https://vk.me/club${groupId}?start=${guest.id}` : '(VK_GROUP_ID не задан)';

    return ctx.reply(
      `✅ Гость создан: "${guest.name}" (id: ${guest.id})\n\n` +
      `🔗 Telegram: ${tgLink}\n` +
      `🌐 Web: ${webLink}\n` +
      `📘 VK: ${vkLink}`
    );
  });

  // /guests
  bot.command('guests', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const all = guests.listAll();

    if (all.length === 0) {
      return ctx.reply('Гостей пока нет.');
    }

    const lines = all.map((g) => {
      const bound = g.telegram_id ? `tg:${g.telegram_id}` : g.vk_id ? `vk:${g.vk_id}` : 'не привязан';
      return `${STATUS_EMOJI[g.status]} ${g.name} (${g.id}) — ${bound}`;
    });

    return sendLong(ctx, lines.join('\n'));
  });

  // /stats
  bot.command('stats', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const s = guests.getStats();
    const answered = s.accepted + s.declined + s.maybe;
    const pct = s.total > 0 ? Math.round((answered / s.total) * 100) : 0;

    return ctx.reply(
      `📊 Статистика гостей:\n\n` +
      `Всего: ${s.total}\n` +
      `${STATUS_EMOJI.accepted} Придут: ${s.accepted}\n` +
      `${STATUS_EMOJI.maybe} Не уверены: ${s.maybe}\n` +
      `${STATUS_EMOJI.declined} Не придут: ${s.declined}\n` +
      `${STATUS_EMOJI.pending} Ожидают ответа: ${s.pending}\n\n` +
      `Ответили: ${answered} из ${s.total} (${pct}%)`
    );
  });

  // /link [guest_id]
  bot.command('link', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const arg = ctx.message.text.replace(/^\/link\s*/, '').trim();

    if (arg) {
      const guest = guests.getById(arg);
      if (!guest) return ctx.reply('Гость не найден.');
      return ctx.reply(buildLinksText(ctx, guest));
    }

    const all = guests.listAll();
    if (all.length === 0) return ctx.reply('Гостей пока нет.');

    const buttons = all.map((g) =>
      [Markup.button.callback(`${STATUS_EMOJI[g.status]} ${g.name}`, `getlink:${g.id}`)]
    );
    return ctx.reply('Выберите гостя:', Markup.inlineKeyboard(buttons));
  });

  // /remove <id>
  bot.command('remove', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const id = ctx.message.text.replace(/^\/remove\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /remove <id>');
    const guest = guests.getById(id);
    if (!guest) return ctx.reply('Гость не найден.');
    guests.remove(id);
    return ctx.reply(`Гость "${guest.name}" удалён.`);
  });

  // /unbind <id>
  bot.command('unbind', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const id = ctx.message.text.replace(/^\/unbind\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /unbind <id>');
    const guest = guests.getById(id);
    if (!guest) return ctx.reply('Гость не найден.');
    guests.unbind(id);
    return ctx.reply(`Привязка гостя "${guest.name}" удалена.`);
  });

  // /broadcast Текст
  bot.command('broadcast', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const text = ctx.message.text.replace(/^\/broadcast\s*/, '').trim();
    if (!text) return ctx.reply('Использование: /broadcast Текст');

    const all = guests.listAll().filter((g) => g.telegram_id);
    if (all.length === 0) return ctx.reply('Нет гостей с привязанным Telegram.');

    const failed = [];
    let sent = 0;

    for (const g of all) {
      try {
        await ctx.telegram.sendMessage(g.telegram_id, text);
        sent++;
      } catch (e) {
        failed.push(g.name);
      }
    }

    let report = `Рассылка завершена. Отправлено: ${sent}/${all.length}.`;
    if (failed.length > 0) {
      report += `\nНе доставлено: ${failed.join(', ')}`;
    }
    return ctx.reply(report);
  });

  // /addpoll [--multi] Вопрос | Вариант1, Вариант2
  bot.command('addpoll', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { polls } = ctx.services;
    let args = ctx.message.text.replace(/^\/addpoll\s*/, '').trim();
    let multiple = false;

    if (args.startsWith('--multi')) {
      multiple = true;
      args = args.replace(/^--multi\s*/, '').trim();
    }

    const [question, optionsPart] = args.split('|').map((s) => s.trim());
    if (!question || !optionsPart) {
      return ctx.reply('Использование: /addpoll [--multi] Вопрос | Вариант1, Вариант2');
    }

    const options = optionsPart.split(',').map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) return ctx.reply('Нужно минимум 2 варианта.');

    const poll = polls.create(question, options, multiple);
    await ctx.reply(
      `✅ Опрос создан (id: ${poll.id}):\n"${poll.question}"\n` +
      `Варианты: ${options.join(', ')}\n` +
      `Тип: ${multiple ? 'множественный выбор' : 'один вариант'}\n\n` +
      `📤 Рассылаю гостям...`
    );

    // Рассылка опроса всем привязанным TG-гостям
    const { guests } = ctx.services;
    const allGuests = guests.listAll().filter(g => g.telegram_id);
    let sent = 0;
    const failedNames = [];
    for (const g of allGuests) {
      try {
        const buttons = options.map(opt =>
          [Markup.button.callback(opt, `poll_answer:${poll.id}:${g.id}:${opt}`)]
        );
        await ctx.telegram.sendMessage(
          g.telegram_id,
          `📊 Новый опрос!\n\n${question}${multiple ? '\n(можно выбрать несколько)' : ''}`,
          Markup.inlineKeyboard(buttons)
        );
        sent++;
      } catch { failedNames.push(g.name); }
    }

    let report = `📤 Опрос разослан в Telegram: ${sent} из ${allGuests.length}`;
    if (failedNames.length) report += `\n❌ Не доставлено: ${failedNames.join(', ')}`;
    await ctx.reply(report);
  });

  // /polls
  bot.command('polls', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { polls } = ctx.services;
    const all = polls.listAll();

    if (all.length === 0) return ctx.reply('Опросов пока нет.');

    const lines = all.map((p) => {
      const results = polls.getResults(p.id);
      const status = p.active ? '🟢' : '🔴';
      const opts = Object.entries(results || {})
        .map(([opt, count]) => `  ${opt}: ${count}`)
        .join('\n');
      return `${status} [${p.id}] ${p.question}\n${opts}`;
    });

    return sendLong(ctx, lines.join('\n\n'));
  });

  // /closepoll <id>
  bot.command('closepoll', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { polls } = ctx.services;
    const id = ctx.message.text.replace(/^\/closepoll\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /closepoll <id>');
    const poll = polls.getById(Number(id));
    if (!poll) return ctx.reply('Опрос не найден.');
    polls.close(Number(id));
    return ctx.reply(`Опрос "${poll.question}" закрыт.`);
  });

  // /addadmin [Имя]
  bot.command('addadmin', async (ctx) => {
    const { admins } = ctx.services;
    const name = ctx.message.text.replace(/^\/addadmin\s*/, '').trim() ||
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
      `tg:${ctx.from.id}`;

    if (admins.isTelegramAdmin(ctx.from.id)) {
      return ctx.reply('Вы уже являетесь администратором.');
    }

    admins.addTelegram(ctx.from.id, name);
    return ctx.reply(`✅ Вы добавлены как администратор (${name}).`);
  });

  // /removeadmin <id>
  bot.command('removeadmin', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { admins } = ctx.services;
    const id = ctx.message.text.replace(/^\/removeadmin\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /removeadmin <id>');
    admins.remove(Number(id));
    return ctx.reply(`Администратор с id ${id} удалён.`);
  });

  // /checklist [tab]
  bot.command('checklist', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (!ctx.services.checklist) return ctx.reply('Сервис чеклиста не подключён.');

    const checklist = ctx.services.checklist;
    const arg = ctx.message.text.replace(/^\/checklist\s*/, '').trim();
    const tabs = arg ? [arg] : ['bride', 'groom'];

    const parts = [];
    for (const tab of tabs) {
      const items = checklist.getByTab(tab);
      if (!items || items.length === 0) {
        parts.push(`📋 ${tab}: пусто`);
        continue;
      }

      const categories = {};
      for (const item of items) {
        const cat = item.category || 'Без категории';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
      }

      const lines = [`📋 ${tab.toUpperCase()}`];
      for (const [cat, catItems] of Object.entries(categories)) {
        lines.push(`\n${cat}:`);
        for (const item of catItems) {
          const check = item.done ? '✅' : '⬜';
          const note = item.note ? ` (${item.note})` : '';
          lines.push(`${check} [${item.id}] ${item.text}${note}`);
        }
      }
      parts.push(lines.join('\n'));
    }

    return sendLong(ctx, parts.join('\n\n'));
  });

  // /check <id>
  bot.command('check', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (!ctx.services.checklist) return ctx.reply('Сервис чеклиста не подключён.');

    const id = ctx.message.text.replace(/^\/check\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /check <id>');
    ctx.services.checklist.markDone(Number(id), true);
    return ctx.reply(`✅ Задача ${id} отмечена как выполненная.`);
  });

  // /uncheck <id>
  bot.command('uncheck', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (!ctx.services.checklist) return ctx.reply('Сервис чеклиста не подключён.');

    const id = ctx.message.text.replace(/^\/uncheck\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /uncheck <id>');
    ctx.services.checklist.markDone(Number(id), false);
    return ctx.reply(`⬜ Отметка с задачи ${id} снята.`);
  });

  // /addtask tab | category | text | note
  bot.command('addtask', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (!ctx.services.checklist) return ctx.reply('Сервис чеклиста не подключён.');

    const args = ctx.message.text.replace(/^\/addtask\s*/, '').trim();
    const parts = args.split('|').map((s) => s.trim());
    const [tab, category, text, note] = parts;

    if (!tab || !category || !text) {
      return ctx.reply('Использование: /addtask tab | category | text | note');
    }

    const item = ctx.services.checklist.addCustom({ tab, category, text, note: note || null });
    return ctx.reply(`✅ Задача добавлена (id: ${item.id}): [${tab}] ${category} — ${text}`);
  });

  // /removetask <id>
  bot.command('removetask', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (!ctx.services.checklist) return ctx.reply('Сервис чеклиста не подключён.');

    const id = ctx.message.text.replace(/^\/removetask\s*/, '').trim();
    if (!id) return ctx.reply('Использование: /removetask <id>');
    ctx.services.checklist.removeCustom(Number(id));
    return ctx.reply(`Задача ${id} удалена.`);
  });

  // /remind
  bot.command('remind', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const pending = guests.listAll().filter(g => g.status === 'pending' && (g.telegram_id || g.vk_id));

    if (pending.length === 0) return ctx.reply('🎉 Все гости ответили!');

    await ctx.reply(`📤 Отправляю напоминания ${pending.length} гостям...`);

    let sent = 0;
    const failedNames = [];

    for (const g of pending) {
      const webLink = ctx.siteUrl + '/?id=' + g.id;
      const msg = '💌 Напоминаем о приглашении на свадьбу Артёма и Полины!\n\n' +
        '1 августа 2026 года мы ждём вас.\n\n' +
        'Пожалуйста, подтвердите своё присутствие:\n' + webLink;

      if (g.telegram_id) {
        try {
          await ctx.telegram.sendMessage(g.telegram_id, msg,
            Markup.inlineKeyboard([
              [Markup.button.callback('✅ Приду!', 'rsvp:' + g.id + ':accepted')],
              [Markup.button.callback('🤔 Думаю', 'rsvp:' + g.id + ':maybe')],
              [Markup.button.callback('❌ Не смогу', 'rsvp:' + g.id + ':declined')],
            ])
          );
          sent++;
        } catch { failedNames.push(g.name + ' (TG)'); }
      }
    }

    let report = '📤 Напоминания отправлены: ' + sent + ' из ' + pending.length;
    if (failedNames.length) report += '\n❌ Не доставлено:\n' + failedNames.join('\n');
    await ctx.reply(report);
  });

  // /search <query>
  bot.command('search', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const query = ctx.message.text.replace('/search', '').trim();
    if (!query) return ctx.reply('Формат: /search Имя');
    const { guests } = ctx.services;
    const all = guests.listAll();
    const found = all.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
    if (found.length === 0) return ctx.reply('Не найдено.');
    const EMOJI = { pending: '⏳', accepted: '✅', declined: '❌', maybe: '🤔' };
    let msg = `🔍 Найдено: ${found.length}\n\n`;
    found.forEach(g => { msg += `${EMOJI[g.status]||'❓'} ${g.name}\n   ID: ${g.id}\n\n`; });
    await ctx.reply(msg);
  });

  // /filter <status|platform>
  bot.command('filter', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const arg = ctx.message.text.replace('/filter', '').trim().toLowerCase();
    if (!arg) return ctx.reply('Формат: /filter <accepted|declined|maybe|pending|telegram|vk|web|noresponse>');
    const { guests } = ctx.services;
    const all = guests.listAll();
    let filtered;
    switch (arg) {
      case 'accepted': case 'declined': case 'maybe': case 'pending':
        filtered = all.filter(g => g.status === arg); break;
      case 'telegram': filtered = all.filter(g => g.telegram_id); break;
      case 'vk': filtered = all.filter(g => g.vk_id); break;
      case 'web': filtered = all.filter(g => !g.telegram_id && !g.vk_id && g.session_token); break;
      case 'noresponse': filtered = all.filter(g => g.status === 'pending'); break;
      default: return ctx.reply('Неизвестный фильтр.');
    }
    if (filtered.length === 0) return ctx.reply('Не найдено.');
    const EMOJI = { pending: '⏳', accepted: '✅', declined: '❌', maybe: '🤔' };
    let msg = `📋 ${arg}: ${filtered.length}\n\n`;
    filtered.forEach(g => { msg += `${EMOJI[g.status]||'❓'} ${g.name} [${g.id}]\n`; });
    const chunks = msg.match(/[\s\S]{1,4000}/g) || [msg];
    for (const c of chunks) await ctx.reply(c);
  });

  // /export
  bot.command('export', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const all = guests.listAll();
    let csv = 'ID,Имя,Статус,Telegram,VK,Диета,Комментарий,Ответил\n';
    all.forEach(g => {
      csv += `${g.id},"${g.name}",${g.status},${g.telegram_username||''},${g.vk_id||''},` +
        `"${(g.dietary||'').replace(/"/g,'""')}","${(g.comment||'').replace(/"/g,'""')}",${g.responded_at||''}\n`;
    });
    await ctx.replyWithDocument({ source: Buffer.from(csv, 'utf-8'), filename: 'guests.csv' });
  });

  // /tag <guestId> <tag>
  bot.command('tag', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const parts = ctx.message.text.replace('/tag', '').trim().split(/\s+/);
    if (parts.length < 2) return ctx.reply('Формат: /tag GUEST_ID тег');
    const [guestId, ...tagParts] = parts;
    const tag = tagParts.join(' ');
    const { guests } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    guests.addTag(guestId, tag);
    await ctx.reply(`🏷 Тег "${tag}" добавлен к ${guest.name}.`);
  });

  // /tags <guestId>
  bot.command('tags', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const guestId = ctx.message.text.replace('/tags', '').trim();
    if (!guestId) return ctx.reply('Формат: /tags GUEST_ID');
    const { guests } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    const tags = guests.getTags(guestId);
    if (tags.length === 0) return ctx.reply(`${guest.name}: нет тегов.`);
    await ctx.reply(`🏷 ${guest.name}:\n${tags.map(t => `  • ${t}`).join('\n')}`);
  });

  // /note <guestId> <text>
  bot.command('note', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/note', '').trim();
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx === -1) return ctx.reply('Формат: /note GUEST_ID текст заметки');
    const guestId = text.substring(0, spaceIdx);
    const note = text.substring(spaceIdx + 1);
    const { guests } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    guests.addNote(guestId, note);
    await ctx.reply(`📝 Заметка добавлена к ${guest.name}.`);
  });

  // /notes <guestId>
  bot.command('notes', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const guestId = ctx.message.text.replace('/notes', '').trim();
    if (!guestId) return ctx.reply('Формат: /notes GUEST_ID');
    const { guests } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    const notes = guests.getNotes(guestId);
    if (notes.length === 0) return ctx.reply(`${guest.name}: нет заметок.`);
    let msg = `📝 ${guest.name}:\n\n`;
    notes.forEach(n => { msg += `${n.created_at}: ${n.note}\n\n`; });
    await ctx.reply(msg);
  });

  // /seat <guestId> <tableName>
  bot.command('seat', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/seat', '').trim();
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx === -1) return ctx.reply('Формат: /seat GUEST_ID Стол 1');
    const guestId = text.substring(0, spaceIdx);
    const tableName = text.substring(spaceIdx + 1);
    const { guests } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    guests.setSeating(guestId, tableName);
    await ctx.reply(`🪑 ${guest.name} → ${tableName}`);
  });

  // /seating
  bot.command('seating', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const all = guests.getAllSeating();
    if (all.length === 0) return ctx.reply('Рассадка пуста. Используйте /seat GUEST_ID Стол');
    const tables = {};
    all.forEach(s => { if (!tables[s.table_name]) tables[s.table_name] = []; tables[s.table_name].push(s.name); });
    let msg = '🪑 Рассадка:\n\n';
    Object.entries(tables).forEach(([table, names]) => {
      msg += `${table}:\n${names.map(n => `  • ${n}`).join('\n')}\n\n`;
    });
    await ctx.reply(msg);
  });

  // /backup
  bot.command('backup', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const path = require('path');
    const dbPath = path.join(__dirname, '../../db/wedding.db');
    try {
      await ctx.replyWithDocument({ source: dbPath, filename: `wedding-backup-${new Date().toISOString().slice(0,10)}.db` });
    } catch (e) {
      await ctx.reply('Ошибка при отправке: ' + e.message);
    }
  });

  // /info <guestId>
  bot.command('info', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const guestId = ctx.message.text.replace('/info', '').trim();
    if (!guestId) return ctx.reply('Формат: /info GUEST_ID');
    const { guests, polls } = ctx.services;
    const guest = guests.getById(guestId);
    if (!guest) return ctx.reply('Гость не найден.');
    const EMOJI = { pending: '⏳', accepted: '✅', declined: '❌', maybe: '🤔' };
    const tags = guests.getTags(guestId);
    const notes = guests.getNotes(guestId);
    const seat = guests.getSeating(guestId);
    const answers = polls.getGuestAnswers(guestId);

    let msg = `👤 ${guest.name}\n`;
    msg += `🆔 ${guest.id}\n`;
    msg += `${EMOJI[guest.status]||'❓'} ${guest.status}\n`;
    if (guest.telegram_username) msg += `📱 @${guest.telegram_username}\n`;
    if (guest.telegram_id) msg += `TG ID: ${guest.telegram_id}\n`;
    if (guest.vk_id) msg += `VK ID: ${guest.vk_id}\n`;
    if (guest.dietary) msg += `🍽 Диета: ${guest.dietary}\n`;
    if (guest.comment) msg += `💬 Комментарий: ${guest.comment}\n`;
    if (seat) msg += `🪑 Стол: ${seat}\n`;
    if (tags.length) msg += `🏷 Теги: ${tags.join(', ')}\n`;
    if (guest.responded_at) msg += `📅 Ответил: ${guest.responded_at}\n`;
    if (guest.bound_at) msg += `🔗 Привязан: ${guest.bound_at}\n`;
    if (notes.length) {
      msg += `\n📝 Заметки (${notes.length}):\n`;
      notes.slice(0, 3).forEach(n => { msg += `  • ${n.note}\n`; });
      if (notes.length > 3) msg += `  ... и ещё ${notes.length - 3}\n`;
    }
    if (answers.length) {
      msg += `\n📊 Ответы на опросы: ${answers.length}\n`;
    }

    await ctx.reply(msg);
  });

  // /templates
  bot.command('templates', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.reply(
      '📋 Шаблоны рассылок:\n\n' +
      '1️⃣ Напоминание:\n/broadcast 💌 Напоминаем, что ждём вас 1 августа! Пожалуйста, подтвердите присутствие.\n\n' +
      '2️⃣ Спасибо:\n/broadcast ❤️ Спасибо, что подтвердили! Ждём с нетерпением!\n\n' +
      '3️⃣ Адрес:\n/broadcast 📍 Адрес площадки: [АДРЕС]. Карта: [ССЫЛКА]\n\n' +
      '4️⃣ За день до:\n/broadcast ✨ Уже завтра! Ждём вас в 15:00. Не забудьте хорошее настроение!\n\n' +
      '5️⃣ День свадьбы:\n/broadcast 🎉 Сегодня наш день! Ждём вас. Координатор: [ТЕЛЕФОН]\n\n' +
      'Скопируйте шаблон и отправьте как команду.'
    );
  });

  // /import
  bot.command('import', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/import', '').trim();
    if (!text) return ctx.reply(
      '📥 Массовый импорт гостей.\n\n' +
      'Формат: каждый гость на новой строке\n' +
      'Имя | Персональный текст\n\n' +
      'Пример:\n/import\n' +
      'Мария Иванова | Дорогая Маша!\n' +
      'Алексей Петров | Лёха, ждём тебя!\n' +
      'Ольга Сидорова'
    );

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const { guests } = ctx.services;
    let added = 0;
    let report = '';

    for (const line of lines) {
      const parts = line.split('|').map(s => s.trim());
      const name = parts[0];
      const personalText = parts[1] || null;
      if (!name) continue;

      const guest = guests.create(name, personalText);
      const webLink = ctx.siteUrl + '/?id=' + guest.id;
      report += `✅ ${name} → ${webLink}\n`;
      added++;
    }

    if (added === 0) return ctx.reply('Не удалось импортировать ни одного гостя.');

    const chunks = (`📥 Импортировано: ${added}\n\n` + report).match(/[\s\S]{1,4000}/g) || [];
    for (const c of chunks) await ctx.reply(c);
  });

  // Callback: getlink:<guestId>
  bot.action(/^getlink:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) {
      return ctx.answerCbQuery('Нет доступа.');
    }
    const { guests } = ctx.services;
    const guestId = ctx.match[1];
    const guest = guests.getById(guestId);
    if (!guest) {
      await ctx.answerCbQuery('Гость не найден.');
      return;
    }
    await ctx.editMessageText(buildLinksText(ctx, guest));
    await ctx.answerCbQuery();
  });

  // Callback: approve:<userId>
  bot.action(/^approve:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) {
      return ctx.answerCbQuery('Нет доступа.');
    }
    const userId = Number(ctx.match[1]);
    bot._pendingApprovals[ctx.from.id] = userId;
    await ctx.answerCbQuery('Введите имя гостя');
    await ctx.reply(`Введите имя для нового гостя (пользователь id: ${userId}):`);
  });

  // Callback: deny:<userId>
  bot.action(/^deny:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) {
      return ctx.answerCbQuery('Нет доступа.');
    }
    const userId = Number(ctx.match[1]);
    try {
      await ctx.telegram.sendMessage(userId, 'К сожалению, ваш запрос на доступ отклонён. Обратитесь к организаторам.');
    } catch (e) {
      // user may have blocked the bot
    }
    await ctx.answerCbQuery('Запрос отклонён');
    await ctx.reply(`Запрос пользователя ${userId} отклонён.`);
  });

  // /budget — show budget summary
  bot.command('budget', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const db = require('../../db/index.js').createDb();
    const items = db.prepare('SELECT * FROM budget ORDER BY category, item').all();
    db.close();
    if (items.length === 0) return ctx.reply('Бюджет пуст. /addexpense категория | статья | сумма');

    const categories = {};
    let totalBudget = 0, totalPaid = 0;
    items.forEach(i => {
      if (!categories[i.category]) categories[i.category] = [];
      categories[i.category].push(i);
      totalBudget += i.amount;
      if (i.paid) totalPaid += i.amount;
    });

    let msg = '💰 Бюджет свадьбы:\n\n';
    Object.entries(categories).forEach(([cat, items]) => {
      const catTotal = items.reduce((s, i) => s + i.amount, 0);
      msg += `📂 ${cat} — ${catTotal.toLocaleString('ru')} ₽\n`;
      items.forEach(i => {
        msg += `  ${i.paid ? '✅' : '⬜'} ${i.item}: ${i.amount.toLocaleString('ru')} ₽\n`;
      });
      msg += '\n';
    });
    msg += `💰 Итого: ${totalBudget.toLocaleString('ru')} ₽\n✅ Оплачено: ${totalPaid.toLocaleString('ru')} ₽\n⏳ Осталось: ${(totalBudget - totalPaid).toLocaleString('ru')} ₽`;
    await ctx.reply(msg);
  });

  // /addexpense категория | статья | сумма
  bot.command('addexpense', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/addexpense', '').trim();
    if (!text) return ctx.reply('Формат: /addexpense Категория | Статья | 50000');
    const parts = text.split('|').map(s => s.trim());
    if (parts.length < 3) return ctx.reply('Нужно 3 параметра: категория | статья | сумма');
    const amount = parseFloat(parts[2]);
    if (isNaN(amount)) return ctx.reply('Сумма должна быть числом.');
    const db = require('../../db/index.js').createDb();
    db.prepare('INSERT INTO budget (category, item, amount) VALUES (?, ?, ?)').run(parts[0], parts[1], amount);
    db.close();
    await ctx.reply(`✅ Добавлено: ${parts[1]} (${parts[0]}) — ${amount.toLocaleString('ru')} ₽`);
  });

  // /pay <id> — mark expense as paid
  bot.command('pay', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = ctx.message.text.replace('/pay', '').trim();
    if (!id) return ctx.reply('Формат: /pay <id расхода>');
    const db = require('../../db/index.js').createDb();
    db.prepare('UPDATE budget SET paid = 1 WHERE id = ?').run(Number(id));
    db.close();
    await ctx.reply(`✅ Расход #${id} отмечен как оплаченный.`);
  });

  // /vendors — list vendors
  bot.command('vendors', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const db = require('../../db/index.js').createDb();
    const vendors = db.prepare('SELECT * FROM vendors ORDER BY role').all();
    db.close();
    if (vendors.length === 0) return ctx.reply('Список подрядчиков пуст. /addvendor роль | имя | телефон');
    let msg = '📞 Подрядчики:\n\n';
    vendors.forEach(v => {
      msg += `${v.role}: ${v.name}\n`;
      if (v.phone) msg += `  📱 ${v.phone}\n`;
      if (v.note) msg += `  💬 ${v.note}\n`;
      msg += '\n';
    });
    await ctx.reply(msg);
  });

  // /addvendor роль | имя | телефон | заметка
  bot.command('addvendor', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/addvendor', '').trim();
    if (!text) return ctx.reply('Формат: /addvendor Фотограф | Иван Иванов | +7... | заметка');
    const parts = text.split('|').map(s => s.trim());
    if (parts.length < 2) return ctx.reply('Минимум: роль | имя');
    const db = require('../../db/index.js').createDb();
    db.prepare('INSERT INTO vendors (role, name, phone, note) VALUES (?, ?, ?, ?)').run(parts[0], parts[1], parts[2] || null, parts[3] || null);
    db.close();
    await ctx.reply(`✅ Подрядчик добавлен: ${parts[0]} — ${parts[1]}`);
  });

  // /timeline — RSVP response timeline
  bot.command('timeline', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const { guests } = ctx.services;
    const all = guests.listAll().filter(g => g.responded_at);
    if (all.length === 0) return ctx.reply('Ещё никто не ответил.');

    // Group by date
    const byDate = {};
    all.forEach(g => {
      const date = g.responded_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(g);
    });

    const EMOJI = { accepted: '✅', declined: '❌', maybe: '🤔' };
    let msg = '📈 Таймлайн ответов:\n\n';
    Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, gs]) => {
      msg += `📅 ${date} (${gs.length}):\n`;
      gs.forEach(g => { msg += `  ${EMOJI[g.status]||'❓'} ${g.name}\n`; });
      msg += '\n';
    });
    await ctx.reply(msg);
  });

  // Text handler: process pending approvals
  bot.on('text', async (ctx, next) => {
    const { admins, guests } = ctx.services;
    if (!admins.isTelegramAdmin(ctx.from.id)) return next();

    const pendingUserId = bot._pendingApprovals[ctx.from.id];
    if (!pendingUserId) return next();

    const name = ctx.message.text.trim();
    if (!name) return ctx.reply('Имя не может быть пустым.');

    delete bot._pendingApprovals[ctx.from.id];

    const guest = guests.create(name);
    guests.bindTelegram(guest.id, pendingUserId);

    const webAppUrl = `${ctx.siteUrl}/?id=${guest.id}`;
    const tgLink = `https://t.me/${ctx.botInfo.username}?start=${guest.id}`;

    try {
      await ctx.telegram.sendMessage(
        pendingUserId,
        `🎉 Ваш запрос одобрен! Добро пожаловать, ${name}!`,
        Markup.inlineKeyboard([
          [Markup.button.webApp('🎉 Открыть приглашение', webAppUrl)],
        ])
      );
    } catch (e) {
      // user may have blocked the bot
    }

    return ctx.reply(
      `✅ Гость "${name}" создан и привязан к пользователю ${pendingUserId}.\n` +
      `🔗 Ссылка: ${tgLink}\n🌐 Web: ${webAppUrl}`
    );
  });

  // /settext key | value — update site config text
  bot.command('settext', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const text = ctx.message.text.replace('/settext', '').trim();
    if (!text || !text.includes('|')) return ctx.reply('Формат: /settext ключ | значение\n\nПример:\n/settext venue.name | Загородный клуб "Романтика"\n/settext wishes.text1 | Лучший подарок — ваше присутствие!');

    const sepIdx = text.indexOf('|');
    const key = text.substring(0, sepIdx).trim();
    const value = text.substring(sepIdx + 1).trim();

    const db = require('../../db/index.js').createDb();
    db.prepare('INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES (?, ?, datetime("now"))').run(key, value);
    db.close();

    await ctx.reply(`✅ Обновлено:\n${key} = ${value}`);
  });

  // /texts — show all config keys
  bot.command('texts', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const db = require('../../db/index.js').createDb();
    const rows = db.prepare('SELECT key, value FROM site_config ORDER BY key').all();
    db.close();

    if (rows.length === 0) return ctx.reply('Конфигурация пуста.');

    let msg = '📝 Тексты сайта:\n\n';
    rows.forEach(r => {
      const short = r.value.length > 50 ? r.value.slice(0, 50) + '...' : r.value;
      msg += `\`${r.key}\`\n  ${short}\n\n`;
    });

    const chunks = msg.match(/[\s\S]{1,4000}/g) || [msg];
    for (const c of chunks) await ctx.reply(c, { parse_mode: 'Markdown' });
  });
};

function buildLinksText(ctx, guest) {
  const groupId = process.env.VK_GROUP_ID;
  const tgLink = `https://t.me/${ctx.botInfo.username}?start=${guest.id}`;
  const webLink = `${ctx.siteUrl}/?id=${guest.id}`;
  const vkLink = groupId ? `https://vk.me/club${groupId}?start=${guest.id}` : '(VK_GROUP_ID не задан)';
  const qrLink = `${ctx.siteUrl}/qr?id=${guest.id}`;
  return (
    `🔗 Ссылки для гостя "${guest.name}" (${guest.id}):\n\n` +
    `Telegram: ${tgLink}\n` +
    `Web: ${webLink}\n` +
    `VK: ${vkLink}\n` +
    `QR: ${qrLink}`
  );
}
