const mongoose = require('mongoose');
const crypto = require('crypto');

const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = { isObjectId, toObjectId, sha256, randomToken };
