---
name: delulu-performance
description: Verify Delulu navigation and rendering performance using the pstack benchmark workflow. Use for route loading, cache, resource fetching, bundle size, charts, editor or perceived-speed changes. Produces comparable local evidence; does not run staging.
---

Read `docs/TESTING.md`, including the measurement limitations. Use installed pstack benchmark instructions for browser metrics and evidence, with the repository's deterministic fixture harness.

1. State the slow flow and reproducible baseline: commit, browser, viewport, build mode, API fixture latency, CPU throttling and cold/warm cache state. Save this alongside results in `.context/`. If no baseline exists, collect one before changing behavior; never invent before numbers.
2. Run `pnpm verify:browser` first. Correctness gates include cache reuse, duplicate reads, delayed data and retry recovery. Add a regression case for the behavior being changed.
3. Build the fixtures and run the preview as documented. Open it with `agent-browser`, obtain its CDP websocket URL, and run `apps/app/testing/browser/benchmark.mjs` with that URL, preview origin and an output JSON path. The script applies 4x CPU and runs each navigation ten times; default fixture latency is 150ms. Stop competing builds and other benchmark sessions during measurement.
4. Compare median timings for each flow against an identically measured baseline; investigate regressions above 10%. Record request counts, long tasks and JavaScript bytes. Use the browser Performance/Network APIs if the existing report lacks a metric. Keep raw reports so findings can be reproduced.
5. Report measured improvement separately from correctness. The cleanup target is at least 30% on the slowest reproduced flow; say when it is missed. Built fixture navigation is not Next.js RSC navigation, and static API fixtures do not measure API/database or provider latency.

Do not silently adjust thresholds, add sleeps to pass timing checks, claim production performance from fixtures, or contact staging without a user request. Hardware-sensitive timing comparisons are evidence, not universal CI pass/fail thresholds.
