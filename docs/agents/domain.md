# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`development-notes/`** — this repo's long-standing curated context store: RFCs, design notes, and interaction diagrams written across sessions. It predates these skills and is not replaced by them. **Start at `development-notes/README.md`** — it is a real index, not a directory listing (see below).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

Exception: `CONTEXT.md` here was **seeded**, not accreted. Spacewalk's vocabulary was already settled across `development-notes/` before these skills arrived, so the glossary was harvested from those notes in one pass. Treat its entries as established usage, not as tentative first drafts.

## File structure

Single-context repo:

```
/
├── CONTEXT.md                          ← glossary (created lazily)
├── development-notes/                  ← RFCs and design notes (pre-existing)
├── docs/adr/                           ← architectural decisions
│   ├── 0001-....md
│   └── 0002-....md
└── src/
```

## How to read `development-notes/`

`development-notes/README.md` indexes every note with a **status tag** and a *when to read* column. Both matter:

| Status | How to treat it |
|---|---|
| **Current** | Describes how the code works today. Safe to rely on. |
| **Reference** | Background that doesn't go stale (concepts, theory, setup). |
| **Proposal** | An RFC that has *not* shipped. Describes intent, not behavior. |
| **Historical** | Shipped or abandoned. **Does not describe current behavior** — the README says where to look instead. |

The trap: several completed RFCs are still in the tree as **Historical** and read like design docs for the current system. `refactor-highlighting-redesign.md` and `refactor-continuous-genomic-locator.md` are both shipped; for how highlighting behaves *now*, the index points at `highlighting-participant-map.md`. Never infer current behavior from a Historical note — follow the redirect, or read the code.

If you add a note to `development-notes/`, **add its row to that README table** (document, status, when to read). An unindexed note is invisible.

## Which store does a piece of knowledge go in?

Four stores overlap here. Keep them apart:

- **`CONTEXT.md`** — the glossary. What a domain term *means*, and which synonyms the project deliberately avoids. Definitions only, no plans.
- **`development-notes/`** — anything with a **plan, phases, or a walkthrough**: RFCs, participant maps, interaction diagrams, setup guides. This is the default home for substantial writing in this repo.
- **`docs/adr/`** — a single **hard-to-reverse choice with no accompanying plan**, where the rationale would otherwise be lost (e.g. "Cloudflare R2 over jsDelivr for remote `.sw`", "`.sw` is the only supported format"). One decision per file.
- **Agent memory** — cross-session working state and user preferences. Never the source of truth for anything in the three above.

Two rules that follow:

1. **Don't backfill.** Decisions already recorded inside an existing RFC stay there. Do not mine `development-notes/` to manufacture ADRs.
2. **If an RFC already covers it, extend the RFC.** A new ADR that restates an RFC's reasoning is a duplicate, and the two will drift.

## Note on `docs/`

`docs/` in this repo is a published **Jekyll / GitHub Pages site** (just-the-docs theme) serving the user- and developer-facing documentation. `docs/agents/` and `docs/adr/` are internal agent scaffolding and are listed under `exclude:` in `docs/_config.yml` so they never reach the public site. **If you add another agent-facing directory under `docs/`, add it to that `exclude:` list too.**

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
