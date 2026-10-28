# Spacewalk MCP: carving out the 3D viewer for geenee

> **STATUS: In progress (M0).** Designed in a grilling session, 2026-10-27/28. Prefactors done
> (#105–#109). The viewer-only page exists: `viewer.html` → `src/viewerMain.js`, loading `?file=`;
> `build/viewerBoundary.mjs` fails `vite build` if its bundle reaches `igv` or `juicebox.js` (#110).
> Toolbar and overlays (#111–#113) next.
> Carves a 3D-viewer-only Spacewalk out of this app, hosts it as a self-contained MCP server
> (`spacewalk-mcp`), and integrates it into geenee (`~/AidenLabDevelopment/geenee`) beside
> igvjs-mcp and juicebox-mcp. Read before touching material-provider ownership, building a
> viewer-only entry point, or anything that talks to a Room.

## The conceit

Spacewalk's original value was hand-authored orchestration between three panels — 3D, IGV,
Juicebox. In geenee, IGV and Juicebox already exist as MCP servers, and the LLM orchestrates.
What Spacewalk alone contributes is the **3D viewer**. So we carve it out, and keep only what is
3D and only 3D.

> **The Spacewalk MCP viewer is to Spacewalk what juicebox-mcp's map page is to Juicebox:
> the one irreplaceable surface, with everything else discarded.**

The threads that tied 3D to IGV and Juicebox are not deleted — they are named as **ports**
(see `CONTEXT.md`) and left unconnected. The viewer is whole without them.

## Scope

**Two codebases.**

| Piece | Lives in | Shape |
|---|---|---|
| Viewer page | this repo — a viewer-only entry point, later a shared core package | the 3D viewer filling the window |
| `spacewalk-remote` | this repo | browser library that attaches a Spacewalk page to a Room (like `@aidenlab/juicebox-remote`) |
| `spacewalk-mcp` | new repo | Cloudflare Worker: `/mcp` (Streamable HTTP) + `/ws` (Room WebSocket), Room Durable Object, Join card. igvjs-mcp's *shape* (TypeScript, zod 4, command-tools table) — not its state flow |

The viewer page is hosted on Cloudflare Pages beside the Worker, with the `/ws` origin allow-list.

**The viewer page.** No navbar. The 3D viewer fills the window (Claude side panel or geenee
Workspace iframe) and resizes with it — no drag grip, no resize corner. The gray top bar becomes
the toolbar:

```
[ − ][ trace # ][ + ]   ………   [ ⚙ ]  [ ⌂ ]
     trace select              settings  reset camera
```

- ☰ opens today's widget panel (point size/transparency, color ramps, render style, radii,
  sticks, circular genome) — **reparented into the viewer** as an overlay, closed by default.
  The ☰ stays where it is today, floating over the top-left of the canvas rather than in the
  bar: it costs almost no screen and needs no new home. A ☰ in the bar would only earn its
  place by doing something the floating one doesn't.
- ⚙ opens today's settings (background, axes, ground plane, reference ruler) — same treatment.
- The genomic navigator stays where it is.

**In v1:** `.sw` ensembles, ensemble groups, traces; ball-and-stick and ribbon (point cloud is
dictated by the ensemble); navigator + ball-picker highlighting; color-ramp material provider;
reference ruler, axes, ground plane, camera/lighting.

**Out:** the navbar and everything behind it (File, Share, Session, View, Fullscreen, About,
Help); hand loading of any kind — **loading goes through the model only**; Scale Bars (slated for
deletion in the app anyway); IGV cursor guide and Juicebox crosshair producers.

**Highlighting is unchanged in kind.** It exists to link a user's gesture in genomic space to the
corresponding place in 3D space. The two surviving producers are the navigator and the ball
picker. The model is *not* a producer and never writes the selection.

## The carve-out boundary (M0 — work in this repo)

**Bundle rule.** The viewer page's bundle contains no `igv` and no `juicebox.js`. Small utilities
(`igv-utils`, `hic-straw`) are decided case by case. The build is the proof: if `igv` reappears in
the bundle, the boundary has leaked.

**The main knot: material-provider ownership.** Today every visualization gets color by reaching
through the IGV panel:

```
ballAndStick.js:40      igvPanel.materialProvider
ribbon.js:45            igvPanel.materialProvider
pointCloud.js:53        igvPanel.materialProvider.colorForInterpolant(...)
ballHighlighter.js:52   igvPanel.materialProvider.colorForInterpolant(...)
genomicNavigator.js:68  this.igvPanel.materialProvider = this.colorRampMaterialProvider
```

IGVPanel owns "which material provider is current." That is the **signal-in port**, buried. The
refactor: the viewer owns the *current material provider*; the color-ramp material provider is
its default; the track material provider becomes something plugged in through the signal-in port.
In the full app, IGVPanel plugs it in. In the MCP viewer, nothing does.

**Order.** These are ordinary refactors on `main`, landing in the full app first, with the app
working throughout — the same deepening discipline as Phases 3–4. The viewer-only entry point
comes after, and initially loads from a URL parameter with no server.

## The ports

Each port is defined by the shape of what crosses it, not by who is on the other side.

| Port | Direction | Today's wiring | v1 |
|---|---|---|---|
| Signal | in — a 1D signal over genomic positions | checked IGV tracks → track material provider | unconnected |
| Matrix | out — a contact matrix | ensemble → live contact map in Juicebox | unconnected |
| Selection | in and out — a genomic selection in bp | IGV pointer / Juicebox crosshairs ↔ navigator | unconnected |

**No placeholder tools.** A tool that answers "not yet implemented" invites the model to call it
and apologise.

**Open questions, deliberately left open:**

- Who wires a port when it is wired — the LLM (data in tool calls), geenee, or a direct
  server-to-server channel? geenee has no cross-viewer linkage yet; Spacewalk's would be its first.
- Real-time coupling (scrubbing the navigator updating IGV at frame rate) cannot survive an LLM
  round-trip. The selection port probably needs a direct channel; the signal and matrix ports
  probably do not.
- Signal port: does the viewer fetch track data itself (igv's data layer without its UI), or
  receive values per genomic extent?
- Matrix port: what is the payload — a computed matrix, or a `.hic`-like artifact Juicebox loads?

## The model's surface

Tools use `CONTEXT.md` vocabulary strictly. "Model" appears only in descriptions as a pointer
("the ensemble — the user may call this 'the model'"). geenee serves them prefixed `spacewalk_`.

| Area | Tools |
|---|---|
| Ensemble | `load_ensemble(url)`, `list_example_ensembles` (backed by the Load From List file), `select_ensemble_group(key)` |
| Rendering | `set_render_style(ball_and_stick \| ribbon)` — errors on a point-cloud ensemble; ball radius up/down; stick radius up/down |
| Scene | `reset_camera`, `set_background_color(name \| hex)`, `adjust_background(lighter \| darker)` |
| State | `read_viewer_state`, `get_shareable_url`, `load_session(url)` |

Everything else stays interactive-only — trace stepping included.

**Observe everything, control a few.** The state the model sees covers everything visible (trace
index and count, group, point settings, color ramp, sticks, furniture, circular genome), not just
what it can change. Every tool reply carries the full state, plus **what changed in the viewer
since the model last looked** ("the user switched to ribbon and stepped to trace 12").

**Qualitative commands are relative steps applied by the viewer**, so "darken the background" and
"bigger balls" need no read-then-write and cannot race a hand change. Absolute setters exist only
where the user would name a value (a color) or a choice (render style).

## State and Rooms (designed in spacewalk-mcp)

- **The Room is authoritative.** One versioned state document: session string (today's format,
  unchanged) + viewer settings (beside the session, not in it) + camera. Pages and tool calls
  propose changes; the Room orders them, bumps the version, and broadcasts to every page. Pages
  are replicas. Reconnect is resync; a late joiner is a first sync.
- **Replies wait for "realized".** A tool reply returns when a page reports the new state loaded,
  drawn, or failed — with a timeout. Errors on any page surface in later replies.
- **Viewer settings move out of `localStorage`** for the MCP viewer, which would otherwise leak
  them across Rooms and out of shareable URLs.
- 24h idle expiry; an expired Room stays expired; a protocol version in the join handshake.

**Viewer settings** (grilled 2026-10-28, before #113). `localStorage` was a single-user design —
the viewer page shares an origin with the full app, so it silently inherited the app's settings.
- **Shared, not personal.** Background, axes, ground plane, ruler visibility and color are a fact
  about the scene: one change repaints every page in the Room, and `read_viewer_state` has one true
  answer. Per-person preferences layered over the Room are deferred until someone asks.
- **The ruler's anchor is per-page**, like overlay open/closed. It is a corner plus a pixel offset —
  a fact about one window — so a Driver's wide Workspace and a Guest's narrow side panel must not
  fight over it. It never enters the Room.
- **The full app keeps `localStorage`** — single user, unchanged. Settings stay out of session files.
- **The M0 viewer page persists nothing**: defaults on every load, changes last the page. It behaves
  as the M1 viewer will before first sync, and builds no store users would come to rely on.
- **One owner, pluggable store** (#123): a single viewer-settings object, injected, replaces four
  independent `SettingsManager.load()` readers and the `spacewalk-settings-changed` document event.
  Stores: `localStorage` (app), none (viewer), the Room (M1) — which is why the owner must accept
  changes *in*, not only persist them *out*.

**Shared rooms (M3).** geenee's model: one Driver conversation, Guests joining by Room link as
equals; no roles. Everything is shared except hover highlighting and overlay open/closed. The
camera is shared and live — a throttled (~150 ms) unversioned channel during a drag, one committed
change at gesture end.

This design deliberately departs from juicebox-mcp's peer-relayed events, whose documented costs
were async completions escaping the echo guard, position-based identity, drift on reconnect,
unordered concurrent edits, and failures hidden behind the first ack. Spacewalk also escapes the
panel-identity problem outright: there is one viewer.

## Milestones

| | Where | What |
|---|---|---|
| **M0** | this repo | material-provider ownership moved off IGVPanel; IGV out of the 3D code; viewer-only entry point with toolbar and overlays |
| **M1** | `spacewalk-mcp` | Worker, Room state document, protocol, tools, state-in-every-reply, Join card — single user |
| **M2** | geenee | `SPACEWALK_UPSTREAM_URL`, `spacewalk_` prefix, third Workspace tab, instructions — **v1 done** |
| **M3** | both | shared rooms: Guests, live camera channel |

## Testing

Invisible logic only: the Room's state document (apply, version, order), the
changed-since-last-look diff, protocol handshake and version refusal, realized/timeout handling,
relative-step logic. The 3D page is audited by eye.

## Records elsewhere

`spacewalk-mcp`, when created: `GLOSSARY.md` adopting geenee's terms (Room, Room link, Driver,
Guest, Viewer); ADR 0001 — the Room is authoritative; ADR 0002 — viewer settings beside the
session.
