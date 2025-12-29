const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT utility functions
 */

/**
 * Generate access token
 * @param {Object} payload - Token payload (user id, role, etc.)
 * @returns {String} JWT token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
  });
};

/**
 * Generate refresh token
 * @param {Object} payload - Token payload (user id)
 * @returns {String} JWT token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d'
  });
};

/**
 * Verify access token
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Verify refresh token
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * Generate random token (for email verification, password reset)
 * @returns {String} Random token
 */
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate 6-digit code
 * @returns {String} 6-digit code
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash token for storage
 * @param {String} token - Plain token
 * @returns {String} Hashed token
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomToken,
  generateVerificationCode,
  hashToken
};
