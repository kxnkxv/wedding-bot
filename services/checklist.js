const PRESETS = [
  // registration tab — positions 1-44
  { tab: 'registration', category: 'Документы',      text: 'Паспорта обоих',                  note: 'Проверить срок действия', position: 1 },
  { tab: 'registration', category: 'Документы',      text: 'Квитанция об оплате госпошлины',   note: null,                      position: 2 },
  { tab: 'registration', category: 'Документы',      text: 'Заявление',                        note: null,                      position: 3 },
  { tab: 'registration', category: 'Документы',      text: 'Свидетельства о расторжении',      note: 'Если были в браке',       position: 4 },

  { tab: 'registration', category: 'Образ и стиль',  text: 'Наряд Полины',                     note: null,                      position: 5 },
  { tab: 'registration', category: 'Образ и стиль',  text: 'Костюм Артёма',                    note: null,                      position: 6 },
  { tab: 'registration', category: 'Образ и стиль',  text: 'Обувь разносить',                  note: null,                      position: 7 },
  { tab: 'registration', category: 'Образ и стиль',  text: 'Аксессуары',                       note: null,                      position: 8 },
  { tab: 'registration', category: 'Образ и стиль',  text: 'Макияж и укладка',                 note: 'Пробный за неделю',       position: 9 },
  { tab: 'registration', category: 'Образ и стиль',  text: 'Маникюр',                          note: null,                      position: 10 },

  { tab: 'registration', category: 'Атрибуты',       text: 'Кольца',                           note: 'Проверить размер',        position: 11 },
  { tab: 'registration', category: 'Атрибуты',       text: 'Букет',                            note: null,                      position: 12 },
  { tab: 'registration', category: 'Атрибуты',       text: 'Бутоньерка',                       note: null,                      position: 13 },
  { tab: 'registration', category: 'Атрибуты',       text: 'Шампанское и бокалы',              note: null,                      position: 14 },
  { tab: 'registration', category: 'Атрибуты',       text: 'Лепестки/конфетти',                note: null,                      position: 15 },

  { tab: 'registration', category: 'Фото и видео',   text: 'Фотограф',                         note: null,                      position: 16 },
  { tab: 'registration', category: 'Фото и видео',   text: 'Видеограф',                        note: null,                      position: 17 },
  { tab: 'registration', category: 'Фото и видео',   text: 'Список кадров',                    note: null,                      position: 18 },

  { tab: 'registration', category: 'Логистика',      text: 'Транспорт до ЗАГСа',               note: null,                      position: 19 },
  { tab: 'registration', category: 'Логистика',      text: 'Ресторан',                         note: null,                      position: 20 },
  { tab: 'registration', category: 'Логистика',      text: 'Подтвердить время',                note: null,                      position: 21 },
  { tab: 'registration', category: 'Логистика',      text: 'Предупредить гостей',              note: null,                      position: 22 },
  { tab: 'registration', category: 'Логистика',      text: 'Зарядить телефоны',                note: null,                      position: 23 },

  // wedding tab — positions 100-144
  { tab: 'wedding', category: 'Утро сборы',          text: 'Завтрак',                          note: null,                                      position: 100 },
  { tab: 'wedding', category: 'Утро сборы',          text: 'Макияж Полины',                    note: null,                                      position: 101 },
  { tab: 'wedding', category: 'Утро сборы',          text: 'Сборы Артёма',                     note: null,                                      position: 102 },
  { tab: 'wedding', category: 'Утро сборы',          text: 'Набор экстренного ремонта',         note: 'Нитки, булавки, пластырь',               position: 103 },
  { tab: 'wedding', category: 'Утро сборы',          text: 'Сменная обувь',                    note: null,                                      position: 104 },
  { tab: 'wedding', category: 'Утро сборы',          text: 'Косметичка',                       note: null,                                      position: 105 },

  { tab: 'wedding', category: 'Площадка и декор',    text: 'Встреча с декоратором',             note: null,                                      position: 106 },
  { tab: 'wedding', category: 'Площадка и декор',    text: 'Рассадочные карточки',              note: null,                                      position: 107 },
  { tab: 'wedding', category: 'Площадка и декор',    text: 'План рассадки',                     note: null,                                      position: 108 },
  { tab: 'wedding', category: 'Площадка и декор',    text: 'Свадебная арка',                    note: null,                                      position: 109 },
  { tab: 'wedding', category: 'Площадка и декор',    text: 'Фотозона',                          note: null,                                      position: 110 },
  { tab: 'wedding', category: 'Площадка и декор',    text: 'Красные акценты',                   note: null,                                      position: 111 },

  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Кольца шаферу',                     note: null,                                      position: 112 },
  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Торт доставка',                     note: null,                                      position: 113 },
  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Меню и напитки',                    note: null,                                      position: 114 },
  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Ведущий тайминг',                   note: null,                                      position: 115 },
  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Плейлист',                          note: null,                                      position: 116 },
  { tab: 'wedding', category: 'Церемония и банкет',  text: 'Первый танец',                      note: null,                                      position: 117 },

  { tab: 'wedding', category: 'Не забыть',           text: 'Оплата подрядчиков',                note: null,                                      position: 118 },
  { tab: 'wedding', category: 'Не забыть',           text: 'Вещи на ночь',                      note: null,                                      position: 119 },
  { tab: 'wedding', category: 'Не забыть',           text: 'Ответственный за подарки',           note: null,                                      position: 120 },
  { tab: 'wedding', category: 'Не забыть',           text: 'Зарядить устройства',               note: null,                                      position: 121 },
  { tab: 'wedding', category: 'Не забыть',           text: 'Аптечка',                           note: null,                                      position: 122 },
];

function createChecklistService(db) {
  const insert = db.prepare(
    `INSERT INTO checklist_items (tab, category, text, note, position, is_custom)
     VALUES (@tab, @category, @text, @note, @position, @is_custom)`
  );

  const seedPresets = () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM checklist_items WHERE is_custom = 0').get().cnt;
    if (count > 0) return;
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run({ ...item, is_custom: 0 });
      }
    });
    insertMany(PRESETS);
  };

  const getById = (id) =>
    db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) || null;

  const listAll = () =>
    db.prepare('SELECT * FROM checklist_items ORDER BY position').all();

  const listByTab = (tab) =>
    db.prepare('SELECT * FROM checklist_items WHERE tab = ? ORDER BY position').all(tab);

  const listGrouped = (tab) => {
    const items = listByTab(tab);
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
    return grouped;
  };

  const check = (id) =>
    db.prepare('UPDATE checklist_items SET checked = 1 WHERE id = ?').run(id);

  const uncheck = (id) =>
    db.prepare('UPDATE checklist_items SET checked = 0 WHERE id = ?').run(id);

  const addCustom = (tab, category, text, note = null) => {
    const maxPos = db.prepare('SELECT MAX(position) as m FROM checklist_items').get().m || 0;
    const result = insert.run({ tab, category, text, note, position: maxPos + 1, is_custom: 1 });
    return getById(result.lastInsertRowid);
  };

  const removeCustom = (id) => {
    const item = getById(id);
    if (!item) return;
    if (item.is_custom === 0) throw new Error('Cannot remove preset item');
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id);
  };

  const getProgress = (tab) => {
    const row = db.prepare(
      `SELECT COUNT(*) as total, SUM(checked) as checked FROM checklist_items WHERE tab = ?`
    ).get(tab);
    return { total: row.total, checked: row.checked || 0 };
  };

  return { seedPresets, getById, listAll, listByTab, listGrouped, check, uncheck, addCustom, removeCustom, getProgress };
}

module.exports = { createChecklistService };
