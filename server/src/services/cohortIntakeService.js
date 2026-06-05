const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * Cohort (intake batch) management. A cohort is a program's season of intake;
 * only an 'open' cohort accepts applications. Running an off year is simply not
 * opening a new cohort — historical cohorts stay intact and queryable.
 */
class CohortIntakeService {
  async listCohorts({ programId, status } = {}) {
    const where = {};
    if (programId) where.programId = programId;
    if (status) where.status = status;

    const cohorts = await models.Cohort.findAll({
      where,
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });

    // Attach application counts per cohort (grouped, one query).
    const ids = cohorts.map((c) => c.id);
    const counts = ids.length
      ? await models.Application.findAll({
          where: { cohortId: ids },
          attributes: ['cohortId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
          group: ['cohort_id', 'status'],
          raw: true
        })
      : [];

    const byCohort = new Map();
    for (const row of counts) {
      const m = byCohort.get(row.cohortId) || { total: 0, byStatus: {} };
      const n = Number(row.count);
      m.total += n;
      m.byStatus[row.status] = n;
      byCohort.set(row.cohortId, m);
    }

    return cohorts.map((c) => {
      const json = c.toJSON();
      const stat = byCohort.get(c.id) || { total: 0, byStatus: {} };
      return { ...json, applicationCount: stat.total, applicationsByStatus: stat.byStatus };
    });
  }

  async getCohort(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId, {
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name', 'status', 'visibility'] }]
    });
    if (!cohort) throw new NotFoundError('Cohort not found');
    return cohort;
  }

  async createCohort(data, createdBy) {
    const { programId, name } = data;
    if (!programId || !name) throw new ValidationError('programId and name are required');

    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');

    return models.Cohort.create({
      programId,
      name: name.trim(),
      description: data.description || null,
      status: data.status || 'planning',
      capacity: data.capacity ?? null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      createdBy
    });
  }

  async updateCohort(cohortId, data) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const allowed = [
      'name', 'description', 'status', 'capacity', 'startDate', 'endDate',
      // public intake link + assessment configuration
      'applyOpensAt', 'applyClosesAt', 'maxApplications', 'intakeFormSchema',
      'assessmentId', 'assessmentRequired'
    ];
    const patch = {};
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }

    // Validate an attached assessment exists and is usable.
    if (patch.assessmentId) {
      const assessment = await models.Assessment.findByPk(patch.assessmentId);
      if (!assessment) throw new ValidationError('Attached assessment not found');
    }
    await cohort.update(patch);
    return cohort;
  }

  /**
   * Turn the public self-serve intake link on for a cohort, minting a slug the
   * first time. Returns the cohort + the absolute apply URL.
   */
  async enablePublicLink(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    if (!cohort.publicSlug) {
      // Short, URL-safe, unguessable slug. Retry on the rare collision.
      let slug;
      for (let i = 0; i < 5; i += 1) {
        slug = crypto.randomBytes(9).toString('base64url');
        const clash = await models.Cohort.findOne({ where: { publicSlug: slug } });
        if (!clash) break;
        slug = null;
      }
      if (!slug) throw new ValidationError('Could not generate a unique link, try again');
      cohort.publicSlug = slug;
    }
    cohort.publicEnabled = true;
    await cohort.save();
    return { cohort, applyUrl: this.buildApplyUrl(cohort.publicSlug) };
  }

  async disablePublicLink(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    cohort.publicEnabled = false;
    await cohort.save();
    return cohort;
  }

  buildApplyUrl(slug) {
    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    return `${base}/apply/${slug}`;
  }

  /**
   * Resolve a public slug to a cohort *only if the link is currently accepting
   * applications*: enabled, status 'open', inside the optional window, and under
   * the optional application cap. Returns null when the link should not resolve.
   */
  async getOpenCohortBySlug(slug) {
    if (!slug) return null;
    const cohort = await models.Cohort.findOne({
      where: { publicSlug: slug },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'description', 'type'] },
        { model: models.Assessment, as: 'assessment', attributes: ['id', 'title', 'description', 'instructions', 'timeLimitMins', 'status'] }
      ]
    });
    if (!cohort) return null;

    const now = new Date();
    const reasons = [];
    if (!cohort.publicEnabled) reasons.push('disabled');
    if (cohort.status !== 'open') reasons.push('not_open');
    if (cohort.applyOpensAt && now < new Date(cohort.applyOpensAt)) reasons.push('not_yet_open');
    if (cohort.applyClosesAt && now > new Date(cohort.applyClosesAt)) reasons.push('closed');

    if (cohort.maxApplications != null) {
      const count = await models.Application.count({ where: { cohortId: cohort.id } });
      if (count >= cohort.maxApplications) reasons.push('full');
    }

    return { cohort, open: reasons.length === 0, reasons };
  }
}

module.exports = new CohortIntakeService();
