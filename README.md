# ExampleHR — Time-Off Frontend

**Live demo:** [examplehr-timeoff-five.vercel.app](https://examplehr-timeoff-five.vercel.app) ·
**Storybook:** [Chromatic](https://main--6a299211ce79a0f82652a294.chromatic.com) ·
**Repo:** [luisjrez/examplehr-timeoff](https://github.com/luisjrez/examplehr-timeoff)

A Time-Off module where the **HCM (Workday/SAP) owns the numbers** and the
frontend stays honest about it: balances can change underneath an open
session, a `200 OK` can be a lie, and the UI must give instant feedback
without ever telling an employee "approved" before it is true.

📄 **Start with the [Technical Requirement Document](docs/TRD.md)** — it
enumerates the challenges, the architecture (optimistic-with-provenance,
request FSM, CAS-gated decisions), the alternatives considered and the
security posture (§13). Where this goes next: [docs/FUTURE.md](docs/FUTURE.md),
executable as a stateful multi-phase plan in
[docs/plans/](docs/plans/README.md).

> Built 100% through agentic development: the spec, the TRD and the test
> design drive the agent; no line of code was written by hand.

## Quick start

Prerequisites: **Node.js ≥ 20** (developed on 22) and **pnpm** — if you don't
have pnpm: `corepack enable` (ships with Node) or `npm i -g pnpm`.

```bash
pnpm install
pnpm dev            # app + mock HCM at http://localhost:3000
pnpm storybook      # every UI state, at http://localhost:6006
```

For the e2e suite only, install the Playwright browser once:

```bash
pnpm exec playwright install chromium
```

- `/employee` — balances per location, date-range request filing (business
  days derived and narrated live), recovery from contradictions. The
  "Simulate" toolbar injects HCM chaos on demand.
- `/manager` — pending queue with decision-time balance reads and
  version-gated approvals.

## Test suite (what guards what)

| Command               | Layer                                                                               | Guards against                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`           | Domain FSM + projection (fast-check), mock HCM brain, data flows vs MSW, components | Invariant violations under any event interleaving; the verification flow; rollback/recovery logic                                                                     |
| `pnpm test:storybook` | Every story is a browser-mode interaction test                                      | The states the assignment demands: loading, empty, stale, optimistic-pending, optimistic-rolled-back, HCM-rejected, HCM-silently-wrong, balance-refreshed-mid-session |
| `pnpm test:e2e`       | Playwright vs real route handlers, two tabs                                         | Cross-layer wiring: employee→manager loop, denial refunds, version-gated approvals, chaos recovery                                                                    |
| `pnpm test:coverage`  | Coverage (v8) for the two Vitest projects                                           | —                                                                                                                                                                     |

Watch the e2e suite run for yourself:

```bash
pnpm test:e2e:headed   # real Chrome window, watch both personas interact
pnpm test:e2e:ui       # Playwright UI mode: time-travel through every step
pnpm exec playwright show-report   # HTML report of the last run
```

Route handlers and pages show 0% in Vitest coverage **by design** — they are
exercised end-to-end by Playwright, not mocked twice (TRD §10).

Current coverage (unit + storybook projects): **domain 95% · components 96% ·
data 89% · mocks 73%** (the gap is the route-handler plumbing covered by e2e).

## Mock HCM

Route handlers under `/api/hcm/*` and MSW handlers share one in-memory brain
(`src/mocks/hcmStore.ts`): CAS writes with per-cell versions, hold semantics
(filing debits, denial refunds), a work-anniversary bonus trigger, and
**deterministic chaos** via the `x-chaos` header (`silent-failure`,
`wrong-success`, `conflict`, `error`, `latency:<ms>`). Demo mode
(`HCM_DEMO_CHAOS=1`) rolls dice instead; explicit headers always win.

It also pushes **real-time updates**: `GET /api/hcm/events` streams cell AND
request changes over SSE; both views subscribe (the "● Live" badge) — open
`/employee` and `/manager` side by side and watch filings and decisions sync
across users instantly, with the polls as fallback (TRD §6.6).

```bash
curl -X POST localhost:3000/api/hcm/requests \
  -H 'content-type: application/json' -H 'x-chaos: silent-failure' \
  -d '{"employeeId":"emp-alice","locationId":"loc-mx","days":2,"expectedVersion":1}'
# → 201 Created … and HCM kept nothing. The UI catches it by verification.
```

## Layout

```
docs/TRD.md         the spec — read this first
src/domain/         pure logic: request FSM, projection, types (no React)
src/data/           TanStack Query cache + Zustand ledger + flows (no JSX)
src/components/     presentational: props in, JSX out (no fetching)
src/views/          containers wiring data hooks to components
src/mocks/          the HCM brain + its two transports (routes, MSW)
e2e/                Playwright specs
```

## Quality gates & regression alerting

`pnpm format:check` (Prettier) · `pnpm typecheck` (strict TS:
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any` anywhere) ·
`pnpm lint` (type-aware ESLint: `no-unsafe-*`, `jsx-no-bind`, exhaustive
switches; warnings fail).

The CI pipeline is a single **quality gate** (prettier → eslint → typecheck →
unit → storybook → e2e → build). Deploys to Chromatic and Vercel run **only**
if the gate is green — there is no path to production around it.

**Regression alerting:** any failure on `main` auto-files a GitHub issue
(label `regression`) containing the failing jobs/steps with log links, the
exact commands to reproduce locally, a fix playbook, links to the forensic
artifacts (Playwright HTML report, traces, videos), and a **copy-paste agent
prompt** carrying all the context an AI agent needs to resolve it. Repeat
failures of the same job set dedupe into comments on the open issue.
