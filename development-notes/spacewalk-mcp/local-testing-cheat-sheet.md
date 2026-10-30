# Spacewalk MCP — local testing cheat sheet

> **STATUS: Current (2026-10-30, #130).** Run the Worker and the viewer page together on one machine and
> drive them the way a model would. Needs no npm publish and no deployed host. Vocabulary:
> `spacewalk-mcp/GLOSSARY.md`.

## Before you start

The test runs two things: the Worker from `spacewalk-mcp` and the viewer page from `spacewalk`. The
`@aidenlab/spacewalk-remote` tarball is only the library the page uses to talk to the Worker, so you still
need a checkout of `spacewalk-mcp` to run the Worker.

One-time setup:

- `spacewalk` is on `viewer-attaches-to-room` (`main` once #130 merges), with `npm install` done.
- `spacewalk-mcp` is on `main`, with `npm install` done and `server/.dev.vars` copied from
  `server/.dev.vars.example`.

## Start it (two terminals)

```sh
# spacewalk-mcp: the Worker, on http://localhost:8787
npm run dev --workspace server -- --var VIEWER_URL:http://localhost:5173/viewer.html

# spacewalk: the viewer page, on http://localhost:5173
npm run dev
```

**Keep the `--var`.** `wrangler.toml` has `VIEWER_URL` at `http://localhost:5173/`, which is the full app,
and the full app ignores `?room=`. Without it the Room link opens the wrong page.

## Drive it (a third terminal)

Paste this helper, or add it to `~/.zshrc`. It calls one tool on the local Worker and prints the reply.
`ROOM` is added to every call when it is set.

```sh
sw() {
  node -e '
    const [tool, room, ...pairs] = process.argv.slice(1)
    const args = Object.fromEntries(pairs.map(p => [ p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1) ]))
    if (room) args.room = room
    fetch("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
    }).then(r => r.json()).then(r => console.log(r.result ? r.result.content.map(c => c.text ?? "").join("\n") : r.error.message))
  ' "$1" "$ROOM" "${@:2}"
}
```

Open a Room, then open its link:

```sh
unset ROOM
ROOM=$(sw open_viewer | grep -oE 'room=[0-9A-Z]{10}' | head -1 | cut -d= -f2)
open "http://localhost:5173/viewer.html?room=$ROOM"
```

Prefer a UI? Connect the MCP Inspector (`npx @modelcontextprotocol/inspector`) to `http://localhost:8787/mcp`
over Streamable HTTP.

## The tools

```sh
sw list_example_ensembles
sw load_ensemble url=https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/A549_chr21-28-30Mb.sw
sw select_ensemble_group key=GROUP_KEY

sw set_render_style style=ribbon           # or ball_and_stick
sw step_ball_radius direction=up           # or down
sw step_stick_radius direction=up          # or down

sw set_background_color color=cantaloupe   # an Apple crayon name, or hex
sw adjust_background direction=darker      # or lighter
sw reset_camera

sw read_viewer_state
sw get_shareable_url                       # creates a real short link; see Limits
sw load_session session=SHAREABLE_URL_OR_SESSION_STRING
```

Every reply opens with how the change came out and what changed "not by you", then the full viewer state.
To see just the headline: `sw read_viewer_state | head -1`.

## Ensembles to test with

All under `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/`. Full list: `sw list_example_ensembles`.

| Path | Use it for |
|---|---|
| `A549_chr21-28-30Mb.sw` | The default: small, 3,941 traces |
| `IMR90_chr21-28-30Mb.sw`, `K562_chr21-28-30Mb.sw` | Switching ensembles |
| `dugla-one-trace.sw`, `dugla-eight-traces.sw` | The ends of the trace stepper |
| `H1-hESC_chr21-0-48Mb.sw` | A large structure |
| `pointcloud/pointcloud.sw` | Point cloud: kind, point size, opacity, render-style refusal |
| `pointcloud/multiple-traces-multiple-genomic-locations.sw` | Trace stepping on a point cloud |
| `does-not-exist.sw` | A load that fails (404) |

Kinds and trace counts other than A549's are read from the file names, not checked.

## What to check

**A tool call changes the page**

- [ ] `load_ensemble`: the structure appears; the reply says "Applied and drawn"
- [ ] `set_render_style`, `step_ball_radius`, `step_stick_radius`, `set_background_color`, `adjust_background`: each shows at once
- [ ] Orbit, then `reset_camera`: the view returns to its framing

**A hand change shows up in the next reply** (make it, then `sw read_viewer_state | head -1`)

- [ ] Orbit: "the camera was moved". It should commit shortly after the camera visibly stops, with no jump back
- [ ] Trace stepper: "stepped to trace N"
- [ ] Render style, ball and stick radius, sticks, color ramp, circular (☰ panel)
- [ ] Axes, ground plane, ruler, background (⚙ settings)
- [ ] Home button: "reset the camera"

**Camera rules**

- [ ] Orbit, then step a trace: the view holds still
- [ ] Never orbited (or just reset), then step a trace: each trace is framed
- [ ] Orbit, then `load_ensemble` of another file: the new structure is framed

**Per Room and per window**

- [ ] Reload the page: it comes back in the same state
- [ ] Open the Room link in a second tab: it opens on the same state, and changes reach both
- [ ] Ruler position and open overlays stay with the window
- [ ] `localStorage` is empty for the page (DevTools → Application)

**Point cloud**

- [ ] Load one: `"kind": "point-cloud"` in the state
- [ ] `sw set_render_style style=ribbon`: refused
- [ ] Point size and transparency by hand show up in the next reply

**When things go wrong**

- [ ] `sw load_ensemble url=…/does-not-exist.sw`: "failed to draw"; the last structure stays; the next change still draws and does not fetch it again
- [ ] Stop the Worker with the page open, restart it: the page reconnects and resyncs
- [ ] `http://localhost:5173/viewer.html?room=0000000000`: "There is no such Room."

**Before deploy**

- [ ] `npm test` and `npm run build` pass in `spacewalk`; the build fails if `igv` or `juicebox.js` reaches the viewer bundle
- [ ] `npm run typecheck` and `npm run test:run` pass in `spacewalk-mcp`

## Limits

- **Not testable here:** publishing `@aidenlab/spacewalk-remote` and the pinned version, the deployed `VIEWER_ORIGINS` and `VITE_SERVER_URL`, and hosted clients such as claude.ai and ChatGPT web, which cannot reach `localhost` without a tunnel.
- **No group control on the viewer page.** Groups can only be chosen with `select_ensemble_group`. Which example files have more than one group is not recorded here: a loaded file's group name shows in the info panel.
- **`get_shareable_url` calls the production shortener,** so each call creates a real short link, and locally that link points at `localhost`. A local Worker's Rooms are also unrelated to deployed ones.
- **A Worker restart may or may not keep Rooms.** `wrangler dev` stores Durable Objects under `server/.wrangler`. If a Room is refused after a restart, open a new one.

## If something looks wrong

| Symptom | Likely cause |
|---|---|
| Room link opens the full app with its navbar | Worker started without the `--var` |
| Page stays empty, Worker log shows 403 on `/ws` | The page's origin is not in `VIEWER_ORIGINS`; use port 5173 |
| Page stays empty, no `/ws` request at all | `VITE_SERVER_URL` in `spacewalk/.env` points elsewhere; unset, it is `http://localhost:8787` |
| `load_ensemble` says "not shown yet — no viewer is open" | The page is not open or not attached; check it is on `viewer.html?room=` with the current `ROOM` |
| Changes to `remote/` do not show | The page uses the tarball. In `spacewalk`, run `npm install ../spacewalk-mcp/remote --no-save`, then restart `npm run dev` |
| `sw` says `Tool … not found` or an argument is invalid | Check the name and values under [The tools](#the-tools) |
