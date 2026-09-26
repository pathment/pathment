'use strict';

const { ValidationError } = require('../../src/utils/errors/errorTypes');
const {
  BADGE_ICON_PRESETS,
  defaultIconKey,
  resolveBadgeIcon,
  normalizeIconUrl,
  isAllowedBadgeImageMime,
} = require('../../src/utils/badgeIcons');

describe('badgeIcons', () => {
  test('defaults follow category then criteria', () => {
    expect(defaultIconKey({ category: 'streak' })).toBe('flame');
    expect(defaultIconKey({ category: 'quality' })).toBe('star');
    expect(defaultIconKey({ criteriaType: 'tasks_completed' })).toBe('target');
    expect(defaultIconKey({})).toBe('zap');
  });

  test('null iconUrl resolves to category default', () => {
    const resolved = resolveBadgeIcon({ category: 'milestone', iconUrl: null });
    expect(resolved.kind).toBe('default');
    expect(resolved.preset).toBe('target');
    expect(resolved.imageUrl).toBeNull();
  });

  test('preset selection overrides default', () => {
    const resolved = resolveBadgeIcon({ category: 'milestone', iconUrl: 'preset:flame' });
    expect(resolved.kind).toBe('preset');
    expect(resolved.preset).toBe('flame');
    expect(resolved.defaultPreset).toBe('target');
  });

  test('cloudinary badge artwork is accepted and unknown presets fall back', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/pathment/badges/icon.png';
    expect(normalizeIconUrl(url, { ValidationError })).toBe(url);
    expect(normalizeIconUrl('flame', { ValidationError })).toBe('preset:flame');
    expect(normalizeIconUrl(null, { ValidationError })).toBeNull();
    expect(() => normalizeIconUrl('https://evil.example/x.png', { ValidationError })).toThrow(/pathment\/badges/);
    expect(() => normalizeIconUrl('preset:nope', { ValidationError })).toThrow(/badge set/);
    expect(resolveBadgeIcon({ iconUrl: 'preset:nope', category: 'points' }).preset).toBe('trophy');
  });

  test('upload mime allowlist excludes svg', () => {
    expect(isAllowedBadgeImageMime('image/png')).toBe(true);
    expect(isAllowedBadgeImageMime('image/svg+xml')).toBe(false);
    expect(BADGE_ICON_PRESETS).toContain('trophy');
  });
});
