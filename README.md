# ErgoS1 ZMK Builder

Local-deploy webapp for editing the [Ergo S-1 keyboard](https://github.com/wizarddata/Ergo-S-1) ZMK keymap with a GUI and building firmware via GitHub Actions.

Forked from [Nylone/zmk-keymap-editor](https://github.com/Nylone/zmk-keymap-editor) (which is itself a fork of [nickcoutsos/keymap-editor](https://github.com/nickcoutsos/keymap-editor)). GitHub OAuth/App machinery has been replaced with a Personal Access Token flow so the app can run entirely locally.

## How it works

1. You provide a GitHub Personal Access Token (PAT).
2. On first start, the app forks `arcanemachine/ergo-s-1-zmk-config` into your account if you don't already have it.
3. It loads `config/info.json` + `config/ergo_s1_oe.keymap` from the fork into the GUI.
4. You edit the keymap in the browser.
5. **Build Firmware** commits the modified keymap (plus a regenerated `west.yml` pointing at `arcanemachine/zmk-ergo-s-1` and a `build.yaml` with your selected boards) to your fork, dispatches the GitHub Actions workflow, polls until completion, and streams the resulting `firmware.zip` back to your browser for download.

## Supported targets

| Board | Shield (left / right) | Notes |
|-------|-----------------------|-------|
| `nice_nano` | `ergo_s1_oe_left` / `ergo_s1_oe_right` | Production OSE (Open Source Edition). Default. |
| `nrf52840dk_nrf52840` | `ergo_s1_left` / `ergo_s1_right` | Prototype/standard variant. |

Both can be enabled simultaneously — Actions builds all four `.uf2` files in parallel.

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).
- A GitHub account.
- A GitHub Personal Access Token — see below.

## Setup

### 1. Create a Personal Access Token

Pick one:

- **Classic PAT** (https://github.com/settings/tokens) — scopes: `repo`, `workflow`.
- **Fine-grained PAT** (https://github.com/settings/personal-access-tokens) — scoped to your fork of `ergo-s-1-zmk-config` (or "All repositories"), with permissions:
  - Contents: Read and write
  - Workflows: Read and write
  - Actions: Read

The token must be able to fork the upstream repo on first run, so for the very first run it needs access to your account broadly enough to create the fork. After the fork exists, a fine-grained token scoped to just that one repo is sufficient.

### 2. Configure environment

```sh
cp .env.template .env
# Edit .env, paste your PAT into GITHUB_PAT=
```

### 3. Run

```sh
docker compose up --build
```

Open http://localhost:8080.

The first run creates your fork (~5–30s wait). Subsequent starts are instant.

## Local development (no Docker)

```sh
npm install              # installs api + app deps via postinstall
npm run dev              # ENABLE_DEV_SERVER=true → spawns CRA on :3000, API on :8080
```

Then open http://localhost:3000.

For production-style local run (single-port, served from express):

```sh
npm install
cd app && npm run build && cd ..
node index.js
```

Then open http://localhost:8080.

## Build flow internals

`POST /build/{owner}/{repo}/{branch}` is a **Server-Sent Events** stream. Events:

| Event | Payload | When |
|-------|---------|------|
| `status` | `{ phase, message }` | Phase changes: commit → dispatch → locate → build → artifact |
| `commit` | `{ sha }` | After keymap commit lands |
| `run` | `{ id, htmlUrl, number }` | Workflow run located |
| `done` | `{ runId, artifactId, downloadUrl, sizeBytes }` | Build succeeded, artifact ready |
| `error` | `{ message, detail? }` | Anything failed |

The artifact is downloaded via `GET /build/{owner}/{repo}/artifact/{artifactId}` (proxy through the local server because the GitHub artifact endpoint requires the PAT in the `Authorization` header).

## Flashing firmware

Each side flashes independently:

1. Unzip `firmware.zip`.
2. Double-press the reset button on the back of the keyboard half to enter bootloader mode.
3. Connect via USB. The half mounts as a removable drive.
4. Copy `ergo_s1_oe_left.uf2` (or `ergo_s1_left.uf2` for prototype) onto the drive.
5. The drive auto-ejects when complete; the keyboard restarts.
6. Repeat for the other half with the matching `_right.uf2`.

## Troubleshooting

- **`401 Unauthorized` on first request** → PAT missing or wrong scopes. Check `repo` + `workflow`.
- **Fork created but `keyboard-files` returns 404** → fork is async-replicating; wait a few seconds and reload.
- **Build run not located** → The workflow file in your fork may have been disabled. Visit `https://github.com/<you>/ergo-s-1-zmk-config/actions` and re-enable.
- **Build fails on shield not found** → `west.yml` did not get regenerated. Check `config/west.yml` on your fork — it should reference `arcanemachine/zmk-ergo-s-1`. If it still points at `zmkfirmware/zmk`, click Build Firmware again (the app rewrites it on every build with `updateInfra: true`).
- **CORS errors** → set `APP_BASE_URL` in `.env` to the URL you're loading the page from (default `http://localhost:8080`).

## Architecture

```
Browser
  │  GUI edit (React, port 8080)
  ▼
Node Express server (api/)
  ├── /github/setup       PAT → ensure user fork exists
  ├── /github/keyboard-files/{owner}/{repo}    fetch info.json + keymap
  ├── /github/keyboard-files/{owner}/{repo}/{branch}   POST commit
  └── /build/{owner}/{repo}/{branch}    SSE: commit → dispatch → poll → artifact
       │
       ▼  GitHub REST API (PAT auth)
GitHub
  ├── your fork of arcanemachine/ergo-s-1-zmk-config (config + keymap)
  └── Actions runner → builds against arcanemachine/zmk-ergo-s-1 (ZMK fork w/ ergo_s1 shields)
```

## Credit

- [nickcoutsos](https://github.com/nickcoutsos/keymap-editor) — original keymap editor
- [Nylone](https://github.com/Nylone/zmk-keymap-editor) — fork
- [arcanemachine](https://github.com/arcanemachine) — Ergo S-1 ZMK config + ZMK fork with `ergo_s1` / `ergo_s1_oe` shields
- [wizarddata](https://github.com/wizarddata/Ergo-S-1) — Ergo S-1 keyboard

## License

MIT.
