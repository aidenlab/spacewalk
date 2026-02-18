# Git Worktree Guide

## What Is a Git Worktree?

A Git worktree lets you check out **multiple branches of the same repository** into separate directories on disk — simultaneously. Instead of cloning the repo twice or constantly running `git checkout` to switch branches, you create a **linked worktree** that shares the same `.git` object database (commits, branches, remotes, reflog, stash) but has its own working directory and index.

## How Our Workspace Uses Worktrees

We have a single clone of `igv.js` at:

```
/Users/turner/IGVDevelopment/igv.js          ← main worktree (spacewalk branch)
/Users/turner/IGVDevelopment/igv.js-master   ← linked worktree (another branch)
```

Both directories point to the **same Git repository**. The linked worktree (`igv.js-master`) has a `.git` file (not a directory) whose contents are:

```
gitdir: /Users/turner/IGVDevelopment/igv.js/.git/worktrees/igv.js-master
```

This tells Git where the real repository data lives.

### What is shared between worktrees

- The entire object database (all commits, blobs, trees)
- All branches (local and remote-tracking)
- Remotes and their configuration
- Stash
- Reflog
- Git configuration (`.git/config`)

### What is separate per worktree

- The checked-out branch (each worktree must be on a **different** branch)
- The working directory files
- The staging area / index
- `HEAD` (each worktree tracks its own position)

## Command Reference

### List all worktrees

```bash
git worktree list
```

Output shows each worktree's path, current commit, and branch:

```
/Users/turner/IGVDevelopment/igv.js         fb28a2a1 [spacewalk]
/Users/turner/IGVDevelopment/igv.js-master  bfb359e3 [DEPRICATRED-spacewalk-integration]
```

### Create a new worktree

Check out an **existing branch** into a new directory:

```bash
git worktree add ../igv.js-master master
```

This creates `../igv.js-master/` with the `master` branch checked out.

Check out an existing branch with a custom directory name:

```bash
git worktree add /path/to/directory branch-name
```

Create a **new branch** and check it out in the worktree in one step:

```bash
git worktree add -b new-feature-branch ../igv.js-feature main
```

This creates `new-feature-branch` starting from `main` and checks it out in `../igv.js-feature/`.

Create a worktree in a **detached HEAD** state (no branch):

```bash
git worktree add --detach ../igv.js-detached HEAD
```

### Navigate between worktrees

Worktrees are just directories. You navigate between them with `cd`:

```bash
# Work on the spacewalk branch
cd /Users/turner/IGVDevelopment/igv.js

# Switch to working on master
cd /Users/turner/IGVDevelopment/igv.js-master
```

All standard Git commands work in either directory — Git automatically knows which worktree context you're in.

### Switch the branch in a worktree

From within a worktree, you switch branches the normal way:

```bash
cd /Users/turner/IGVDevelopment/igv.js-master
git checkout master
```

**Important constraint:** Two worktrees cannot have the same branch checked out at the same time. If `master` is already checked out in another worktree, Git will refuse. You'd need to check out a different branch in the other worktree first, or use `--force` (not recommended).

### Remove a worktree

First, make sure you're not inside the worktree directory, then:

```bash
# Clean removal (worktree directory must be clean — no uncommitted changes)
git worktree remove ../igv.js-master

# Force removal even if there are uncommitted changes
git worktree remove --force ../igv.js-master
```

If you already deleted the directory manually, clean up the stale reference:

```bash
git worktree prune
```

### Move a worktree to a new location

```bash
git worktree move ../igv.js-master ../igv.js-main
```

This updates Git's internal tracking so the worktree is at the new path.

### Lock / unlock a worktree

If a worktree is on a removable drive or network share, lock it to prevent accidental pruning:

```bash
git worktree lock ../igv.js-master
git worktree unlock ../igv.js-master
```

## Common Workflows

### Side-by-side branch comparison

This is our current setup. Keep one branch in the main worktree and another in a linked worktree, then open both in a multi-root Cursor/VS Code workspace for easy diffing.

### Quick hotfix while working on a feature

You're deep into feature work on `feature-branch` and need to make an urgent fix on `main`:

```bash
# Create a worktree for the hotfix (from anywhere in the repo)
git worktree add ../hotfix-tree main

# Go there and do the fix
cd ../hotfix-tree
# ... edit, commit, push ...

# Come back and clean up
cd ../igv.js
git worktree remove ../hotfix-tree
```

Your feature branch working directory is completely untouched — no stashing required.

### Review a pull request locally

```bash
git fetch origin pull/123/head:pr-123
git worktree add ../review-pr-123 pr-123

# Review the code in ../review-pr-123, then clean up
git worktree remove ../review-pr-123
git branch -D pr-123
```

## Tips and Gotchas

- **One branch per worktree.** Git enforces that no two worktrees can have the same branch checked out. If you need the same code in two places, consider `git worktree add --detach`.

- **`git stash` is shared.** Stashes created in one worktree are visible in all worktrees (they live in the shared `.git`). Be mindful when popping stashes.

- **Submodules and worktrees.** If your repo uses submodules, each worktree needs its own submodule checkout. Run `git submodule update --init` in each worktree.

- **`npm install` per worktree.** Each worktree has its own `node_modules/`. You need to run `npm install` separately in each one since the working files are independent.

- **Branch deletion safety.** Git won't let you delete a branch that's checked out in any worktree. Remove the worktree first (or check out a different branch there).

- **IDE awareness.** Cursor/VS Code multi-root workspaces handle worktrees well. Each folder in the workspace can point to a different worktree and the Git integration recognizes them as parts of the same repository.
