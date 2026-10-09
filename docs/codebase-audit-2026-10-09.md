# Codebase audit — October 9, 2026

Audited the current working tree, including its pre-existing uncommitted changes. Application files were not changed. This report covers the React/TypeScript application, FastAPI routes, Gemini pipeline, persistence, caching, camera inference, sign assets, deployment configuration, and tests.

Severity: **High** warrants early correction because it affects privacy, trust, resource control, or core correctness. **Medium** is a functional defect or a material reliability/performance issue. **Low** is a narrower inefficiency. “Reproduced” means a local browser or isolated execution confirmed the behavior. “Static” means the implementation establishes the defect, but the affected integration was not exercised. Conditional findings state the required configuration.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm test` | 19 tests passed across 3 utility test files |
| `npm run build` | Passed; largest JS chunk 1,006.30 kB, 258.62 kB gzip |
| `.venv/bin/python -m pytest -q` | 49 passed; reported backend coverage 63% |
| Sign asset integrity | All 100 metadata entries have files; frame counts match arrays; FPS values are positive |
| Targeted browser checks | PDF failure, incorrect share destination, stale level unlock, repeatable answered exercise, React render-time update warning confirmed |
| Isolated execution | XP double addition, old Gemini cache ID reuse, untrusted forwarded IP acceptance, numeric fingerspelling loss, untrusted verification flag confirmed |

Browser checks used a local Vite server, synthetic session/cache data, and mocked API responses. No real Gemini calls were made. Camera hardware, live Redis, PostgreSQL, deployed proxy configuration, offline upgrades, and production load were not exercised. No dependency vulnerability scan was performed. The existing coverage configuration does not include the Gemini pipeline in its reported table; 63% must not be read as whole-application coverage.

## Findings, ordered by priority

### 1. High — Translation privacy claims contradict actual data handling

**Location:** `src/components/DictionaryPage.tsx:240`, `routes/translate.py:40`, `routes/translate.py:176`, `python_code/asl/pipeline.py:267`.

The landing page says “Everything stays on your device” and “Translations are processed locally.” Translation input actually goes to FastAPI, then Gemini. The backend writes the raw query to logs, its translation cache, and the analytics table. The same copy describes an opt-in sync setting that is not implemented.

**Impact:** Users can submit sensitive phrases under a false understanding of where those phrases go and are retained.

**Fix:** Explain the distinction between local camera recognition and remote phrase translation. Describe actual persistence and remove nonexistent sync claims. Consider omitting raw phrases from routine logs and analytics or adding an explicit, documented retention policy.

**Evidence:** Static end-to-end request trace.

### 2. High — The model can label an unknown or incorrect sign “verified”

**Location:** `python_code/asl/schemas.py:45`, `python_code/asl/pipeline.py:291`, `python_code/asl/pipeline.py:310`, `src/components/SignCard.tsx:113`.

`kb_verified` is part of the model-generated response schema. Postprocessing sets matched signs to true but never resets model-supplied true values for unmatched signs. In addition, a matched word is marked verified based on its name alone: the generated hand shape, movement, and location are not compared with or overwritten by the KB entry.

**Impact:** The UI presents authoritative verification for content that may never have been verified. This directly undermines the app's instructional trust model.

**Fix:** Remove verification provenance from the generative schema. Compute it exclusively on the server. For exact KB matches, populate authoritative fields directly from the matched entry, and distinguish generated beginner paraphrases from verified source fields. Treat semantic matches separately if enabled.

**Evidence:** Reproduced with a fake Gemini response containing `UNKNOWN_AUDIT_SIGN` and `kb_verified=true`; the final output retained true.

### 3. High — Numeric fingerspelling drops every digit

**Location:** `python_code/asl/knowledge_base.py:129`, `python_code/asl/pipeline.py:187`, `python_code/asl/pipeline.py:302`.

The grammar prompt explicitly outputs phone numbers as tokens such as `fs-6-1-7`. `_extract_fs_glosses()` keeps only characters for which `isalpha()` is true. It therefore produces an empty list for every numeric token, and postprocessing forces that empty list onto the final sign.

**Impact:** Phone numbers, ZIP codes, and numeric identifiers lose their spelling instructions.

**Fix:** Define supported spelling characters explicitly, retain digits, discard only separators, and ensure frontend guides support numeric characters. Add the documented phone-number example as a regression test.

**Evidence:** Reproduced: `YOU CALL-ME fs-6-1-7 fs-5-5-5 fs-1-2-3-4` yielded three empty spelling lists.

### 4. High — Camera streams can outlive their component or be orphaned by overlapping starts

**Location:** `src/hooks/useCamera.ts:43`, `src/hooks/useCamera.ts:55`, `src/hooks/useCamera.ts:116`; `src/components/camera/CameraPage.tsx:71`.

`startCamera()` stops the current stream before awaiting `getUserMedia()`. There is no generation or mounted-state check after that await. If navigation/unmount happens while permission is pending, cleanup stops nothing; the eventual stream is assigned after cleanup and remains live. Two pending starts can each obtain a stream, with the later assignment overwriting the only reference to the other stream. The catch path also does not stop a stream after a metadata/play failure.

Camera flipping has two restart owners: the hook's facing-mode effect and the page effect, whose `startCamera` dependency changes with facing mode. Development StrictMode can also produce overlapping startup calls.

**Impact:** Camera capture can continue after leaving the page, and unreleased tracks can cause later camera access failures.

**Fix:** Use a request-generation token, stop stale streams immediately upon resolution, serialize starts, stop acquired tracks on every failure, and have one owner for facing-mode restarts.

**Evidence:** Static lifecycle trace; physical camera behavior was not tested.

### 5. High, configuration-dependent — The supplied deployment key bypasses the daily quota

**Location:** `render.yaml:49`, `routes/translate.py:85`, `routes/translate.py:109`, `config.py:47`.

The deployment blueprint provisions `GOOGLE_API_KEY` but does not provision `SHARED_API_KEY`. Daily quota enforcement only applies to the shared-key branch. With the supplied configuration, anonymous users use the server-key branch, which is limited by the per-minute limiter but has no per-day budget.

**Impact:** The documented ten-per-day allowance does not protect the default deployment's Gemini usage. Deploys/process restarts also reset the in-memory per-minute limiter.

**Fix:** Apply the public daily allowance to all anonymous server-funded translation requests, or configure the shared-key mode explicitly and make the distinction clear in deployment documentation. Keep separate global provider-budget controls.

**Evidence:** Static configuration trace. Dashboard overrides could change the deployed behavior.

### 6. High when Redis is configured — Successful connection logs expose Redis credentials

**Location:** `cache.py:87`.

The success log includes the complete Redis URL. Credential-bearing URLs include usernames/passwords, so connecting successfully copies the secret into application logs.

**Fix:** Log only a redacted host/port or an opaque connection label; never log the raw URL.

**Evidence:** Static, conditional on a credential-bearing Redis URL.

### 7. Medium — Save PDF fails for every current results page

**Location:** `src/utils/pdf.ts:6`, `src/utils/pdf.ts:60`, `src/components/DictionaryPage.tsx:654`, `src/components/SignCard.tsx:125`.

The exporter searches for `.results-section`, while the actual page uses `.dictionary-page__results`. It immediately throws “Results section not found.” Its remaining selectors are also stale: `.sign-word`, `.detail-value`, `.sign-detail-item`, and `.asl-note` do not match the current sign/grammar markup. Renaming only the outer selector would still produce empty content.

**Fix:** Export from the typed translation response rather than scrape presentation markup. Include beginner descriptions, detailed fields, grammar notes, and provenance deliberately. Update print selectors as well; several still target the old markup.

**Evidence:** Reproduced in Chromium: clicking Save PDF displayed “Failed to generate PDF. Please try again.”

### 8. Medium — Share links open Home instead of the translation

**Location:** `src/utils/share.ts:51`, `src/App.tsx:30`.

`generateShareUrl()` returns `origin/?q=...`. Only `/translate` mounts the component that reads `q`, so recipients reach Home without the shared result. The clipboard fallback additionally copies only `data.text`, discarding the generated translation URL entirely.

**Fix:** Generate `/translate?q=...` links, include that URL in clipboard fallback content, and optionally redirect legacy root query links.

**Evidence:** Browser confirmed zero result cards at `/?q=hello` despite a seeded translation cache.

### 9. Medium — Gemini cache recovery retries the expired ID

**Location:** `python_code/asl/pipeline.py:364`, `python_code/asl/pipeline.py:369`, `python_code/asl/pipeline.py:399`.

`_make_config()` closes over local `cache_name`. Recovery updates `self._grammar_cache_name`, but the retry configuration still reads the old local name. When recreation succeeds, the current request fails again against the expired cache even though a replacement exists.

**Fix:** Pass the cache name directly into the config builder or refresh the local variable before retrying. Synchronize recreation to prevent concurrent expired-cache requests creating multiple replacements.

**Evidence:** Isolated execution observed outgoing cache IDs `['cachedContents/old', 'cachedContents/old']`, while the instance held `cachedContents/new`.

### 10. Medium — Learning XP is added twice in memory

**Location:** `src/contexts/LearnContext.tsx:112`, `src/contexts/LearnContext.tsx:658`.

On a correct answer, `storage.addXP(xp)` persists the increment and `UPDATE_STATS` loads that new total into state. `ANSWER_EXERCISE` then adds the same XP to `state.totalXP` again.

**Impact:** Displayed lifetime XP exceeds persisted XP by the latest reward, and decreases upon reload. It is not permanently doubled in storage. The UI's reward animation also uses 10 XP while the context can award 15, and its “streak” bonus means any earlier correct answer, even after an intervening wrong answer.

**Fix:** Give one action responsibility for lifetime XP and another for session scoring, or use a single atomic answer action. Calculate the awarded reward once and pass it to the UI. Track consecutive answers if a streak bonus is intended.

**Evidence:** Executing the actual reducer with the dispatched sequence gave stored XP 10, state XP 20, session score 10.

### 11. Medium — Level unlocking reads progress from before the answer

**Location:** `src/contexts/LearnContext.tsx:470`, `src/contexts/LearnContext.tsx:676`.

`setTimeout(() => checkLevelUnlock(), 100)` retains the callback from the answering render. Its `calculateLevelMastery` closure retains the old `signProgress`. Waiting 100 ms does not replace that closure with the next render's callback.

**Impact:** Crossing the mastery threshold can leave the next level locked until another answer or later action triggers a check.

**Fix:** Check unlock conditions in an effect that observes updated progress/current level, or calculate the next progress state and unlock in the same reducer operation.

**Evidence:** Seeded level-one progress just below the rounded 80% threshold, answered the remaining sign correctly, and waited 500 ms. The next level was not persisted as unlocked.

### 12. Medium — Resuming during feedback permits duplicate rewards

**Location:** `src/contexts/LearnContext.tsx:488`, `src/components/learn/LearnPage.tsx:170`, `src/utils/storage.ts:16`.

The saved session tracks index and score, but not whether the current exercise has already been answered. Progress and XP are written immediately; index advancement happens two seconds later. Reloading during that delay resumes the already rewarded exercise as unanswered.

**Impact:** The same answer receives XP and repetition credit again. Session correctness summaries also lose earlier answers because `exerciseResults` is not persisted.

**Fix:** Persist answer status and exercise outcomes, and make reward application idempotent by exercise ID. Resume the next unanswered exercise or restore feedback without applying its reward again.

**Evidence:** Browser saved `currentIndex:0, sessionScore:10` after answering exercise one, then reloaded and resumed “Exercise 1 of 2” with fresh answer controls.

### 13. Medium — Delayed sign loads can overwrite a newer exercise

**Location:** `src/components/learn/LearnPage.tsx:115`, `src/contexts/LearnContext.tsx:260`, `src/utils/signDataLoader.ts:34`.

The effect loading sign and option data has no cancellation/version check, and does not clear old data when the exercise changes. A slow load for exercise A can resolve after the user skips to B and set A's animation under B's answer. `loadSign` also changes identity whenever `loadedSigns` changes, rerunning the effect while it is loading option data. The loader has no in-flight deduplication.

**Fix:** Guard commits with an effect generation/cancelled flag, clear the previous data while loading, stabilize the loader, and share pending fetch promises per sign. Treat missing required sign data as a session load error instead of presenting an unanswerable placeholder.

**Evidence:** Static async trace; delayed-network reproduction was not run.

### 14. Medium — Natural answers to compound signs are marked wrong

**Location:** `src/components/learn/RecallExercise.tsx:58`, `src/utils/format.ts`.

Recall compares a trimmed, lowercased answer directly to the internal sign key. The library key `thank_you` is presented as “Thank You”; typing `thank you` is rejected.

**Fix:** Normalize spaces, underscores, and hyphens consistently, and define explicit acceptable aliases where appropriate.

**Evidence:** Static comparison against the actual library key.

### 15. Medium — Replay controls do not reset the animator

**Location:** `src/components/learn/SignToWordExercise.tsx:33`, `src/components/learn/RecallExercise.tsx:39`, `src/components/learn/SignAnimator.tsx:77`.

Replay resets the parent's `currentFrame`, which is only used to display playback progress. `SignAnimator` owns its own frame state and accepts no seek/reset input. It resets only when the sign changes. Thus replay while playing continues from the current frame; replay while paused resumes from that frame.

**Fix:** Add a reset token or controlled seek API, and make the progress display read the same authoritative playback state.

**Evidence:** Static component contract trace.

### 16. Medium — Animation callbacks update other components from a state updater

**Location:** `src/components/learn/SignAnimator.tsx:449`.

The `setCurrentFrame` updater invokes `onFrameChange` and `onAnimationEnd`. Those callbacks set parent component state. React updater functions must be pure and can be executed more than once during development checks. This causes render-time cross-component updates and creates duplicate callback/sequence-advance risks.

**Fix:** Compute frame advancement independently, update frame state without side effects, and emit callbacks from an effect or another explicitly committed playback step.

**Evidence:** Chromium logged “Cannot update a component (`SignToWordExercise`) while rendering a different component (`SignAnimator`).” Duplicate sequence advancement was not separately reproduced.

### 17. Medium — Translation animation lookup does not match library naming

**Location:** `src/components/DictionaryPage.tsx:693`, `src/components/SentenceAnimator.tsx:49`, `src/utils/signDataLoader.ts:35`.

The translation page replaces spaces with underscores but leaves hyphens intact. Grammar-generated `THANK-YOU` requests `thank-you.json`, while the library file is `thank_you.json`. Numeric glosses such as `3` similarly do not map to `three.json`. Fingerspelled names are looked up as one nonexistent full-name file rather than expanding their supplied letter sequence.

**Impact:** Available demonstrations silently disappear, and the app's statement that it animates every translated sign exceeds its actual capability.

**Fix:** Centralize canonical sign-key mapping, translate numeric glosses to available number names, and expand fingerspelling into letter animations. Show a clear missing-animation state for genuinely unsupported concepts.

**Evidence:** Static lookup trace against the checked-in files.

### 18. Medium — Camera confidence transitions can prevent or prematurely accept a letter

**Location:** `src/components/camera/CameraPage.tsx:109`.

When a new stable label first arrives below 0.8 confidence, `letterHoldStartRef` is set to null. Later high-confidence results for that same label have no branch that initializes the timer, so the letter cannot be accepted until the stable label changes or the hand disappears. Conversely, once started, a low-confidence frame clears only the displayed progress, leaving the old timer intact; returning to high confidence can immediately satisfy the hold threshold despite the interruption.

**Fix:** Reset the timer whenever confidence falls below threshold and initialize it when a stable label first becomes confidently eligible. Measure a continuous high-confidence interval.

**Evidence:** Static branch trace.

### 19. Medium, latent path — Camera practice cannot recognize ten and suppresses model failures

**Location:** `src/constants/levels.ts:46`, `public/models/asl-classifier/labels.json:1`, `src/components/learn/CameraPracticeExercise.tsx:45`.

Numbers include `ten`, but the classifier exposes only `0`–`9` and `a`–`z`; it cannot emit `10` or `ten`. The practice component also ignores both hand-detector and classifier errors, allowing their failed loads to be followed by a “ready” camera that never recognizes anything.

**Fix:** Restrict practice targets to actual model capability, represent dynamic signs appropriately, and surface all loading errors with retry/skip actions. Check model support when constructing sessions.

**Evidence:** Label inventory confirmed no ten output. The current normal session-start UI calls `startLevelSession(..., 10)` without enabling camera practice, so this is a latent defect in the supported camera-practice/resume path, not a claim that ordinary sessions currently reach it.

### 20. Medium — Quota errors are presented as one-minute throttles, and failed translations consume allowance

**Location:** `routes/translate.py:89`, `routes/translate.py:96`, `src/services/api/translate.ts:16`, `src/components/features/RateLimitBanner.tsx:17`.

Shared quota is committed before Gemini runs and never refunded on upstream/auth/output failures. The daily-limit 429 has no `Retry-After`, so the frontend invents a 60-second countdown and discards the backend's explanation that the limit lasts until midnight UTC. The banner is loaded only on mount/key change, so successful translations do not decrement the displayed remaining allowance. The retry button clears rate-limit errors without actually resending them because only AI/network errors set `canRetry`.

**Fix:** Define whether the quota charges attempts or successful translations. Use reservations with compensating release if success is intended. Return a structured limit type and reset timestamp, expose relevant headers for cross-origin use, update the banner after requests, and retry the query when the button says it will retry.

**Evidence:** Static request/error trace. Concurrent quota enforcement already uses an atomic database update; preserve that property.

### 21. Medium — Static data downloads create unbounded analytics writes and inflate page-view counts

**Location:** `middleware.py:52`, `middleware.py:76`, `db/models.py:45`, `db/models.py:74`.

The middleware excludes `/api/`, `/health`, and `/assets` but records `/sign-data/*`, `/models/*`, `/sw.js`, manifests, favicons, and arbitrary missing paths as page views. Browsing signs causes many background database writes. Tasks are retained until completion without a queue limit, and analytics/quota tables have no retention cleanup.

**Impact:** Analytics overcounts views; slow SQLite writes can accumulate tasks and increase memory/locking pressure. Data grows indefinitely between database resets.

**Fix:** Track deliberate navigation or frontend page events, exclude static/data paths and unsuccessful requests, use a bounded batched analytics writer, and establish retention for analytics and old daily counters.

**Evidence:** Static middleware coverage; no load test was run.

### 22. Medium — Redis can stall the memory fallback

**Location:** `cache.py:79`, `cache.py:121`, `cache.py:151`.

Redis has a connection timeout but no application command deadline or socket read timeout. Once connected, every cache read awaits Redis before checking memory. A stalled Redis server can prevent the fallback from being reached and cause frontend requests to time out. Initial connection failure also leaves Redis disabled until process restart; later failures repeatedly retry the same unavailable backend on each request.

**Fix:** Configure bounded operation timeouts, use a circuit breaker/backoff and controlled reconnection, and let a memory hit serve without waiting on an unhealthy remote cache.

**Evidence:** Static; no live Redis failure injection.

### 23. Medium, conditional — Forwarded IP trust lacks a trusted-peer boundary

**Location:** `deps.py:24`, `config.py:55`, `auth.py:46`.

With the default `TRUSTED_PROXY_HOPS=1`, the application trusts `X-Forwarded-For` from any peer. Reading from the right protects against attacker-supplied prefixes when a trusted proxy reliably appends the actual client IP. It does not protect a directly reachable backend: an attacker can supply the entire header and choose the quota, throttle, and admin-lockout identity. Incomplete chains also silently fall back to whatever entries are supplied.

**Fix:** Enforce a trusted proxy boundary, configure forwarding in one infrastructure layer, and default direct/local deployments to ignoring forwarded headers. Validate expected chain length and address formatting.

**Evidence:** Isolated call from untrusted peer `203.0.113.17` with supplied header `198.51.100.123` returned the supplied address. Actual Render exposure/header normalization was not tested.

The admin failure dictionary also only expires an IP's history when that same IP returns. Distinct failed-login identities leave entries indefinitely; use bounded/TTL storage. Both the guard and per-minute limiter are process-local, so multiple workers require shared state to retain consistent protection.

### 24. Medium — Translation concurrency and lifetimes are uncontrolled

**Location:** `routes/translate.py:118`, `python_code/asl/pipeline.py:196`, `python_code/asl/pipeline.py:74`, `src/services/api/client.ts:10`.

Each cache miss submits two sequential Gemini operations to the default executor. There is no application concurrency bound or per-text pending-request deduplication. Simultaneous identical misses all pay for the same work. The browser stops waiting after 60 seconds or aborts, while the synchronous worker can continue running; the route has no cooperative cancellation or explicit total request budget. Each agent/cache creation constructs a fresh `genai.Client` without explicit close or context-manager use.

**Impact:** Duplicate provider cost, work continuing after callers leave, thread-pool backlog, repeated connection setup, and resources whose cleanup is left to object lifetime rather than an explicit lifecycle.

**Fix:** Bound pending and active work, deduplicate compatible in-flight translations, use explicit provider and total deadlines, and manage clients with a deliberate lifecycle. Preserve per-key isolation. Prefer an async provider path if practical; cancellation still needs a defined policy for already submitted upstream work.

**Evidence:** Static; executor saturation and connection leakage were not measured. Do not interpret lack of an explicit timeout here as proof that the SDK has no internal timeout.

### 25. Medium, deployment-dependent — Persistence and migration behavior are fragile

**Location:** `render.yaml:10`, `render.yaml:40`, `db/engine.py:47`, `db/engine.py:56`, `docker-compose.yml:21`.

The blueprint stores feedback, analytics, and shared quotas in a relative SQLite file and declares no persistent disk or external database. The repository itself documents this deployment's filesystem as ephemeral. Consequently persistence and daily counters depend on an external deployment arrangement absent from the blueprint.

Startup unconditionally adds `analytics.key_type` after `create_all()` already creates that column, then catches every exception. This masks real migration failures. On PostgreSQL, a duplicate-column error aborts the transaction: catching the Python exception does not recover it, and a fresh startup's preceding schema creation can be rolled back. That path needs a PostgreSQL integration test before the documented database switch is considered supported.

Compose also mounts nonexistent `./database.py`, while the active backend lives under `db/`, and does not bind-mount the `db/`, `routes/`, `auth.py`, or middleware modules. Edits to those files do not hot reload in the advertised development environment.

**Fix:** Configure durable storage, use versioned or inspected migrations, and update Compose mounts to the current architecture. Make a deployment test exercise actual startup against a fresh database.

**Evidence:** Static configuration review; deployed durability and PostgreSQL behavior were not integration-tested.

## Further optimizations and smaller flaws

1. **Heavy initial dependencies.** The build produces a 521.87 kB main JS chunk plus a 1,006.30 kB shared chunk. `ActionButtons` imports `pdf.ts`, which eagerly imports jsPDF; clicking Export could load it on demand. `LearnPage` eagerly imports `CameraPracticeExercise`, pulling camera/ML code into ordinary learning. Lazy-load camera practice and PDF export, then remeasure the browser's route dependency graph. Chunk names alone do not identify everything inside them.

2. **Duplicated sign retention defeats the cache cap.** The loader limits its map to 50 entries, but `LearnContext.loadedSigns` and each visible dictionary card retain separate strong references. The dictionary observer only disconnects after first visibility; it never releases offscreen sign data. All raw sign assets total 9.8 MB on disk and expand into many JS arrays/objects after parsing. Use a shared bounded cache, release offscreen data, and virtualize long grids where useful. This is an architectural memory estimate, not a measured heap profile.

3. **Repeated sentence-animation loads.** `DictionaryPage` creates a fresh `words` array each render, triggering the animator's `[words]` loading effect. Memoize that array, deduplicate pending fetches, normalize keys once, and bound parallel fetches for long phrases. `_get_kb_matched_words` also recomputes semantic matches after context construction when semantic mode is enabled; retain the lookup results instead.

4. **Avoid React renders for spinner rotation.** `TranslateLoadingView` calls `setTick` on every animation frame and rerenders its entire skeleton/pipeline view just to rotate SVGs. CSS animation can perform the same task and support reduced-motion preferences.

5. **Docker sends unnecessary local environments.** `.dockerignore` ignores `venv/` but not `.venv/`, which currently occupies 2.0 GB. Ignore it and training/build/test artifacts explicitly. It is not copied into the image by the current explicit `COPY` list; the avoidable cost concerns the build context.

6. **Two Python dependency definitions have diverged.** Docker/CI use the lean `requirements*.txt` path on Python 3.11; `pyproject.toml`/`uv.lock` require Python 3.13 and still install LangChain, LangGraph, Torch, ONNX, TensorFlow conversion packages, and sentence-transformers as application dependencies. `google-genai` is only transitive in that path. Use one authoritative runtime dependency set and optional training/semantic/dev groups. Runtime pins do not pin every transitive requirement.

7. **Storage validation is incomplete.** Most readers accept any parsed JSON without shape checks. Valid JSON such as a null favorites list can crash provider consumers. Active sessions accept empty exercises, negative/out-of-range/noninteger indices, nonexistent levels, missing IDs, invalid exercise types, and inconsistent answer/options fields. Validate bounded schemas and version stored data. `clearLearningData()` also leaves `ACTIVE_SESSION` intact.

8. **Translation cache needs explicit semantics.** Server cache keys lowercase the text, so meaning-sensitive capitalization can collide; hits return the original cached `query` rather than the caller's query. Frontend session cache lacks TTL/schema/prompt-version checks, and its unguarded `sessionStorage.getItem` calls fail when storage access throws. Introduce consistent normalization, a cache version, current-query echoing, and safe validated storage reads.

9. **Navigation does not follow query changes.** Dictionary initial query handling is intentionally mount-only. Browser Back/Forward or navigation to another `q` on the already mounted route changes the URL without updating the shown translation. Observe query changes while deduplicating requests, and clean up pending requests/hint/countdown timers on unmount.

10. **Offline model updates are not atomic.** `sw.js` refreshes model topology, weight shard, scaler, and labels independently, so a retraining deploy can mix asset versions. Cache versioned model bundles together. Several `cache.put()` promises are neither returned nor attached to `event.waitUntil`, weakening completion guarantees when the worker stops. Offline camera detection also depends on third-party WASM/model downloads that this worker deliberately does not cache. Offline upgrade behavior was not tested.

11. **Configuration is partly ineffective.** `Settings.model_name` is ignored by the pipeline's hardcoded `MODEL_NAME`; changing `MODEL_NAME` in the environment does not select the requested model. `api_prefix` is configurable in the backend but hardcoded in frontend calls, analytics exclusions, and service-worker exclusions. Centralize or remove these knobs.

12. **Presentation data is fabricated.** “Recent translations” is a fixed sample list with fixed counts and relative dates, even though real history exists. The saved-phrase composer button inserts a hardcoded phrase instead of opening saved phrases. Dictionary sort and its displayed keyboard shortcut have no corresponding handlers. Implement these controls or label sample content honestly.

## Test gaps and suggested correction order

Existing passing tests are useful but primarily exercise utilities, CRUD operations, and mocked routes. The frontend suite contains no component/hook tests. Backend tests generally bypass lifespan; the named rate-limit test sends three requests to the unthrottled health endpoint and does not prove translation throttling. Atomic shared quota consumption, live startup/migrations, pipeline postprocessing/recovery, production route serving, and cache behavior remain weakly covered.

Suggested sequence:

1. Correct privacy copy, server-controlled verification, and numeric spelling. Add deterministic pipeline tests using fake provider responses.
2. Fix camera ownership/cleanup and public provider-budget enforcement; redact Redis credentials.
3. Repair PDF/share behavior, XP/unlock logic, and idempotent saved-session outcomes. Add browser/component regressions for the confirmed cases.
4. Resolve stale sign loads, playback callbacks/reset, animation key mapping, and confidence timing.
5. Make persistence/startup durable and tested; bound analytics/provider work and Redis operations.
6. Split heavy route/export dependencies, reduce render churn, and reconcile dependency/development configuration. Measure performance after these changes instead of increasing chunk-warning thresholds.

No implementation fixes were made during this audit. The pre-existing working-tree changes remain intact.
