# Evidence: Build it 26 PR 1 — the privacy page and the terms

Result: **PASS for everything this repository can answer. UNVERIFIED for everything a browser would
answer** — no screen has been opened, and the before/after run against a deployed build is the owner's.
Date: 2026-10-13
How checked: four commands, below, with their exit codes. Plus two deliberate breakages, to show the
check that matters most can fail.
Checked by: Claude Code. **No dashboard, no connector, no browser, and nothing run against staging or
production.**

---

## 1. What was built

| | |
|---|---|
| `web/src/lib/legal.ts` | **every sentence of both documents, in one file.** The two pages hold none |
| `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx` | map over the arrays in that file and render nothing of their own |
| `web/src/app/components/Footer.tsx` | two links, in the one component that is in the root layout and therefore on every screen — #204's first condition |
| `web/src/lib/supabase/proxy.ts` | `"/privacy"` and `"/terms"` in `PUBLIC_PATHS` |
| `scripts/screen-state-check.mjs` section 11 | **nine new checks**, in CI's pure-checks job |
| `scripts/staging/build-it-26-legal-pages-checks.mjs` | the before/after the owner runs against a deployed build. **In no CI job** — see section 5 |

**The words are a draft and merging is what makes them the owner's.** `docs/plan.md` has said since
7 October that writing them is the owner's "not least because they carry legal weight", and #204 says
"this issue is the requirement and the gate, not a draft". Answer 5 of 13 October is that the owner
reads both documents himself and **that this is not a legal review** — so nothing in either document
may read as one, which is the fourth of five permanent refusals section 11 enforces.

## 2. The four commands

### 2.1 The pure checks — `node scripts/screen-state-check.mjs`

```
11. The privacy page and the terms -- one file of sentences, five refusals, and the numbers
PASS  neither page holds a sentence of its own: every word comes from legal.ts
PASS  the five sentences docs/claims.md marks MUST NOT SAY appear nowhere in the words
PASS  and the sentences the refusals leave room for ARE there
PASS  the app's own figures come from its own constants, not from literals
PASS  the three figures with no constant in web/ agree with the file that owns each
PASS  every item #204 and the owner require is on the page
PASS  the contact address is one constant, used by the sentences and typed in no page
PASS  both paths are public, and the footer on every screen links to both
PASS  the export and delete-account are not claimed before they are built

306 of 306 checks passed.
```

Exit code **0**. **297 before this change, 306 after** — nine checks, and CI's expected count is a
**minimum** (`-lt`), so no workflow change is needed for them to be enforced. Section 5 says what that
leaves.

### 2.2 The staging script's selftest — `--selftest`

```
15 logic cases, 0 wrong.
PASS every judgement can fail: 15 cases, including each of the five sentences docs/claims.md marks
MUST NOT SAY, and the redirect to /login this script exists to catch
```

Exit code **0**.

### 2.3 `npm run lint`

```
> web@0.1.0 lint
> eslint
```

Exit code **0**, no output, which is eslint saying nothing is wrong.

### 2.4 `npm run build`

Both routes appear, and both are **prerendered as static content**, which is what a page with no data
and no secret should be:

```
├ ○ /privacy
└ ○ /terms

○  (Static)   prerendered as static content
```

Exit code **0**.

## 3. The two deliberate breakages — can the checks fail?

**The MUST NOT SAY check is the one worth proving**, because it is the only check in this repository
whose job is to stop a sentence being written, and a check that cannot fire would be worse than none:
it would read like protection.

**First breakage — four of the five patterns at once.** One sentence added to the privacy words saying
all four:

```
FAIL  the five sentences docs/claims.md marks MUST NOT SAY appear nowhere in the words
        expected [0,0,0,0,0]
        got      [1,0,1,1,1]
```

Exit code **1**.

**AND THE SECOND ELEMENT WAS STILL ZERO, which is why there was a second breakage.** That sentence did
not happen to say anything about an accepted version, so pattern 2 had not been exercised — a
four-of-five pass read as a five-of-five pass and was not one. So:

```
FAIL  the five sentences docs/claims.md marks MUST NOT SAY appear nowhere in the words
        expected [0,0,0,0,0]
        got      [0,1,0,0,0]
```

**Both breakages were reverted**, and the run after them is exit code **0** again.

**And three of the nine checks failed on their own wrong expected counts while being written**, which
is worth recording rather than tidying away, because each failure was a real finding about the thing
being counted:

| What went red | Why | What it changed |
|---|---|---|
| the three outside figures | `day <= l_today - 7` appears **twice** in the usage-counts migration — once in the statement and once in a comment quoting it | the check now counts `and day <= l_today - 7;`, the statement only |
| the same check again | `14 daily copies` is **not** a string in `docs/backups.md`; the figure lives there as the lifecycle rule's name | it now looks for `delete-after-14-days`, which cannot be reworded without renaming the rule in Cloudflare |
| both paths are public | `"/privacy"` appeared **twice** in `proxy.ts` — the array entry and the comment above it — and the footer's own comment quotes #204, which `longLiterals` counted as a sentence | the path check counts the indented array entry; `longLiterals` now strips comments first, which it should have done from the start |

## 4. What is NOT checked here, and it is everything a browser would say

1. **No screen has been opened.** Not on a laptop and not on a phone, which is the device
   `docs/plan.md` says this app is for. Two long documents on a narrow screen is exactly the layout
   nobody has looked at — the same item `evidence/build-it-23-attachments-screen.md` has carried about
   the files panel since 9 October.
2. **No deployed build has been fetched.** `PUBLIC_PATHS` is a list in a module; the thing that reads
   it runs in the Edge runtime, on a request. Section 2.1 proves the list; only a `GET` proves the
   Proxy. **That is the owner's run**, and it is the before/after in section 6.
3. **Nobody has read the words for what they say.** Section 11 holds the discipline, the refusals and
   the numbers. It cannot tell whether a sentence is **true**, whether it is **clear**, or whether it
   is **complete** — and answer 5 puts all three in the owner's hands.
4. **No screenshot of anything.**

## 5. One gap this change creates, and it is filed rather than mentioned

**`scripts/staging/build-it-26-legal-pages-checks.mjs` is named in no CI job**, so its fifteen logic
cases run nowhere and cannot fail a pull request. That is the fault
[#167](https://github.com/build-once/team-tasks/issues/167) records happening before — a staging
script added for Build it 18 whose 57 cases "ran nowhere and could not fail a pull request" — and
[#102](https://github.com/build-once/team-tasks/issues/102) records the same shape for a pure check.

**It was not fixed here on purpose.** The fix is one line in
`.github/workflows/ci.yml`'s `staging-script-selftests` job plus one expected count in its `env` block,
and **rule 5 says `.github/workflows/` changes only when the owner asks.** Adding a selftest
strengthens a check rather than weakening one, so this is a question rather than a refusal — and it is
filed as [#302](https://github.com/build-once/team-tasks/issues/302) so it does not live only in a
pull-request description.

## 6. The before/after the owner runs, which is the half this file cannot have

Two runs of one command, each taking a public web address and **no secret of any kind** — the script
has none, sends two `GET` requests, and creates, sends and spends nothing.

**BEFORE**, against the address serving the build *without* this change:

```sh
node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
```

Expect **FAIL on both paths** — a redirect or a 404. That is what makes the after mean something.

**AFTER**, against this branch's Vercel Preview address:

```sh
node scripts/staging/build-it-26-legal-pages-checks.mjs https://<this branch's preview>.vercel.app
```

Expect **PASS on both** — status 200 signed out, both headings, and every required phrase.

**And one thing no script can do: open both pages in a phone browser and read them.** That is the
check that answers 3 and 4 of section 4, and it is the one worth doing last and carefully.
