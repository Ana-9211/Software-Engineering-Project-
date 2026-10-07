const config = require('../config');
const { redact } = require('./redact');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function log(level, message, fields) {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...redact(fields || {}) });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

module.exports = {
  debug: (m, f) => log('debug', m, f),
  info: (m, f) => log('info', m, f),
  warn: (m, f) => log('warn', m, f),
  error: (m, f) => log('error', m, f),
  // security-relevant events: actor id and time, never secrets (Architecture 7.3)
  audit: (event, f) => log('info', `audit:${event}`, f),
};
