# Normalising line endings — one-time, run by hand

`.gitattributes` in this repo now pins the whole tree to LF (`* text=auto eol=lf`).
That fixes _future_ checkouts. It does **not** fix the files already sitting in
your working tree, which are CRLF while the index is LF.

Right now: **319 of 629 tracked files are CRLF in the working tree**
(65 are already LF, the rest are binary). Until they are renormalised, every
`git diff` shows whole files as changed and real regressions hide in the noise.

Deep Dish is the worst affected: its lint run currently reports roughly 20,600
errors, and almost every one of them is `Delete `␍``. Renormalising should
reduce that to the real lint backlog.

## The two commands

Run these once, at the repo root, on a clean tree with nothing else in progress:

```
git add --renormalize .
git commit -m "chore: normalise line endings to LF"
```

That is the whole procedure. Nothing else is needed and nothing else should be
in that commit.

## What to expect

- **Warning: this will touch nearly every file in the repo** (~319 of them).
  It must be its own commit, with no other change mixed in — otherwise the one
  line you actually meant to change is invisible inside a whole-repo rewrite.
- `git add --renormalize .` prints nothing and takes a few seconds. It rewrites
  the _index_, not your files' contents in any meaningful way — only the stored
  line endings change.
- `git status` after it will list a very large number of modified files. That is
  correct.
- The commit diff will be enormous. That is expected and is exactly why it is
  isolated.
- Afterwards, `git ls-files --eol` should show `i/lf w/lf` for text files, and
  `git status` on an untouched tree should be clean.
- Nothing in `src/` changes semantically. Binary files are excluded by the
  `binary` rules in `.gitattributes`.

Deliberately **not** run for you: this is a large, noisy, history-visible change
and it belongs to whoever is at the machine, on a clean tree, in a commit of
its own.
