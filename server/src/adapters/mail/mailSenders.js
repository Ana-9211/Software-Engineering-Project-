const crypto = require('crypto');

class MailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MailError';
  }
}

// MailSender contract (SDD 7.2): send({ to, subject, text, html }) -> { providerMessageId } or throws MailError.

// Development mailer: prints the email to the server console. It does not deliver anything.
class ConsoleMailSender {
  constructor({ from } = {}) {
    this.name = 'console';
    this.from = from;
  }

  async send({ to, subject, text }) {
    process.stdout.write(`\n--- email (console mailer, not delivered) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---------------------------------------------\n`);
    return { providerMessageId: `console_${crypto.randomBytes(6).toString('hex')}` };
  }
}

// Test mailer: keeps messages in memory so tests can read links, and can be told to fail.
class MemoryMailSender {
  constructor() {
    this.name = 'memory';
    this.outbox = [];
    this.failuresLeft = 0;
  }

  failNext(times = 1) {
    this.failuresLeft = times;
  }

  async send(message) {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new MailError('memory mailer failure');
    }
    this.outbox.push({ ...message });
    return { providerMessageId: `memory_${this.outbox.length}` };
  }

  last(to) {
    const list = to ? this.outbox.filter((m) => m.to === to) : this.outbox;
    return list[list.length - 1];
  }
}

module.exports = { ConsoleMailSender, MemoryMailSender, MailError };
