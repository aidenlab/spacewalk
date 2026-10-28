# Spacewalk MCP — milestones

> **STATUS: Current plan.** The overarching plan for building the Spacewalk MCP server and
> integrating it into geenee. One section per milestone: goal, where the work lives, the tasks,
> and what "done" means. When a milestone starts, it gets its own document listing the GitHub
> tickets and their order — see the table below.
>
> **Design:** [`../spacewalk-mcp-viewer-carve-out.md`](../spacewalk-mcp-viewer-carve-out.md) (RFC).
> **Vocabulary:** `CONTEXT.md` — especially **port**, **render style**, **producer**.

## At a glance

| Milestone | Where | Delivers | Ticket doc | Status |
|---|---|---|---|---|
| **M0** — carve out the 3D viewer | `spacewalk` (this repo) | a viewer-only page with no IGV or Juicebox inside it | [m0-viewer-carve-out.md](m0-viewer-carve-out.md) | **Done** (2026-10-28) |
| **M1** — the MCP server, single user | `spacewalk-mcp` (Worker + `spacewalk-remote`) + the viewer page here | the model drives the viewer page through a Room | [m1-server-single-user.md](m1-server-single-user.md) | Designed (2026-10-28); tickets drafted |
| **M2** — geenee integration | `geenee` | Spacewalk is the third viewer in geenee — **v1 done** | — | Not started |
| **M3** — shared Rooms | `spacewalk-mcp` + `spacewalk` | Guests join a Room link and share one live 3D view | — | Not started |

Each milestone is blocked by the one before it. Within a milestone, tickets carry their own
blocking edges on GitHub.

```
M0 viewer page ──▶ M1 server + Room ──▶ M2 geenee (v1) ──▶ M3 shared Rooms
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
  color ramp, circular genome), viewer settings, camera. The session string appears only at the
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
   hex), `adjust_background`; `read_viewer_state` (also geenee's connection probe),
   `get_shareable_url` (a Room-free snapshot of the viewer page, shortened), `load_session` (either
   app's URL or a bare session string; Spacewalk part only, says what it ignored).
8. **Replies** — as above.
9. **Join card** — the MCP App card with an Open button for the viewer.
10. **Deploy** — one wizard: Worker `spacewalk-mcp-dev.3dg.io`, Pages `spacewalk-viewer-dev.3dg.io`
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

**Where.** `geenee`.

**Tasks.**

1. `SPACEWALK_UPSTREAM_URL` in geenee's configuration, pointing at the dev `spacewalk-mcp`.
2. Serve Spacewalk's tools with the `spacewalk_` prefix; hide `open_viewer` behind `open_geenee`;
   withhold `get_shareable_url` (as for igv); pass the Room id as an argument
   (`roomGoesIn: 'argument'`); probe the connection with `read_viewer_state`.
3. A third tab in the geenee Workspace, with the viewer page embedded and its connection state shown.
4. Update geenee's server instructions so the model knows when the 3D viewer is the right one.
5. Any small changes the viewer page needs for embedding (geenee's `&embedded` convention).

**Done when.** In a geenee conversation the user can move between IGV, Juicebox and the 3D viewer,
and the model routes 3D requests to Spacewalk. **This is v1.**

**Out of scope.** Cross-viewer linkage — the ports stay unconnected.

---

## M3 — Shared Rooms

**Goal.** A Room link handed to other people puts them in one live, shared 3D view.

**Where.** `spacewalk-mcp` and `spacewalk-remote`.

**Tasks.**

1. **Guests** — several pages in one Room, all equal (geenee's Driver + Guests); a late joiner is a
   first sync.
2. **What is shared** — everything in the state document; per person: hover highlighting and
   whether the overlays are open.
3. **Live camera** — during a drag, camera positions go out on a throttled (~150 ms) channel that is
   not versioned; one camera change is committed at the end of the gesture.
4. **Multi-page realized reporting** — a failure on any page reaches the model's next reply.
5. **geenee** — confirm the Room link, QR code and hand-off page work with the 3D viewer.

**Done when.** Two browsers on one Room link see the same ensemble, render style and camera; one
orbits and the other follows live; the Driver's model sees Guests' changes as "changed in the
viewer".

**Out of scope.** Presence (who is here, cursors), roles, permissions, attribution.

---

## After v1: the ports

Not a milestone yet. The three ports — signal in, matrix out, selection in and out — stay
unconnected through M3. Their open questions are in the RFC's "Ports" section; wiring them is the
next design conversation once the viewer is up and running in geenee.
