/**
 * Recompute every enrollment's progress with the difficulty weighting.
 *
 * `overallProgressPercentage` is stored on the enrollment and only recalculated
 * when one of that mentee's tasks changes status. So switching the formula from
 * a row count to a difficulty weighting changes nothing anybody can see until
 * each mentee happens to finish something, and until then a mentee's bar, their
 * score and their mentor's dashboard all disagree.
 *
 * This runs the same service method a task completion would, so there is no
 * second copy of the formula to drift from the first.
 *
 * Safe to run repeatedly: it recomputes from the tasks rather than adjusting
 * what is already there, so running it twice gives the same answer as once.
 *
 * Run:        node server/scripts/backfill-weighted-progress.js
 * Dry run:    node server/scripts/backfill-weighted-progress.js --dry
 */
require('dotenv').config();

const { models, sequelize } = require('../src/db');
const taskService = require('../src/services/taskService');

async function main() {
  const dry = process.argv.includes('--dry');

  console.log(`▶ Recomputing enrollment progress${dry ? ' (dry run, nothing will be written)' : ''}`);

  const enrollments = await models.Enrollment.findAll({
    attributes: ['id', 'overallProgressPercentage']
  });

  console.log(`  ${enrollments.length} enrollments to check`);

  let changed = 0;
  let same = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    const before = Math.round(Number(enrollment.overallProgressPercentage) || 0);

    try {
      if (dry) {
        // Read only: work out what it WOULD become, without writing.
        const { difficultyWeight } = require('../src/config/scoring');
        const tasks = await models.AssignedTask.findAll({
          where: { enrollmentId: enrollment.id },
          include: [
            { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['difficulty'], required: false }
          ]
        });
        const live = tasks.filter((t) => t.status !== 'cancelled');
        const total = live.reduce((s, t) => s + difficultyWeight(t.roadmapTask?.difficulty), 0);
        const done = live
          .filter((t) => t.status === 'completed')
          .reduce((s, t) => s + difficultyWeight(t.roadmapTask?.difficulty), 0);
        const after = total > 0 ? Math.round((done / total) * 100) : 0;

        if (after === before) same += 1;
        else {
          changed += 1;
          console.log(`  ${enrollment.id.slice(0, 8)}  ${before}% → ${after}%`);
        }
        continue;
      }

      await taskService.updateEnrollmentTaskStats(enrollment.id);
      await enrollment.reload();
      const after = Math.round(Number(enrollment.overallProgressPercentage) || 0);

      if (after === before) same += 1;
      else {
        changed += 1;
        console.log(`  ${enrollment.id.slice(0, 8)}  ${before}% → ${after}%`);
      }
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${enrollment.id.slice(0, 8)} failed: ${error.message}`);
    }
  }

  console.log(
    `\n${dry ? '✓ Dry run complete' : '✅ Done'} — ${changed} changed, ${same} already correct` +
      (failed ? `, ${failed} failed` : '')
  );

  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Backfill failed:', error.message);
    process.exit(1);
  });
