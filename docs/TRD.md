# Technical Requirement Document — ExampleHR Time-Off Frontend

**Status:** Approved · **Author:** Luis Juárez (spec) + agentic implementation · **Date:** 2026-06-10

---

## 1. Problem Statement

ExampleHR's Time-Off module is the primary interface for employees to request time off, but the HCM system (Workday/SAP) — not ExampleHR — owns the balance data. The frontend must present balances and request workflows that feel **instant and trustworthy** while the underlying numbers can:

- change underneath an open session (work-anniversary bonuses, year-start refreshes),
- reject a request that the UI already acknowledged,
- fail **silently** (a `200 OK` that did not actually apply),
- conflict with a concurrent mutation made by another actor.

Two personas constrain every decision:

- **The Employee** wants an accurate balance and instant feedback. They must **never** be told "approved" and later "actually, denied."
- **The Manager** must approve against a balance that is valid **at the moment of approval**, not minutes ago.

## 2. Challenges (enumerated)

| #   | Challenge                                                              | Where it is addressed                                        |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| C1  | Instant feedback vs. authoritative data owned elsewhere                | §4 (provenance model), §5 (FSM)                              |
| C2  | Balances mutate underneath an open session (anniversary bonus)         | §6 (reconciliation)                                          |
| C3  | A success response can still be wrong (silent failure / wrong-success) | §5 (`accepted_unverified` state + verification read)         |
| C4  | Background refresh racing an in-flight user action                     | §6 (two-layer model makes the race unrepresentable)          |
| C5  | Manager must decide on a _current_ balance                             | §7 (fresh read + version gate on approve)                    |
| C6  | Batch corpus endpoint is authoritative but expensive                   | §6 (hydration + low-frequency reconciliation only)           |
| C7  | HCM may be slow or silent                                              | §6 (staleness signal, retries with backoff, non-blocking UI) |
| C8  | Multiple rows per employee (per-location balances)                     | §4 (cell-keyed model: `employeeId × locationId`)             |

## 3. Core Architectural Decision: Optimistic _with provenance_

### 3.1 Options considered

**A. Pessimistic UI.** Block every interaction until HCM confirms. Honest but fails the "instant feedback" requirement; every submit becomes a spinner gated on a system we already know can be slow. Rejected.

**B. Classic optimistic updates (cache patching).** Patch the query cache in `onMutate`, roll back in `onError` (the standard TanStack Query recipe). Fast, but it has two structural problems for this domain:

1. _It lies by construction._ The UI renders the patched number as if HCM had confirmed it. The employee persona forbids exactly this ("approved… actually, denied").
2. _Background refetches race the patch._ A corpus refetch landing mid-mutation overwrites the optimistic value; the standard mitigation (`cancelQueries` + careful merge rules) is convention, not guarantee — precisely the kind of code future contributors silently break.

**C. Optimistic with provenance (chosen).** Keep two layers that never write to each other:

- **Confirmed layer** — the last value HCM actually returned, with `version` and `updatedAt`. Owned by the server-state cache (TanStack Query). Only HCM responses write here.
- **Pending overlay** — local commands (requests in flight) expressed as deltas. Owned by a client ledger (Zustand). Only user actions write here.

The UI renders the **projection**: `projected = confirmed + Σ(pendingDeltas)`, and _always shows the split_ ("10 days confirmed · −2 pending"). The user gets instant feedback (the projection moves immediately) without ever being shown an unconfirmed number as truth.

### 3.2 Why this resolves the challenges

- **C1**: the projection moves instantly; the provenance badge keeps it honest.
- **C3**: a write success does **not** confirm anything — confirmation requires a subsequent authoritative read (§5).
- **C4**: a background refresh updates only the confirmed layer; pending deltas survive untouched and re-project on top. The race condition is not "handled" — it is **unrepresentable**. There is no merge rule to get wrong.

## 4. Domain Model

```
CellKey            = `${employeeId}:${locationId}`           (C8: per-employee, per-location)
BalanceCell        = { employeeId, locationId, days, version, updatedAt }   // what HCM confirmed
PendingCommand     = { id, cellKey, requestId, deltaDays, state: RequestState }
BalanceCellView    = {
  confirmed:  BalanceCell | undefined,
  pending:    readonly PendingCommand[],
  projected:  number,
  staleness:  'fresh' | 'aging' | 'stale',                   // age of confirmed.updatedAt (C7)
}
```

All domain code lives in `src/domain/` with **zero React imports** — pure functions over immutable data, so the invariants are testable with property-based tests (fast-check):

- `projected === (confirmed?.days ?? 0) + Σ pending.deltaDays` — for **any** sequence of events.
- A confirmed-layer update never removes or mutates pending commands.
- No event sequence can produce an illegal request state (see §5).

## 5. Request Lifecycle — a finite state machine

```
draft ──submit──▶ submitting ──2xx──▶ accepted_unverified ──verify-read──▶ confirmed
                     │                        │
                     │4xx/409                 │verify-read mismatch
                     ▼                        ▼
                   denied                contradicted ──user action──▶ recovered
                     ▲                        ▲        (retry w/ fresh balance, or discard)
                     └────────────────────────┘
            (timeout/silence → still recoverable via reconciliation)
```

Implemented as a **pure reducer** (`requestReducer(state, event)`) with a discriminated union of states and events — no XState dependency needed; exhaustiveness is enforced by the TypeScript compiler (`switch-exhaustiveness-check`).

**The load-bearing state is `accepted_unverified`** (C3). HCM "usually returns a clear error — but not always," so a `200` merely moves the request to `accepted_unverified`. The data layer then issues an **authoritative per-cell read**:

- If the read reflects the write → `confirmed`. Only now does the pending delta fold into the confirmed layer (it disappears from the overlay because HCM's number now includes it).
- If it does not → `contradicted`. The UI presents recovery: _retry against the fresh balance_ or _discard_. The employee was never told "approved" — they were told "pending confirmation," which is the truth.

**Storybook mapping:** every meaningful UI state demanded by the assignment is a node or edge of this machine plus the staleness signal, so stories are derived mechanically from the FSM rather than invented ad hoc (§9).

## 6. Data-Fetching & Cache Strategy

### 6.1 Tool choice (alternatives considered)

| Option                           | Verdict                                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TanStack Query v5** (chosen)   | Owns the confirmed layer: dedupe, retries with backoff, focus/interval refetch, per-key invalidation. We deliberately do **not** use its optimistic-update recipe (see §3.1-B).                                 |
| SWR                              | Same niche, fewer primitives (no mutation lifecycle hooks, weaker invalidation API). No advantage here.                                                                                                         |
| RTK Query / Redux                | Heavier; we don't need global actions/middleware. The ledger is small and Zustand covers it with less ceremony.                                                                                                 |
| Server Actions + `useOptimistic` | Couples the verification flow to RSC plumbing that Storybook and Vitest exercise poorly; the assignment weighs test rigor heavily. Rejected for the data layer; route handlers are still used for the mock HCM. |
| Hand-rolled fetch layer          | Re-implements retries/dedupe/caching that TanStack provides; more surface for bugs with zero rubric upside.                                                                                                     |

**Zustand** holds the pending ledger + UI state: tiny API, selector-based subscriptions, trivially testable outside React.

### 6.2 Cache topology & invalidation

- `['cell', employeeId, locationId]` — per-cell query, backed by the **real-time authoritative endpoint**. `staleTime: 15s` for grid display; **`staleTime: 0` for decision contexts** (manager approval panel).
- `['corpus']` — the expensive batch endpoint (C6). Used exactly twice per concern: initial hydration (it **seeds** the per-cell keys via `setQueryData`, so the grid never waterfalls N cell requests) and periodic reconciliation (60s interval + on window focus).
- Invalidation points:
  - after a verification read (regardless of outcome) → invalidate that cell;
  - after manager approve/deny → invalidate the affected cell + pending-requests list;
  - on `409 CONFLICT` → invalidate that cell (the version moved underneath us);
  - corpus arrival → `setQueryData` per cell (cheaper than invalidating N keys and refetching N times).

### 6.3 Background refresh vs in-flight action (C4, explicitly)

The corpus poll and a user's in-flight request can interleave arbitrarily. Because the layers are write-isolated (§3.1-C), every interleaving resolves the same way: confirmed data lands in the cache, the overlay re-projects, the UI shows the new projection plus the still-pending delta. A property-based test generates random interleavings of `{corpus-arrival, submit, verify-success, verify-mismatch, bonus}` and asserts the invariants of §4 hold for all of them.

### 6.4 Mid-session balance changes (C2)

When a reconciliation (corpus or cell read) changes a confirmed value while the session is open:

- the projection recalculates automatically (subscription), and
- a **ReconciliationToaster** announces the delta with its cause when known ("Your balance changed: +1 day — work anniversary 🎉"), satisfying "reconcile without surprising them."

### 6.5 Degradation (C7)

- Retries with exponential backoff (TanStack default, capped) for reads; **no automatic retry for writes** (a silent failure followed by a blind retry could double-book — instead the verification read decides).
- `staleness` derives from `confirmed.updatedAt` age: `fresh < 30s ≤ aging < 2min ≤ stale`. Stale cells render a visible badge; the UI never blocks on HCM.
- Writes carry `expectedVersion` (compare-and-swap). A `409` is a first-class domain event (→ `contradicted`), not an exception.

### 6.6 Real-time push (SSE)

Polling alone leaves a window of up to 60s where an external mutation (bonus, a manager deciding elsewhere) is invisible. The mock HCM therefore also exposes `GET /api/hcm/events` — a **Server-Sent Events** stream of confirmed cell changes — and the employee view subscribes (`useRealtimeBalances`).

- **Same merge rules as the corpus** (`reconcileRealtimeEvent`): versions win over arrival order, never regress a cell. SSE is a faster delivery path for the same truth, not a second source of truth.
- **Narration is provenance-aware**: external changes toast ("Balance updated by HCM"); changes explained by this session's own in-flight request stay silent — the SSE echo of your own write can beat the verification read, and toasting your own action is noise.
- **Graceful degradation**: the corpus poll remains the safety net. The UI discloses its freshness mode ("● Live" / "○ Polling"). On serverless the stream is cut at function timeout; EventSource auto-reconnects.
- _Alternatives_: WebSocket (bidirectional — unneeded, HCM only pushes; heavier infra) and long-polling (worse latency/cost). SSE is the minimal primitive that fits a one-way feed.

## 7. Manager Decision Integrity (C5)

Opening a pending request's decision panel triggers a **fresh authoritative cell read** (`staleTime: 0`); Approve/Deny stay disabled until it lands, and the approval payload carries the `version` from that read. If HCM's version has advanced by approval time, the mock returns `409`, the panel re-reads and re-arms with the new balance. The guarantee is structural (CAS), not temporal ("we fetched recently").

## 8. Component Tree → Concern Mapping

Layering rule (enforced by folder structure): `domain/` (pure logic, no React) → `data/` (hooks, no JSX) → `components/` (presentational, props-in/JSX-out, no fetching) → `views/` (containers wiring data hooks to components).

```
<EmployeeView>                          [container: wires data hooks]
  <BalanceGrid>                         [layout]
    <BalanceCellCard cellView=… />      [presentational: projected + <ProvenanceBadge/>]
  <RequestForm onSubmit=… />            [presentational: validation only]
  <RequestList>
    <RequestTimeline request=… />       [presentational: renders the FSM trajectory]
<ManagerView>                           [container]
  <PendingRequestCard>
    <DecisionPanel cellView=… gate=… /> [presentational: version-gated Approve/Deny]
<ReconciliationToaster/>                [container: subscribes to reconciliation events]
<ProvenanceBadge/>                      [shared: confirmed / pending / stale]
```

Presentational components receive `BalanceCellView` / FSM states as plain props — Storybook renders any UI state by constructing a value, with no network or provider scaffolding.

## 9. Mock HCM Design

The mock's brain is a **pure module** (`src/mocks/hcm-store.ts`, framework-free) exposed twice — as Next.js route handlers (app, e2e, deployed demo) and as MSW handlers (Storybook, unit tests). One brain, zero drift between environments.

| Endpoint                                                 | Behavior                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/hcm/balance/[employeeId]/[locationId]`         | Authoritative per-cell read                                                                            |
| `PUT  …same…`                                            | CAS write: validates `expectedVersion` (→`409`) and sufficient balance (→`422`)                        |
| `GET /api/hcm/corpus`                                    | Full corpus, artificial latency (it is "expensive")                                                    |
| `POST /api/hcm/requests`, `PATCH /api/hcm/requests/[id]` | Request lifecycle; approve debits via CAS                                                              |
| `POST /api/hcm/triggers/anniversary`                     | Fires the bonus deterministically (tests/stories); a timer drives it in demo mode (`HCM_DEMO_CHAOS=1`) |
| `POST /api/hcm/reset`                                    | Re-seed; test isolation                                                                                |
| `GET /api/hcm/events`                                    | SSE stream of confirmed-cell changes (§6.6)                                                            |

**Determinism by injection:** chaos is requested per call via the `x-chaos` header — `silent-failure` (200, no effect), `wrong-success` (200, wrong effect), `conflict`, `latency:<ms>`, `error`. Tests inject exactly the failure under test; demo mode rolls probabilities. This is the difference between "we have chaos" and "we can _prove_ behavior under chaos."

## 10. Test Strategy — what guards what

Deliberate split: each layer is guarded by the cheapest test type that can catch its regressions, and the expensive layers only assert what cheaper ones cannot.

| Layer                     | Tool                                         | Guards against                                                                                                                                                          |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain (FSM, projection)  | Vitest + **fast-check**                      | Invariant violations under _any_ event interleaving; illegal states; a future contributor "simplifying" the reducer into a lie                                          |
| Mock HCM store            | Vitest (unit)                                | CAS, insufficient balance, bonus, chaos determinism — keeps the test harness itself trustworthy                                                                         |
| Data layer                | Vitest + MSW                                 | Verification-read flow, contradiction handling, corpus seeding, 409→contradicted, no-retry-on-write                                                                     |
| Presentational components | Testing Library                              | Each FSM/staleness state renders the right affordances                                                                                                                  |
| **Storybook stories**     | addon-vitest (browser mode) + play functions | Every declared UI state _is a test_: loading, empty, stale, optimistic-pending, optimistic-rolled-back, HCM-rejected, HCM-silently-wrong, balance-refreshed-mid-session |
| E2E                       | Playwright vs real route handlers            | The full wiring: employee submits → manager approves; silent failure → contradiction → recovery; mid-session bonus → reconciliation toast; version-gated approval       |

Rationale: the FSM/property tests are the deepest guard (they outlive UI rewrites); Storybook tests double as documentation of every state the assignment demands; Playwright is kept thin (slow, brittle) and only covers cross-layer wiring no other layer can see.

## 11. Risks & Mitigations

- **Verification read races a concurrent external mutation** (bonus lands between write and verify): the verify compares _effect_ (expected delta applied) not absolute equality; ambiguous cases resolve to `contradicted` — the safe direction (never over-promise).
- **In-memory mock resets on serverless cold start** (Vercel): acceptable for a demo; documented. E2E runs against a long-lived dev server.
- **Polling cost**: corpus every 60s is the deliberate trade (C6) — per-cell reads stay on-demand.

## 12. Out of Scope

Authentication/authorization, multi-tenant concerns, real HCM connectors, i18n, and persistence beyond the in-memory mock. The employee/manager switch is a UI toggle, not a security boundary.
