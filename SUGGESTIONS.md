# Pathment Suggestions

A living, open list of suggestions and proposals for Pathment. Anyone can add
one. This is where ideas live before they become work, so we can discuss the
problem and the proposal in the open before anyone writes code.

If you just have a quick idea, that is fine too. Add it under
[Quick ideas](#quick-ideas) and someone can flesh it out later.

## How to add a suggestion

1. Copy the [template](#template) below.
2. Fill it in. Keep the Problem and the Proposal short and concrete.
3. Add it to [Open suggestions](#open-suggestions) with the next `S-###` number.
4. Open a pull request that adds your entry. Discussion happens on the PR.

A suggestion does not need to be perfect or fully designed. A clear problem and
a rough direction is enough to start.

### Statuses

| Status            | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| Proposed          | Written down, not yet discussed.                               |
| Under discussion  | Being talked through. Open questions remain.                   |
| Accepted          | Agreed to do. Not built yet.                                   |
| Shipped           | Built and released. Links to the commit or PR.                 |
| Declined          | Decided against, with a short reason so we remember why.       |

### Conventions

- Number entries `S-001`, `S-002`, and so on. Never reuse a number.
- Write in plain language. Avoid em-dashes and AI-ish characters in copy, the
  product does too. Use regular hyphens, commas, and periods.
- One suggestion per entry. If it has several independent parts, split it.

## Template

Copy everything in the block below for a new entry.

```markdown
### S-XXX: Short, plain title

- **Status:** Proposed
- **Author:** your name
- **Date:** YYYY-MM-DD
- **Area:** which part of the product (e.g. Mentor > Mentee profile > Schedule)

**Problem**
What is wrong or missing today, and who feels it. One short paragraph.

**Proposal**
What to change. Be concrete. Bullet points are good.

**Why it helps**
The user or product outcome. Why this is better than today.

**Scope and risks**
Roughly how big it is and what could break or regress.

**Alternatives considered**
Other approaches and why this one wins, if relevant.

**Open questions**
Anything still undecided.
```

## Open suggestions

Nothing open right now. Add yours here.

## Shipped

### S-001: Simplify the per-mentee schedule slot and task-linking flow

- **Status:** Shipped (`56b5ce3`)
- **Author:** Pathment team
- **Date:** 2026-06-03
- **Area:** Mentor > Mentee profile > Schedule and tracks (`SchedulePanel`)

**Problem**
Setting up a mentee's day and linking each slot to a roadmap or a recurring
task was harder than it should be. Each roadmap slot crammed five controls into
one row (Start, Tasks, a cryptic 1:1 icon, Change, and a delete), which made
rows wrap and made it unclear what to click. Slot icons were assigned by
position, so "Breakfast" could show a moon. The roadmap chain builder showed the
selected roadmaps in one order and the numbered chain in another, with no way to
reorder, and the work was split across three surfaces (Assign / Change, a
separate Tasks button, and a Track Manager modal).

**Proposal**

- Clean each slot row down to: a meaningful time-of-day icon, the slot name and
  time, what runs there, an inline step control when a roadmap is active, and a
  single Edit button plus remove.
- Replace the three surfaces with one slot editor that handles everything:
  - Choose Roadmap or Recurring task with two clear cards that say what each
    one does ("Auto-assigns tasks, step by step" vs "Repeats, like a daily
    talk").
  - Build the roadmap chain as an ordered list you can reorder and remove, and
    add roadmaps from a searchable picker.
  - Set the cadence (Every day / Weekdays / Weekend) and toggle 1:1 booking
    with a labeled checkbox instead of a mystery icon.
- Pick slot icons by time of day so they read meaningfully.

**Why it helps**
Creating a schedule and linking it to tasks is the core mentor setup loop. The
old flow looked complex and cluttered for something that should be simple. One
row, one button, one editor makes the model obvious: a slot runs a roadmap that
auto-assigns tasks, or a recurring task. Reordering and searching make building
a multi-roadmap chain quick.

**Scope and risks**
Contained to `SchedulePanel.tsx`. The standalone Track Manager modal is no longer
used from the panel. Stepping and chain reordering are now one click each, but a
one-click "jump to an arbitrary step" was folded into the inline back and
forward stepper. Low risk, no data model changes.

**Open questions**
Should a one-click "jump to step N" return inside the editor for power users, or
is back and forward stepping enough?

## Quick ideas

A scratchpad for one-liners. Promote any of these into a full entry when ready.

- Group the long mentor sidebar into sections (Core, Growth, Org) so it is not a
  single long list.
- Let a mentor fill a slot's roadmap or recurring task for several mentees at
  once, not just one at a time.
- Persist community posts, announcements, and promotions to the shared store so
  they survive a reload and can drive real notifications.
