const express = require('express');
const multer = require('multer');
const { validate, id } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');
const { AppError } = require('../../utils/AppError');
const { MAX_BYTES } = require('./media.service');

// Reads one multipart field "file" into memory; the size limit stops reading at 2 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 2 } }).single('file');

function uploadMiddleware(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('FILE_TOO_LARGE', 413, 'The image is larger than 2 MB'));
    return next(new AppError('INVALID_FILE', 400, 'The upload could not be read'));
  });
}

// API-19 (public image download) and API-41 (seller image upload)
function createMediaRouters({ mediaService, authGuard }) {
  const images = express.Router();
  const sellerUploads = express.Router();

  images.get('/:imageId', validate({ params: { imageId: id.required() } }), async (req, res) => {
    const file = await mediaService.streamImage(req.valid.params.imageId);
    if (req.get('If-None-Match') === file.etag) return res.status(304).end();
    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.length),
      'Cache-Control': 'public, max-age=31536000, immutable', // an image id is never reused
      ETag: file.etag,
      'Content-Disposition': 'inline',
    });
    return file.stream.on('error', () => res.destroy()).pipe(res);
  });

  sellerUploads.post('/images', authGuard, requireRole('seller'), uploadMiddleware, async (req, res) => {
    res.status(201).json(await mediaService.saveImage(req.user.id, req.file));
  });

  return { images, sellerUploads };
}

module.exports = { createMediaRouters };
