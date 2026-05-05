# ErgoS1 ZMK Builder

GUI for editing [Ergo S-1](https://github.com/wizarddata/Ergo-S-1) ZMK keymaps + building firmware locally. No GitHub fork or PAT required — builds run in Docker against a one-time clone of [arcanemachine/zmk-ergo-s-1](https://github.com/arcanemachine/zmk-ergo-s-1).

Based on [Nylone/zmk-keymap-editor](https://github.com/Nylone/zmk-keymap-editor) (fork of [nickcoutsos/keymap-editor](https://github.com/nickcoutsos/keymap-editor)).

## Requirements

- Docker Desktop (Win/macOS) or Docker Engine (Linux). Must be running.
- Node 18 or newer.
- Git.
- ~5 GB free disk for the build cache.

## Quick start

```sh
git clone https://github.com/wizarddata/ergo-s1-zmk-webbuilder.git
cd ergo-s1-zmk-webbuilder
npm install                       # also installs app/ deps via postinstall
cd app && npm run build && cd ..  # build React frontend
node index.js                     # start server on :8090
```

Open <http://localhost:8090>.

A factory-default Ergo S-1 keymap is bundled with the app — no extra repo to clone. To start from your own existing keymap, click **Upload .keymap** in the UI on first load.

## Building firmware (in the browser)

1. Page loads with the bundled factory-default Ergo S-1 keymap.
2. (Optional) Click **Upload .keymap** to start from your own existing keymap file instead. Your file overwrites the editor state for the rest of the session.
3. Click any key on the visual keyboard to remap it.
4. Pick a **board** (`nice_nano` for OSE, `nrf52840dk_nrf52840` for prototype).
5. Tick **left**, **right**, or both.
6. Click **Build Firmware**.
   - **First build:** ~3–5 minutes. Pulls the Docker image (~1 GB), clones the ZMK fork into a Docker named volume, runs `west update`. One time only.
   - **Later builds:** ~30–60 seconds per shield.
7. When the build finishes, click each `⬇ <shield>.uf2` link at the top of the build panel to download.

Files also land at `%LOCALAPPDATA%\ergo-s1-builder\artifacts\<buildId>\` (Windows) or `~/.cache/ergo-s1-builder/artifacts/<buildId>/`.

## Flashing the keyboard

For each downloaded `.uf2`:

1. Double-tap the reset button on the back of the matching half.
2. The half mounts as a USB drive.
3. Drag the `.uf2` onto the drive.
4. The drive auto-ejects; the keyboard restarts on new firmware.
5. Repeat with the other half's `.uf2`.

`ergo_s1_oe_left.uf2` → left half. `ergo_s1_oe_right.uf2` → right half. (Or `ergo_s1_left/right.uf2` for the prototype board.)

## Configuration

Defaults are usually fine. To override, copy `.env.template` → `.env`:

| Var | Default | What |
|-----|---------|------|
| `PORT` | `8090` | HTTP port |
| `BUILD_CACHE_VOLUME` | `ergo-s1-cache` | Docker named volume holding ZMK fork + zephyr + modules. Lives inside Docker; faster than a host bind mount on Windows/Mac. |
| `ARTIFACTS_DIR` | `%LOCALAPPDATA%/ergo-s1-builder/artifacts` (Win), `~/.cache/ergo-s1-builder/artifacts` | Where built `.uf2` files land on the host |
| `ZMK_FORK_GIT_URL` | `https://github.com/arcanemachine/zmk-ergo-s-1.git` | ZMK fork URL |
| `ZMK_FORK_REVISION` | `main` | ZMK fork branch/tag |
| `DOCKER_IMAGE` | `zmkfirmware/zmk-dev-arm:4.1-branch` | Build image. Matches the Zephyr `v4.1.0+zmk-fixes` pin in arcanemachine's `west.yml`. |
| `ZMK_CONFIG_PATH` | unset (uses bundled defaults) | Optional. Point to a local clone of an Ergo S-1 zmk-config repo to load its keymap on boot instead of the bundled one. |

### Reset cache

```sh
npm run reset-cache
```

Drops the `ergo-s1-cache` Docker volume. Next build re-clones + re-runs `west update` (~3–5 min).

### Refresh bundled defaults

```sh
npm run sync-defaults
```

Re-fetches `info.json` + `ergo_s1_oe.keymap` from `arcanemachine/ergo-s-1-zmk-config@master` into the bundled defaults dir. Run this if upstream changes the factory keymap and you want to ship the new one.

## How the build pipeline works

```
Browser
  │  GUI edit (React, port 8090)
  ▼
Express server (api/)
  ├── /server-config              static board+shield matrix
  ├── /layout, /keymap            bundled factory-default keymap
  ├── /import-keymap              parse uploaded .keymap → JSON
  ├── /generate-keymap            JSON → .keymap text
  ├── /build/preflight            docker availability check
  ├── /build/state                current/last build status
  ├── /build/local                SSE: cache → docker run → .uf2 collect
  ├── /build/local/stream/:id     reattach to in-progress build (refresh-safe)
  ├── /build/local/artifact/:id/:name    serve built .uf2
  └── /build/reset-cache          drop the cache volume
       │
       ▼  spawns docker, mounts cache volume + per-build io dir
docker run --rm
  -v ergo-s1-cache:/workspace                  # named volume
  -v <ARTIFACTS_DIR>/<id>:/io                  # per-build host bind
  zmkfirmware/zmk-dev-arm:4.1-branch
  └── cp /io/keymap → shield dir
      west build (incremental, no -p)
      cp zmk.uf2 → /io/<shield>.uf2
       │
       ▼  served from host
<ARTIFACTS_DIR>/<buildId>/<shield>.uf2
```

A single build runs at a time. Refreshing the browser mid-build reattaches to the running build via the registry — no work lost.

## Troubleshooting

- **`/build/preflight` returns 503** → Docker daemon not running. Start Docker Desktop and retry.
- **First build hangs at `cache:update`** → it's downloading zephyr + modules into the volume. Watch the SSE log; ~3 min on a fast connection.
- **Build fails: "shield not found"** → cache volume is in a bad state. `npm run reset-cache`, then build again.
- **CORS errors in browser console** → set `APP_BASE_URL` in `.env` to whatever URL you're loading the page from.
- **Port 8090 already in use** → `PORT=8091 node index.js` or set `PORT` in `.env`.
- **Need to peek inside the cache volume** → `docker run --rm -v ergo-s1-cache:/workspace -it alpine sh`.

## Local dev (frontend hot-reload)

```sh
npm run dev
```
Spawns CRA on `:3000`, API on `:8090`. Open <http://localhost:3000>.

## Credits

- [nickcoutsos](https://github.com/nickcoutsos/keymap-editor) — original keymap editor
- [Nylone](https://github.com/Nylone/zmk-keymap-editor) — fork
- [arcanemachine](https://github.com/arcanemachine) — Ergo S-1 ZMK config + the ZMK fork carrying the `ergo_s1` / `ergo_s1_oe` shields
- [wizarddata](https://github.com/wizarddata/Ergo-S-1) — Ergo S-1 keyboard

## License

MIT.
