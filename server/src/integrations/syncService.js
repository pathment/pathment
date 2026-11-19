/**
 * Bringing people in from other systems: one pipeline for every door.
 *
 *   records ─▶ field mapping ─▶ validate ─▶ match ─▶ create / update ─▶ report
 *                                                  (an intake, at "Added")
 *
 * A batch is a SyncRun: queued by the API (or the app), picked up by the sync
 * worker, processed record by record, and left with its counts and per-record
 * errors. Nothing in a batch can stop the rest of it.
 *
 * Matching: their ID first (an ExternalIdentity per source and intake), then
 * the email within the intake. An update only changes the fields this source
 * set last time, so whatever an admin changed in Pathment stays. Closed
 * applicants (rejected, withdrawn, removed) are never reopened. People missing
 * from a later batch are never deleted.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors/errorTypes');
const mapping = require('./fieldMapping');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED = ['rejected', 'withdrawn', 'removed'];
const MAX_RECORDS = 1000;
const MAX_ERRORS = 500;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The applicant columns a source may set (country lives in responses). */
const COLUMNS = ['email', 'firstName', 'lastName', 'phone', 'level'];

/** A thrown error carrying the public API's error code (and field). */
const coded = (error, code, field = null) => Object.assign(error, { apiCode: code, apiField: field });

const sha256 = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const blank = (v) => v == null || v === '';

class SyncService {
  constructor() {
    this.MAX_RECORDS = MAX_RECORDS;
  }

  // ── Connections (the app) ──────────────────────────────────────────────────
  _cleanConnection(data, { partial = false } = {}) {
    const out = {};
    if (!partial || data.name !== undefined) {
      const name = String(data.name || '').trim();
      if (!name) throw new ValidationError('Give the connection a name (the system it is for)');
      out.name = name.slice(0, 120);
    }
    if (data.cohortId !== undefined) out.cohortId = data.cohortId || null;
    if (data.afterSync !== undefined) {
      if (!['none', 'send_assessment'].includes(data.afterSync)) throw new ValidationError('afterSync must be "none" or "send_assessment"');
      out.afterSync = data.afterSync;
    }
    if (!partial || data.mapping !== undefined) {
      const m = data.mapping || { fields: {}, keepUnmapped: true };
      const problems = mapping.validateMapping(m);
      if (problems.length) throw new ValidationError(problems.join('; '));
      out.mapping = { fields: m.fields || {}, keepUnmapped: m.keepUnmapped !== false };
    }
    return out;
  }

  async _assertCohort(cohortId) {
    if (!cohortId) return null;
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id'] });
    if (!cohort) throw new ValidationError('That intake does not exist in this workspace');
    return cohort;
  }

  async listConnections() {
    return models.SyncConnection.findAll({
      where: { archivedAt: null },
      include: [{ model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });
  }

  async createConnection(user, data) {
    const clean = this._cleanConnection(data);
    await this._assertCohort(clean.cohortId);
    const pull = require('./pullService').columnsFor(data, null);
    return models.SyncConnection.create({ ...clean, ...pull, createdBy: user?.id || null });
  }

  async updateConnection(id, data) {
    const row = await models.SyncConnection.findOne({ where: { id, archivedAt: null } });
    if (!row) throw new NotFoundError('Connection not found');
    const clean = this._cleanConnection(data, { partial: true });
    if (clean.cohortId) await this._assertCohort(clean.cohortId);
    const pull = require('./pullService').columnsFor(data, row);
    await row.update({ ...clean, ...pull });
    return row;
  }

  async archiveConnection(id) {
    const row = await models.SyncConnection.findOne({ where: { id, archivedAt: null } });
    if (!row) throw new NotFoundError('Connection not found');
    await row.update({ archivedAt: new Date() });
    return { archived: true };
  }

  /** What a mapping makes of some sample records — the app's preview. */
  preview(mappingInput, samples = []) {
    const problems = mapping.validateMapping(mappingInput || { fields: {} });
    const rows = (Array.isArray(samples) ? samples : [samples]).slice(0, 20).map((record) => {
      const { values, responses } = mapping.mapRecord(record, mappingInput);
      const errors = [];
      if (!values.email) errors.push({ field: 'email', code: 'missing_email', message: 'No email after mapping' });
      else if (!EMAIL_RE.test(values.email)) errors.push({ field: 'email', code: 'invalid_email', message: `"${values.email}" is not an email address` });
      return { values, responses, errors };
    });
    return { problems, rows };
  }

  suggest(sample) {
    return mapping.suggestMapping(sample || {});
  }

  // ── Queueing a batch ───────────────────────────────────────────────────────
  /**
   * Queue a batch. With an idempotency key, the same key and body within 24
   * hours returns the original run (`replay: true`); the same key with a
   * different body is a conflict.
   */
  async enqueue({ cohortId, records, connectionId = null, dryRun = false, sendAssessment, idempotencyKey = null, apiKeyId = null, triggeredBy = null, source = 'api' }) {
    if (!Array.isArray(records) || records.length === 0) throw coded(new ValidationError('`records` must be a non-empty array'), 'validation_failed', 'records');
    if (records.length > MAX_RECORDS) throw coded(new ValidationError(`Send at most ${MAX_RECORDS} records per request`), 'too_many_records', 'records');

    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id'] });
    if (!cohort) throw coded(new NotFoundError('Intake not found'), 'intake_not_found');
    let connection = null;
    if (connectionId) {
      connection = await models.SyncConnection.findOne({ where: { id: connectionId, archivedAt: null } });
      if (!connection) throw coded(new ValidationError('That connection does not exist in this workspace'), 'validation_failed', 'connection');
    }

    const key = idempotencyKey ? String(idempotencyKey).slice(0, 255) : null;
    const requestHash = sha256({ cohortId, records, connectionId, dryRun: !!dryRun, sendAssessment: sendAssessment ?? null });
    if (key) {
      const prior = await models.SyncRun.findOne({ where: { apiKeyId, idempotencyKey: key } });
      if (prior && Date.now() - new Date(prior.createdAt).getTime() < IDEMPOTENCY_WINDOW_MS) {
        if (prior.requestHash !== requestHash) {
          throw coded(new ConflictError('This Idempotency-Key was already used with a different request'), 'idempotency_key_reused');
        }
        return { run: prior, replay: true };
      }
      // Older than the window: free the key for this request.
      if (prior) await prior.update({ idempotencyKey: null });
    }

    const run = await models.SyncRun.create({
      connectionId: connection ? connection.id : null,
      cohortId,
      apiKeyId,
      triggeredBy,
      source,
      status: 'queued',
      dryRun: !!dryRun,
      sendAssessment: sendAssessment != null ? !!sendAssessment : connection?.afterSync === 'send_assessment',
      idempotencyKey: key,
      requestHash,
      records,
      total: records.length,
      counts: { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
    });
    // Don't wait for the next poll.
    setImmediate(() => { require('../workers/syncWorker').kick(); });
    return { run, replay: false };
  }

  // ── Processing a batch (the worker) ────────────────────────────────────────
  async process(runId) {
    const run = await models.SyncRun.findByPk(runId);
    if (!run || run.status !== 'running') return null;
    try {
      const outcome = await this._processRecords(run);
      const failed = outcome.counts.failed;
      const ok = run.total - failed;
      await run.update({
        status: failed === 0 ? 'succeeded' : ok > 0 ? 'partial' : 'failed',
        counts: outcome.counts,
        errors: outcome.errors.slice(0, MAX_ERRORS),
        assessmentsSent: outcome.assessmentsSent,
        records: null, // the outcome is kept; the payload isn't needed any more
        finishedAt: new Date(),
      });
      await require('../webhooks/webhookService').emit(run.organizationId, 'sync.job.completed', () => ({ job: this.presentJob(run) }));
    } catch (error) {
      await run.update({ status: 'failed', errorMessage: String(error.message || error).slice(0, 1000), finishedAt: new Date() });
      await require('../webhooks/webhookService').emit(run.organizationId, 'sync.job.completed', () => ({ job: this.presentJob(run) }));
      require('../utils/logger').error('Sync run failed', { runId, message: error.message });
    }
    return run;
  }

  async _processRecords(run) {
    const cohort = await models.Cohort.findByPk(run.cohortId);
    if (!cohort) throw new Error('The intake no longer exists');
    const connection = run.connectionId ? await models.SyncConnection.findByPk(run.connectionId) : null;
    const map = connection?.mapping && Object.keys(connection.mapping.fields || {}).length ? connection.mapping : null;
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    const sourceKey = `${run.connectionId || 'api'}:${cohort.id}`;
    const cap = cohort.maxApplications != null ? Number(cohort.maxApplications) : null;
    let count = cap != null ? await models.Application.count({ where: { cohortId: cohort.id } }) : 0;

    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    const errors = [];
    const createdIds = [];
    const seenEmail = new Set();
    const seenExternal = new Set();
    const fail = (index, values, code, message, field = null) => {
      counts.failed += 1;
      errors.push({ index, externalId: values.externalId || null, email: values.email || null, field, code, message });
    };

    const records = Array.isArray(run.records) ? run.records : [];
    for (let index = 0; index < records.length; index += 1) {
      let values;
      let responses;
      try {
        ({ values, responses } = mapping.mapRecord(records[index], map));
      } catch (e) {
        fail(index, {}, 'mapping_failed', `Could not read this record: ${e.message}`);
        continue;
      }

      // ── Validate ──
      if (!values.email) { fail(index, values, 'missing_email', 'This record has no email.', 'email'); continue; }
      if (!EMAIL_RE.test(values.email)) { fail(index, values, 'invalid_email', `"${values.email}" is not an email address.`, 'email'); continue; }
      if (values.level != null) {
        if (levels.length) {
          const hit = levels.find((l) => String(l.key).toLowerCase() === values.level.toLowerCase() || String(l.label).toLowerCase() === values.level.toLowerCase());
          if (!hit) { fail(index, values, 'invalid_level', `"${values.level}" is not a level of this intake (${levels.map((l) => l.key).join(', ')}).`, 'level'); continue; }
          values.level = hit.key;
        } else {
          // The intake has no levels: keep what they sent as an answer instead.
          responses.level = values.level;
          delete values.level;
        }
      }
      if (seenEmail.has(values.email) || (values.externalId && seenExternal.has(values.externalId))) {
        fail(index, values, 'duplicate_in_batch', 'The same person appears earlier in this batch.');
        continue;
      }
      seenEmail.add(values.email);
      if (values.externalId) seenExternal.add(values.externalId);
      if (values.country) { responses.country = values.country; }

      // ── Match ──
      const identityKey = values.externalId ? String(values.externalId).slice(0, 255) : `email:${values.email}`;
      // eslint-disable-next-line no-await-in-loop
      let identity = await models.ExternalIdentity.findOne({ where: { sourceKey, externalId: identityKey } });
      // eslint-disable-next-line no-await-in-loop
      let app = identity ? await models.Application.findOne({ where: { id: identity.applicationId, cohortId: cohort.id } }) : null;
      if (!app) {
        // eslint-disable-next-line no-await-in-loop
        app = await models.Application.findOne({ where: { cohortId: cohort.id, email: values.email } });
      }

      try {
        if (!app) {
          // ── Create ──
          if (cap != null && count >= cap) { fail(index, values, 'intake_full', `The intake is at its application cap (${cap}).`); continue; }
          const fields = Object.fromEntries(COLUMNS.filter((c) => !blank(values[c])).map((c) => [c, values[c]]));
          if (run.dryRun) { counts.created += 1; count += 1; continue; }
          // eslint-disable-next-line no-await-in-loop
          await sequelize.transaction(async (transaction) => {
            app = await models.Application.create({
              cohortId: cohort.id, ...fields, source: 'api', status: 'pending', responses,
            }, { transaction });
            await this._remember(identity, sourceKey, identityKey, app.id, { ...fields, country: values.country ?? null }, transaction);
          });
          counts.created += 1;
          count += 1;
          createdIds.push(app.id);
          continue;
        }

        // ── Update ──
        if (CLOSED.includes(app.status)) {
          counts.skipped += 1;
          errors.push({ index, externalId: values.externalId || null, email: values.email, field: null, code: 'applicant_closed', message: `This applicant is ${app.status}; a sync never reopens them.` });
          continue;
        }
        const last = identity?.lastValues || {};
        const changes = {};
        for (const c of COLUMNS) {
          const next = values[c];
          if (blank(next)) continue;
          const current = app[c];
          // Only fill what's empty, or what this source set last time (an admin's edit stays).
          const ours = blank(current) || (last[c] !== undefined && current === last[c]);
          if (ours && current !== next) changes[c] = next;
        }
        if (changes.email) {
          // eslint-disable-next-line no-await-in-loop
          const taken = await models.Application.findOne({ where: { cohortId: cohort.id, email: changes.email, id: { [Op.ne]: app.id } }, attributes: ['id'] });
          if (taken) delete changes.email;
        }
        const mergedResponses = { ...(app.responses || {}), ...responses };
        const responsesChanged = JSON.stringify(mergedResponses) !== JSON.stringify(app.responses || {});
        const nothing = !Object.keys(changes).length && !responsesChanged;
        if (nothing) {
          counts.unchanged += 1;
          if (!run.dryRun && !identity) {
            // eslint-disable-next-line no-await-in-loop
            await this._remember(null, sourceKey, identityKey, app.id, this._valuesOf(app, values), null);
          }
          continue;
        }
        if (run.dryRun) { counts.updated += 1; continue; }
        // eslint-disable-next-line no-await-in-loop
        await sequelize.transaction(async (transaction) => {
          await app.update({ ...changes, ...(responsesChanged ? { responses: mergedResponses } : {}) }, { transaction });
          await this._remember(identity, sourceKey, identityKey, app.id, this._valuesOf(app, values), transaction);
        });
        identity = null;
        counts.updated += 1;
      } catch (e) {
        fail(index, values, 'internal_error', 'This record could not be saved. Try it again.');
        require('../utils/logger').error('Sync record failed', { runId: run.id, index, message: e.message });
      }
    }

    // ── After the sync: the assessment, for the people it added ──
    let assessmentsSent = 0;
    if (run.sendAssessment && !run.dryRun && createdIds.length) {
      try {
        const result = await require('../services/assessmentPipelineService').sendInvites(cohort.id, createdIds, null);
        assessmentsSent = result.sent.length;
      } catch (e) {
        require('../utils/logger').error('Sync assessment send failed', { runId: run.id, message: e.message });
      }
    }
    return { counts, errors, assessmentsSent };
  }

  /** The source's values as they stand on the applicant now (what it "owns" next time). */
  _valuesOf(app, values) {
    const out = {};
    for (const c of COLUMNS) if (!blank(values[c]) && app[c] === values[c]) out[c] = values[c];
    out.country = values.country ?? null;
    return out;
  }

  async _remember(identity, sourceKey, externalId, applicationId, lastValues, transaction) {
    if (identity) {
      await identity.update({ applicationId, lastValues }, { transaction });
      return;
    }
    const [row, created] = await models.ExternalIdentity.findOrCreate({
      where: { sourceKey, externalId },
      defaults: { sourceKey, externalId, applicationId, lastValues },
      transaction,
    });
    if (!created) await row.update({ applicationId, lastValues }, { transaction });
  }

  // ── Reading runs ───────────────────────────────────────────────────────────
  async getRun(id) {
    const run = await models.SyncRun.findByPk(id, { attributes: { exclude: ['records'] } });
    if (!run) throw coded(new NotFoundError('Job not found'), 'job_not_found');
    return run;
  }

  async listRuns({ cohortId, connectionId, limit = 50 } = {}) {
    const where = {};
    if (cohortId) where.cohortId = cohortId;
    if (connectionId) where.connectionId = connectionId;
    return models.SyncRun.findAll({
      where,
      attributes: { exclude: ['records'] },
      include: [
        { model: models.SyncConnection, as: 'connection', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] },
        { model: models.ApiKey, as: 'apiKey', attributes: ['id', 'name', 'prefix'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    });
  }

  /** A run as the public API's Job object. */
  presentJob(run) {
    const c = run.counts || {};
    return {
      id: run.id,
      status: run.status,
      dryRun: !!run.dryRun,
      intakeId: run.cohortId,
      connection: run.connectionId || null,
      total: run.total,
      counts: { created: c.created || 0, updated: c.updated || 0, unchanged: c.unchanged || 0, skipped: c.skipped || 0, failed: c.failed || 0 },
      assessmentsSent: run.assessmentsSent || 0,
      errors: run.errors || [],
      ...(run.errorMessage ? { message: run.errorMessage } : {}),
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  /** The per-record errors as CSV, for the app's download. */
  errorsCsv(run) {
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = ['row,external_id,email,field,code,message'];
    for (const e of run.errors || []) lines.push([e.index + 1, e.externalId, e.email, e.field, e.code, e.message].map(esc).join(','));
    return lines.join('\n');
  }
}

module.exports = new SyncService();
