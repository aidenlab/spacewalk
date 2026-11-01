# M2 — geenee integration: tickets

> **STATUS: Not started.** Ticket list and implementation order for milestone M2, from the grilling
> session of 2026-10-31 to 2026-11-01. All tickets are labelled `ready-for-agent` except
> geenee#48 and geenee#49 (`ready-for-human`); all are sub-issues of the umbrella, and carry
> native GitHub issue dependencies (across both repos). `geenee#N` is aidenlab/geenee;
> `spacewalk-mcp#N` is aidenlab/spacewalk-mcp.
> Overall plan: [milestones.md](milestones.md). Vocabulary: `geenee/GLOSSARY.md`. Decisions:
> `geenee/docs/adr/` 0001–0003, with "Revised" notes added by geenee#47.
> Umbrella issue: **geenee#43**.

## Goal

Spacewalk is the third Viewer in geenee, alongside igv and Juicebox. In a geenee conversation the
user can move between the three, and the model routes 3D requests to Spacewalk. **This is v1.**

## Why two tickets are in `spacewalk-mcp`

M1 departed from the igv and Juicebox pattern in two ways that matter to a Connector composing
Upstreams:

- **A Room has a real opened state.** In igv and Juicebox a Room is little more than a mailbox to
  the Viewer, so any well-formed id works the first time it is used. Spacewalk's Room holds the
  viewer state, and `open_viewer` refused an id it had never opened. geenee mints the id, so
  Spacewalk could never have opened under it.
- **Reading the viewer state clears the news.** M1 named `read_viewer_state` as geenee's connection
  probe, but polling it every 4 s would erase hand changes before the model saw them.

## Who creates the Room

Under geenee, geenee does: `open_geenee` mints the id, and each Upstream has its own Room under that
one id, beside geenee's own record of it. Used directly, an Upstream mints the id itself. An
Upstream cannot tell which case it is in, and does not need to.

## Order

```
Wave 1 (parallel)   mcp#27 open_viewer accepts a new id      mcp#28 read_viewer_count
                      │                                     │
Wave 2              geenee#44 third Upstream ───────────────────┘
                      │
Wave 3 (parallel)   geenee#45 open_geenee opens its Room
                    geenee#46 Spacewalk tab
                    geenee#47 instructions, copy, ADRs
                      │
Wave 4              geenee#48 deploy to geenee-dev and check on the Hosts (a human step)
                      │
Wave 5              geenee#49 promote to prod, mark M2 done (a human step)
```

In the diagram, `mcp#N` is spacewalk-mcp#N.

Working alone, take them in this order: **spacewalk-mcp#27 → spacewalk-mcp#28 → geenee#44 →
geenee#45 → geenee#46 → geenee#47 → geenee#48 → geenee#49.**

## Tickets

| Order | Issue | Repo | Title | Blocked by |
|---|---|---|---|---|
| 1 | spacewalk-mcp#27 | spacewalk-mcp | `open_viewer` accepts a new well-formed Room id | — |
| 2 | spacewalk-mcp#28 | spacewalk-mcp | Add `read_viewer_count`, a connection probe that leaves news intact | — |
| 3 | geenee#44 | geenee | Forward to Spacewalk as a third Upstream | spacewalk-mcp#27, spacewalk-mcp#28 |
| 4 | geenee#45 | geenee | `open_geenee` opens Spacewalk's Room | geenee#44 |
| 5 | geenee#46 | geenee | Add the Spacewalk tab and its connection mark | geenee#44 |
| 6 | geenee#47 | geenee | Update the server instructions, copy and ADRs for three Viewers | geenee#44 |
| 7 | geenee#48 | geenee | Deploy to `geenee-dev` and check M2 on the Hosts (`ready-for-human`) | geenee#45, geenee#46, geenee#47 |
| 8 | geenee#49 | geenee | Promote to prod and mark M2 done (`ready-for-human`) | geenee#48 |

The tickets carry the detail. Fix-ups from geenee#48 get their own issues.

## Decisions

- **Rooms.** geenee mints the Room id. `open_viewer` accepts a new well-formed id, and every other
  tool still refuses a Room never opened. `open_geenee` opens Spacewalk's Room straight away, so a
  tool call before the Workspace loads still works; if Spacewalk is down, geenee tries again later.
- **Connection state.** `read_viewer_count` answers `{ viewers: n }`, clears no news, and counts as
  a use of the Room.
- **Workspace.** Tabs are IGV, Juicebox, Spacewalk, with IGV first. The blank Viewer loads with the
  Workspace, with no data preloaded. The Viewer page ignores `&embedded`, and needs no change unless
  the by-eye check finds one.
- **Tools.** 11 tools are served under `spacewalk_`. `open_viewer` is hidden; `get_shareable_url`
  and `read_viewer_count` are withheld. geenee goes from 44 tools to 55.
- **Routing.** A request fitting more than one Viewer goes to the last one used that can do it.
  Spacewalk has no locus, zoom or tracks.
- **Expiry.** If only Spacewalk's Room has expired, `open_geenee` asks the probe, then revives it
  empty, and the person reloads the page. It does not call `open_viewer` on a live Room, because
  that clears the news. An expired geenee Room stays expired (geenee ADR 0003).
- **Guests.** Not gated. The camera follows at the end of a gesture until M3 adds live following.
- **Release.** `geenee-dev` first, then prod. Claude desktop and ChatGPT desktop in Codex mode must
  pass; claude.ai and ChatGPT web are checked but do not block v1.
- **Docs.** "Revised" notes on geenee ADR 0001 and 0002, and no new ADR.

## Not tested during design

Whether browsers throttle drawing in a hidden cross-origin frame, which could delay a realized
report. geenee#48 checks it.

## Verification at each step

- `npm run typecheck` and `npm run test:run` pass in `spacewalk-mcp`.
- `npm run typecheck` and `npm run test:run` pass in `geenee`, against stand-in Upstreams.
- From geenee#46 on: `npm run dev` against the deployed dev Upstreams, checked by eye.

## Done

M2 is done when every ticket above is closed and the "Done when" in [milestones.md](milestones.md)
holds on the two required Hosts. Then: mark M2 done in `milestones.md`, set this document's status to
**Done**, and start the M3 ticket document.
