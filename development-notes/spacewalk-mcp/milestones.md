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
| **M0** — carve out the 3D viewer | `spacewalk` (this repo) | a viewer-only page with no IGV or Juicebox inside it | [m0-viewer-carve-out.md](m0-viewer-carve-out.md) | **In progress** |
| **M1** — the MCP server, single user | `spacewalk-mcp` (new repo) + `spacewalk-remote` here | the model drives the viewer page through a Room | — | Not started |
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

**Goal.** A model in Claude can open the viewer, load an ensemble, and change what it shows; every
reply tells the model the full viewer state and what the user changed by hand.

**Where.** A new repo, `spacewalk-mcp` (Cloudflare Worker), plus `spacewalk-remote` in this repo.
The viewer page is deployed to Cloudflare Pages.

**Tasks.**

1. **Repo scaffold** — modelled on igvjs-mcp's *shape*: TypeScript, zod 4, `/mcp` (Streamable HTTP)
   and `/ws` (WebSocket), a Room Durable Object, the command-tools table, wrangler environments for
   dev and prod, a deploy wizard. Docs layout from day one: `GLOSSARY.md` (geenee's terms — Room,
   Room link, Driver, Guest, Viewer), `docs/adr/`.
2. **ADRs** — 0001 *the Room is authoritative*; 0002 *viewer settings stored beside the session*.
3. **The Room's state document** — one versioned document: session string (Spacewalk's existing
   format, unchanged) + viewer settings + camera. Pages and tool calls propose changes; the Room
   applies, versions and broadcasts them. Reconnect is resync. 24h idle expiry; an expired Room
   stays expired.
4. **The protocol** — join handshake with a protocol version (mismatch → "reload the viewer");
   proposed changes; state broadcasts; pages report a change as **realized** (loaded, drawn, or
   failed).
5. **`spacewalk-remote`** — the browser library that attaches the viewer page to a Room: applies
   broadcast state, proposes hand changes (debounced at gesture end), reports realized/failed.
6. **Viewer settings out of `localStorage`** for the MCP viewer, into the Room.
7. **Tools** — `open_viewer`; `load_ensemble`, `list_example_ensembles`, `select_ensemble_group`;
   `set_render_style`, ball radius up/down, stick radius up/down; `reset_camera`,
   `set_background_color` (named colors), `adjust_background`; `read_viewer_state`,
   `get_shareable_url`, `load_session`. Glossary vocabulary in names and descriptions.
8. **Replies** — every reply carries the full viewer state (*observe everything, control a few*) and
   what changed in the viewer since the model last looked; replies wait for "realized", with a
   timeout.
9. **Join card** — the MCP App card with an Open button for the viewer.
10. **Deploy** — Worker and viewer page to dev, with the origin allow-list.
11. **Tests** — the state document (apply, version, order), the changed-since-last-look diff, the
    handshake and version refusal, realized/timeout handling, relative steps. The page is checked
    by eye.

**Done when.** In Claude, connected directly to the dev `spacewalk-mcp`: "show me an example
chromatin trace", "switch to ribbon", "make the balls bigger", "darken the background" all work;
a hand change in the viewer appears in the next reply; a shareable URL reopens the same view.

**Out of scope.** Multiple pages in one Room. Any port wiring.

---

## M2 — geenee integration (v1 done)

**Goal.** Spacewalk is the third viewer in geenee, alongside IGV and Juicebox.

**Where.** `geenee`.

**Tasks.**

1. `SPACEWALK_UPSTREAM_URL` in geenee's configuration, pointing at the dev `spacewalk-mcp`.
2. Serve Spacewalk's tools with the `spacewalk_` prefix; hide `open_viewer` behind `open_geenee`;
   pass the Room id the way igvjs-mcp expects it.
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
