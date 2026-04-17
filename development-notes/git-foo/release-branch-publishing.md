# Publishing via the `release` branch

Pushing to the `release` branch triggers publishing the app to its hosted location. After a release tag is created on `main`, fast-forward/merge `main` into `release` and push to publish.

## Steps

```sh
git checkout release   # creates local tracking branch from origin/release if not present
git merge main
git push origin release
git checkout main
```

## Notes

- Run this on `main` after the release tag (e.g. `r15.15`) has been created and pushed. The tag itself does not publish — the push to `release` does.
- If `release` has no local branch yet, plain `git checkout release` creates one tracking `origin/release`. Equivalent explicit form: `git checkout -b release origin/release`.
- The merge should be a straightforward fast-forward or clean merge since `release` only ever receives commits from `main`. Never commit directly to `release`.
