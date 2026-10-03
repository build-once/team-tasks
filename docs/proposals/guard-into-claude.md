# Proposal: move the guard's rule files under `.claude/`

**Drafted by the assistant. Not applied.** Guard files (`guard/`, `.claude/hooks/`,
`.claude/settings*`) are person-only under rule 5, so the assistant must not apply this. The owner
reviews, applies and commits.

The patch is `docs/proposals/guard-into-claude.patch`. It touches 20 files, six of them moves.
Closes #100, which records the owner's decision of 2 Oct 2026 to take **option (i)** on #66.

---

## The one thing to understand before reading the patch

**The location of the rule files is the mechanism. It is not tidiness.**

`claude-code-action` restores a fixed list of paths from a pull request's **base** branch before
Claude starts. At the commit `.github/workflows/claude.yml` pins
(`97c53473391bff1901034d4b454b5bac7ab7a029`, v1.0.239) that list is:

```js
export const SENSITIVE_PATHS = [
  ".claude", ".mcp.json", ".claude.json", ".gitmodules",
  ".ripgreprc", "CLAUDE.md", "CLAUDE.local.md", ".husky",
];
```

`.claude` is on it. A top-level `guard/` is not. So today, on a `@claude` run on a pull request,
the guard **script** comes from `main` while the **rules it enforces** come from the branch under
review — which is #66. Moving `rules.json` and `local.json` inside `.claude/` makes them come from
the base branch too, with **no new logic, no `git` calls in the hook, and no new failure mode**.

That is the whole fix. Everything else in the patch is the consequence of moving six files.

The flip side, and it is why the patch adds comments in three places: **this fix is invisible in
the code**. Nothing stops a future change from moving the rules back out, or from having the guard
read one more file from somewhere convenient. `loadRules` would still work, every test would still
pass, and #66 would be reopened in full. So `guard.mjs`, `docs/guards.md` and `claude.yml` each now
say, where somebody would be about to do it, that the location is load-bearing.

---

## What the patch does

### 1. The move

`guard/` becomes `.claude/guard/`, same six file names, in `git diff -M` rename format so
`git apply` performs the move:

```
 {guard => .claude/guard}/arming-probe.md |  8 +--
 {guard => .claude/guard}/check.mjs       | 10 ++--
 {guard => .claude/guard}/local.json      |  0
 {guard => .claude/guard}/probe.mjs       | 18 +++----
 {guard => .claude/guard}/rules.json      | 58 ++++++++++++++++++--
 {guard => .claude/guard}/selftest.mjs    | 22 ++++----
```

### 2. `guard.mjs` — the two `resolve` calls, and a comment saying why

```diff
-  const rulesPath = resolve(root, 'guard', 'rules.json');
-  const localPath = resolve(root, 'guard', 'local.json');
+  // The rule files live INSIDE .claude/ on purpose, and that location is a
+  // security property rather than tidiness. [...] Do not move these files out of .claude/.
+  const rulesPath = resolve(root, '.claude', 'guard', 'rules.json');
+  const localPath = resolve(root, '.claude', 'guard', 'local.json');
```

`ROOT` itself is unchanged: `resolve(dirname(SELF), '..', '..')`. It is still derived from the
script's own absolute location, which is what stops a `cd` moving the guard, and the hook is still
two folders below the project root. Three error strings that name the files are re-pathed so a
failure message points at a file that exists.

### 3. The three scripts beside the rules

`selftest.mjs`, `check.mjs` and `probe.mjs` each compute `ROOT` from their own location. They are
now one folder deeper, so each gains one `'..'`:

```diff
-const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
+const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

**I got this wrong on the first build**, and it is worth recording how it was caught. I updated
`ROOT` in `selftest.mjs` and `check.mjs` and missed `probe.mjs`. Every assertion in my build script
passed, because an assertion can only check a replacement I remembered to write. The self-test
passed too, because the self-test does not run the probe. What caught it was
`node .claude/guard/probe.mjs offline`, which reported *"Hook script did NOT deny the probe"* and
exited 1 — the probe pointed at `.claude/.claude/hooks/guard.mjs`, which does not exist, so Node
exited 1, and **exit 1 does not block**. That is exactly the failure the guard's own header warns
about. The offline probe is now one of the eight verification commands below, for that reason.

`selftest.mjs` also has its temporary-kit builder re-pathed (it writes a throw-away `.claude/guard/`
instead of a throw-away `guard/`), and the three fail-closed cases that edit a guard file by
relative or symlinked path now name the new location.

### 4. `guard-self-protect` — the only rule whose behaviour changes

This is the part to read adversarially. The pattern has three branches; two already covered the new
location by accident, and one did not.

**Before:**

```
^(?:guard/|\.claude/hooks/|\.claude/settings[^/]*$)|(?:\b(?:rm|mv|cp|tee|…|ren)\b|\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-[a-z]*i|>)[^|;&]*(?:\bguard[/\\]|\.claude[/\\](?:hooks|settings))|\bgit\s+(?:checkout|restore|rm|mv)\b[^|;&]*(?:\bguard[/\\]|\.claude[/\\](?:hooks|settings))
```

**After** — three additions, nothing removed:

```
^(?:guard/|\.claude/guard/|\.claude/hooks/|\.claude/settings[^/]*$)|(?:\b(?:rm|mv|cp|tee|…|ren)\b|\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-[a-z]*i|>)[^|;&]*(?:\bguard[/\\]|\.claude[/\\](?:guard|hooks|settings))|\bgit\s+(?:checkout|restore|rm|mv)\b[^|;&]*(?:\bguard[/\\]|\.claude[/\\](?:guard|hooks|settings))
```

| Branch | What it matches | Did it already cover `.claude/guard/`? |
|---|---|---|
| 1. anchored path | the **file tools** — a path that *starts* `guard/`, `.claude/hooks/` or `.claude/settings…` | **No.** `.claude/guard/rules.json` did not start with any of them, so `Edit .claude/guard/rules.json` was **allow** on `main`. This is the hole. |
| 2. mutating verb or redirect, then a guard path | the **shell tools** — `rm`, `mv`, `Set-Content`, `>` … followed by `guard/` or `guard\` | **Yes, by accident.** `\bguard[/\\]` matches the `guard/` inside `.claude/guard/`, because `/` is a word boundary. `rm .claude/guard/rules.json` was already forbidden. |
| 3. `git checkout/restore/rm/mv`, then a guard path | `git checkout -- guard/rules.json` | **Yes, same reason.** |

So branch 1 is the one that had to change. `\.claude/guard/` is **added** to the alternation rather
than replacing `guard/`: a reintroduced top-level `guard/` stays protected, which is the only safe
direction for a rule like this. `(?:hooks|settings)` becomes `(?:guard|hooks|settings)` in branches
2 and 3 — strictly redundant given `\bguard[/\\]`, and added anyway so the rule reads as covering
all three guard folders rather than relying on a coincidence of word boundaries that a later edit
could remove.

**The reason text** changes to name the new location:

> The guard's own files (`.claude/guard/`, `.claude/hooks/`, `.claude/settings*`, and `guard/` if it
> ever returns) can only be changed by a person, never by the assistant.

**Ten `should_match` and five `should_not_match` examples are added**, covering the new path on both
shell tools and on the file tools: `Edit`, `Write`, `rm`, `sed -i`, `>`, `mv`, `git checkout`,
`Remove-Item`, `Set-Content`, `Out-File` — and, as near-misses that must stay allowed, reading the
new files (`cat`, `Get-Content`, `node … selftest.mjs`, a redirect whose *target* is not a guard
path). **No existing example is removed**, and every original stays at its original index.

### 5. A deliberate over-block, named rather than hidden

Branches 2 and 3 match `\.claude[/\\](?:guard|hooks|settings)` with no trailing separator, so a
mutating shell command aimed at `.claude/guardians/` — a folder that does not exist — would now be
refused:

| case | `main` | patched |
|---|---|---|
| `rm .claude/guardians/notes.md` | allow | **forbid** |
| `Edit .claude/guardians/notes.md` (file tool) | allow | allow |

This is the same shape of false positive the rule already has: on `main`,
`rm src/guard/banner.tsx` is forbidden by `\bguard[/\\]`. Tightening it to `guard[/\\]` would mean
tightening `hooks|settings` the same way, and `settings` must keep matching
`.claude/settings.json`, which has no trailing separator. Narrowing an existing branch to remove a
false positive would be a **loosening**, which #100 forbids. So it stays, and it is in the matrix as
a row rather than a surprise.

### 6. Everything else

`package.json`, the CI "Guard self-test" job, `scripts/launch-check.mjs` (its check *and* its
self-test fixtures), `checklist/launch.json`, and seven documents. The full list, including what was
deliberately left alone, is below.

The `claude.yml` header is rewritten rather than patched line by line: most of it was an explanation
of #66 in the present tense. It now says the script **and** the rules come from base, says that this
holds **only** because the rules are inside `.claude/`, and keeps the limitation that remains —
`AGENTS.md` and `docs/plan.md` are still the branch's.

---

## No rule content changed, measured

`JSON.stringify(doc, null, 2) + '\n'` reproduces `rules.json` byte-for-byte, so the rules were
edited as parsed JSON rather than by text surgery: nothing but the intended keys can shift.

```
version      : 1 -> 1
rule count   : 24 -> 24
rule ids     : identical, same order
$comment     : changed (the selftest path it names)

rules whose JSON differs in ANY way: 2 of 24
  arming-probe: examples
  guard-self-protect: pattern, reason, examples

  arming-probe.id/decision/tools/reason/lesson/pattern : all unchanged
  arming-probe.examples.should_match     : 2 -> 2, originals kept in place: true
  arming-probe.examples.should_not_match : 3 -> 3   (two near-miss strings re-pathed:
                                                     `node guard/probe.mjs` -> `node .claude/guard/probe.mjs`)
  guard-self-protect.id/decision/tools/lesson/flags    : all unchanged
  guard-self-protect.reason              : CHANGED (names the new location)
  guard-self-protect.pattern             : CHANGED (three additions, nothing removed)
  guard-self-protect.examples.should_match     : 13 -> 23, originals kept in place: true
  guard-self-protect.examples.should_not_match :  7 -> 12, originals kept in place: true
```

**22 of 24 rules are byte-identical.** The two that changed are the two that name a path.

### Where #100's own wording pulls two ways, and what I did about it

#100 item 2 asks for `guard-self-protect`'s patterns to be updated and for new `should_match`
examples on both shell tools. #100 item 3 asks that the rules be **byte-identical** before and
after, proved by a checksum of each moved file. **Both cannot hold at once**: adding an example
changes the file, and so changes its checksum.

I read the intent as "no rule's *substance* changes, and nothing is removed or weakened", and
answered it with four measurements rather than one: the per-rule comparison above, the checksums
below, a bypass matrix, and a systematic sweep of every example already in `main`'s rules file. If
the intent was the literal one — move the files and change nothing in them — then items 2 and 3 of
the issue conflict and it is the owner's call which wins. Say so and I will rebuild the patch with
`rules.json` untouched; the cost is that `Edit .claude/guard/rules.json` would then be **allow**,
which is the hole the move exists to close.

### Checksums of each moved file

Line endings are normalised to LF before hashing. This repository is checked out with
`core.autocrlf=true`, so without that every file would look changed for a reason that has nothing to
do with the move.

| file | before (`guard/`) | after (`.claude/guard/`) | identical |
|---|---|---|---|
| `arming-probe.md` | `244fec14416005320902843978934adbf35d83574744f2524ebe383ffc53dd3f` | `f2a1b3ad7f5303784513574c71d84511afa60c1d1d0ce0927a83df8d6ceab9fa` | no |
| `check.mjs` | `888e2d18c962d7fafc40e6dec364cc6965071885352ef146f07f0bd21b8699f7` | `bcdb87d5e97fd240f6ef8d15e749ece321efe22430af5ddbfd016966f7314a67` | no |
| `local.json` | `07725a6ff3cb6cdd9ca7043c25f05c02efe0c487edf9e7ec82fb7ace297ca754` | `07725a6ff3cb6cdd9ca7043c25f05c02efe0c487edf9e7ec82fb7ace297ca754` | **yes** |
| `probe.mjs` | `c7974a106ff179a0f74caffea08b72733c6ba230e3c28d1531f32eac2b3b9b10` | `b782cb9cc4643b93d22565883b9a700e3015d934ed0d0872d05efb3880ecaa77` | no |
| `rules.json` | `f292ddf8e38730c5112f3d1cfe8e9633c4adad6ca6ff9979199ca633867e80f5` | `5a568ba396b0a59cc5171607ecb87d1927955b33f111afb50561e6a1f598eb11` | no |
| `selftest.mjs` | `a23de7491d80e9cbd7defb251fb2b1667ed30a29ae66d967d9c2be0d505a308f` | `3add8a1f929e334df54e1aff9981e65c4db47269dc8cf1b4a9883e89e9c08f7c` | no |

**`local.json` is byte-identical** — the file holding the production patterns is moved and not
otherwise touched. The other five change because they each name a path: four scripts and one rules
file. `arming-probe.md` is a document and only its commands change.

---

## Every `guard/` reference in the repository

`git grep -c "guard/"` on `main` (commit `926187c`) reports **103 matching lines across 31 files**.
Each is accounted for below. The "deliberately not" half is the half worth checking.

### Changed by the patch (20 files)

| file | what changes |
|---|---|
| `guard/*` (6 files) | moved to `.claude/guard/` |
| `.claude/hooks/guard.mjs` | the two `resolve` calls, three error strings, one comment block added |
| `.claude/guard/selftest.mjs` | `ROOT`, the temp-kit builder, three relative/symlink cases, two check names |
| `.claude/guard/check.mjs` | `ROOT`, usage comment, usage string |
| `.claude/guard/probe.mjs` | `ROOT`, usage comment, two usage strings, the `arming-probe.md` reference |
| `.claude/guard/arming-probe.md` | the four commands it tells you to run |
| `.claude/guard/rules.json` | `$comment`; `arming-probe` near-misses; `guard-self-protect` pattern, reason, examples |
| `package.json` | `guard:test`, `guard:check` |
| `.github/workflows/ci.yml` | the "Guard self-test" job's `run:` (the workflow change #100 asks for) |
| `.github/workflows/claude.yml` | the header: the four-locks list and the long #66 explanation |
| `scripts/launch-check.mjs` | the `guard_selftest` check's path and message, plus **both self-test fixtures** |
| `checklist/launch.json` | the launch item's title |
| `docs/guards.md` | eight path mentions, plus a new paragraph on why the files live under `.claude/` |
| `docs/launch-check.md` | the UNVERIFIED example |
| `docs/environments.md` | the two paths in the closed 2026-09-28 entry |
| `docs/secrets.md` | the "known limitation" paragraph, rewritten rather than deleted |
| `docs/stack.md` | the "Job in your app" list |
| `CONTRIBUTING.md` | where self-test examples go |
| `README.md` | the Guards row's file list |
| `SECURITY.md` | the in-scope list |

### Changed directly in the pull request, not in the patch (3 files)

These name **both** locations, so each is correct before the patch is applied and after. None is a
guard file.

| file | what changes |
|---|---|
| `AGENTS.md` | rule 5's path list gains `.claude/guard/`, keeps `guard/`, and says why both are there |
| `CLAUDE.md` | the same sentence, byte-identical to `AGENTS.md`'s |
| `.github/PULL_REQUEST_TEMPLATE.md` | the guard-files checkbox gains `.claude/guard/` |

### Deliberately not changed (9 files)

| file | why not |
|---|---|
| `.github/CODEOWNERS.example` | `/.claude/` is already a line in it, so the new location is covered. `/guard/` is left as belt-and-braces. |
| `HANDOFF.md` | a dated record of a past session, regenerated by `npm run handoff`. It is already stale on other counts (it says 22 guard rules; there are 24). |
| `evidence/secret-audit.md`, `evidence/production-log.md`, `evidence/main-protection.md` | evidence records what was true when it was written. Rewriting a path inside one would make it a worse record, not a better one. |
| `docs/proposals/rule-19-guard.md`, `docs/proposals/rule-19-guard.patch` | a past proposal and its patch, already applied. Also a record. The patch would no longer apply after the move, which is expected: it has already been applied once and is not meant to be applied again. |
| `addons/ai-team/files/.github/ai-team/config.json` | its `protected_paths` already contains `.claude/**`, which covers `.claude/guard/**`. It is also shipped to other repositories, which may still use a top-level `guard/`. |
| `addons/ai-team/files/.github/workflows/ai-builder.yml` | the same: its instruction already names `.claude/`, and it ships elsewhere. |

### One false positive in my own sweep, recorded so nobody re-finds it

`scripts/launch-check.mjs:279` contains `/guard/i` — a regular-expression literal testing whether
the hook command contains the word "guard", not a path. It stays as it is. My first whole-tree sweep
flagged it, and flagged every `.claude/guard/` path as a leftover `guard/` too, because `guard/` is
a substring of `.claude/guard/`. The sweep now strips the new path before counting.

---

## Verification

Four kinds of evidence, answering four different questions. All of it was produced in **scratch
clones outside the working tree**; `guard/` in this repository was never touched.

### 1. The self-test, before and after

```
$ node <base>/guard/selftest.mjs                      # main, commit 926187c
PASS: 513 rule examples across 24 rules, plus 32 fail-closed checks.
exit 0

$ node <patched>/.claude/guard/selftest.mjs           # the same clone, patch applied
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
exit 0
```

**24 rules and 32 fail-closed checks in both** — no rule and no core check was lost. Examples go
513 → 537, and the 24 is arithmetic rather than a surprise: the build script predicted it before the
self-test ran. Ten `should_match` and five `should_not_match` examples were added; the self-test
re-runs every *plain string* example of a shell rule as a PowerShell call as well, so a string
counts twice and an object example once. `should_match`: 5 strings × 2 + 5 objects = 15.
`should_not_match`: 4 strings × 2 + 1 object = 9. **15 + 9 = 24.**

### 2. The bypass matrix, `main` versus patched

The guard's own exported `evaluate()`, run over the same cases against both rule sets. **47 of 47
rows behave as intended; 0 rows got looser.** The rows that matter:

| group | case | `main` | patched |
|---|---|---|---|
| the hole | `Edit .claude/guard/rules.json` | **allow** | **forbid** |
| the hole | `Write .claude/guard/local.json` | **allow** | **forbid** |
| the hole | `Edit <abs>/.claude/guard/rules.json` | **allow** | **forbid** |
| the hole | `Edit ../.claude/guard/rules.json` from `docs/` | **allow** | **forbid** |
| old location | `Edit guard/rules.json`, `rm`, `Remove-Item`, `sed -i`, `git checkout` | forbid | forbid |
| new location, shell | `rm`, `cp`, `sed -i`, `>`, `truncate`, `ln -sf`, `git checkout`, `mv` | forbid | forbid |
| new location, PowerShell | `Remove-Item`, `Set-Content`, `Out-File`, `New-Item` | forbid | forbid |
| not over-blocked | `.claude/skills/…`, `.claude/agents/…`, `cat`/`Get-Content` the rules, `node … selftest.mjs`, `node … selftest.mjs > guard-log.txt`, `src/guard/banner.tsx`, `npm run guard:test` | allow | allow |
| over-block, deliberate | `rm .claude/guardians/notes.md` | allow | **forbid** |
| unchanged | `.claude/hooks/guard.mjs`, `.claude/settings.json`, `.claude/settings.local.json` | forbid | forbid |
| other rules | arming probe, `git push origin main`, `git push --force`, `supabase db push --linked`, `cat .env` | forbid | forbid |
| other rules | `npm install left-pad@1.3.0`, `vercel deploy`, `Edit .github/workflows/ci.yml` | ask | ask |
| other rules | `ls`, `git status` | allow | allow |

### 3. A systematic sweep, because a hand-written matrix only covers what somebody thought of

PR #54's lesson was that a test written by whoever wrote the pattern inherits its blind spot. So
every example already in **`main`'s** `rules.json` was turned into a payload — every rule, and each
plain string run as both Bash and PowerShell — and evaluated against both rule sets:

```
Swept 513 payloads built from main's own examples.
Cases whose decision got WEAKER under the patch: 0
Cases whose decision got STRICTER under the patch: 0
```

**Identical on all 513.** Every behaviour change this patch makes is on a `.claude/guard/` path,
which `main` had no example for — which is the point.

### 4. test-must-fail-first, because a test you have never seen fail proves nothing

`docs/guards.md` step 3. The patch was applied to a clone, then the **three pattern additions were
reverted** while leaving the move and the new examples in place:

```
--- RED: pattern additions reverted, new .claude/guard/ examples still present
exit code: 1
FAIL: 5 problem(s)
   - guard-self-protect: should MATCH but did not: Edit {"file_path":".claude/guard/rules.json",…}
   - guard-self-protect: should MATCH but did not: Write {"file_path":".claude/guard/local.json",…}
   - core: relative guard path from a sub-folder is denied (exit 0)
   - core: settings command denies a guard edit from a sub-folder (exit 0)
   - core: guard edit through a symlinked path is denied (exit 0)

--- GREEN: pattern restored
exit code: 0
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
```

Two of the five are the new examples. **The other three are fail-closed core checks that already
existed** — they edit a guard file by relative path, through the settings command, and through a
symlink, and because `selftest.mjs` now aims them at `.claude/guard/rules.json`, they exercise the
new location too. Those three are the closest thing here to #66's "test that the fix works": they
fail if the new location is not protected, by three different routes.

### 5. Every command, with its exit code

```
  0  main: guard self-test                         PASS: 513 examples, 24 rules, 32 checks
  0  patched: guard self-test                      PASS: 537 examples, 24 rules, 32 checks
  0  patched: guard checker still runs             Decision: DENY (forbid) [push-to-main]
  0  patched: arming probe, offline                denies the probe for Bash and PowerShell (exit 2)
  0  bypass matrix (main vs patched)               VERDICT: PASS, 0 unexpected, 0 loosened
  0  git apply --check, from the repo root         (--check writes nothing)
  0  patched: npm test (full suite)                AI team self-test: 258 passed, 0 failed
  0  unpatched repo: npm test (full suite)         AI team self-test: 258 passed, 0 failed

8 of 8 commands exited 0.
```

And after applying, in the patched clone:

```
  guard/ exists        : false
  .claude/guard/ exists: true
  .claude/guard/ holds : arming-probe.md, check.mjs, local.json, probe.mjs, rules.json, selftest.mjs
```

`git apply --verbose` reported all 20 patches, including all six renames, **"applied … cleanly"**.

### What none of this shows

**Whether the guard is actually armed in a live session.** Only the arming probe shows that, and it
needs a session restart. **And whether `claude-code-action` really restores `.claude/guard/` from the
base branch** — that is read from the action's source at the pinned commit, not observed, because
`claude.yml` has never run. It is the same `.claude/` prefix that already restores
`.claude/hooks/guard.mjs` and `.claude/settings.json`, so the mechanism is the one already relied on
rather than a new one; but **unverified — this workflow has never run**. The way to settle it is the
planned first use of `claude.yml`: the arming probe on both shell tools, on a pull request whose
branch weakens `.claude/guard/rules.json`. The probe must still block.

---

## What this does not fix

**`AGENTS.md` and `docs/plan.md` are still the pull request's.** Neither is in `SENSITIVE_PATHS`.
For `AGENTS.md` the exposure is smaller than it looks, because `CLAUDE.md` **is** restored from base
and repeats all nineteen rules inline — a duplication that exists for a different reason and happens
to cover this. `docs/plan.md`, which `CLAUDE.md` imports, has no such duplicate. So the habit #66
replaced for the guard files survives for these two, and `claude.yml` and `docs/secrets.md` now say
exactly that instead of the old, broader warning: **do not write `@claude` on a pull request whose
branch changes `AGENTS.md` or `docs/plan.md`.** Filed as **#105**.

**The guard still cannot see inside a patch file.** `git apply docs/proposals/guard-into-claude.patch`
modifies `guard/rules.json`, but the command names only the patch, so `guard-self-protect` does not
match and would not block it. That is **#53**, unchanged by this work, and it is the mechanism this
very proposal is delivered through: the protection rests on the assistant choosing not to run
`git apply`, not on the guard refusing.

**Nothing enforces that the rules stay inside `.claude/`.** Three comments say so. A comment is not
a mechanism — and neither is anything checking that `SENSITIVE_PATHS` still contains `.claude` at
the action commit this repository pins. Filed as **#106**.

**The fix has not been observed, only read.** `claude.yml` has never run, so "a pull request run
enforces `main`'s rules" comes from the action's source at the pinned commit rather than from a
run. The one-off check that would settle it — weaken the rules on a throw-away branch, `@claude` the
pull request, see the probe blocked — is filed as **#107**.

---

## For the owner, after applying — in this order

```
git apply docs/proposals/guard-into-claude.patch
node .claude/guard/selftest.mjs
npm test
```

Expect **537 examples across 24 rules, plus 32 fail-closed checks**, and `npm test` exit 0. If the
hunks have drifted because `main` moved on, `git apply --3way` is the fallback.

The patch was generated against **`926187c`** — `main` as of 3 Oct 2026, with #97 and #99 merged.
It was first built against `3b6e50b` and **regenerated** when `main` moved mid-task: #97 changed
`.github/workflows/ci.yml` and `package.json`, and #99 changed rule 5 in `AGENTS.md` and
`CLAUDE.md` — all four files this change touches. The rebuild produced byte-identical checksums for
all six moved files and the same counts, because nothing in `guard/` itself moved between the two
commits. **If `main` has moved again by the time you apply this, re-read this paragraph rather than
trusting it**: `git apply --check` is one command and settles it.

Then **restart the assistant session** — settings and hooks are read at start-up — and run the
arming probe on **both** shell tools, because they are separate tool names in
`.claude/settings.json`:

```
Bash:        echo guard-arming-probe n0123456789abcdef
PowerShell:  echo guard-arming-probe n0123456789abcdef
```

Each must be **blocked**, quoting `arming-probe`. A probe that runs means the guard is not attached
for that tool, and nothing in this proposal can be relied on. Neither the self-test nor the matrix
can show this.

One more worth doing once, because it is the only check that tests the *actual* fix rather than the
rule that came with it: on a throw-away branch, weaken `.claude/guard/rules.json` — delete the
`arming-probe` rule — push it, open a pull request, and write `@claude` on it asking for the probe
command. If the probe is **blocked**, the rules being enforced came from `main` and #66 is closed by
observation rather than by reading the action's source. Delete the branch afterwards. Written up as
**#107**, with the full procedure and the three verdicts.
