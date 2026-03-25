module.exports = {
  apps: [{
    name: 'wedding-bot',
    script: 'server.js',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '200M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true,
  }],
};
