# Contributing

This file is for changing the package's source. To use the package, read `README.md` and `AGENTS.md`.

## What this repository is

The source of `@onlyworlds/sdk`, a typed TypeScript client for the OnlyWorlds API at onlyworlds.com, with the schema's constants generated from the public schema distribution. A version tag publishes it to npm through `.github/workflows/release.yml`. How the generated code is made: `codegen/README.md`.

## Set up and run the gates

You need git, the network, Node 22.18 or later (the build tool, tsup 9, runs on nothing older; the built package runs on Node 18 and later), and Python 3 with PyYAML for the schema checks, as `python` on your PATH (the npm scripts call `python`; CI's `schema` job installs PyYAML with `pip install pyyaml`). Run every command from the repository root in a POSIX shell; Git Bash works on Windows. Run `git fetch origin` first, so `origin/main` is current. `npm ci`, `verify-wire.mjs` and the live tests need the network.

The commands CI runs, in an order that works locally (CI's jobs run in parallel, most of them on the `build` job's `dist/`). Run them all before you call a change done:

```sh
npm ci                                                      # install exactly what package-lock.json pins
node scripts/public-words.mjs --commits origin/main..HEAD   # commits: your commit messages
npm run build                                               # build: writes dist/
node scripts/public-words.mjs                               # test: the words of the published files
node --test                                                 # test: every test, against dist/
npm run schema:verify                                       # schema: the vendored schema is the pinned one
npm run codegen:check                                       # schema: generated files match their inputs
node scripts/verify-wire.mjs                                # wire: dist/ against the server's public API document
```

`node --test` and `verify-wire.mjs` run the built `dist/`, never `src/`. After any source edit, run `npm run build` again first, or the tests pass or fail on the old code. `npm test` does both: it builds, then runs `node --test`. The tests also compile every `typescript` block in `README.md` against the build, so a README edit can fail them.

A plain run skips the seven tests in `test/live-practice.test.mjs` and one TypeScript version check; on Node 22 nothing else skips. CI runs both in jobs of their own, and you can too:

```sh
OW_LIVE=1 node --test test/live-practice.test.mjs           # live: writes to the practice world (onlyworlds.com's one world anyone may write to, its key public, reset nightly), deletes each write
npm install --prefix "$PWD/../ts" --no-save --no-audit --no-fund typescript@4.5
OW_TSC_DIR="$PWD/../ts/node_modules/typescript" OW_TSC_EXPECT=4.5 node --test test/types-resolution.test.mjs
```

The types job runs the last two lines for TypeScript 4.5, 4.7, 5.0, 6.0 and 7.0; an older version skips, by name, a module resolution it does not have. Put the install folder outside the repository.

`main` requires two checks: `build` and `test (22)`. On a pull request CI also runs `commits`, `test` on Node 18, 20 and 24, `types`, `schema`, `live` and `wire` (`.github/workflows/ci.yml`). They are not required, but a red one is explained in the pull request, never ignored. On Node 18, CI sets `NODE_OPTIONS=--experimental-global-webcrypto` for the tests.

## How a change reaches main

Work on a branch and open a pull request. `main` takes a commit only when the required checks passed on it, and a repository rule refuses a direct push, with no bypass. A maintainer merges; never merge your own pull request. Never push to `main`, and never create or push a tag: a version tag publishes a release to npm. Do not edit `.github/workflows/`, the `version` in `package.json`, or a release heading in `CHANGELOG.md` unless the job says so. A changelog line goes under `## [Unreleased]`, and only when the job asks for one.

## What not to touch or hand-edit

- `codegen/schema-dist/` and `codegen/schema-pin.json`: the vendored schema and its pin, checked by `npm run schema:verify`. Only `codegen/repin.py` moves them.
- `codegen/tools/tools.json` and `codegen/tools-pin.json`: the vendored tools list and its pin. Only `node codegen/tools.mjs --repin <commit>` moves them.
- Generated files, which `npm run codegen` writes and `npm run codegen:check` holds: `src/v2/types.generated.ts`, `SCHEMA.md`, `src/tools.generated.ts`, `src/layout-anchors.generated.ts`, `src/layout-directions.generated.ts`. Also `src/nfc-tables.generated.ts` (`codegen/nfc_tables.mjs`) and the `FOLD_RUNS` string in `src/case-fold.ts` (`codegen/fold_runs.mjs`), which `test/world-file.test.mjs` checks.
- `codegen/layout/anchors.json` and `codegen/layout/directions.json`: shared tables the generated layout files and the schema's fixtures hold by their bytes.
- `package-lock.json`: install with `npm ci`, never `npm install`, which can rewrite it. It changes only with a dependency.
- `test/fixtures/`: do not change a file there unless the job says so. Every path `.gitattributes` marks `-text` must stay byte for byte as it is, and many are pinned by their sha256 in a test or a manifest. `test/fixtures/draught-text/` is written only by `npm run build && node test/fixtures/generate-draught-text.mjs --write`; `test/fixtures/layout/by-links-3d.answers.json` only by `node scripts/pin-layout-answers.mjs`, which refuses a moved answer unless `BY_LINKS_3D_VERSION` in `src/layout-by-links-3d.ts` was raised.
- The "Current as of" line at the top of `AGENTS.md`: it names the schema pin, and `codegen:check` fails without it.

Keep each file's line endings as they are: a rewritten ending is a changed line, and a `-text` file must stay byte-exact.

## Words

Everything here is public: the code, the docs, the tests and the commit messages. `node scripts/public-words.mjs` checks the published files and this one for names and pointers that belong to no public reader; its list of paths is in the script, so check a new file outside it by name (`node scripts/public-words.mjs <path>`). `node scripts/public-words.mjs --commits origin/main..HEAD` checks your commit messages, as the `commits` job does. A commit message says what the change does and why; it names no private repository, no person and no internal ticket.

## Where to stop and ask

Stop, and do not guess, when the job would need any of these:

- a change to anything in "What not to touch or hand-edit";
- a new dependency, or a changed one;
- a change to public behaviour the job did not name: an export, a type, what a method sends or returns;
- a gate that fails and you cannot say why, including one that also fails on `origin/main`;
- two readings of the job that give different code.

Write one question as a comment on your pull request, or, with no pull request yet, in a file `ASK.md` at the root of your branch, committed. Push your branch as it stands, then end your turn.

## What a finished job looks like

The pull request's description holds:

- what changed, and why;
- each gate you ran, with the last line of its output;
- what you did not run, and why;
- a list headed "Looked wrong, left alone": anything you noticed outside the job and did not change.
