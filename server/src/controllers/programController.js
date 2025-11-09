const { models } = require('../db');

const enroll = async (req, res, next) => {
  try {
    const programId = req.params.id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required in body' });

    // ensure program and user exist
    const program = await models.Program.findByPk(programId);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    const user = await models.User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // create enrollment (idempotent - ignore if exists)
    const [enrollment, created] = await models.ProgramEnrollment.findOrCreate({
      where: { program_id: program.id, user_id: user.id },
      defaults: { status: 'enrolled' }
    });

    return res.status(created ? 201 : 200).json({ enrollment });
  } catch (err) {
    next(err);
  }
};

const createProgram = async (req, res, next) => {
  try {
    const { title, description, createdBy } = req.body;
    if (!title || !createdBy) return res.status(400).json({ error: 'title and createdBy required' });

    const user = await models.User.findByPk(createdBy);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Only admin can create programs' });

    const program = await models.Program.create({ title, description, created_by: createdBy });
    return res.status(201).json({ program });
  } catch (err) {
    next(err);
  }
};

module.exports = { enroll, createProgram };
