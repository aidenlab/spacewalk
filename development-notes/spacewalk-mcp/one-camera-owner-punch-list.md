# One owner for the camera: punch list

> **STATUS: In progress (2026-11-01): tickets 1 to 6 are done; ticket 7 and the geenee note remain.** Tracked in [aidenlab/spacewalk-mcp#29](https://github.com/aidenlab/spacewalk-mcp/issues/29). Vocabulary: `spacewalk-mcp/GLOSSARY.md`.

The Room stops keeping a copy of the camera pose. A Viewer's `CameraLightingRig` owns it, one Viewer at a time is the camera holder, and anyone who needs the pose asks by message.

## Work in this order

| # | Ticket | Repo | What it does | Needs | Status |
|---|---|---|---|---|---|
| 1 | [#30](https://github.com/aidenlab/spacewalk-mcp/issues/30) Record that the rig owns the camera | `spacewalk-mcp` | ADR 0005 and the glossary | — | ☑ |
| 2 | [#31](https://github.com/aidenlab/spacewalk-mcp/issues/31) The Room knows the camera holder and relays poses | `spacewalk-mcp` | The holder, the relay, and the library's camera messages | 1 | ☑ |
| 3 | [#32](https://github.com/aidenlab/spacewalk-mcp/issues/32) `reset_camera` and `get_shareable_url` ask the camera holder | `spacewalk-mcp` | The two tools that use the camera | 2 | ☑ |
| 4 | [#33](https://github.com/aidenlab/spacewalk-mcp/issues/33) Take the camera out of the viewer state | `spacewalk-mcp` | Removes the Room's copy, and bumps the protocol to 2 | 3 | ☑ |
| 5 | [#34](https://github.com/aidenlab/spacewalk-mcp/issues/34) Release spacewalk-remote 0.2.0 as a tarball | `spacewalk-mcp` | Publishes the package the Viewer needs | 4 | ☑ |
| 6 | [#143](https://github.com/aidenlab/spacewalk/issues/143) The Viewer reads the camera from the rig, and keeps no copy | `spacewalk` | Moves `roomAttachment.js` onto the messages | 5 | ☑ |
| 7 | [#35](https://github.com/aidenlab/spacewalk-mcp/issues/35) Deploy the camera change and check it in two windows | `spacewalk-mcp` | Dev, the check by eye, then production | 6 | ☐ |
| — | [geenee#50](https://github.com/aidenlab/geenee/issues/50) Say who owns live state in each viewer | `geenee` | A note on the three projects | 1 | ☐ |

The geenee note isn't in the sequence: do it any time after ticket 1.

## Why this order

- **1 comes first** so the code has a written decision to follow.
- **2 and 3 add, and 4 removes.** `main` stays green and keeps its current behavior through 2 and 3, because the camera stays in the viewer state until 4.
- **5 stands alone** because a released tarball can never be replaced. Do it only once 4 is merged and you're satisfied with the protocol. A later fix means a new version.
- **6 can't start before 5**, because the Viewer installs the library from the release.

## Points to watch

- **Don't deploy between 4 and 7.** A Worker on protocol 2 tells a Viewer on protocol 1 to reload, and reloading doesn't help until ticket 6 is deployed. Deploy the Worker and the Viewer together.
- **The release tag must not start with `v`.** Use `remote-0.2.0`. A `v*` tag triggers the npm publish workflow.
- **Nothing has been checked in a real browser yet.** Ticket 7 is the first time the camera behavior is seen on screen, so expect it to find things.
- **Open tickets #27 and #28** also change `server/src/tools.ts`, and #28 changes the Room. They don't depend on this work, but merging them may conflict with tickets 2 to 4.

