# Pathment — Server (Express + Sequelize)

This folder contains a minimal scaffold for an Express server using Sequelize (Postgres).

Quick start

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Install dependencies from project root (or from `server/`):

```powershell
cd server
npm install
```

3. Run migrations (if you add migrations) or rely on `sequelize.sync()` for dev:

```powershell
npm run migrate
# or for quick local start
npm run dev
```

Notes
- This scaffold uses plain JavaScript (CommonJS). Models live in `src/models/` and are wired in `src/db/index.js`.
- For production use migrations (sequelize-cli / Umzug) rather than `sync()`.
