# 0006 — Bring-your-own AI key, routed per feature

**Status:** accepted, in production.

## Decision

Pathment ships no AI provider key of its own. A workspace (or an individual mentor)
supplies a provider key, it is stored encrypted, and each AI feature is routed to
whichever connection is configured for it.

## Evidence in this repository

- `server/src/models/system/AIConnection.js` — the stored connection.
- `server/src/services/aiConnectionService.js` — *"encrypted at rest and only ever
  surfaced masked"*; `encrypt()` at line 53, `keyEncrypted` written at line 91.
- `server/src/routes/aiConnections.js` — admin surface for managing connections.
- A connection can be org-wide (`ownerId` null) or personal to a mentor
  ([../ARCHITECTURE.md §7](../ARCHITECTURE.md)).
- AI-derived roadmap changes persist as `AdaptiveRecommendation` rows for a human to
  approve before they apply.
- Longer write-up: `articles/06-bring-your-own-key.md` *(local only, untracked)*.

## What it buys

- No per-tenant inference cost on the platform, and no shared key to rate-limit.
- A workspace keeps its own data-processing relationship with its provider.
- AI features degrade to "not configured" rather than breaking when no key exists.

## What it costs

- Every AI code path must handle "no connection for this feature" as a normal state.
- Key material lives in the database; the encryption key is an operational secret.
- Provider behaviour varies, so prompts cannot assume one model's quirks.

## Rule for new AI features

Resolve the connection through the AI connection layer. Never read a provider key from
the environment, and never fail a user-facing flow because an AI call failed —
surface it, or fall back.

## Related

[features/ai-integration.md](../features/ai-integration.md), [../RAG_README.md](../RAG_README.md)
