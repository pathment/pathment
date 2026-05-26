# Contributing to Pathment

Thank you for your interest in contributing to Pathment.

## Before You Start

- Check existing issues and pull requests before starting work.
- For larger changes, open an issue first so maintainers can align on scope.
- Follow the branch and pull request workflow below.

## Contribution Workflow (Fork → Clone → Branch → Commit → PR)

1. **Fork** this repository to your GitHub account.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/pathment.git
   cd pathment
   ```
3. **Create a branch** from `staging` using the naming rules below.
4. **Make focused changes** related to a single issue/task.
5. **Commit** with clear, descriptive messages.
6. **Push** your branch to your fork.
7. **Open a Pull Request** against `pathment/pathment:staging`.

## Branch Naming Convention

Use one of the following prefixes:

- `feature/<short-description>` for new features
- `fix/<short-description>` for bug fixes
- `docs/<short-description>` for documentation-only updates

Examples:

- `feature/mentor-matching-filters`
- `fix/enrollment-status-validation`
- `docs/update-onboarding-guide`

## Local Setup

## 1) Server (`/server`) — Node.js + Express + PostgreSQL

```bash
cd server
npm install
cp .env.example .env   # or create .env manually
```

Set required values in `.env` (database credentials, JWT secrets, etc.), then initialize local data:

```bash
node scripts/syncDatabase.js
node scripts/seedSkills.js
node scripts/seedAdmin.js
```

Start server:

```bash
npm run dev
```

## 2) Client Interface (`/client-interface`) — Next.js

```bash
cd client-interface
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_APP_NAME=Pathment
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Start client:

```bash
npm run dev
```

## 3) Marketing Site (`/marketing-site`) — Next.js

```bash
cd marketing-site
npm install
npm run dev
```

By default:
- Server: `http://localhost:5000`
- Client Interface: `http://localhost:3000`
- Marketing Site: `http://localhost:3001` (or next available port)

## Code Standards

- Keep PRs small, focused, and easy to review.
- Follow existing project patterns and folder structure.
- Avoid unrelated refactors in feature/bug-fix PRs.
- Update docs when behavior or workflow changes.
- Run relevant lint/build/test checks for the changed app(s) before opening a PR.

## Pull Request Guidelines

When opening a PR:

- Fill out the PR template completely.
- Link the related issue (for example: `Closes #123`).
- Explain what changed and why.
- Include screenshots/GIFs for UI changes.
- Mention any environment, migration, or rollout considerations.

## Review and Merge Process

- PRs require review from the appropriate code owners.
- Address review feedback with follow-up commits.
- Keep CI checks green for impacted projects.
- Maintainers squash or merge into `staging` once approvals and checks are complete.
- Changes are promoted from `staging` to `main` by maintainers after validation.

Thank you for helping improve Pathment for the community.
