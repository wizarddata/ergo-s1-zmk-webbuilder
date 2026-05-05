# ErgoS1 ZMK Builder

Local-deploy webapp for editing the [Ergo S-1 keyboard](https://github.com/wizarddata/Ergo-S-1) ZMK keymap with a GUI and building firmware via local Docker — **no GitHub account, no PAT, no fork required**.

Forked from [Nylone/zmk-keymap-editor](https://github.com/Nylone/zmk-keymap-editor) (which is itself a fork of [nickcoutsos/keymap-editor](https://github.com/nickcoutsos/keymap-editor)). The original GitHub OAuth/App flow has been replaced with an offline build path that runs `west build` inside `zmkfirmware/zmk-dev-arm:4.1-branch` against a one-time clone of [arcanemachine/zmk-ergo-s-1](https://github.com/arcanemachine/zmk-ergo-s-1).

## How it works

1. App boots, loads default layout + keymap from sibling `../zmk-config/config/`.
2. You edit the keymap in the browser (or upload an existing `.keymap` file).
3. Pick a board (`nice_nano` or `nrf52840dk_nrf52840`) + side(s) (`left`, `right`, or both).
4. **Build Firmware** streams an SSE log:
   - On first run: pulls Docker image (~1GB), clones ZMK fork into a Docker named volume, runs `west update` inside the container. ~3-4 min total on Windows.
   - Builds each selected shield via `docker run --rm -v ergo-s1-cache:/workspace -v <per-build-tmp>:/io ... west build`. Warm rebuild ~45s/shield.
   - Returns one download link per `.uf2` file.

The only network access required is the one-time GitHub clone of the ZMK fork + the Docker image pull. After that, builds are fully offline.

The cache lives inside a Docker named volume (`ergo-s1-cache`) rather than a host bind mount — Windows/Mac users get the speed of native Linux I/O without sacrificing host browseability of the final `.uf2` outputs (which still land in `ARTIFACTS_DIR`).

## Supported targets

| Board | Shield (left / right) | Notes |
|-------|-----------------------|-------|
| `nice_nano` | `ergo_s1_oe_left` / `ergo_s1_oe_right` | Production OSE (Open Source Edition). Default. |
| `nrf52840dk_nrf52840` | `ergo_s1_left` / `ergo_s1_right` | Prototype/standard variant. |

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine (Linux), running and reachable as `docker` on PATH.
- `git` on PATH (used for the one-time ZMK fork clone).
- Node 18+ (for running the server locally).
- Disk: ~5GB for the build cache after first run.

## Setup

```sh
npm install              # installs api + app deps via postinstall
npm run dev              # ENABLE_DEV_SERVER=true → CRA on :3000, API on :8090
```

Then open http://localhost:3000.

For production-style local run (single-port, served from express):

```sh
npm install
cd app && npm run build && cd ..
node index.js
```

Then open http://localhost:8090.

### Configuration (optional)

All settings have sensible defaults. Copy `.env.template` → `.env` to override.

| Var | Default | What |
|-----|---------|------|
| `PORT` | `8090` | Server port |
| `BUILD_CACHE_VOLUME` | `ergo-s1-cache` | Docker named volume for ZMK fork + zephyr + modules + intermediate build outputs. Lives inside the Docker engine (WSL2 ext4 on Windows) for ~7-10× faster I/O than a Windows host bind mount. |
| `ARTIFACTS_DIR` | `%LOCALAPPDATA%\ergo-s1-builder\artifacts` (Win), `~/.cache/ergo-s1-builder/artifacts` | Host dir for per-build I/O scratch + final `.uf2` outputs. Browsable from your file manager. |
| `ZMK_FORK_GIT_URL` | `https://github.com/arcanemachine/zmk-ergo-s-1.git` | ZMK fork URL |
| `ZMK_FORK_REVISION` | `main` | Branch/tag |
| `DOCKER_IMAGE` | `zmkfirmware/zmk-dev-arm:4.1-branch` | Docker build image (matches Zephyr v4.1.0+zmk-fixes pin) |

### Reset cache

```sh
npm run reset-cache    # docker volume rm -f ergo-s1-cache
```

Next build re-clones + re-runs `west update`.

## Build flow internals

`POST /build/local` is a Server-Sent Events stream. Events:

| Event | Payload | When |
|-------|---------|------|
| `status` | `{ phase, message? }` | Phase changes: `prepare` → `image:pull` → `cache:clone` → `cache:update` → `build:<shield>` → `archive` |
| `log` | `{ line }` | Stdout/stderr line from git/west/docker |
| `done` | `{ buildId, shields, files, downloadUrls }` | All shields built. One download URL per file. |
| `error` | `{ message, detail? }` | Anything failed |

Per-build artifacts live at `<ARTIFACTS_DIR>/<buildId>/<shield>.uf2` and are served by `GET /build/local/artifact/:id/:name`. Each build dir also keeps the staged `keymap` text file used as input.

## Flashing firmware

Each side flashes independently:

1. Click the per-shield download link from the build panel. Save the `.uf2` somewhere.
2. Double-press the reset button on the back of the keyboard half to enter bootloader mode.
3. Connect via USB. The half mounts as a removable drive.
4. Copy `<shield>.uf2` onto the drive (e.g. `ergo_s1_oe_left.uf2` for the left half on production OSE).
5. The drive auto-ejects when complete; the keyboard restarts.
6. Repeat with the matching `_right.uf2`.

## Architecture

```
Browser
  │  GUI edit (React, port 8090)
  ▼
Node Express server (api/)
  ├── /server-config              static board+shield matrix
  ├── /layout, /keymap            default ZMK keymap from sibling zmk-config/
  ├── /import-keymap              parse uploaded .keymap → JSON
  ├── /generate-keymap            JSON → .keymap text
  ├── /build/preflight            docker availability check
  ├── /build/reset-cache          drop the ergo-s1-cache volume
  ├── /build/local                SSE: cache → docker run → .uf2 collect
  └── /build/local/artifact/:id/:name   serve built .uf2
       │
       ▼  spawns docker, mounts cache volume + per-build io dir
docker run --rm
  -v ergo-s1-cache:/workspace                  # named volume (Linux ext4)
  -v <ARTIFACTS_DIR>/<id>:/io                  # per-build host bind
  zmkfirmware/zmk-dev-arm:4.1-branch
  └── cp /io/keymap → /workspace/zmk/app/boards/shields/<shield_dir>/<keymap>
      west build → /workspace/zmk/app/build/<shield>/zephyr/zmk.uf2
      cp zmk.uf2 → /io/<shield>.uf2
       │
       ▼  served from host
<ARTIFACTS_DIR>/<buildId>/<shield>.uf2
```

## Troubleshooting

- **`/build/preflight` returns 503** → Docker daemon not running, or `docker` not on PATH. Start Docker Desktop and retry.
- **First build slow** → expected, but should be ~3-4 min on Windows now that the cache lives in a Docker named volume. The SSE `log` event streams progress (clone → west update → compile).
- **Build fails: "shield not found"** → cache volume was partially populated. Run `npm run reset-cache` (drops the volume), then build again.
- **CORS errors** → set `APP_BASE_URL` in `.env` to the URL you're loading the page from (default `http://localhost:8090`).
- **Inspecting cache contents** → cache lives inside the volume; `docker run --rm -v ergo-s1-cache:/workspace -it alpine sh` gives a shell inside it. Or `docker volume inspect ergo-s1-cache` for the on-disk path (Windows users: the path is inside the WSL2 VM).

## Running the server itself in Docker

The shipped `Dockerfile` + `docker-compose.yml` containerize the *webapp*. To dispatch builds from inside the container, you'd need to mount the host docker socket and translate cache paths between host + container — not yet wired. Until then, **run the server with `node index.js` on the host** and let it spawn build containers directly.

## Credit

- [nickcoutsos](https://github.com/nickcoutsos/keymap-editor) — original keymap editor
- [Nylone](https://github.com/Nylone/zmk-keymap-editor) — fork
- [arcanemachine](https://github.com/arcanemachine) — Ergo S-1 ZMK config + ZMK fork with `ergo_s1` / `ergo_s1_oe` shields
- [wizarddata](https://github.com/wizarddata/Ergo-S-1) — Ergo S-1 keyboard

## License

MIT.
