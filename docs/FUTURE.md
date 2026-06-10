# Future Plan — improvements beyond the assignment

The architecture was designed so none of these require structural rewrites:
they extend the same two-layer model, FSM and CAS gates. The **executable,
stateful version** of this roadmap lives in
[`docs/plans/plan-0001-future-improvements.json`](plans/plan-0001-future-improvements.json)
(see [`docs/plans/README.md`](plans/README.md) for how plans are executed);
this document is the narrative.

## Prioritized improvements

### 1. Real authentication & authorization _(phase-1 — parallelizable)_

The persona toggle becomes a session (mock OIDC for the demo). Employees file
only for themselves; managers decide only for their reports; route handlers
enforce it server-side. Removes the biggest documented caveat (TRD §12).

### 2. Persistent session ledger _(phase-2 — parallelizable)_

Today a reload wipes the pending overlay (in-flight requests vanish from the
UI even though HCM has them). `zustand/persist` plus a boot-time
reconciliation pass — re-verify anything pre-confirmation against HCM records
so a rehydrated hold can never double-count.

### 3. Write idempotency _(phase-3 — parallelizable)_

Filings carry an idempotency key (the client UUID already exists). Unlocks a
safe single automatic retry after `hcm_silent` — today retries are
user-driven by design because a blind retry could double-book.

### 4. Demo-surface gating _(phase-4)_

`x-chaos`, `POST /reset` and the anniversary trigger become env-gated so a
production build exposes no test surface.

### 5. Scoped realtime + transport hardening _(phase-5 — needs auth)_

The SSE feed currently broadcasts every cell to any listener. With sessions
in place, filter per-user; add rate limiting on writes and CSP/CORS headers.

### 6. Contradiction observability _(phase-6)_

The most interesting health signal in this system is its **contradiction
rate** (verify mismatches, conflicts, silences). Counters + a metrics
endpoint turn "HCM is silently failing more than usual" into an alert
instead of a support ticket.

## Beyond the current roadmap (unscheduled)

- **Employee switcher / multi-tenant**: the data layer is already cell-keyed
  per employee; this is mostly UI.
- **WebSocket upgrade**: only if bidirectional needs appear; SSE fits today's
  one-way feed (TRD §6.6 alternatives).
- **Visual regression as a gate**: Chromatic baselines exist; flipping
  `a11y.test` to `error` and enforcing snapshot review would harden UI
  changes further.
- **Replace the in-memory mock with SQLite** for multi-instance demo
  deployments (today: per-instance state, documented in TRD §11).
- **i18n** for the UI copy (the wording is part of the honesty contract, so
  translations must preserve the verifying/awaiting/contradicted semantics).
