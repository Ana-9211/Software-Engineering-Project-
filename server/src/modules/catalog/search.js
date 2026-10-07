// Search design D-10 (SDD 4.4): derived fields, a trigram index for 3+ characters and prefix
// indexes for 1 or 2 characters. Nothing here ever scans the catalogue with a pattern.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// lower case, accents removed, trimmed, repeated spaces collapsed
function normalise(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ISBN digits only (a final X is kept for ISBN-10)
const isbnDigits = (isbn) => String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();

function trigrams(text) {
  const grams = new Set();
  for (let i = 0; i + 3 <= text.length; i += 1) grams.add(text.slice(i, i + 3));
  return [...grams];
}

// I-28: derived search fields stored on the book
function buildSearchFields(title, author, isbn) {
  const titleLower = normalise(title);
  const authorLower = normalise(author);
  if (!titleLower || !authorLower || !isbnDigits(isbn)) {
    const err = new Error('title, author and isbn are required to build search fields');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const searchText = `${titleLower} ${authorLower} ${isbnDigits(isbn).toLowerCase()}`;
  return { titleLower, authorLower, searchText, searchTrigrams: trigrams(searchText) };
}

// Part of the Mongo filter produced by a query text; returns null when there is no text.
function textCondition(q) {
  if (q === undefined || q === null) return null;
  let t = normalise(q);
  // a query made only of digits, hyphens and spaces is an ISBN fragment: hyphens and spaces are dropped
  if (/^[0-9][0-9\- ]*$/.test(t)) t = t.replace(/[- ]/g, '');
  if (!t) return null;
  if (t.length >= 3) {
    return { searchTrigrams: { $all: trigrams(t) }, searchText: { $regex: escapeRegex(t) } };
  }
  const prefix = new RegExp(`^${escapeRegex(t)}`);
  return { $or: [{ titleLower: prefix }, { authorLower: prefix }, { isbn: new RegExp(`^${escapeRegex(t.toUpperCase())}`) }] };
}

module.exports = { normalise, isbnDigits, trigrams, buildSearchFields, textCondition, escapeRegex };
