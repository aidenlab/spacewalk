# Git Worktree Cheat Sheet

## What Is a Git Worktree?

A worktree lets you check out **multiple branches of the same repository** into separate directories — simultaneously. Instead of cloning the repo twice or constantly running `git checkout`, you create a **linked worktree** that shares the same `.git` object database (commits, branches, remotes, reflog, stash) but has its own working directory and index.

### What is shared between worktrees

- The entire object database (all commits, blobs, trees)
- All branches (local and remote-tracking)
- Remotes and their configuration
- Stash
- Reflog and Git configuration

### What is separate per worktree

- The checked-out branch (each worktree must be on a **different** branch)
- The working directory files
- The staging area / index
- `HEAD` (each worktree tracks its own position)

---

## Our Workspace Setup

```
/Users/turner/IGVDevelopment/igv.js          ← main worktree (spacewalk branch)
/Users/turner/IGVDevelopment/igv.js-master   ← linked worktree (for master or other branch)
```

Both directories share a single Git repository. The linked worktree (`igv.js-master`) contains a `.git` file (not a directory) pointing back to the main worktree's `.git`:

```
gitdir: /Users/turner/IGVDevelopment/igv.js/.git/worktrees/igv.js-master
```

---

## Commands

### List all worktrees

```bash
git worktree list
```

Example output:

```
/Users/turner/IGVDevelopment/igv.js         fb28a2a1 [spacewalk]
/Users/turner/IGVDevelopment/igv.js-master  bfb359e3 [master]
```

### Create a worktree for an existing branch

```bash
git worktree add ../igv.js-master master
```

Creates directory `../igv.js-master/` with `master` checked out.

### Create a worktree with a new branch

```bash
git worktree add -b my-new-branch ../my-new-dir main
```

Creates `my-new-branch` starting from `main` and checks it out in `../my-new-dir/`.

### Create a detached-HEAD worktree (no branch)

```bash
git worktree add --detach ../igv.js-detached HEAD
```

### Switch the branch inside a worktree

Just `cd` into the worktree and use `git checkout` as normal:

```bash
cd /Users/turner/IGVDevelopment/igv.js-master
git checkout master
```

### Navigate between worktrees

They're just directories:

```bash
cd /Users/turner/IGVDevelopment/igv.js          # spacewalk branch
cd /Users/turner/IGVDevelopment/igv.js-master   # master branch
```

### Remove a worktree

```bash
# Clean removal (working directory must have no uncommitted changes)
git worktree remove ../igv.js-master

# Force removal even with uncommitted changes
git worktree remove --force ../igv.js-master
```

### Clean up after manually deleting a worktree directory

If you `rm -rf` a worktree directory instead of using `git worktree remove`:

```bash
git worktree prune
```

### Move a worktree to a new location

```bash
git worktree move ../igv.js-master ../igv.js-main
```

### Lock / unlock a worktree

Prevents accidental pruning (useful for worktrees on removable drives):

```bash
git worktree lock ../igv.js-master
git worktree unlock ../igv.js-master
```

---

## Common Workflows

### Side-by-side branch comparison (our current use)

```bash
# From the main clone, create a worktree for master
cd /Users/turner/IGVDevelopment/igv.js
git worktree add ../igv.js-master master

# Now open both in a multi-root Cursor workspace for comparison
# When done with the comparison work:
git worktree remove ../igv.js-master
```

### Quick hotfix without disrupting feature work

```bash
# You're deep in feature work — don't stash, just spin up a worktree
git worktree add ../hotfix main

cd ../hotfix
# ... make fix, commit, push ...

cd ../igv.js
git worktree remove ../hotfix
```

### Review a pull request locally

```bash
git fetch origin pull/123/head:pr-123
git worktree add ../review-pr-123 pr-123

# Review code in ../review-pr-123, then clean up
git worktree remove ../review-pr-123
git branch -D pr-123
```

---

## Gotchas

| Gotcha | Detail |
|---|---|
| **One branch per worktree** | Two worktrees cannot have the same branch checked out. You'll get: `fatal: 'branch' is already used by worktree at '/path'` |
| **Stash is shared** | Stashes created in one worktree are visible in all of them. Be careful when popping. |
| **Separate `node_modules`** | Each worktree has its own files, so you need `npm install` in each one independently. |
| **Can't delete checked-out branches** | Git won't let you delete a branch that's checked out in any worktree. Remove the worktree first. |
| **Labels can drift** | A workspace file label like "master branch" is just a display name — it doesn't enforce which branch is actually checked out. Verify with `git branch` or `git worktree list`. |
| **Worktrees are disposable** | They're meant for temporary tasks. Remove them when done to reduce cognitive overhead. Creating a new one takes seconds. |
