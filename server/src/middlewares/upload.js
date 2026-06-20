const multer = require('multer');
const path = require('path');
const { ValidationError } = require('../utils/errors/errorTypes');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Allowed MIME types. Browsers are inconsistent about a few (notably .zip on
// Windows/Edge → application/x-zip-compressed, and some send octet-stream), so
// we ALSO accept by file extension below as a fallback.
const allowedTypes = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Video (demo recordings)
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mpeg',
  'video/3gpp',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  // Archives (incl. Windows/Edge .zip variants)
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  // Code files
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
];

// Extension fallback for when the browser sends a vague/wrong MIME type.
const allowedExtensions = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.mpeg', '.mpg', '.3gp',
  '.mp3', '.wav', '.ogg',
  '.zip', '.rar', '.7z', '.gz', '.tar',
  '.html', '.css', '.js', '.json', '.xml',
];

// File filter: accept by MIME type OR by extension (handles inconsistent
// browser MIME types). A rejection is a 400 (operational), not a 500.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type not supported: ${file.originalname || file.mimetype}. Please upload a document, image, video, archive, or code file.`), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

/**
 * Wrap a multer handler so size/count limits and filter rejections surface as
 * clean 400 messages instead of a generic 500 "Something went wrong on our end".
 */
const withUploadErrors = (handler) => (req, res, next) => {
  handler(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: 'One of your files is too large. Each file must be 10MB or smaller.',
        LIMIT_FILE_COUNT: 'Too many files. Please upload fewer files.',
        LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
      };
      return next(new ValidationError(messages[err.code] || 'File upload failed. Please try again.'));
    }
    // fileFilter already throws a ValidationError; wrap anything unexpected.
    return next(err instanceof ValidationError ? err : new ValidationError(err.message || 'File upload failed. Please try again.'));
  });
};

upload.withUploadErrors = withUploadErrors;
/** `upload.arraySafe('files', 5)` — array upload with clean error messages. */
upload.arraySafe = (field, maxCount) => withUploadErrors(upload.array(field, maxCount));
/** `upload.singleSafe('file')` — single upload with clean error messages. */
upload.singleSafe = (field) => withUploadErrors(upload.single(field));

module.exports = upload;
