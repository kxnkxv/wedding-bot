function log(level, msg, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

module.exports = {
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data),
};
