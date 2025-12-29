# Database Setup Guide

## Prerequisites
Make sure you have PostgreSQL running and your `.env` file configured with `DATABASE_URL`.

Example `.env`:
```
DATABASE_URL=postgres://postgres:password@localhost:5432/pathment_dev
```

## Create Tables from Sequelize Models

### Method 1: Create Tables (Recommended for first time)
This creates all tables based on your Sequelize models. Safe - won't drop existing tables.

```bash
npm run db:create
```

### Method 2: Sync Database
Safe sync - creates tables only if they don't exist:
```bash
npm run db:sync
```

Alter existing tables to match models (safer than force):
```bash
npm run db:sync:alter
```

### Method 3: Reset Database (⚠️ DANGER - Deletes all data!)
Drop all tables and recreate them:
```bash
npm run db:reset
```

## Available Scripts

| Command | Description | Safety |
|---------|-------------|--------|
| `npm run db:create` | Create tables (preserves existing) | ✅ Safe |
| `npm run db:sync` | Sync models (create only if not exists) | ✅ Safe |
| `npm run db:sync:alter` | Alter tables to match models | ⚠️ Use with caution |
| `npm run db:reset` | Drop and recreate all tables | 🚨 DATA LOSS! |
| `npm run seed:admin` | Create admin user | ✅ Safe |
| `npm run test:db` | Test database connection | ✅ Safe |

## Typical Setup Workflow

1. **First time setup:**
   ```bash
   cd server
   npm run db:create
   npm run seed:admin
   ```

2. **After model changes:**
   ```bash
   npm run db:sync:alter
   ```

3. **Fresh start (development only):**
   ```bash
   npm run db:reset
   npm run seed:admin
   ```

## Verify Tables Created

After running any of the above commands, you can verify tables were created:

```bash
# Connect to PostgreSQL
psql -U postgres -d pathment_dev

# List all tables
\dt

# Describe a specific table
\d users

# Exit
\q
```

Or use the check script:
```bash
npm run check:tables
```

## Model Structure

Your models are organized in:
```
src/models/
├── auth/        # User, Token models
├── programs/    # Program, Enrollment models  
├── tasks/       # Task, Submission models
├── users/       # UserProfile, MentorProfile models
├── gamification/ # Badge, Achievement models
├── messaging/   # Message, Notification models
├── analytics/   # Analytics models
└── system/      # System models
```

## Troubleshooting

### Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Make sure PostgreSQL is running
```bash
sudo service postgresql start
```

### Database doesn't exist
```
Error: database "pathment_dev" does not exist
```
**Solution:** Create the database first
```bash
psql -U postgres
CREATE DATABASE pathment_dev;
\q
```

### Permission denied
```
Error: password authentication failed for user "postgres"
```
**Solution:** Check your DATABASE_URL in .env file

## Production Notes

⚠️ **Never use `db:reset` or `db:sync --force` in production!**

For production, use migrations instead:
```bash
npm run migrate
```
