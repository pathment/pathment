const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

/**
 * Upload file buffer to Cloudinary
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} folder - Cloudinary folder path
 * @param {string} resourceType - Type of resource (image, video, raw, auto)
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadToCloudinary = (fileBuffer, folder = 'pathment/submissions', resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        type: 'upload',         // explicit public delivery
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    // Convert buffer to stream and pipe to cloudinary
    const readableStream = new Readable();
    readableStream.push(fileBuffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Type of resource (image, video, raw)
 * @returns {Promise<Object>} Cloudinary deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    throw error;
  }
};

/**
 * Extract the public ID from a Cloudinary URL.
 *
 * The path between /upload/ and the filename can contain two kinds of segment
 * that are NOT part of the public id, and including either produces an id that
 * matches nothing — so `destroy()` quietly succeeds while the asset stays:
 *
 *   - a version stamp, `v1699123456`
 *   - delivery transforms, `f_auto,q_auto` or `c_fill,g_face,h_128,w_128`
 *
 * Both are stripped here. Everything else is the folder path and is kept.
 *
 * @param {string} url - Cloudinary URL
 * @returns {string} Public ID
 */
const VERSION_SEGMENT = /^v\d+$/;

// A transform segment is comma-separated `key_value` pairs (`f_auto`,
// `c_fill,g_face,h_128,w_128`). Matching on the shape alone would be wrong — a
// folder called `my_folder` looks identical — so every part must use a real
// Cloudinary transform key before we treat the segment as a transform.
const TRANSFORM_KEYS = new Set([
  'w', 'h', 'c', 'g', 'q', 'f', 'e', 'a', 'b', 'bo', 'co', 'dpr', 'fl', 'l',
  'o', 'r', 't', 'u', 'x', 'y', 'z', 'ar', 'd', 'if', 'pg', 'so', 'eo', 'du',
]);
const isTransformSegment = (segment) =>
  segment.includes('_') &&
  segment.split(',').every((part) => {
    const key = part.slice(0, part.indexOf('_'));
    return TRANSFORM_KEYS.has(key);
  });

const extractPublicId = (url) => {
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return url;

  const filename = parts[parts.length - 1];
  const publicId = filename.split('.')[0];

  const folder = parts
    .slice(uploadIndex + 1, -1)
    .filter((segment) => !VERSION_SEGMENT.test(segment) && !isTransformSegment(segment))
    .join('/');

  return folder ? `${folder}/${publicId}` : publicId;
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId
};
