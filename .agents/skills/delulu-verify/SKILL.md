---
name: delulu-verify
description: Verify Delulu features and bug fixes before review. Use after changing app behavior, API contracts, publishing, permissions, or shared UI, or when asked to test a feature. Runs local regression checks and follows the pstack QA evidence workflow. Does not run staging or real publishing.
---

Read `docs/TESTING.md` from the repository root first; it owns commands and environment setup.

1. Read the diff and identify observable behavior, impacted consumers, and risks. Write a short test matrix before executing: normal use, failure/retry, empty/populated data, permissions, and relevant workspace/session transitions. Mark inapplicable cases explicitly.
2. Add a behavior regression test to the owning feature. For a bug, reproduce a failing assertion before the fix. For UI behavior, extend `apps/app/testing/browser/tests/*.browser.ts` using real pages and explicit fixtures. Never replace the component under test with a stub. Reject unhandled fixture requests; do not add a generic successful fallback.
3. Run affected unit tests and typechecks, the boundary checks, and non-mutating lint for changed files. Run `pnpm verify:browser` for app/shared UI/cache changes. Backend changes also need the documented disposable Postgres integration suite. Do not point migrations at a shared database.
4. Follow pstack QA's evidence loop: reproduce, save evidence, fix, repeat the exact failing action, and run surrounding regressions. Use installed `agent-browser` for exploratory interaction; if using pstack browse, read its installed skill for discovery/setup. Inspect keyboard focus, mobile touch targets, light/dark themes, long labels and loading/errors on impacted screens. Save screenshots in `.context/`. Automated browser reports live under `apps/app/.cache/`.
5. Report commands and outcomes, evidence paths, remaining failures, and missing coverage. Distinguish fixture behavior from Next server/auth integration and real provider behavior. A passing existing suite does not verify a new feature without assertions for its acceptance criteria.

Completion requires relevant checks to pass or explicit, evidenced blockers. Never hide failures through sleeps, retries, skipped tests, weaker assertions, or production auth bypasses. Staging, OAuth and real publishing are out of scope until the user explicitly requests them. Do not push, merge or deploy as part of this skill.
