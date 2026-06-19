const { models } = require('../db');
const { createAuditLog } = require('../utils/auditContext');

const SETTING_KEY = 'org.system';
const LEGACY_KEY = 'org.governance';

const DEFAULT = {
  cohortReviewDeleteLocked: false,
};

/**
 * Org-wide system settings stored in system_settings (single JSON row).
 */
class OrgSystemSettingsService {
  _parse(row) {
    if (!row?.settingValue) return { ...DEFAULT };
    try {
      const stored = JSON.parse(row.settingValue);
      return { cohortReviewDeleteLocked: Boolean(stored.cohortReviewDeleteLocked) };
    } catch {
      return { ...DEFAULT };
    }
  }

  async _readRow() {
    let row = await models.SystemSettings.findOne({ where: { settingKey: SETTING_KEY } });
    if (!row) {
      row = await models.SystemSettings.findOne({ where: { settingKey: LEGACY_KEY } });
    }
    return row;
  }

  async get() {
    return this._parse(await this._readRow());
  }

  async isCohortReviewDeleteLocked() {
    const settings = await this.get();
    return settings.cohortReviewDeleteLocked;
  }

  async update(adminId, patch = {}) {
    const current = await this.get();
    const prev = { ...current };
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
        category: 'system',
        isPublic: false,
      },
    });
    row.settingValue = serialized;
    row.settingType = 'json';
    row.category = 'system';
    row.lastModifiedBy = adminId;
    await row.save();

    if (prev.cohortReviewDeleteLocked !== current.cohortReviewDeleteLocked) {
      await createAuditLog({
        userId: adminId,
        action: 'COHORT_REVIEW_DELETE_LOCK_UPDATED',
        entityType: 'SystemSettings',
        entityId: row.id,
        oldValues: { cohortReviewDeleteLocked: prev.cohortReviewDeleteLocked },
        newValues: { cohortReviewDeleteLocked: current.cohortReviewDeleteLocked },
      });
    }

    return current;
  }
}

module.exports = new OrgSystemSettingsService();
