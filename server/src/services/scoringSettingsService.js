const { models } = require('../db');
const { DIMENSION_KEYS, DIMENSIONS, resolveWeights } = require('../config/scoring');

/**
 * Who decides what the performance score is made of.
 *
 * Two levels, and the order matters:
 *
 *   ORG   an admin sets the weights and can switch a dimension off everywhere.
 *   CLAN  a mentor can switch a dimension off for their own clan only.
 *
 * A clan can turn something OFF that the org has on. It cannot turn something
 * back ON that the org has switched off, because the org's choice is usually
 * "we do not measure this here" and a clan quietly reinstating it would make
 * its mentees incomparable with everyone else's.
 *
 * Weights live only at org level. Letting each mentor re-weight would mean two
 * mentees with identical work getting different scores because of who mentors
 * them, which is the exact unfairness the score exists to remove.
 */

const ORG_KEY = 'scoring.weights';
const clanKey = (clanId) => `scoring.clan.${clanId}.disabled`;

function parse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Only keys we recognise, only numbers we can use. */
function cleanWeights(input) {
  const out = {};
  for (const key of DIMENSION_KEYS) {
    const value = Number(input?.[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return out;
}

function cleanDisabled(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((key) => DIMENSION_KEYS.includes(key));
}

class ScoringSettingsService {
  async getOrgSettings() {
    const row = await models.SystemSettings.findOne({
      where: { settingKey: ORG_KEY },
      attributes: ['settingValue']
    });
    const stored = parse(row?.settingValue, {});
    return {
      weights: cleanWeights(stored.weights),
      disabled: cleanDisabled(stored.disabled)
    };
  }

  async setOrgSettings({ weights, disabled }, actorId = null) {
    const next = {
      weights: cleanWeights(weights),
      disabled: cleanDisabled(disabled)
    };

    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: ORG_KEY },
      defaults: {
        settingKey: ORG_KEY,
        settingValue: JSON.stringify(next),
        settingType: 'json',
        category: 'scoring',
        description: 'Performance score weights, and dimensions switched off org wide',
        lastModifiedBy: actorId
      }
    });

    if (row.settingValue !== JSON.stringify(next)) {
      await row.update({ settingValue: JSON.stringify(next), lastModifiedBy: actorId });
    }

    return next;
  }

  async getClanDisabled(clanId) {
    if (!clanId) return [];
    const row = await models.SystemSettings.findOne({
      where: { settingKey: clanKey(clanId) },
      attributes: ['settingValue']
    });
    return cleanDisabled(parse(row?.settingValue, []));
  }

  async setClanDisabled(clanId, disabled, actorId = null) {
    const next = cleanDisabled(disabled);
    const value = JSON.stringify(next);

    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: clanKey(clanId) },
      defaults: {
        settingKey: clanKey(clanId),
        settingValue: value,
        settingType: 'json',
        category: 'scoring',
        description: `Score dimensions switched off for clan ${clanId}`,
        lastModifiedBy: actorId
      }
    });

    if (row.settingValue !== value) {
      await row.update({ settingValue: value, lastModifiedBy: actorId });
    }

    return next;
  }

  /**
   * The weights actually in force for one clan, with everything the caller
   * needs to explain them on screen.
   */
  async effectiveWeights(clanId = null) {
    const org = await this.getOrgSettings();
    const clanDisabled = clanId ? await this.getClanDisabled(clanId) : [];

    // Union: a clan may switch more off, never fewer.
    const disabled = [...new Set([...org.disabled, ...clanDisabled])];
    const weights = resolveWeights(org.weights, disabled);

    return {
      weights,
      disabled,
      // Which level turned each one off, so the UI can say whether a mentor can
      // switch it back on or whether it is the org's call.
      disabledBy: Object.fromEntries(
        disabled.map((key) => [key, org.disabled.includes(key) ? 'org' : 'clan'])
      ),
      dimensions: DIMENSIONS
    };
  }
}

module.exports = new ScoringSettingsService();
