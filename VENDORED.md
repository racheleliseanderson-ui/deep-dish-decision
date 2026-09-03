# Vendored files

Four repos publish one product, **Salty & Clever**:

| repo | app |
| --- | --- |
| `salty-command-center` | Salty & Clever (the desk) — retired, still vendors these files |
| `salty-kitchen-bar-intelligence` | Kitchen & Bar |
| `occasion-planner-suite` | Occasion OS |
| `deep-dish-decision` | Deep Dish |

Three source files are **hand-copied** between all four and must stay identical:

```
src/lib/salty-handoff/contract.ts
src/lib/salty-handoff/codec.ts
src/lib/salty-night-record.ts
```

## Why copied and not packaged

The four apps deploy independently, to separate hosts, on separate schedules,
from separate repos. There is no shared package registry between them and no
build step that could pull one in. A published npm package would mean a version
bump, a publish and four installs for every contract change, and — worse — it
would make it possible for the four apps to be running *different versions of
the contract at the same time*, which is exactly the failure the contract exists
to prevent. `contract.ts` deliberately has no imports at all so that it can drop
into any of the four apps unchanged.

So: copied, and enforced.

## The rule

**A change to any vendored file must be copied to all four repos, and
`--update` re-run in each, in the same sitting.**

```
# in the repo where you made the change
node scripts/check-vendored-parity.mjs --update

# copy the changed file(s) AND vendored-parity.json into the other three repos
# then, in each of them
node scripts/check-vendored-parity.mjs --update
```

All four `vendored-parity.json` files should end up byte-identical. If they do
not, the copy was incomplete.

## The gate

`scripts/check-vendored-parity.mjs` is what enforces this. It:

- hashes each vendored file with SHA-256 **after normalising line endings to
  LF**, so a CRLF working tree never trips it — only real content drift does;
- compares against the checksums committed in `vendored-parity.json`;
- exits non-zero with a per-file report naming the drifted file and both hashes.

It is plain Node with **zero dependencies** and runs on a bare `node`, with no
install step. It is wired into:

- the `test` script in `package.json`, prepended so it fails before anything
  slower runs;
- a GitHub Actions workflow that runs on push and pull request.

## What is *not* vendored

`src/lib/salty-handoff/apply.ts` is **deliberately not** in the manifest, and
must not be added to it. Only its shared helpers are common between the apps;
the rest of the file writes an incoming packet into that one app's own state,
which is different in every app by design. It legitimately differs in all four
repos and always will.

## History

`salty-night-record.ts` had already drifted into four different versions before
this gate existed, and nothing caught it. That is why the gate exists.
