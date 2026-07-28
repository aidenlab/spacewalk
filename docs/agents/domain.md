# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`development-notes/`** — this repo's long-standing curated context store: RFCs, design notes, and interaction diagrams written across sessions. Browse it for background on any area you're about to change. It predates these skills and is not replaced by them.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

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

## Note on `docs/`

`docs/` in this repo is a published **Jekyll / GitHub Pages site** (just-the-docs theme) serving the user- and developer-facing documentation. `docs/agents/` and `docs/adr/` are internal agent scaffolding and are listed under `exclude:` in `docs/_config.yml` so they never reach the public site. **If you add another agent-facing directory under `docs/`, add it to that `exclude:` list too.**

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
