// Plain email templates. Values are escaped for the HTML part; the text part is plain text.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const money = (minor, currency) => `${currency} ${(minor / 100).toFixed(2)}`;

function wrap(text) {
  const html = `<p>${escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  return { text, html };
}

function verification({ name, link }) {
  return { subject: 'Verify your email address', ...wrap(`Hello ${name},\n\nPlease verify your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you did not register, ignore this email.`) };
}

function passwordReset({ name, link }) {
  return { subject: 'Reset your password', ...wrap(`Hello ${name},\n\nUse this link to choose a new password (valid for 30 minutes, one use):\n${link}\n\nIf you did not ask for this, ignore this email.`) };
}

function orderConfirmation({ name, order, currency }) {
  const lines = order.items.map((i) => `- ${i.titleSnapshot} x ${i.quantity}: ${money(i.lineTotal, currency)}`).join('\n');
  const body =
    `Hello ${name},\n\nThank you for your order ${order.orderNumber}.\n\n${lines}\n\n` +
    `Subtotal: ${money(order.subtotal, currency)}\nTax: ${money(order.tax, currency)}\nShipping: ${money(order.shippingFee, currency)}\n` +
    `Total: ${money(order.total, currency)}`;
  return { subject: `Order confirmation ${order.orderNumber}`, ...wrap(body) };
}

module.exports = { verification, passwordReset, orderConfirmation };
