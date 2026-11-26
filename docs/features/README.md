# Pathment - Feature Guide

This folder is the **feature-by-feature manual** for Pathment. Each file explains one
feature end to end: what it is, why it exists, the data behind it, the backend flow, the
frontend, and - most importantly - **what each role (admin / mentor / mentee) actually
does**. Read a single file and you'll understand that feature without reading code.

> For the big picture first, read **[../ARCHITECTURE.md](../ARCHITECTURE.md)** (how the
> system fits together) and **[../DATABASE.md](../DATABASE.md)** (the full data model).
> These feature docs go one level deeper, per feature.

## How each doc is structured

Every feature file follows the same template so things are easy to find and remember:

1. **What it is** - one or two sentences.
2. **Why it exists** - the problem it solves.
3. **Data model** - the tables involved (see DATABASE.md for full columns).
4. **Backend** - key services + the API endpoints.
5. **Frontend** - the pages/components.
6. **Role flows** - the journey for admin, mentor, and mentee.
7. **Rules & edge cases** - the non-obvious logic.
8. **Related** - links to adjacent features.

## The features

### Identity & access
| Feature | What it covers |
| --- | --- |
| [Authentication](./authentication.md) | Login, JWT + refresh, 2FA, email verification, password reset, invite-based registration. |
| [Authorization (Scoped RBAC)](./authorization-rbac.md) | Permissions, built-in + custom roles bound to org/program/clan/self scopes, delegation, the Roles & Access admin page. |

### Getting people in
| Feature | What it covers |
| --- | --- |
| [Intake & Assessments](./intake-and-assessments.md) | Public program catalog, shareable cohort apply links, applications, magic-link, admin-built assessments, accept → invite → register → placement, carry-forward. |
| [System Pool](./system-pool.md) | Pre-clan selection: candidates qualify on existing work, are reviewed and scored, shortlisted, decided by a person, then placed into clans. |
| [Programs, Cohorts & Clans](./programs-cohorts-clans.md) | The org structure: programs, intake cohorts, mentor-led clans, memberships, clan change requests, cross-clan help. |
| [Public Clan Joining Link](./clan-public-join.md) | Shareable multi-use clan URLs: admin permission, Lead Mentor link + approve/reject, visitor register/login → join request. |
| [Matching & Placement](./matching-and-placement.md) | Clan-based placement + AI mentor-match suggestions. |

### Doing the work
| Feature | What it covers |
| --- | --- |
| [Roadmaps & Tasks](./roadmaps-and-tasks.md) | Org/local roadmaps, task assignment, versioned submissions, the review → feedback loop, extensions, personal tracks. |
| [Enrollment & Progress](./enrollment-and-progress.md) | The enrollment lifecycle, the single source of truth for progress, mentor-confirmed completion, program reviews. |
| [Blockers & Delays](./blockers-and-delays.md) | Friction inputs that make progress fair (accepted delays credit the mentee). |
| [Scheduling & 1:1s](./scheduling.md) | Mentor availability, booking 1:1 meetings, meeting notes, schedule templates. |

### Communication & engagement
| Feature | What it covers |
| --- | --- |
| [Messaging](./messaging.md) | Real-time 1:1 chat with delivery/read ticks and emoji reactions. |
| [Notifications & Email](./notifications-and-email.md) | The notification matrix, in-app + email, preference gating, Resend. |
| [Community](./community.md) | Scoped feeds (clan/cohort/program/global), posts, comments, kudos, Q&A, moderation. |
| [Gamification](./gamification.md) | Points, badges, challenges, leaderboards, the gift catalog + redemptions. |
| [Certificates](./certificates.md) | Template builder, certificate types + criteria, AI grading, issuance, and tier-aware layers (per-type wording and badges). |

### Insight, intelligence & knowledge
| Feature | What it covers |
| --- | --- |
| [Analytics & Insights](./analytics-and-insights.md) | Activity tracking, rollups, clan health, the fairness lens, dashboards. |
| [AI Integration (BYO keys)](./ai-integration.md) | Bring-your-own AI keys, key resolution, and the AI features (summaries, roadmaps, recommendations, matching). |
| [Knowledge: Library & Mentor Spec](./knowledge-library-and-mentor-spec.md) | The shared resource library and the single mentor handbook. |

### Personal
| Feature | What it covers |
| --- | --- |
| [Profile, Skills & Settings](./profile-skills-settings.md) | Profile + location, skills, appearance/theming, and the settings tabs (incl. notification & AI prefs). |

### Cross-cutting / platform
| Topic | What it covers |
| --- | --- |
| [Workspaces (multi-tenancy)](./multi-tenancy-workspaces.md) | How one deployment serves many organizations: workspace resolution, the ORM tenant scope, socket scoping, the rollout gate, and the known worker gaps. |
| [Platform console](./platform-console.md) | The OPERATOR surface at `/platform`: platform-admin tiers, workspace provisioning with owner activation links, plan assignment + invoice activation, per-workspace overrides, lifecycle, account-level support, lead inbox, queue/job health, append-only platform audit. |
| [Error handling & observability](../ARCHITECTURE.md#error-handling--observability) | One error envelope (`message` + `code` + `errors[]` + `requestId`), typed errors, request-id correlation, no-leak prod, structured (aggregator-ready) logging, and the client error boundaries. *(Documented in ARCHITECTURE — it's cross-cutting.)* |

---

*Keep these honest:* when you change a feature, update its file here. A doc that lies is
worse than no doc. New feature → add a file and link it in the table above.
