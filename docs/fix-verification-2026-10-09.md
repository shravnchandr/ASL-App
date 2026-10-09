# Fix verification — October 9, 2026

## Final focused verification — cold-cache failure and recovery

The last reported cold-cache defect is fixed. Repeated the isolated reproduction against the actual service-worker fetch handler with empty Cache Storage and a transient failed weights download. The topology request now produces a network error instead of serving an unpinned file. After switching the simulated deployment to v2 and recovering the network, the same client successfully receives v2 weights, topology, labels, and scaler. No mixed version is returned in this reproduction.

The cached-fallback reproduction also remains fixed: an existing page stays on v1 while a new page receives v2. New regression tests cover rejecting all requests in an incomplete initial load and recovering on the same client. Existing tests cover offline fallback, sequential requests, worker restart, and old-bundle cleanup.

ESLint, TypeScript/production build, and **54 frontend tests** pass. The existing approximately 1 MB ML chunk warning remains. Backend tests were not rerun for this service-worker-only follow-up; the preceding backend run passed 98 tests. No new correctness findings in this focused verification. No application code was changed.

The remaining findings in earlier sections below are historical and superseded by this section.

## Previous verification — client-pinned model bundles

The previously reproduced cached-fallback race is fixed. Repeating the sequential topology/weights reproduction now returns v1 for both files. A different page obtains v2 while the original page continues receiving v1. The new worker-restart pin test also passes.

ESLint, TypeScript/production build, and **52 frontend tests** pass. Backend tests were not repeated for this service-worker-only follow-up. No application code was changed during verification.

### Remaining P2 — An uncached failed refresh bypasses bundle consistency

**Location:** `public/sw.js:199–207`, `public/sw.js:210–217`.

When the first bundle refresh fails and there is no previous bundle, `bundleForClient` caches a promise resolving to null. Each subsequent file for that page consequently uses the independent `fetch(event.request)` fallback. This permits different releases within one classifier load despite the client pinning logic.

**Reproduction:** Started with empty Cache Storage, failed the initial bundle's weights request once, and requested topology through the actual worker fetch handler. The independent fallback returned v1 topology. Switched the simulated deployment to v2 before the same client requested weights: it received v2 weights. This reproduction uses a nonempty client ID. Existing tests all start with a successfully cached bundle before exercising failures.

**Correction:** If there is no complete bundle after a failed refresh, fail the classifier load rather than returning individual unpinned network files. Allow a later complete-load retry, or fetch files through immutable versioned paths. Add a cold-cache partial-failure regression test.

The earlier sections below are historical. Their remaining cached-fallback finding is superseded by this section.

## Follow-up verification of the five remaining fixes

This section supersedes the five findings below for the latest working tree. Application code was not changed during this verification.

- ESLint and TypeScript/production build pass; **50 frontend tests** and **98 backend tests** pass. The build still warns about the approximately 1 MB ML chunk.
- **Fixed:** abandoned queued translations do not start, and the pending queue is bounded. Both new regression tests pass.
- **Fixed:** uncached `/translate?q=hello` works under development StrictMode. Browser observed two requests (effect replay), one result card, and no stuck loading or landing view.
- **Fixed:** duplicate answer callbacks in one batch return `[10, null]`; stored XP and React XP both remain 10, with one result and one study increment.
- **Fixed:** midnight refund uses the reservation date. The boundary test confirms old-day usage 0 and new-day usage 1.
- Browser also reconfirmed PDF download, legacy share redirect, level unlock, and resume at the next unanswered exercise.

### Remaining P2 — Model refresh retries can still mix releases

**Location:** `public/sw.js:125–126` and `public/sw.js:133–143`.

On refresh failure, the rejection handler immediately clears `modelRefresh`. The topology request falls back to the old complete bundle, but the next request can launch a fresh refresh and switch to the new bundle. TensorFlow requests weights after reading topology, so this sequential request pattern occurs during normal classifier loading (`src/hooks/useASLClassifier.ts:35`).

**Reproduction:** Seeded a complete v1 bundle, advanced beyond the refresh window, and made the v2 weight download fail once. Requested `model.json` and then `group1-shard1of1.bin` through the actual worker fetch handler. Results were **v1 topology and v2 weights**. The existing bundle tests pass because they request all four files together with `Promise.all`; they do not cover this sequence.

**Correction:** Pin topology, weights, labels, and scaler to one immutable bundle version for an entire classifier load. Retaining the failed refresh decision for the coalescing window would prevent this immediate retry race, but immutable versioned paths or a manifest are needed for reliable consistency across refresh boundaries. Add a regression test with sequential topology/weight requests and a transient refresh failure.

## Previous verification (historical)

Reviewed the current working tree against the earlier codebase audit. No application changes were made during verification. Tests, isolated executions, and browser checks used synthetic data and fake provider responses; no real Gemini requests were sent.

## Checks

- ESLint passed.
- Frontend tests: **46 passed** across 7 files.
- Backend tests: **95 passed**, reported coverage **73%** (the configured coverage table still omits the pipeline).
- TypeScript and production build passed.
- Main JS chunk decreased from **521.87 kB to 143.62 kB** (uncompressed). PDF and camera-practice dependencies now load separately. The ML chunk remains approximately 1 MB, but is no longer part of ordinary learning's eager imports.
- Browser confirmed a PDF download, legacy share redirect, exactly 10 stored XP for one correct answer, level-two unlock when mastery crossed the threshold, and resumption at exercise two after exercise one was rewarded.
- New pipeline tests verify numeric spelling, authoritative KB fields/provenance, cache recovery, and client cleanup. Camera hook tests verify stale-stream disposal and a single facing-mode restart.

## Remaining correctness defects

### 1. P1 — Timed-out queued translations still start expensive work

**Location:** `routes/translate.py:67–76`.

The semaphore caps active workers, but every call creates a shielded task before waiting for capacity. A timeout returns 503 and refunds the caller's quota while leaving the task alive. Tasks that have not even acquired a slot subsequently start Gemini processing after their caller has already timed out. There is no pending-queue cap, and failed requests can keep refilling their quota while adding work.

**Reproduction:** With one slot, a 15 ms request timeout, and a fake 120 ms pipeline, four sequential callers all timed out. At that point four tasks remained pending and only the first job had started. The remaining jobs started at approximately 126, 252, and 377 ms, all after their callers had received timeouts.

**Correction:** Bound admission/pending work and track waiters on shared jobs. Cancel jobs still waiting for a slot when their last waiter leaves. Preserve accounting and lifecycle ownership for already running threads, and give pipeline stages a shared total deadline. A client wait timeout alone is not a work deadline.

### 2. P2 — Uncached translation links fail during development StrictMode mount

**Location:** `src/components/DictionaryPage.tsx:565–583`.

The first effect setup starts the query and sets `lastQueryRef`. StrictMode's cleanup then aborts the request. During effect replay, the query matches `lastQueryRef`, so no replacement request is started. The aborted request clears loading and the page returns to the landing screen despite having `?q=hello` in the URL.

**Reproduction:** Opened the Vite development app at `/translate?q=hello` with an empty session cache and a working mocked API. Observed one translation request, zero sign cards, zero loading views, and one landing view. Submitting the same phrase manually worked.

**Correction:** Make setup/cleanup symmetric: clear the active-query ownership on cancellation, or let the query effect own its request and cleanup so replay starts a replacement. Add a component test mounted in StrictMode. This finding is specific to development effect replay; it was not observed as a production failure.

### 3. P2 — Answer idempotency protects the reducer but not persisted rewards

**Location:** `src/contexts/LearnContext.tsx:632–653`.

The callback checks the render's `state.results`, then writes progress and XP before dispatching. Two invocations before React commits both pass that check. The reducer drops the second action, but cannot undo its already completed storage writes.

**Reproduction:** Called the context's answer callback twice in one browser batch for the same exercise. Both returned 10. Persisted XP became **20**, React state XP stayed **10**, the results list contained one outcome, and the sign's study count became two.

**Correction:** Reserve the exercise ID synchronously before performing side effects, using a ref or a persistence operation that returns whether the reward was newly applied. Test the actual context callback, not only the reducer. This is a same-batch callback reproduction, not a claim that two ordinary click events always produce the defect.

### 4. P2 — Quota refunds can debit the wrong UTC day

**Location:** `db/crud/analytics.py:235`, `routes/translate.py:277`.

Refunding recomputes today's date instead of using the reservation's date. A request reserved shortly before midnight and failed shortly afterward leaves yesterday's reservation charged and can decrement a successful reservation from the new day.

**Reproduction:** Reserved one slot on October 9, reserved one on October 10, then refunded the October 9 failure after midnight. Counts became `October 9: 1; October 10: 0`, rather than `0; 1`.

**Correction:** Return a reservation token/date from quota consumption and carry it through the refund path. Add a midnight-boundary test.

### 5. P2 — Network-first model caching still permits mixed model versions

**Location:** `public/sw.js:76–85`, `public/sw.js:103–107`.

Changing each model file to network-first reduces routine staleness but does not make a bundle atomic. If new topology downloads and a weight/scaler/label request fails, that request independently falls back to an older cached file. Deploying between requests can also mix releases. The comment promising that files can never mix is stronger than the implementation.

**Reproduction:** Executed the actual service-worker function with a fake new topology response and a failed weight download. It returned **new topology plus old cached weights**.

**Correction:** Use versioned model URLs/one manifest and switch the active cached version only after all required files have been fetched and validated. Offline fallback must select an entire previously complete bundle.

## Original-audit disposition

| Audit item | Verification |
| --- | --- |
| 1 Privacy copy | Corrected; describes remote translation and local camera processing |
| 2 Model-controlled verification | Corrected by generation/output schema separation and server KB field replacement |
| 3 Numeric spelling loss | Corrected; regression tests cover the phone-number example |
| 4 Camera stream ownership | Corrected in reviewed lifecycle paths; new hook tests pass; hardware not exercised |
| 5 Server-key quota bypass | Corrected; server-funded requests are capped by tests |
| 6 Redis connection credential log | Corrected for success logs; redaction test passes |
| 7 PDF export | Corrected for ordinary results; browser downloaded the file |
| 8 Share destination | Corrected, including legacy root redirect; development mount defect remains as noted above |
| 9 Expired cache recovery | Corrected; retry selects the replacement cache |
| 10 XP double addition | Corrected for one answer; same-batch duplicate callback remains |
| 11 Stale level unlock | Corrected; browser confirmed crossing-threshold unlock |
| 12 Feedback-time resume | Corrected; browser resumed at the next unanswered exercise |
| 13 Stale sign loads | Cancellation guards and stable loading callback added; missing sign data still becomes a placeholder rather than a required-data failure |
| 14 Compound recall | Canonical key comparison added |
| 15 Replay | Reset token connected for learning exercise controls; SentenceAnimator's restart still lacks a reset token |
| 16 Render-time animation callbacks | Moved out of state updater |
| 17 Animation key mapping | Compounds/numbers/spelling expanded; zero has no checked-in `zero.json` asset |
| 18 Camera hold transitions | Timer now starts on high confidence and resets on low confidence |
| 19 Unsupported camera targets/errors | Ten excluded from generated camera sessions; model errors surfaced |
| 20 Quota refunds/UI | Mostly corrected; midnight refund bug remains; daily scope still inferred from timeout length in the UI |
| 21 Analytics flood/retention | Static/data requests excluded; page-view backlog capped; retention task added |
| 22 Redis stalls | Read/write deadlines, memory-first access, and backoff added; failure-injection tests pass |
| 23 Forwarded trust/admin map | Trusted-network/IP validation and bounded admin history added; deployed proxy behavior not exercised |
| 24 Work concurrency/lifetimes | Active worker cap, deduplication, provider timeouts, and client close added; queued work survives caller deadlines |
| 25 Deployment/migrations | Inspected SQLite migrations tested; Compose mounts updated; durable storage is still absent from the supplied Render configuration |

Other original limitations remain: `pyproject.toml`/`uv.lock` still describe the heavy Python dependency set, lowercase translation cache identities still merge potentially meaning-sensitive capitalization, and most non-session localStorage values still lack full shape validation. The new model caching strategy is not yet an atomic upgrade mechanism.

PDF export now works, but extreme generated content can still overflow: the implementation moves a whole section to a new page rather than splitting a section whose lines themselves exceed one page. This was identified statically and was not visually reproduced.

Live Gemini, physical cameras, deployed Render proxy behavior, PostgreSQL startup, and real offline updates were not integration-tested. Passing tests and the checked fixes support substantial improvement, but the five reproduced defects above prevent treating the changes as fully verified.
