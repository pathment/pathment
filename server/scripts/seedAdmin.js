require("dotenv").config();
const bcrypt = require("bcrypt");
const { sequelize, models } = require("../src/db");

/**
 * Seed initial admin user
 * Run with: npm run seed:admin
 */
async function seedAdmin() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    // Check if admin already exists
    const existingAdmin = await models.User.findOne({
      where: { email: "admin@pathment.com" },
    });

    if (existingAdmin) {
      console.log("❌ Admin user already exists");
      console.log("📧 Email: admin@pathment.com");
      console.log(
        "💡 Use this account to login or create new admins via API\n"
      );
      process.exit(0);
    }

    console.log("🔨 Creating admin user...");

    // Create admin user
    const hashedPassword = await bcrypt.hash("Admin@123!ChangeMeNow", 12);

    const admin = await models.User.create({
      firstName: "System",
      lastName: "Admin",
      email: "admin@pathment.com",
      passwordHash: hashedPassword,
      role: "admin",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      status: "active",
    });

    console.log("✅ User created");
    console.log("🔨 Creating admin profile...");

    // Create admin profile
    await models.AdminProfile.create({
      userId: admin.id,
      permissions: ["all"],
      canManageUsers: true,
      canManagePrograms: true,
      canManageContent: true,
      canViewAnalytics: true,
      canManageSettings: true,
    });

    console.log("✅ Admin profile created\n");
    console.log("🎉 Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 Email:    admin@pathment.com");
    console.log("🔑 Password: Admin@123!ChangeMeNow");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      "⚠️  IMPORTANT: Change this password immediately after first login!"
    );
    console.log("   Use POST /api/auth/change-password\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error seeding admin:", error.message);
    if (error.original) {
      console.error("   Details:", error.original.message);
    }
    process.exit(1);
  }
}

seedAdmin();
