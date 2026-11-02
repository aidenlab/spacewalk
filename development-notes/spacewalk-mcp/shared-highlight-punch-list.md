# Every Viewer shows the highlight: punch list

> **STATUS: Not started (2026-11-02).** Tracked in [aidenlab/spacewalk-mcp#41](https://github.com/aidenlab/spacewalk-mcp/issues/41). Vocabulary: `spacewalk-mcp/GLOSSARY.md` (**Highlight**).

The highlight is the link between genomic space and 3D space. Today it holds only on the screen of the person pointing. The Room will relay it, so that every Viewer draws exactly what the pointer's own screen draws. The Room keeps nothing, and the model takes no part.

## Work in this order

| # | Ticket | Repo | What it does | Needs | Status |
|---|---|---|---|---|---|
| 1 | [#42](https://github.com/aidenlab/spacewalk-mcp/issues/42) Record that the highlight is relayed, never kept | `spacewalk-mcp` | ADR 0006 and the glossary | — | ☐ |
| 2 | [#43](https://github.com/aidenlab/spacewalk-mcp/issues/43) The Room relays the highlight | `spacewalk-mcp` | The messages, the relay, the clear on close, and the library's throttled sender | 1 | ☐ |
| 3 | [#44](https://github.com/aidenlab/spacewalk-mcp/issues/44) Release spacewalk-remote 0.3.0 as a tarball | `spacewalk-mcp` | Publishes the package the Viewer needs | 2 | ☐ |
| 4 | [#146](https://github.com/aidenlab/spacewalk/issues/146) The Viewer shares the highlight through the Room | `spacewalk` | `HighlightController` keeps local and remote apart; `roomAttachment.js` sends and follows | 3 | ☐ |
| 5 | [#45](https://github.com/aidenlab/spacewalk-mcp/issues/45) Deploy the highlight and check it in two windows | `spacewalk-mcp` | Dev, then the check by eye | 4 | ☐ |
| — | [#147](https://github.com/aidenlab/spacewalk/issues/147) Hovering ball 0 never highlights it | `spacewalk` | A falsy-zero bug in `picker.js` | — | ☐ |

Ticket #147 isn't in the sequence, so do it any time.

## Why this order

- **1 comes first** so the code has a written decision to follow.
- **3 stands alone** because a released tarball can never be replaced. Do it only once 2 is merged and you're satisfied with the messages.
- **4 can't start before 3**, because the Viewer installs the library from the release.

## Points to watch

- **Deploy the Worker before the Viewer.** The protocol version stays 2, because the change is additive: an older Viewer ignores `highlight-moved`. But an older Room answers each `highlighted` with an error and a resync, which would happen at mouse-move rate.
- **No `touch()` per highlight.** It writes an alarm, and highlights arrive at mouse-move rate.
- **No echo.** A received highlight must never reach the local listener that sends.
- **The release tag must not start with `v`.** Use `remote-0.3.0`.
- **Nothing has been checked in a real browser yet.** Ticket 5 is the first time the shared highlight is seen on screen.
