# M1 — The MCP server, single user: tickets

> **STATUS: Filed (2026-10-28).** Ticket list and implementation order for milestone M1, from the
> grilling session of 2026-10-28. All tickets are labelled `ready-for-agent` except spacewalk-mcp#12 (`ready-for-human`); all are sub-issues of the
> umbrella, and carry native GitHub issue dependencies (across both repos). Bare `#N` is
> aidenlab/spacewalk; `spacewalk-mcp#N` is aidenlab/spacewalk-mcp.
> Overall plan: [milestones.md](milestones.md). Vocabulary: `spacewalk-mcp/GLOSSARY.md`.
> Decisions: `spacewalk-mcp/docs/adr/` 0001–0003. Umbrella issue: **spacewalk-mcp#2**.

## Goal

A model in Claude or ChatGPT opens the Viewer, loads an ensemble, and changes what it shows, through
a Room whose viewer state is authoritative; every reply carries the full viewer state and the changes
the model did not cause.

## Order

```
Wave 1 (parallel)   mcp#3 remote workspace + protocol      #128 structure appearance in the session
                      │                                     │
Wave 2              mcp#4 viewer state in the Room         #129 viewer page opens a snapshot URL
                      │                                     │
Wave 3 (parallel)   mcp#5 /ws handshake ── mcp#6 /mcp, open_viewer, Join card
                      │                      │
Wave 4 (parallel)   mcp#8 spacewalk-remote   mcp#7 replies   (mcp#7 needs #5 and #6)
                      │                      │
Wave 5 (parallel)   #130 page attaches       mcp#9 ensemble + rendering tools
                    (needs mcp#8, #129)      mcp#10 scene + state tools (needs #128)
                      │                      │
Wave 6              mcp#11 write the deploy wizard (needs mcp#9, mcp#10, #130)
                      │
Wave 7              mcp#12 run it; check M1 on the four hosts (a human step)
```

In the diagram, `mcp#N` is spacewalk-mcp#N.

Working alone, take them in this order: **spacewalk-mcp#3 → #128 → spacewalk-mcp#4 → #129 → spacewalk-mcp#5 → spacewalk-mcp#6 → spacewalk-mcp#7 →
spacewalk-mcp#8 → spacewalk-mcp#9 → spacewalk-mcp#10 → #130 → spacewalk-mcp#11 → spacewalk-mcp#12.**

## Tickets

| Order | Issue | Repo | Title | Blocked by |
|---|---|---|---|---|
| 1 | spacewalk-mcp#3 | spacewalk-mcp | `remote/` workspace: `@aidenlab/spacewalk-remote` and the wire protocol | — |
| 2 | #128 | spacewalk | Structure appearance in the session format | — |
| 3 | spacewalk-mcp#4 | spacewalk-mcp | The Room's viewer state: proposals, versions, relative steps, expiry | spacewalk-mcp#3 |
| 4 | #129 | spacewalk | The viewer page opens a snapshot URL | #128 |
| 5 | spacewalk-mcp#5 | spacewalk-mcp | `/ws`: join handshake, first sync, realized reports | spacewalk-mcp#4 |
| 6 | spacewalk-mcp#6 | spacewalk-mcp | `/mcp`: command-tools table, `open_viewer`, Join card, Room id | spacewalk-mcp#4 |
| 7 | spacewalk-mcp#7 | spacewalk-mcp | Replies: full state, changes the model did not cause, waiting for realized | spacewalk-mcp#5, spacewalk-mcp#6 |
| 8 | spacewalk-mcp#8 | spacewalk-mcp | `spacewalk-remote`: attach a Viewer to a Room | spacewalk-mcp#5 |
| 9 | spacewalk-mcp#9 | spacewalk-mcp | Ensemble and rendering tools | spacewalk-mcp#7 |
| 10 | spacewalk-mcp#10 | spacewalk-mcp | Scene and state tools, shareable URL, `load_session` | spacewalk-mcp#7, #128 |
| 11 | #130 | spacewalk | The viewer page attaches to a Room | spacewalk-mcp#8, #129 |
| 12 | spacewalk-mcp#11 | spacewalk-mcp | Write the deploy wizard and the dev environment | spacewalk-mcp#9, spacewalk-mcp#10, #130 |
| 13 | spacewalk-mcp#12 | spacewalk-mcp | Run the deploy wizard and check M1 on the four hosts (`ready-for-human`) | spacewalk-mcp#11 |

### Foundations

- **spacewalk-mcp#3 — `remote/` workspace.** The scaffold's `viewer/` workspace becomes `remote/`, the package
  `@aidenlab/spacewalk-remote`, exporting `.` (the attach library, empty for now) and `./protocol`
  (message types, zod schemas, the protocol version). The Worker imports `./protocol` from the
  workspace. A GitHub-release OIDC publish workflow, as juicebox-mcp's `publish-remote.yml`. Update
  README layout and `roundtrip/`'s purpose. ADR 0003.
- **#128 — Structure appearance in the session format.** The full app writes and reads ball and
  stick radius steps, sticks visible, point size and transparency, color ramp and circular genome in
  the `spacewalk` session block. Sessions without it load with defaults. Unit-tested round trip.
  `CONTEXT.md` gains **structure appearance**.

### The Room

- **spacewalk-mcp#4 — Viewer state.** The Room Durable Object holds one structured, versioned viewer state
  (ensemble URL, group, trace, kind; render style; structure appearance; viewer settings; camera).
  Proposals are applied in order, each yielding a new version, broadcast to every socket. Relative
  steps (ball/stick radius along the ladder, background lighter/darker) applied to the current value;
  the ladder and step rule copied from Spacewalk as data. `set_render_style` refused when the kind is
  known to be a point cloud. 24h idle expiry by alarm; an expired Room refuses everything except a
  restart by `open_viewer`, which starts it empty. Tests: apply, version, order, relative steps,
  expiry. ADR 0001.
- **spacewalk-mcp#5 — `/ws`.** `VIEWER_ORIGINS` allow-list (403 otherwise). Join carries the protocol version;
  a mismatch is refused with "reload the viewer". A joining Viewer gets the current state (first
  sync = resync). Viewers send proposals (hand changes) and realized reports — version, drawn or
  failed with a reason, and the ensemble's kind. A second Viewer is tolerated: all receive
  broadcasts. Tests: handshake, version refusal, resync, realized bookkeeping.

### The model's surface

- **spacewalk-mcp#6 — `/mcp`.** Streamable HTTP, the command-tools table (igvjs-mcp's shape), `open_viewer`
  (optional `room`; returns the Join link, Room id and a `resource_link`), the Join card MCP App
  ("Open Spacewalk"). Every other tool takes `room`. Under ChatGPT the Room id is
  HMAC(`x-openai-session`, `SESSION_HMAC_SECRET`); an unknown or expired `room` is an error telling
  the model to call `open_viewer`.
- **spacewalk-mcp#7 — Replies.** Every reply: the full viewer state (*observe everything*), the number of
  connected Viewers, and the changes since the previous reply that the model did not cause — hand
  changes and realize failures — in plain phrases ("switched to ribbon; stepped to trace 12"; camera
  moves collapse to "the camera was moved"). A change waits up to 20 s for the first Viewer to report
  it realized; on timeout "applied, still drawing"; with no Viewer connected "applied, not shown yet —
  no viewer is open". Tests: the diff, phrasing, realized/timeout/no-viewer.
- **spacewalk-mcp#9 — Ensemble and rendering tools.** `load_ensemble(url)`, `list_example_ensembles` (the Load
  From List JSON fetched from R2, short cache), `select_ensemble_group(key)`,
  `set_render_style(ball_and_stick | ribbon)`, ball radius up/down, stick radius up/down. Glossary
  vocabulary in names and descriptions; "the model" appears only as a pointer to the ensemble.
- **spacewalk-mcp#10 — Scene and state tools.** `reset_camera`; `set_background_color` (Apple crayon name or
  hex; names listed in the description); `adjust_background(lighter | darker)`; `read_viewer_state`
  (`isError` only for an unknown or expired Room — geenee's connection probe in M2);
  `get_shareable_url` — a Room-free snapshot of the viewer page: session string (with structure
  appearance) plus a viewer-settings parameter, shortened as the full app does; `load_session` —
  a shareable URL from either app or a bare session string; reads the Spacewalk block only, says
  what it ignored, refuses a session URL meant to be fetched.

### The Viewer

- **spacewalk-mcp#8 — `spacewalk-remote`.** `attachRemote` connects a Viewer to `/ws?room=`, applies each
  broadcast state, proposes hand changes (debounced at gesture end; camera committed at orbit end),
  reports realized or failed with the ensemble's kind, resyncs on reconnect, shows "reload the
  viewer" on a protocol mismatch and "this Room has expired" on expiry. Released to npm.
- **#129 — Snapshot URL.** The viewer page opens a URL carrying a session parameter and a
  viewer-settings parameter, with no Room. Settings stay beside the session. ADR 0002.
- **#130 — The viewer page attaches to a Room.** Given `?room=`, the viewer page attaches through
  `spacewalk-remote` (`file:` during development, pinned before deploy). The Room becomes the
  viewer-settings store (`ViewerSettings.receive()` in, `update()` out). Structure appearance, render
  style, group, trace and camera changes by hand become proposals. The bundle check still passes.
  Checked by eye.
- **spacewalk-mcp#11 — Write the deploy wizard.** One wizard (`/wizard`), igvjs-mcp's stages: Worker `spacewalk-mcp-dev` at
  `spacewalk-mcp-dev.3dg.io`; `SESSION_HMAC_SECRET`; Pages `spacewalk-viewer-dev` at
  `spacewalk-viewer-dev.3dg.io`, built from `../spacewalk` with `VITE_SERVER_URL`; `VIEWER_ORIGINS`;
  connecting Claude desktop, claude.ai, ChatGPT desktop and ChatGPT web.
- **spacewalk-mcp#12 — Run it.** A human step: run the wizard, connect the four hosts, and check
  the milestone's "Done when" on each. Fix-ups get their own issues.

## Verification at each step

- `npm run typecheck` and `npm run test:run` pass in `spacewalk-mcp`; `npm run build` and `npm test`
  pass in `spacewalk`, the viewer bundle still free of `igv` and `juicebox.js`.
- From #130 on: run the local Worker and the viewer page together and drive them with the MCP
  Inspector or Claude desktop.

## Done

M1 is done when every ticket above is closed and the "Done when" in [milestones.md](milestones.md)
holds on all four hosts. Then: mark M1 done in `milestones.md`, set this document's status to
**Done**, and start the M2 ticket document.
