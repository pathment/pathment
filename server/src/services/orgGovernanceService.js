const { models } = require('../db');

const SETTING_KEY = 'org.governance';

const DEFAULT = {
  cohortReviewDeleteLocked: false,
};

/**
 * orgGovernanceService - org-wide compliance / governance toggles.
 * Stored in system_settings as JSON so future policies can share one row.
 */
class OrgGovernanceService {
  _parse(row) {
    if (!row?.settingValue) return { ...DEFAULT };
    try {
      const stored = JSON.parse(row.settingValue);
      return { cohortReviewDeleteLocked: Boolean(stored.cohortReviewDeleteLocked) };
    } catch {
      return { ...DEFAULT };
    }
  }

  async _read() {
    const row = await models.SystemSettings.findOne({ where: { settingKey: SETTING_KEY } });
    return this._parse(row);
  }

  async get() {
    return this._read();
  }

  /** Mentor-facing policy slice (read-only). */
  async getPolicies() {
    return this._read();
  }

  async isCohortReviewDeleteLocked() {
    const settings = await this._read();
    return settings.cohortReviewDeleteLocked;
  }

  async update(adminId, patch = {}) {
    const current = await this._read();
    if (patch.cohortReviewDeleteLocked !== undefined) {
      current.cohortReviewDeleteLocked = Boolean(patch.cohortReviewDeleteLocked);
    }
    const serialized = JSON.stringify(current);
    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: SETTING_KEY },
      defaults: {
        settingKey: SETTING_KEY,
        settingValue: serialized,
        settingType: 'json',
        category: 'governance',
        isPublic: false,
      },
    });
    row.settingValue = serialized;
    row.lastModifiedBy = adminId;
    await row.save();
    return current;
  }
}

module.exports = new OrgGovernanceService();
