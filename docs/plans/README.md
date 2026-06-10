# Spec-Driven Development — stateful plans

This folder is the project's planning system for agentic work. Every
non-trivial change starts as a **plan file** (`plan-NNNN-<slug>.json`) that an
agent (or human) executes phase by phase, **writing progress back into the
file** — the plan is the state, so any session can pick up exactly where the
last one stopped.

## The contract

1. **Specs drive code.** A plan's phases reference the spec they implement
   (TRD sections, issue links, or inline goals). Code without a driving spec
   is scope creep.
2. **Plans are multi-phase.** Each phase declares:
   - `dependsOn`: phase ids that must be `completed` first. Empty = ready.
   - `parallelizable`: whether it may run alongside other ready phases
     (e.g., dispatched to parallel agents/worktrees). Phases touching the
     same files must NOT be marked parallelizable with each other.
3. **State lives in the JSON.** Allowed statuses:
   - plan: `draft → approved → in_progress → completed` (or `abandoned`)
   - phase/task: `pending → in_progress → completed` (plus `blocked`, `skipped`)
     Update `status` and `updatedAt` after every task transition — never batch
     updates at the end (a crashed session must not lose progress).
4. **Verification gates completion.** A phase may only move to `completed`
   when every task's `verification` passes AND the repo-wide gate is green:
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`.
   Phases that touch UI also require `pnpm test:storybook`; flows touching
   wiring require `pnpm test:e2e`.
5. **TDD inside every phase.** Tasks are ordered test-first; a task list that
   starts with implementation is a smell.

## How an agent executes a plan

```text
1. Read the plan JSON. Validate against schema.json.
2. Find READY phases: status=pending AND every dependsOn is completed.
3. If multiple are ready and parallelizable=true for each, they may be
   dispatched concurrently; otherwise execute in listed order.
4. For each phase: set status=in_progress → work the tasks in order,
   updating each task's status as you go → run the phase verification →
   set status=completed (+ updatedAt).
5. When no phases remain pending, set the plan status=completed.
```

## Files

- `schema.json` — JSON Schema every plan must validate against.
- `plan-0001-future-improvements.json` — the live roadmap (see also
  `docs/FUTURE.md` for the human-readable narrative).

## Conventions

- One plan per outcome; phases small enough to land in one session.
- `artifacts` lists the files a phase expects to touch — it is how the
  parallelizability claim is sanity-checked.
- Abandoning a plan requires a `notes` entry explaining why (decisions are
  part of the record, same spirit as the TRD's alternatives sections).
