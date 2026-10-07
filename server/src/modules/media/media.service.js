const mongoose = require('mongoose');
const { Readable } = require('stream');
const { AppError, notFound } = require('../../utils/AppError');
const { toObjectId } = require('../../utils/ids');

const MAX_BYTES = 2 * 1024 * 1024; // D-09: 2 MB
const MAX_IMAGES_PER_LISTING = 3;

// The file type is decided from the first bytes, never from the file name or the declared type.
function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && png.every((b, i) => buffer[i] === b)) return 'image/png';
  return null;
}

// BM-14 Media. Book images live in GridFS (D-09); this service hides the storage (saveImage, streamImage).
function createMediaService() {
  const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db);

  return {
    MAX_BYTES,
    MAX_IMAGES_PER_LISTING,
    detectImageType,

    async saveImage(sellerId, file) {
      if (!file || !file.buffer || file.buffer.length === 0) throw new AppError('INVALID_FILE', 400, 'No image file was uploaded');
      if (file.buffer.length > MAX_BYTES) throw new AppError('FILE_TOO_LARGE', 413, 'The image is larger than 2 MB');
      const contentType = detectImageType(file.buffer);
      if (!contentType) throw new AppError('INVALID_FILE', 400, 'Only JPEG and PNG images are accepted');

      const filename = `book-image-${Date.now()}`; // the client file name is not trusted or stored
      const upload = bucket().openUploadStream(filename, { metadata: { ownerId: String(sellerId), contentType } });
      await new Promise((resolve, reject) => {
        Readable.from(file.buffer).pipe(upload).on('finish', resolve).on('error', reject);
      });
      const imageId = String(upload.id);
      return { imageId, url: `/api/images/${imageId}` };
    },

    // returns { stream, contentType, length, etag } or throws NOT_FOUND
    async streamImage(imageId) {
      const files = await bucket().find({ _id: toObjectId(imageId) }).limit(1).toArray();
      if (files.length === 0) throw notFound('Image not found');
      const f = files[0];
      return {
        stream: bucket().openDownloadStream(f._id),
        contentType: (f.metadata && f.metadata.contentType) || 'application/octet-stream',
        length: f.length,
        etag: `"${String(f._id)}"`,
      };
    },

    // I-16: every image id must exist and belong to the seller
    async assertImagesOwned(sellerId, imageIds) {
      if (!imageIds || imageIds.length === 0) return;
      const unique = [...new Set(imageIds)];
      if (unique.length !== imageIds.length) {
        throw new AppError('VALIDATION_ERROR', 400, 'Duplicate image ids', [{ field: 'imageIds', issue: 'duplicate ids' }]);
      }
      const files = await bucket().find({ _id: { $in: unique.map(toObjectId) }, 'metadata.ownerId': String(sellerId) }).toArray();
      if (files.length !== unique.length) {
        throw new AppError('VALIDATION_ERROR', 400, 'An image is unknown or belongs to another seller', [
          { field: 'imageIds', issue: 'unknown or not owned image' },
        ]);
      }
    },
  };
}

module.exports = { createMediaService, detectImageType, MAX_BYTES };
