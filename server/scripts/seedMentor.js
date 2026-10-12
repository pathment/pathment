require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const bcrypt = require("bcrypt");
const { sequelize, models } = require("../src/db");
const clanService = require("../src/services/clanService");

async function seedMentor() {
  try {
    await sequelize.authenticate();
    const slug = String(process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends').toLowerCase();
    const org = await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true });
    if (!org) {
      console.error("Organization not found. Run seedAdmin.js first.");
      process.exit(1);
    }

    let mentor = await models.User.findOne({ where: { email: "mentor@pathment.com" } });
    if (!mentor) {
      const hashedPassword = await bcrypt.hash("Mentor@123!ChangeMeNow", 12);
      mentor = await models.User.create({
        firstName: "Alex",
        lastName: "Mentor",
        email: "mentor@pathment.com",
        passwordHash: hashedPassword,
        role: "mentor",
        emailVerified: true,
        emailVerifiedAt: new Date(),
        status: "active",
      });

      await models.MentorProfile.findOrCreate({
        where: { userId: mentor.id },
        defaults: {
          userId: mentor.id,
          specialization: ["Full Stack", "React", "Node.js"],
          yearsOfExperience: 5,
          maxMentees: 10,
        },
      });

      await models.OrganizationMembership.findOrCreate({
        where: { organizationId: org.id, userId: mentor.id },
        defaults: { role: "member", status: "active", joinedAt: new Date() },
      });
      console.log("Created user mentor@pathment.com");
    }

    // Ensure a program and clan exist so the mentor has clan-scoped lead_mentor permissions
    let program = await models.Program.findOne({ where: { organizationId: org.id } });
    if (!program) {
      program = await models.Program.create({
        organizationId: org.id,
        name: "Web Development Fellowship",
        description: "Hands-on mentor-led web engineering program.",
        status: "published",
        type: "mentorship",
        totalDurationWeeks: 12,
        createdBy: mentor.id,
      });
      console.log("Created program: Web Development Fellowship");
    }

    let clan = await models.Clan.findOne({ where: { programId: program.id } });
    if (!clan) {
      clan = await models.Clan.create({
        programId: program.id,
        name: "Alpha Clan",
        leadMentorId: mentor.id,
        createdBy: mentor.id,
      });
      await clanService.addMember(clan.id, { userId: mentor.id, role: "lead_mentor" });
      console.log("Created clan: Alpha Clan with lead mentor");
    } else {
      await clanService.addMember(clan.id, { userId: mentor.id, role: "lead_mentor" });
    }

    console.log("\n🎉 Mentor account ready!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 Email:    mentor@pathment.com");
    console.log("🔑 Password: Mentor@123!ChangeMeNow");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding mentor:", err);
    process.exit(1);
  }
}

seedMentor();
