# Spacewalk MCP — milestones

> **STATUS: Current plan.** The overarching plan for building the Spacewalk MCP server and
> integrating it into geenee. One section per milestone: goal, where the work lives, the tasks,
> and what "done" means. Each milestone's tickets and their order live in its umbrella issue
> (see the table below).
>
> **Design:** decisions live in `spacewalk-mcp`'s `GLOSSARY.md` and `docs/adr/`. The original
> carve-out RFC and the per-milestone ticket docs were retired on 2026-11-03, once M0–M3 were done.
> They're in git history if you need them. The RFC's only open material, the ports, is in M4 below.
> **Vocabulary:** `CONTEXT.md` — especially **port**, **render style**, **producer**.

## At a glance

| Milestone | Where | Delivers | Tickets | Status |
|---|---|---|---|---|
| **M0** — carve out the 3D viewer | `spacewalk` (this repo) | a viewer-only page with no IGV or Juicebox inside it | [#104](https://github.com/aidenlab/spacewalk/issues/104) | **Done** (2026-10-28) |
| **M1** — the MCP server, single user | `spacewalk-mcp` (Worker + `spacewalk-remote`) + the viewer page here | the model drives the viewer page through a Room | [spacewalk-mcp#2](https://github.com/aidenlab/spacewalk-mcp/issues/2) | **Done** (2026-10-30) |
| **M2** — geenee integration | `geenee` + `spacewalk-mcp` | Spacewalk is the third viewer in geenee — **v1 done** | [geenee#43](https://github.com/aidenlab/geenee/issues/43) | **Done** (2026-11-02) |
| **M3** — shared Rooms | `spacewalk-mcp` + `spacewalk` | Guests join a Room link and share one live 3D view | [spacewalk-mcp#51](https://github.com/aidenlab/spacewalk-mcp/issues/51) | **Done** (2026-11-03) |
| **M4** — the ports | TBD | signal in, matrix out, selection in and out | — | Not started |

Each milestone is blocked by the one before it. Within a milestone, tickets carry their own
blocking edges on GitHub.

```
M0 viewer page ──▶ M1 server + Room ──▶ M2 geenee (v1) ──▶ M3 shared Rooms ──▶ M4 ports
```

---

## M0 — Carve out the 3D viewer

**Goal.** A page that is only the 3D viewer: it fills the window, loads a `.sw` ensemble from a URL
parameter, and has its own toolbar and overlays. Its bundle contains no `igv` and no `juicebox.js`.
The full Spacewalk app keeps working unchanged the whole way through.

**Where.** This repo. Umbrella issue **#104**.

**Tasks.**

1. **Prefactors in the full app** — remove every reach from the 3D code into IGV, with no visible
   change:
   - the viewer, not IGVPanel, owns the current material provider (the **signal port**'s seam)
   - IGV follows ensemble loads by listening, instead of ingestion calling IGV
   - genome-assembly resolution no longer consults IGVPanel
   - delete the Scale Bars (the follow-on from the Reference Ruler RFC)
2. **One viewer assembly** — a single routine builds the 3D viewer with no IGV or Juicebox
   dependency; the full app calls it and then attaches its panels.
3. **The viewer-only page** — a new entry point built on that routine; fills the window; loads from
   a URL parameter; navigator and ball-picker highlighting work.
4. **The in-viewer UI** — the gray top bar becomes the toolbar (`[− trace +] … [⚙] [⌂]`, ☰ floating over the canvas);
   the widget panel and settings become overlays inside the viewer, closed by default.

**Done when.** The viewer-only page renders the Load From List fixtures in every render style, with
working trace select, widget overlay and settings overlay; the build shows no `igv`/`juicebox.js` in
its bundle; the full app behaves exactly as before.

**Out of scope.** Any server, Room, or WebSocket. Hand-loading UI. Deploying the page.

**The boundary, as it stands.** The viewer page's bundle contains no `igv` and no `juicebox.js`.
Small utilities (`igv-utils`, `hic-straw`) are decided case by case. Two checks enforce it:
- `src/viewer.test.js` walks the static import graph from `viewer.js` and catches a leak at the
  import that introduces it.
- `build/viewerBoundary.mjs` fails `vite build` if the bundle reaches either package by any route,
  including a dependency of a dependency or a dynamic import.

The threads that tied 3D to IGV and Juicebox weren't deleted. They became **ports** (see M4) and
were left unconnected. The viewer is whole without them.

---

## M1 — The MCP server, single user

**Goal.** A model in Claude or ChatGPT can open the viewer, load an ensemble, and change what it
shows; every reply tells the model the full viewer state and what the user changed by hand.

**Where.** A new repo, `spacewalk-mcp` (Cloudflare Worker, plus `@aidenlab/spacewalk-remote` and the
wire protocol in its `remote/` workspace, published to npm), and the viewer page in this repo, which
pins `spacewalk-remote` and is deployed to Cloudflare Pages. See `spacewalk-mcp` ADR 0003.

**Design** (grilled 2026-10-28; vocabulary in `spacewalk-mcp/GLOSSARY.md`, decisions in its
`docs/adr/`):

- **Viewer state** — the Room's one structured, versioned record: the ensemble (URL, group, trace,
  kind), render style, **structure appearance** (radius steps, sticks, point size and transparency,
  color ramp, circular genome), viewer settings. It holds no camera pose (spacewalk-mcp ADR 0005). The session string appears only at the
  edges: `get_shareable_url` writes one, `load_session` reads one.
- **The Room applies every proposal**, relative steps included, so a tool call takes effect with no
  Viewer open (the reply says it is not shown yet).
- **Replies** carry the full viewer state, the number of connected Viewers, and the changes the model
  did not cause, in plain phrases. They wait up to 20 s for **realized**, else "applied, still
  drawing". A second Viewer is allowed without promises: the first to realize answers, any failure
  surfaces.
- **Room id** is a tool argument (`open_viewer` aside); under ChatGPT it is HMAC(`x-openai-session`).
  An expired Room never gets its contents back; `open_viewer` may start it over, empty, under the
  same id.

**Tasks.**

1. **Repo scaffold** — done (`5afcf9c`). The scaffold's `viewer/` workspace becomes `remote/`.
2. **ADRs** — done: 0001 *the Room is authoritative*; 0002 *viewer settings beside the session*;
   0003 *`spacewalk-remote` and the protocol live in `spacewalk-mcp`*.
3. **The viewer state** — apply, version, broadcast; relative steps; 24h idle expiry.
4. **The protocol** — join handshake with a protocol version (mismatch → "reload the viewer");
   proposals; state broadcasts; Viewers report a version **realized** (drawn or failed), with the
   ensemble's kind.
5. **`spacewalk-remote`** — attaches the viewer page to a Room: applies broadcast state, proposes hand
   changes (debounced at gesture end), reports realized/failed. Published by GitHub release.
6. **In `spacewalk`:** structure appearance joins the session format (full app too; old sessions
   load with defaults); the viewer page reads a snapshot URL (session parameter + viewer-settings
   parameter); the viewer page attaches through `spacewalk-remote`, with the Room as the
   viewer-settings store.
7. **Tools** — `open_viewer`; `load_ensemble`, `list_example_ensembles` (the Load From List file,
   fetched from R2), `select_ensemble_group`; `set_render_style` (refused on a known point cloud),
   ball radius up/down, stick radius up/down; `reset_camera`, `set_background_color` (crayon name or
   hex), `adjust_background`; `read_viewer_state`,
   `get_shareable_url` (a Room-free snapshot of the viewer page, shortened), `load_session` (either
   app's URL or a bare session string; Spacewalk part only, says what it ignored).
8. **Replies** — as above.
9. **Join card** — the MCP App card with an Open button for the viewer.
10. **Deploy** — one wizard: Worker `spacewalk-mcp-dev.3dg.io`, Pages `spacewalk-viewer-dev.pages.dev`
    (built from `../spacewalk`), `SESSION_HMAC_SECRET`, `VIEWER_ORIGINS`.
11. **Tests** — the viewer state (apply, version, order), relative steps, the changed-since-last-look
    diff, the handshake and version refusal, realized/timeout handling. The page is checked by eye.

**Done when.** Connected directly to the dev `spacewalk-mcp` from Claude desktop, claude.ai,
ChatGPT desktop and ChatGPT web: "show me an example chromatin trace", "switch to ribbon", "make the
balls bigger", "darken the background" all work; a hand change in the viewer appears in the next
reply; a shareable URL reopens the same view.

**Out of scope.** Multiple pages in one Room, beyond tolerating a second. Any port wiring.

---

## M2 — geenee integration (v1 done)

**Goal.** Spacewalk is the third viewer in geenee, alongside IGV and Juicebox.

**Where.** `geenee`, and two small contract changes in `spacewalk-mcp`.

**Tasks.**

1. In `spacewalk-mcp`: `open_viewer` accepts a new well-formed Room id, as igv's does, since geenee
   mints the id; and a new `read_viewer_count` tool, since reading the viewer state clears the news.
2. `SPACEWALK_UPSTREAM_URL` in geenee's configuration, pointing at the dev `spacewalk-mcp`.
3. Serve Spacewalk's tools with the `spacewalk_` prefix; hide `open_viewer` behind `open_geenee`,
   which opens Spacewalk's Room; withhold `get_shareable_url` (as for igv) and `read_viewer_count`;
   pass the Room id as an argument (`roomGoesIn: 'argument'`); probe the connection with
   `read_viewer_count`.
4. A third tab in the geenee Workspace, with the viewer page embedded and its connection state shown.
5. Update geenee's server instructions so the model knows when the 3D viewer is the right one.
6. Check the viewer page by eye in the frame. It has nothing for `&embedded` to leave out, so it
   changes only if the check finds a need.

**Done when.** In a geenee conversation the user can move between IGV, Juicebox and the 3D viewer,
and the model routes 3D requests to Spacewalk, on Claude desktop and ChatGPT desktop in Codex mode.
**This is v1.**

**Out of scope.** Cross-viewer linkage — the ports stay unconnected.

---

## M3 — Shared Rooms (done)

**Goal.** A Room link handed to other people puts them in one live, shared 3D view.

**Where.** `spacewalk-mcp` and `spacewalk-remote`. M3 needed no new code: work that came out of M1
and M2 had already delivered it. See [spacewalk-mcp#51](https://github.com/aidenlab/spacewalk-mcp/issues/51).

**Tasks.**

1. **Guests** — done. Several pages in one Room, all equal (geenee's Organizer + Guests). One owner
   for the camera (spacewalk-mcp#29, ADR 0005) gives the Room a camera holder, and a late joiner
   asks the holder for its pose (`want-camera`).
2. **What is shared** — done. Everything in the state document, and the highlight, relayed and kept
   by nobody (spacewalk-mcp#41, ADR 0006; spacewalk#146). Overlays are per person, because the
   protocol does not carry them.
3. **Live camera** — declined. Followers jump to the final pose at release, and that is the chosen
   behavior (spacewalk-mcp ADR 0005).
4. **Multi-page realized reporting** — done. A failure reported by any Viewer goes into the model's
   news (`server/src/room.ts`, `realize`).
5. **geenee** — the Room link, QR code and Hand-off checked by eye with two Participants
   (spacewalk-mcp#51).

**Done when.** Two Participants on one geenee Room link, on computers, see the same ensemble, render
style and highlight. When one orbits and lets go, the other lands on the same camera. A Guest's hand
change shows up in the Organizer's model's next reply as "changed in the viewer". A Participant who
joins late sees the current view, from the current camera holder.

**Out of scope.** Presence (who is here, cursors), roles, permissions, attribution; phones, as
geenee's Hand-off already assumes; live camera tracking during a drag.

---

## M4 — The ports

No ticket doc yet: its first step is the design conversation. The three ports — signal in, matrix
out, selection in and out — stayed unconnected through M3.

Each port is defined by the shape of what crosses it, not by who is on the other side.

| Port | Direction | Wiring in the full app | Viewer today |
|---|---|---|---|
| Signal | in: a 1D signal over genomic positions | checked IGV tracks → track material provider → `sceneManager.setMaterialProvider()` | unconnected |
| Matrix | out: a contact matrix | ensemble → live contact map in Juicebox | unconnected |
| Selection | in and out: a genomic selection in bp | IGV pointer / Juicebox crosshairs ↔ navigator | unconnected |

**No placeholder tools.** A tool that answers "not yet implemented" invites the model to call it
and then apologise.

**Open questions, deliberately left open:**

- Who wires a port when it's wired: the LLM (data in tool calls), geenee, or a direct
  server-to-server channel? geenee has no cross-viewer linkage yet, so Spacewalk's would be its first.
- Real-time coupling (scrubbing the navigator and having IGV follow at frame rate) can't survive an
  LLM round-trip. The selection port probably needs a direct channel; the signal and matrix ports
  probably don't.
- Signal port: does the viewer fetch track data itself (igv's data layer without its UI), or
  receive values per genomic extent?
- Matrix port: is the payload a computed matrix, or a `.hic`-like artifact that Juicebox loads?
