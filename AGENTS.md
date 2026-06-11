<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Known gotchas already hit in this repo:

- Route handler `params` are a **`Promise`** — always `await context.params`.
- App Router folders prefixed with `_` are **private** and excluded from
  routing (a `__reset/route.ts` silently 404'd; it lives at `reset/` now).

<!-- END:nextjs-agent-rules -->

# ExampleHR Time-Off — Project Guide

Take-home assignment: a Time-Off frontend where the **HCM (Workday/SAP) owns
the balances**, not us. The UI gives instant feedback while staying honest:
balances mutate underneath open sessions, a `200 OK` can be a lie, and an
employee must never be told "approved" before it is true.

- **Spec / source of truth:** `docs/TRD.md` — read it before changing behavior.
  Security posture: TRD §13. Roadmap: `docs/FUTURE.md`.
- **Live demo:** https://examplehr-timeoff-five.vercel.app
- **Storybook:** https://main--6a299211ce79a0f82652a294.chromatic.com
- **Repo:** https://github.com/luisjrez/examplehr-timeoff

## Architecture (the 30-second version)

Two write-isolated layers compose into what the UI renders (TRD §3):

```
HCM responses ──▶ CONFIRMED LAYER (TanStack Query cache, per-cell keys)
user actions  ──▶ PENDING OVERLAY (Zustand ledger of in-flight requests)
                          │
                          ▼
        projectCell() → BalanceCellView { confirmed, pending, projected, staleness }
```

Because only HCM responses write the confirmed layer and only user actions
write the overlay, a background refresh can never clobber an in-flight
action — the race is unrepresentable, not "handled".

**Request lifecycle** is a pure FSM (`src/domain/requestMachine.ts`):

```
draft → submitting → accepted_unverified → verifying → pending_approval → approved | denied
              │                                │
              └── denied / contradicted ◀──────┘ (verify mismatch, 409, silence)
                        └─ retry → submitting   └─ discard → discarded
```

The load-bearing state is `accepted_unverified`: an HCM 2xx proves nothing.
`src/data/submitFlow.ts` reads back the request record AND the authoritative
cell; only a coherent pair promotes the filing (TRD §5).

**Writes are CAS:** every write carries `expectedVersion`; HCM returns 409 if
the cell moved. Manager approvals are gated the same way (TRD §7).

## Layer map (import rules are law)

| Folder            | Contains                                                     | May import          | Must NOT contain         |
| ----------------- | ------------------------------------------------------------ | ------------------- | ------------------------ |
| `src/domain/`     | FSM, projection, types — pure functions                      | nothing app-level   | React, IO, fetch         |
| `src/data/`       | hcmApi client, query keys, flows, ledger, notifications      | domain              | JSX                      |
| `src/data/hooks/` | React bindings — **one hook per file**, barrel in `index.ts` | data, domain        | logic worth unit-testing |
| `src/components/` | Presentational: props in → JSX out                           | domain (types)      | fetching, global stores  |
| `src/views/`      | Containers wiring data hooks to components                   | data, components    | business math            |
| `src/mocks/`      | HCM brain + two transports (route handlers use it, MSW too)  | domain (wire types) | app imports              |
| `src/app/`        | Pages + `/api/hcm/*` route handlers (thin over `src/mocks`)  | views, mocks        | logic worth testing      |
| `e2e/`            | Playwright specs                                             | —                   | —                        |

## Hard rules (enforced by ESLint/tsc — CI fails on violation)

- **Strict TypeScript, zero `any`** (`no-explicit-any` + all `no-unsafe-*`
  are errors). Parse every network payload from `unknown` via the guards in
  `src/data/parsers.ts` / `src/mocks/wire.ts`.
- **No inline functions in JSX** (`react/jsx-no-bind`): extract handlers with
  `useCallback` or to module scope.
- **Exhaustive switches** over discriminated unions (compiler-checked).
- **Comments explain the WHY only** — never what the code does.
- **TDD red-green-refactor**: write the failing test first, always.
- **Never weaken a test to make it green** — a failing test describes the
  correct behavior.
- Prettier formats everything; `pnpm format:check` is part of the CI gate.
- All code, comments, and content in **English**.
- **User-facing copy speaks the domain, not dev jargon**: freshness is sync
  vocabulary (`Synced` / `Sync delayed` / `Out of sync`, `Periodic sync`),
  and a request is never called "approved" before the manager approves.
  Internal identifiers (`fresh/aging/stale`) are code and stay as-is.

## Commands

```bash
pnpm dev               # app + mock HCM at :3000
pnpm storybook         # Storybook at :6006
pnpm test              # unit project: domain, data flows vs MSW, components
pnpm test:watch        # same, watch mode
pnpm test:storybook    # every story as a browser-mode interaction test
pnpm test:e2e          # Playwright vs the PRODUCTION server (builds, then next start on :3100)
pnpm test:e2e:headed   # watch it in a real Chrome window
pnpm test:e2e:ui       # Playwright UI mode (time-travel debugging)
pnpm test:coverage     # v8 coverage for both Vitest projects
pnpm format / format:check
pnpm lint / typecheck / build
```

Run a single test:

```bash
pnpm test src/domain/requestMachine.test.ts          # one unit test file
pnpm test -- -t "verifies the filing"                # by test name
pnpm test:storybook src/views/EmployeeView.stories.tsx  # one story file
pnpm exec playwright test --grep "wrong-success"     # one e2e by title
```

## Recipes

### Add a new presentational component

1. **Test first**: `src/components/MyThing.test.tsx` (Testing Library,
   queries by role/label, `userEvent`). Define the props API in the test.
2. `src/components/MyThing.tsx` — props in → JSX out. Named props interface,
   `readonly` fields, explicit return type (`ReactElement`), Tailwind for
   styling, handlers via `useCallback`.
3. **Stories**: `src/components/MyThing.stories.tsx` — one story per visual
   state (derive states from the FSM/staleness, don't invent). Add `play`
   functions for interactive behavior; stories are tests
   (`pnpm test:storybook` must stay green). **Never `new Date()` in story
   fixtures** — use static ISO strings; Chromatic snapshots must be
   deterministic (see gotchas).
4. Wire it from a container in `src/views/` — the component itself never
   fetches.

### Add a data-layer flow or hook

1. Write the integration test first in `src/data/*.test.ts`: real
   `QueryClient`, real ledger (`createLedgerStore()`), MSW server from
   `buildHcmHandlers(createHcmStore())`. Mock only the network boundary.
2. Implement the orchestration as a **framework-free function** taking deps
   (`{ queryClient, ledger, notify }`) — see `submitFlow.ts`/`decideFlow.ts`.
3. Expose a thin hook as its own file under `src/data/hooks/` (one hook per
   file) and re-export it from `src/data/hooks/index.ts`; query keys only via
   `src/data/queryKeys.ts`. Cache writes go through `mergeCell`/`applyCorpus`/
   `reconcileRealtimeEvent` (never regress a cell version).

### Add/modify an FSM state

1. Extend `RequestPhase`/`RequestEvent` in `src/domain/types.ts`.
2. Failing tests in `requestMachine.test.ts` (including the property tests —
   add the state to the `legal` set) → implement in `requestReducer`.
3. The compiler will force every exhaustive switch to handle it:
   `projection.ts` (`isPreConfirmation`?), `RequestTimeline.tsx` (wording!),
   stories for the new state, and possibly the flows.
4. Wording rule: never show "approved" before the manager approves.

### Add a mock HCM endpoint (keep both transports in sync!)

1. Logic + unit tests in `src/mocks/hcmStore.ts` (pure, framework-free).
2. Wire types/validation in `src/mocks/wire.ts` (unknown in → typed out).
3. **Both** transports: route handler under `src/app/api/hcm/.../route.ts`
   (thin, via `withChaos`) **and** MSW handler in `src/mocks/mswHandlers.ts`.
   One brain, two transports — they must never drift.
4. Chaos comes from the `x-chaos` header only; never roll dice in the store.

### Add an e2e spec

1. Append to `e2e/timeoff.spec.ts` (or a new file in `e2e/`).
2. The shared HCM store is process-wide: specs run **serially** (1 worker)
   and every spec starts from `POST /api/hcm/reset` (already in
   `beforeEach`).
3. Multi-persona flows: open two pages in one context (employee + manager
   tabs) — see the approve/deny specs. Navigation reloads wipe the
   employee's session ledger, so keep the employee tab alive.
4. Playwright strict mode gotcha: toasts often repeat timeline wording —
   prefer `{ exact: true }` or `.first()` for ambiguous text.
5. Inject chaos through the UI's "Simulate" selector (`getByLabel("HCM chaos
mode")`) or via `request.post` with an `x-chaos` header.

### Add a Storybook flow story

Use the existing pattern in `src/views/*.stories.tsx`: module-level
`createHcmStore()` + `hcm.reset()` in `loaders` + `parameters.msw.handlers =
buildHcmHandlers(hcm)` + `AppProviders` decorator. The preview already resets
the app ledger and notifications between stories. Toast text duplicates
timeline text — use `getAllByText` where both render.

## Testing philosophy (TRD §10)

Each layer is guarded by the cheapest test that catches its regressions:

| Failing test type     | The bug lives in                              |
| --------------------- | --------------------------------------------- |
| domain property test  | FSM / projection invariants                   |
| data test (vs MSW)    | flows: verification, conflict handling, cache |
| component test        | a state's visual contract                     |
| storybook interaction | a full UI state/flow in the browser           |
| e2e                   | cross-layer wiring                            |

Route handlers/pages show 0% in Vitest coverage **by design** — Playwright
covers them for real instead of mocking them twice.

## CI/CD & deploys

Pipeline (`.github/workflows/ci.yml`):

```
quality (prettier → eslint → typecheck → unit → storybook → e2e → build)
   ├─▶ deploy-storybook → Chromatic   (only on green, push to main)
   ├─▶ deploy-vercel    → production  (only on green, push to main)
   └─▶ regression-alert               (only on failure, push to main)
```

- **Nothing deploys around the gate.** Vercel is deliberately NOT connected
  via its GitHub app; the CI job is the only deploy path.
- **Deploys are automatic**: push/merge to `main` with a green gate ships to
  Vercel and publishes Storybook to Chromatic. Manual fallbacks:
  `pnpm dlx vercel deploy --prod` · `pnpm dlx chromatic --project-token=<token>`.
- **Secrets** (repo settings): `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`, `CHROMATIC_PROJECT_TOKEN`.
- **Regression alerting**: any failure on `main` auto-files a GitHub issue
  (labels `regression`, `ci`) with failing jobs/steps + log links, local
  repro commands, a fix playbook, and a copy-paste agent prompt. Repeats
  dedupe into comments. Forensics (Playwright HTML report, traces, videos)
  are uploaded as run artifacts.
- The mock HCM is in-memory: Vercel cold starts re-seed it (fine for the
  demo, documented in TRD §11). `HCM_DEMO_CHAOS=1` enables ambient chaos.

### Real-time (SSE)

`GET /api/hcm/events` streams cell AND request changes (the store's
`subscribe()` feeds it). The client folds events via `reconcileRealtimeEvent`:

- **cell** events: same no-version-regression rule as the corpus; SILENT for
  changes explained by the session's own in-flight requests (the echo of your
  own write must not toast).
- **request** events: the multi-user sync path — they invalidate the request
  queries (open manager tabs refresh live) and fold decisions straight into
  the employee ledger via `syncDecisions`.

MSW answers this route with **204** so EventSource closes permanently in
Storybook/tests and the UI falls back to polling. If you add store mutations,
route them through `mutateCell` / emit a request event so live clients see
them. Note for e2e: live sync collapses UI race windows — specs that want a
stale-version 409 must force it at the HTTP level (see the version-gated
spec), not by clicking a stale button that SSE already refreshed.

## Spec-driven development (stateful plans)

Non-trivial work is planned in `docs/plans/plan-NNNN-*.json` (schema in
`docs/plans/schema.json`, workflow in `docs/plans/README.md`). The plan file
IS the state: multi-phase, each phase declares `dependsOn` + `parallelizable`,
and agents write `status`/`updatedAt` back after every task — any session can
resume where the last one stopped. A phase only completes when its tasks'
`verification` passes plus the repo gate. Before inventing a new plan, check
whether `plan-0001` (production-readiness roadmap) already covers the work.

## Repo-specific gotchas

- `packageManager` in package.json is required by `pnpm/action-setup` in CI.
- `public/mockServiceWorker.js` is generated by `msw init` — don't edit it.
- `examplehr-timeoff.vercel.app` (no suffix) is **someone else's project**;
  ours is `examplehr-timeoff-five.vercel.app`.
- App singletons (`appLedger`, notifications store) have `clear()` —
  Storybook's preview loader calls them between stories; tests should too.
- **Chromatic snapshots must stay deterministic**: story fixtures use static
  ISO dates, and `.storybook/preview.tsx` freezes `Date` under Chromatic's
  capture browser (`chromatic/isChromatic`). Do NOT re-enable
  `autoAcceptChanges` to silence diffs — a diff now means a real visual
  change (regressions get flagged; intentional changes are accepted once in
  the Chromatic UI). Determinism was proven by back-to-back builds 15/16.
- **E2E runs against `next start`**, not `next dev`: dev-mode on-demand route
  compilation can exceed assertion timeouts on cold routes (was a real
  flake). Also, Next 16 refuses two dev servers for the same project — stop a
  running `pnpm dev` if the e2e web server fails to boot.
- Vercel's upload API intermittently 500s — the deploy step retries 3× with
  backoff (regression issues #1/#2).
- **Freshness badges measure the SYNC CHANNEL, not data age**: SSE live →
  always "Synced"; on polling fallback the anchor is the last successful
  reconciliation (equal-version cache writes count as sync proofs — do not
  "optimize" them away). Anchoring to HCM's `updatedAt` was a real bug:
  idle-but-healthy deployments showed "Out of sync" everywhere.
