/**
 * CandidatePool — a selection round for people who are on the platform but not
 * yet in a clan (migration 140).
 *
 * Bound to a programme, which is the scope every `pool.*` permission is
 * checked at. The pool decides nothing on its own: it holds the configuration
 * (dates, quota, scoring weights, reminder schedule) and the list of work the
 * operators give its candidates.
 *
 * `workItems` — the qualifying work, one entry per piece:
 *   { id, kind: 'task'|'quiz'|'interview'|'course', roadmapTaskId, title,
 *     points, required, levels, dueAt, config, createdById, createdAt,
 *     cancelledAt }
 *
 * `levels` aims a piece of work at the levels the candidates applied at (keys
 * into the cohort's `levels`, as on applications). An empty list means
 * everyone, which is what every piece of work written before this meant, so
 * existing rounds are unchanged. A candidate with no level only ever receives
 * work that targets everyone.
 * Each piece has its own task template (`roadmapTaskId`); every member's
 * AssignedTask points at it, which is how a task is traced back to its piece
 * of work and how scoring knows what it is worth.
 *
 * `points` is decided when the work is added — defaulted from the step's
 * difficulty through the pool's own curve — so an operator can see what a
 * round is worth while they build it, instead of discovering it afterwards
 * from a table of percentages.
 *
 * `kind: 'course'` is an Edorax course. Its work item carries
 * `config: { courseId, courseSlug, courseTitle }`, assigning it enrolls the
 * candidate on Edorax, and it is the one kind nobody reviews: the provider
 * reports progress and the score follows that progress. See poolScoringService.
 */
const POOL_STATUSES = ['draft', 'open', 'qualifying', 'reviewing', 'placing', 'closed'];
const WORK_KINDS = ['task', 'quiz', 'interview', 'course'];

// What a piece of work is worth by default, by difficulty. The same shape and
// the same intent as config/points.js — a small, fixed curve rather than a
// hand-typed number per piece — but per pool, because one round can weigh a
// hard project more heavily than another does.
const { TASK_POINTS_BY_DIFFICULTY } = require('../../config/points');
const DIFFICULTY_POINTS = { ...TASK_POINTS_BY_DIFFICULTY };

module.exports = (sequelize, DataTypes) => {
  const CandidatePool = sequelize.define('CandidatePool', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    cohortId: { type: DataTypes.UUID, allowNull: true, field: 'cohort_id' },
    name: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft',
      validate: { isIn: [POOL_STATUSES] },
    },
    // How many people the pool may hold. NULL = no limit.
    capacity: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
    // How many the proposed shortlist selects. Never hard-coded.
    selectionQuota: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'selection_quota', validate: { min: 1 } },
    opensAt: { type: DataTypes.DATE, allowNull: true, field: 'opens_at' },
    closesAt: { type: DataTypes.DATE, allowNull: true, field: 'closes_at' },
    qualificationDueAt: { type: DataTypes.DATE, allowNull: true, field: 'qualification_due_at' },
    // { version, mode: 'points', difficultyPoints: { easy, medium, hard, expert } }
    // The curve a new piece of work takes its points from. Validated by
    // poolService.validateScoringPolicy before it is stored. `components` is
    // kept on older rows and ignored: scores are points now, not percentages.
    scoringPolicy: {
      type: DataTypes.JSONB, allowNull: false, field: 'scoring_policy',
      defaultValue: { version: 1, mode: 'points', difficultyPoints: DIFFICULTY_POINTS },
    },
    // { enabled, inviteAfterDays, inviteMaxCount, dueSoonHours, inactivityDays, inactivityMaxCount }
    reminderPolicy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'reminder_policy' },
    // { awardPoints, autoAssignOnActivation, waitlistSize, targetClanIds }
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    workItems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'work_items' },
    // The pool's photo, shown wherever a clan photo is. See migration 142.
    avatarUrl: { type: DataTypes.TEXT, allowNull: true, field: 'avatar_url' },
    createdById: { type: DataTypes.UUID, allowNull: true, field: 'created_by_id' },
    archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
  }, {
    tableName: 'candidate_pools',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['status'] },
    ],
  });

  CandidatePool.STATUSES = POOL_STATUSES;
  CandidatePool.WORK_KINDS = WORK_KINDS;
  CandidatePool.DIFFICULTY_POINTS = DIFFICULTY_POINTS;

  CandidatePool.associate = (models) => {
    CandidatePool.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    CandidatePool.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    CandidatePool.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
    CandidatePool.hasMany(models.PoolMember, { foreignKey: 'pool_id', as: 'members' });
  };

  return CandidatePool;
};
