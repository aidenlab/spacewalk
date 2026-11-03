# M3 — Shared Rooms: tickets

> **STATUS: Done (2026-11-03).** All tickets closed; milestone issue spacewalk-mcp#51 checked. Ticket list and implementation order for milestone M3, from the grilling
> session of 2026-11-03. The rename tickets are labelled `ready-for-agent`; the check,
> spacewalk-mcp#51, is `ready-for-human` and stands for the milestone. Tickets carry native GitHub
> issue dependencies across the three repos. `geenee#N` is aidenlab/geenee; `spacewalk-mcp#N` is
> aidenlab/spacewalk-mcp; `spacewalk#N` is aidenlab/spacewalk.
> Overall plan: [milestones.md](milestones.md). Vocabulary: `spacewalk-mcp/GLOSSARY.md`
> (**Participant**, **Organizer**, **Guest**, **Camera holder**, **Highlight**). Decisions:
> `spacewalk-mcp/docs/adr/` 0005 and 0006.
> Milestone issue: **spacewalk-mcp#51**.

## Goal

A Room link handed to other people puts them in one live, shared 3D view.

## Why there is no code to write

Most of M3 was done early, by two pieces of work that came out of M1 and M2:

- **One owner for the camera** (spacewalk-mcp#29, ADR 0005) made any number of Viewers equal, gave
  the Room a camera holder, and has a late joiner ask for the holder's pose (`want-camera`). That
  covers M3's Guests task.
- **Every Viewer shows the highlight** (spacewalk-mcp#41, ADR 0006) relays the highlight between
  Viewers and keeps none of it. Overlays were never in the protocol, so they are already per
  person. That covers M3's "what is shared" task.
- A failure reported by any Viewer is already kept and goes into the model's news
  (`server/src/room.ts`, `realize`). That covers M3's multi-page realized reporting.

The one task left, live camera tracking during a drag, was declined: followers jump to the final
pose at release, and that is the behavior we want.

What remains is to settle the language for the people in a Room, then check the whole thing by
eye in geenee.

## Order

```
Wave 1 (parallel)   geenee#58 rename Driver to Organizer      mcp#51 check shared Rooms in geenee
                      │                                         (a human step; independent)
Wave 2 (parallel)   mcp#52 rename, ADR 0005 consequence
                    spacewalk#152 rewrite M3 in milestones.md, rename in the RFC
```

In the diagram, `mcp#N` is spacewalk-mcp#N.

Working alone, take them in this order: **geenee#58 → spacewalk-mcp#52 → spacewalk#152 →
spacewalk-mcp#51.**

## Tickets

| Order | Issue | Repo | Title | Blocked by |
|---|---|---|---|---|
| 1 | geenee#58 | geenee | Rename Driver to Organizer, and add Participant | — |
| 2 | spacewalk-mcp#52 | spacewalk-mcp | Rename Driver to Organizer, and record that live camera tracking was declined | geenee#58 |
| 3 | spacewalk#152 | spacewalk | Rewrite M3 in the Spacewalk MCP milestone notes, and rename Driver to Organizer | geenee#58 |
| 4 | spacewalk-mcp#51 | spacewalk-mcp | M3 — Check shared Rooms in geenee with two Participants (`ready-for-human`) | — |

The tickets carry the detail. Fix-ups from spacewalk-mcp#51 get their own issues.

## Decisions

- **No live camera.** Followers jump to the final pose at release. Live tracking during a drag was
  considered and declined; spacewalk-mcp#52 records it in ADR 0005's consequences rather than a
  new ADR, since it is cheap to reverse.
- **People in a Room.** "Driver" read as the person in control, but no Participant controls a
  Room: anyone's change counts the same, and the camera follows whoever last took hold of it.
  - **Participant**: anyone with the Room open.
  - **Organizer**: the Participant whose conversation the Room belongs to. Their model makes the
    tool calls and hears what changed. It is the only role, and it cannot be handed over.
  - **Guest**: any other Participant.
  - **Host** stays geenee's word for the app (Claude desktop, ChatGPT desktop in Codex mode), so it
    was not used for the person.
  - geenee owns the terms and is renamed first.
- **Where it is checked.** In geenee only, where the Room link, QR code and Hand-off exist. The
  direct `spacewalk-mcp` connector tolerates more than one Viewer, but nothing presents it as shared.
- **Hosts.** The Organizer on Claude desktop, and a Guest in a plain browser through the Card's Room
  link. Sharing lives in the Room, so it does not depend on the Host, and there is no ChatGPT pass.
- **Phones.** Out of scope, as geenee's Hand-off already assumes.
- **After M3.** The ports become M4, starting with the design conversation.

## Verification at each step

- Renames: `npm run typecheck` and `npm run test:run` pass in `geenee` and `spacewalk-mcp`, and no
  "Driver" is left outside _Avoid_ lists.
- spacewalk-mcp#51: every box checked on dev.

## Done

M3 is done when every ticket above is closed and this "Done when" holds:

> Two Participants on one geenee Room link, on computers, see the same ensemble, render style and
> highlight. When one orbits and lets go, the other lands on the same camera. A Guest's hand change
> shows up in the Organizer's model's next reply as "changed in the viewer". A Participant who
> joins late sees the current view, from the current camera holder.

Then mark M3 done in `milestones.md` and set this document's status to **Done**.
