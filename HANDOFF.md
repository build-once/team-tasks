# HANDOFF

Generated: 2026-09-25T11:50:52Z by scripts/handoff.mjs. Secret-looking strings and email addresses are redacted.
Read this first when you start a new session. Check anything important against the repo itself; this file is a summary, not the truth.

## Branch

`chore/fill-placeholders`

## Last commits (newest first, up to 10)

```
d0635c0  2026-09-25  fix(handoff): never re-scan HANDOFF.md for TODOs
f7fdf6a  2026-09-25  chore: fill the last placeholders
f209ae2  2026-09-25  Merge pull request #4 from build-once/ci/add-vet-handoff-selftests
975901c  2026-09-25  fix(checklist): say 'Local' not 'Development' in env-separate-keys title
7b256f9  2026-09-25  ci: run vet-tool and handoff self-tests on every pull request
a66ef7e  2026-09-25  Merge pull request #3 from build-once/fix/kit-cleanup
3bd3e41  2026-09-25  fix: map checklist to lessons, fix lesson refs, workflow checker path, fuller npm test
d5b7d7e  2026-09-25  Merge pull request #2 from build-once/fix/windows-guard-paths
326fc24  2026-09-25  fix(guard): make self-test and checker work on Windows
ca384cb  2026-09-25  Merge pull request #1 from build-once/kit/v0.1-import
```

## Working tree (git status)

1 path(s) not committed: 0 staged, 0 modified, 0 deleted, 1 untracked, 0 conflicted.

## Changed files

Uncommitted changes plus files changed on this branch since it left `main`:

- `HANDOFF.md`
- `README.md`
- `SECURITY.md`
- `configs/mcp/README.md`
- `configs/mcp/github.readonly.json`
- `docs/vetting.md`
- `scripts/handoff.mjs`

## Open TODO / FIXME in changed files

```
scripts/handoff.mjs:22  TODO: |FIXME|HACK|XXX)\b[:\s]?(.*)$/;
scripts/handoff.mjs:130  TODO: / FIXME in changed files', '', 'UNVERIFIED (no list of changed files)', '');
scripts/handoff.mjs:146  TODO: / FIXME in changed files', '');
scripts/handoff.mjs:213  TODO: rotate ${secrets['stripe-live-key']}\n// FIXME: handle the empty list\nexport const a = 1;\n`);
scripts/handoff.mjs:216  TODO: SHOULD_NOT_APPEAR\n');
scripts/handoff.mjs:217  TODO: wire up b\n');
scripts/handoff.mjs:226  FIXME: handle the empty list/.test(t), 'e2e: FIXME from changed file listed with file:line');
scripts/handoff.mjs:227  TODO: wire up b/.test(t), 'e2e: TODO from untracked changed file listed');
scripts/handoff.mjs:275  TODO: /FIXME`;
```

## Decisions / Next steps

_Fill this in before you stop. The tool keeps this section when it regenerates the file._

- **Decided:** Product name is **Build Once** (was guardrails-kit). Repo lives in its own GitHub organisation, `build-once`, private until v0.1 is finished. Course link stays "coming soon" for now. GitHub connector pinned to `v1.12.2`.
- **Why:** Keep the venture separate from any other project; "Build Once" sells the time saved. Private because the kit is still v0.1.
- **Done so far (all merged to main, CI green):** kit imported and renamed (PR #1); 22 guard rules with 203 self-test examples and docs/guards.md (PR #1); Windows support for the guard self-test and checker (PR #2); launch checklist mapped to lessons, workflow checker takes a path, fuller npm test (PR #3); vet-tool and handoff self-tests in CI (PR #4). Live arming probe: ARMED on Linux (cloud session) and on Windows.
- **Not done / blocked:**
  - Branch protection on `main` cannot be tested until the repo is public (or on GitHub Pro). See docs/protect-main.md.
  - Container image digest for the GitHub connector: unverified (registry not reachable from the cloud session). Run `docker pull` locally to pin by digest.
  - Stale comment in guard/selftest.mjs (says "sh -c"; now Git Bash on Windows). Guard file, so a person must edit it.
  - Book fixes from the first review: glossary chapter numbers (Books 2 and 3), wrong cross-references, the missing "we" framing line, author bylines to remove.
- **Next step (first thing to do):** Decide when to make the repo public, then protect `main` and test that a direct push is refused.
- **How to check it worked:** `npm test` exits 0; `node guard/probe.mjs` then the live probe says ARMED; on GitHub, a direct push to `main` is refused.
