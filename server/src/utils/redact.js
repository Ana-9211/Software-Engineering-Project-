// Removes sensitive fields before anything is logged (VFR-08).
const SENSITIVE = /(password|token|authorization|cookie|card|cvv|secret|signature)/i;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[depth limit]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return String(value);
    if (value instanceof Date) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

module.exports = { redact };
