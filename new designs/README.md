# Pathment — Internal Workspace (post-login screens)

A runnable, premium prototype of Pathment's **internal product** — the screens
people see *after* login, for all three roles. Built to feel calm, premium and
low-friction (fast in, fast out), not "AI-ish".

## Run it

```bash
cd "new designs"
npm install
npm run dev        # opens http://localhost:5180
```

Switch roles from the **Mentor / Mentee / Admin** toggle in the sidebar.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · lucide-react · React Router.
No backend — everything runs on local mock data so the flows feel real.

## What's inside

**Mentor**
- **Cockpit** (`/mentor/cockpit`) — cohort overview, one card per mentee, filterable by "needs attention / awaiting review / at risk / going well".
- **Cohort Review** (`/mentor/review`) — the flagship guided, keyboard-driven (← → / A) weekly review with inline approve / request-changes / note.
- **Mentee Profile** (`/mentor/mentee/:id`) — one person's full story: AI summary, absolute-vs-relative progress, work history, delays + reasons, blockers, working style, 1:1 notes.
- **Approvals** (`/mentor/approvals`) — one fast queue across the cohort with inline checklists and bulk approve.
- **At-risk** (`/mentor/at-risk`) — AI-ranked, separating "struggling despite effort" from "disengaged", with nudge / escalate.

**Mentee**
- **This Week** (`/mentee/this-week`) — calm home, the single most important next action up top.
- **Task Detail** (`/mentee/task/:id`) — submit work · request extension · log a blocker/friction (framed so logging *helps* them).
- **My Progress** (`/mentee/progress`) — both scales, measured fairly and supportively.

**Admin**
- **Program Health** (`/admin/health`) — the RAG "task force" dashboard.
- **People** (`/admin/people`) — searchable directory into any profile.

## The two product ideas this prototype leans on

1. **Relative vs absolute progress** (`DualProgress`) — shown side-by-side everywhere, so someone fighting real constraints (job, power cuts, shared hardware) isn't punished, and someone coasting isn't missed.
2. **Explainable AI** (`AISummary`, `AiTag`) — every AI read shows the signals it used and never gates a human decision; styled as a quiet tinted panel, not a robot.

## Structure

```
src/
  lib/        types.ts, ui.tsx        — design-system primitives
  data/       mock.ts                  — the cohort + programs
  components/ AppShell, Sidebar/Topbar, Page, DualProgress, AISummary, nav
  pages/      mentor/ · mentee/ · admin/
```

Reference mockups live in `examples/`.
