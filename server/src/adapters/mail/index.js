const { ConsoleMailSender, MemoryMailSender } = require('./mailSenders');

// The email provider is TBD (Architecture 11.3). Only the console mailer (development) and the memory
// mailer (tests) exist. A real provider adapter must implement send({ to, subject, text, html }).
function createMailer(config) {
  switch (config.mail.provider) {
    case 'console':
      return new ConsoleMailSender({ from: config.mail.from });
    case 'memory':
      return new MemoryMailSender();
    default:
      throw new Error(`Unknown MAIL_PROVIDER "${config.mail.provider}". No real provider adapter has been written yet.`);
  }
}

module.exports = { createMailer };
