module.exports = (sequelize, DataTypes) => {
  const ScheduledJob = sequelize.define('ScheduledJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    jobName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'job_name'
    },
    jobType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'job_type'
    },
    cronExpression: {
      type: DataTypes.STRING(100),
      field: 'cron_expression'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    lastRunAt: {
      type: DataTypes.DATE,
      field: 'last_run_at'
    },
    nextRunAt: {
      type: DataTypes.DATE,
      field: 'next_run_at'
    },
    lastRunStatus: {
      type: DataTypes.STRING(50),
      field: 'last_run_status'
    },
    lastRunDurationMs: {
      type: DataTypes.INTEGER,
      field: 'last_run_duration_ms'
    },
    lastRunError: {
      type: DataTypes.TEXT,
      field: 'last_run_error'
    },
    totalRuns: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_runs'
    },
    successfulRuns: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'successful_runs'
    },
    failedRuns: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'failed_runs'
    },
    jobConfig: {
      type: DataTypes.JSONB,
      field: 'job_config'
    }
  }, {
    tableName: 'scheduled_jobs',
    underscored: true,
    indexes: [
      { fields: ['job_name'] },
      { fields: ['is_active'] },
      { fields: ['next_run_at'] }
    ]
  });

  ScheduledJob.associate = (models) => {
    // No associations needed
  };

  return ScheduledJob;
};
