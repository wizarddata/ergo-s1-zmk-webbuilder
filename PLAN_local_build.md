# Local Docker build — implementation status

GitHub-decoupled refactor. Last updated 2026-05-05. **Validated end-to-end.**

## Selectable ZMK fork revision (added 2026-05-05)

Default = pinned commit (vetted/tested, label `Pinned (tested 2026-05-05)`).
Optional = latest `main` resolved at request time via `git ls-remote`.

**API surface**
- `GET /build/zmk-revisions` → `{ ok, revisions: [pinnedDescriptor, latestDescriptor] }`. Each descriptor: `{ id, label, sha, shortSha, ... }`. Latest descriptor includes `branch`, `resolvedAt`, `cached`. On lookup failure latest carries `error` field; UI disables that option.
- `POST /build/local` — body now accepts optional `zmkRevision`: `'pinned'` | `'latest'` | a 40-char SHA. Server resolves to a concrete SHA before any cache work.
- `GET /build/state` and the `attach` / `done` SSE events now carry `revision: { id, sha, shortSha, label }`.

**Cache invalidation rule (single named volume `ergo-s1-cache`)**
- `inspectCacheState` reads `/workspace/.cached-rev` stamp + `git -C /workspace/zmk rev-parse HEAD` to detect what is on disk.
- If requested SHA ≠ stamped/HEAD: `git fetch --depth 1 origin <sha>` + `git checkout -f FETCH_HEAD` + `git reset --hard FETCH_HEAD`, then **wipe `/workspace/zmk/app/build/`** (CMake state from prior rev would otherwise be incompatible), re-run `west update --narrow`, rewrite stamp.
- If requested SHA == stamped: skip clone/update, go straight to compile.

**Build dir naming**
- Per shield+rev: `build/<board>-<shield>-<rev7>`. Switching back and forth between revisions does not corrupt CMake state because each rev gets its own subtree.

**Frontend UI**
- `BuildPanel.js` shows a `ZMK fork:` `<select>` above the Build button, populated from `/build/zmk-revisions`.
- Default selected = pinned. Latest option carries `⚠ untested — may fail to compile` warning when chosen.
- After build attach, panel renders `Build using: <label> [<shortSha>]`.

**Trust + reproducibility notes**
- "Latest" pulls whatever upstream pushed minutes ago — same trust profile as the pinned SHA, but with no human-vetted gate. Acceptable for self-use; flag if ever multi-user.
- Resolved SHA is logged in the build stream and the `done` event so the user always knows which commit produced their `.uf2`.
- `GET /build/zmk-revisions` caches the latest-SHA lookup for 60 s to avoid hammering GitHub.

**Bumping the pinned default**
1. Verify a fresh upstream commit produces a working firmware (use `latest` option, build, flash).
2. Edit `api/config.js` `ZMK_FORK_REVISION` (full SHA) + `ZMK_FORK_REVISION_TESTED_DATE`.
3. `npm run reset-cache` (optional — invalidation now happens automatically on next build, but reset reclaims the orphaned tree if you want to start clean).

**Followups (not done)**
- Multi-volume option (one named volume per rev) for instant rev switching without re-fetch — deferred. Disk cost ~2-3 GB per rev.
- Persisting last-built rev per artifact in the artifact dir, so download URLs can include rev in filename. Currently filename is just `<shield>.uf2`; rev is reported only via the SSE `done` event.


## What's done + working

- **Backend**
  - `api/services/zmk/west-cache.js` — manages Docker named volume `ergo-s1-cache`, clones ZMK fork into it, runs `west init -l app && west update --narrow -o=--depth=1 && west zephyr-export` inside a one-shot container. Idempotent: inspects volume state and skips clone/update if present.
  - `api/services/zmk/local-build.js` — per build:
    - Creates `<ARTIFACTS_DIR>/<buildId>/` host dir
    - Writes user keymap text to `<dir>/keymap`
    - Spawns `docker run --rm -v ergo-s1-cache:/workspace -v <dir>:/io ...` with a script that copies the keymap into the shield dir, runs `west build`, copies `zmk.uf2` back to `/io/<shield>.uf2`
    - Iterates shields sequentially
  - `api/routes/build.js` — `POST /build/local` SSE (phases: `prepare` → `image:pull?` → `cache:clone?` → `cache:update?` → `cache:ready` → `build:<shield>` → `archive` → `done`) + `GET /build/local/artifact/:id/:name` + `POST /build/reset-cache`.
  - `api/routes/keymap.js` — `/import-keymap` + `/generate-keymap` extracted from old `/github` prefix.
  - `api/services/zmk/local-source.js` — reads default layout + keymap from sibling `../zmk-config/config/`. Falls back to parsing `.keymap` via `parseKeymapCode` if no `keymap.json` present.
  - `api/config.js` — `BUILD_CACHE_VOLUME` (named volume), `ARTIFACTS_DIR` (host dir for downloads).
  - `api/services/github/`, `api/routes/github.js` deleted.

- **Frontend**
  - `app/src/api.js` — single client. Exposes `loadLayout/loadKeymap/loadServerConfig/importKeymapText/generateKeymapCode/buildLocal`.
  - `app/src/Pickers/KeyboardPicker.js` — boots from local server endpoints.
  - `app/src/BuildPanel.js` — calls `/build/local`, renders one download link per shield.
  - `app/src/App.js` — board dropdown + side checkboxes (left/right), no commit button.
  - `app/src/Pickers/Github/`, `app/src/GitHubLink.js` deleted.

- **Pin choices**
  - Docker image: `zmkfirmware/zmk-dev-arm:4.1-branch` (matches `zephyr v4.1.0+zmk-fixes` in arcanemachine fork).
  - ZMK fork: `arcanemachine/zmk-ergo-s-1@main`.
  - Cache: Docker named volume `ergo-s1-cache` (Linux ext4 inside Docker engine — ~7-10× faster than Windows bind mount).
  - Artifacts: host dir `%LOCALAPPDATA%/ergo-s1-builder/artifacts` (Win) — browsable.

## Validation results (2026-05-05)

| Path | Time | Notes |
|---|---|---|
| Cold: image pull (~1GB) | not measured separately | one-time |
| Cold: clone + west update + 1 shield (named volume) | **202.5s** | first ever build |
| Warm: 1 shield only | **43.6s** | cache:ready phase skipped clone+update |
| Warm: 2 shields sequential | **74.4s** | each shield ~37s incremental |

Reference (bind mount, replaced approach):
- west update alone took ~16 min
- 1-shield compile took ~7 min
- Total cold: ~25 min

**Speedup with named volume: ~7× cold, ~10× warm.**

`.uf2` outputs verified: correct size, valid `UF2\n` magic, downloadable via `GET /build/local/artifact/:id/:name`.

## Known issues / followups

- **Old bind-mount cache orphaned** at `%LOCALAPPDATA%\ergo-s1-builder\cache\` (~3-5GB). Safe to delete — no code references it any more. Manual: `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ergo-s1-builder\cache"`.
- **Phase events for skipped work** — `cache:clone` and `cache:update` are now only emitted when those steps actually run (fixed in west-cache.js via `inspectCacheState`).
- **`docker-compose.yml`** still containerizes the webapp; does NOT yet wire docker socket for build dispatch. Run server natively (`node index.js`) for now.
- **Cache invalidation** — never auto-runs `west update` after first init. If the upstream ZMK fork updates, manual reset needed: `npm run reset-cache`. Could add a 24h timer or hash-of-west.yml later.
- **Concurrent builds** — sequential per shield (per user choice). Parallel inside one container is doable but not implemented.
- **Image pin** — `:4.1-branch` is a moving tag. Pinning to a digest (`@sha256:...`) would be more stable but requires manual bumping.

## Test sequence

1. **Server boot**
   ```sh
   cd C:/Users/wizard/Documents/ErgoS1-Build/zmk-webbuilder
   PORT=8091 node index.js
   ```
2. **Preflight**
   ```sh
   curl http://localhost:8091/build/preflight
   # {"ok":true,"image":"zmkfirmware/zmk-dev-arm:4.1-branch","volume":"ergo-s1-cache","artifacts":"..."}
   ```
3. **Trigger build via UI** — open browser, pick board + side(s), click Build Firmware. SSE log should show:
   - `cache:clone` + `cache:update` (first run only, ~3 min total)
   - `build:<shield>` (~30-45s warm)
   - `archive` → `done` with download links

4. **Reset cache to retest cold path**
   ```sh
   npm run reset-cache
   ```
