'use strict';

/**
 * Badge icons share one optional `icon_url` column (no migration):
 * - null / empty  → default Lucide from category or criteria
 * - preset:<key>  → admin-chosen icon from BADGE_ICON_PRESETS
 * - https Cloudinary URL under pathment/badges → custom artwork
 *
 * Awards never copy icons; they always read the badge definition.
 */

const BADGE_ICON_PRESETS = Object.freeze([
  'trophy',
  'flame',
  'star',
  'target',
  'award',
  'sparkles',
  'handshake',
  'zap',
  'book',
  'medal',
]);

const PRESET_PREFIX = 'preset:';
const BADGE_FOLDER = 'pathment/badges';
const CLOUDINARY_BADGE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*pathment\/badges\//;

const CATEGORY_DEFAULT = Object.freeze({
  points: 'trophy',
  streak: 'flame',
  level: 'star',
  community: 'handshake',
  milestone: 'target',
  achievement: 'award',
  mentor: 'sparkles',
  quality: 'star',
});

const CRITERIA_DEFAULT = Object.freeze({
  points_milestone: 'trophy',
  streak_days: 'flame',
  level_reached: 'star',
  tasks_completed: 'target',
  programs_completed: 'book',
  badges_earned: 'medal',
  avg_rating: 'star',
  skill_mastery: 'book',
  custom: 'award',
});

function defaultIconKey(badge = {}) {
  const category = String(badge.category || '').toLowerCase();
  if (CATEGORY_DEFAULT[category]) return CATEGORY_DEFAULT[category];
  const criteria = String(badge.criteriaType || '').toLowerCase();
  if (CRITERIA_DEFAULT[criteria]) return CRITERIA_DEFAULT[criteria];
  return 'zap';
}

function parseStoredIcon(iconUrl) {
  if (iconUrl == null || iconUrl === '') return { kind: 'default', preset: null, imageUrl: null };
  const value = String(iconUrl).trim();
  if (!value) return { kind: 'default', preset: null, imageUrl: null };

  if (value.startsWith(PRESET_PREFIX)) {
    const key = value.slice(PRESET_PREFIX.length).toLowerCase();
    if (BADGE_ICON_PRESETS.includes(key)) return { kind: 'preset', preset: key, imageUrl: null };
    return { kind: 'default', preset: null, imageUrl: null };
  }

  if (BADGE_ICON_PRESETS.includes(value.toLowerCase())) {
    return { kind: 'preset', preset: value.toLowerCase(), imageUrl: null };
  }

  // Custom artwork (and legacy http images): treat as image; UI falls back on error.
  if (/^https:\/\//i.test(value)) {
    return { kind: 'image', preset: null, imageUrl: value };
  }

  return { kind: 'default', preset: null, imageUrl: null };
}

function resolveBadgeIcon(badge = {}) {
  const parsed = parseStoredIcon(badge.iconUrl);
  const fallback = defaultIconKey(badge);
  if (parsed.kind === 'image') {
    return { kind: 'image', preset: fallback, imageUrl: parsed.imageUrl, defaultPreset: fallback };
  }
  if (parsed.kind === 'preset') {
    return { kind: 'preset', preset: parsed.preset, imageUrl: null, defaultPreset: fallback };
  }
  return { kind: 'default', preset: fallback, imageUrl: null, defaultPreset: fallback };
}

/**
 * Normalize admin input into a stored icon_url value.
 * Accepts null, preset key, preset:<key>, or a Cloudinary badges URL.
 */
function normalizeIconUrl(input, { ValidationError }) {
  if (input === undefined) return undefined;
  if (input === null || input === '') return null;

  const value = String(input).trim();
  const lower = value.toLowerCase();

  if (BADGE_ICON_PRESETS.includes(lower)) return `${PRESET_PREFIX}${lower}`;
  if (lower.startsWith(PRESET_PREFIX)) {
    const key = lower.slice(PRESET_PREFIX.length);
    if (!BADGE_ICON_PRESETS.includes(key)) {
      throw new ValidationError(`Choose an icon from the badge set (${BADGE_ICON_PRESETS.join(', ')})`);
    }
    return `${PRESET_PREFIX}${key}`;
  }

  if (CLOUDINARY_BADGE.test(value)) return value;

  throw new ValidationError(
    'Badge artwork must be uploaded through Pathment (pathment/badges) or chosen from the icon set. External image URLs are not allowed.'
  );
}

function isAllowedBadgeImageMime(mime) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(mime || '').toLowerCase());
}

module.exports = {
  BADGE_ICON_PRESETS,
  BADGE_FOLDER,
  defaultIconKey,
  resolveBadgeIcon,
  normalizeIconUrl,
  isAllowedBadgeImageMime,
};
