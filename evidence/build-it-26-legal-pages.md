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
| `scripts/screen-state-check.mjs` section 11 | **thirteen new checks**, in CI's pure-checks job — nine with the pages, four more with the review of 13 Oct (section 7) |
| `scripts/staging/build-it-26-legal-pages-checks.mjs` | the before/after the owner runs against a deployed build. **17 cases, and now named in CI** at the owner's ask of 13 Oct — see sections 5 and 7 |
| `.github/workflows/ci.yml` | **one line and one expected count**, which is the only thing in this change the owner had to ask for (rule 5) |
| `web/src/lib/legal.ts`'s `OPTIONAL_PRIVACY` | **four paragraphs the owner accepts or strikes**, rendered by nobody |

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

**It was not fixed in the first commit on purpose.** The fix is one line in
`.github/workflows/ci.yml`'s `staging-script-selftests` job plus one expected count in its `env` block,
and **rule 5 says `.github/workflows/` changes only when the owner asks.** Adding a selftest
strengthens a check rather than weakening one, so this was a question rather than a refusal — and it was
filed as [#302](https://github.com/build-once/team-tasks/issues/302) so it did not live only in a
pull-request description.

**THE OWNER ASKED ON 2026-10-13, so it is done** — section 7's last subsection has the line, the
expected count and the workflow lint's output. **#302 closes with this change**, and the gap it records
is the one #167 and #102 both describe: a check that exists and runs nowhere.

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

---

## 7. The review of 2026-10-13, and every sentence that changed

**The coach read `web/src/lib/legal.ts` and found four sentences that stated more than the code or a
cited page supports.** All four are fixed, each has a row in `docs/claims.md` §7, and **each is held by
a check** — because a register without a check is a note.

| | The sentence | Why it was wrong | What it says now |
|---|---|---|---|
| **1** | "nothing anybody typed is lost" after a rebuild | **False.** A copy is a copy of a moment; everything after it is gone | the window `docs/backups.md` measured — "up to about a day and a quarter" on a normal night, "about two and a half days if a night's copy is missed", and **"we would not be able to tell you which it had been"**. Deliberately **not** the owner's "at most one day" target, which that page says "is NOT what this design delivers" |
| **2** | a usage count "kept for 7 days and then removed" | **Not true for somebody who does not come back.** The sweep is `where user_id = p_user_id`, so it runs only when that person uses the feature again — [#223](https://github.com/build-once/team-tasks/issues/223) | what happens: the counts go "once you use that feature again", and "if you stop using the app, the last few counts stay until you come back or your account is deleted". **#223 is named in the file**, and a check requires it |
| **3** | Sentry "never receives your email address, your task text, a team name, a file name or any sign-in token" | **Overclaims a limit the plan already records**: "A pattern scrub cannot recognise free text that no known phrase introduces" | three clauses, all about our own code: it **does not attach** them, it **removes the ones it can recognise**, and **that removal works by recognising patterns so it cannot promise to catch what it has no way of recognising** — which is why this app's own messages are written not to carry any of it |
| **4** | "`DHTA Ltd` is answerable" beside "There is no larger organisation behind it" | **A contradiction on a plain reading** — two true facts about different questions, arranged so each denies the other | one paragraph stating both: the company is answerable, one person runs it day to day, and that person can read the whole database — "so there is no support team and nobody else to escalate to" |

**Three of the four were reassuring**, which is worth naming as a pattern: a page about what an app
holds drifts towards comfort, and the sentences that need a check are the ones a reader would be
pleased to see.

### What was changed on the assistant's own re-read, in the same pass

**Eleven more, none of them caught by any check**, found by reading both arrays again with the question
"what makes this true?" rather than "does this read well?". Listed in full because an unlisted edit to
a legal document is an edit nobody reviewed:

| | Was | Now, and why |
|---|---|---|
| 1 | "The hash cannot be turned back into your password" | **"your password stored as a one-way hash rather than as the password itself"** — the original is a cryptographic claim about **somebody else's implementation**, and nothing in this repository establishes which algorithm Supabase Auth uses |
| 2 | "the app does not read it" (task text) | **"nothing checks what it says"** — the app **does** read it: it draws it on a screen, and Suggest subtasks sends a title to another company |
| 3 | the same phrase in the terms | the same fix, so the two documents cannot disagree |
| 4 | "neither can be switched off" (the two logs) | **"nothing in this app can remove a line from either"** — `docs/plan.md`'s own wording is "you cannot turn **most** of them off", which is a different sentence |
| 5 | "on this site" (the login emails through Resend) | **"on the live site"** — custom SMTP is production-only (decision M), so the original is false on a preview deploy, where those two emails are still Supabase's own sending |
| 6 | "for 30 days on its free plan" (Resend's log) | **"by Resend's own account of it"** added — it is Resend's figure, and answer 5's second consequence is that another company's practice stays attributed |
| 7 | "so the password typed into the box beside it is not part of this" | **"which we read as meaning"** added — it is an inference from Cloudflare's sentence, not Cloudflare's sentence |
| 8 | "Cloudflare holds a file it cannot open" | **"with a passphrase Cloudflare does not have, so what it holds is a file it cannot read"** — the reason, not just the conclusion, so a reader can judge it |
| 9 | "no data sold or shared" | **"none of it is sold, and none of it is used for advertising"** — "shared" could be read as contradicting the six companies named immediately above it |
| 10 | "we will delete it" (an account, on request) | **"we will delete it by hand. It is not instant, and it is one person doing it."** — it is a dashboard job, and today the database refuses to delete an account while any of that person's tasks still has a file, so the files come off first |
| 11 | "There is no consent banner, because there is nothing here to consent to" | **the reason the decision actually rests on**: "nothing listed above is used for analytics, advertising or profiling, and the rest is what makes signing in work" |
| 12 | "Error reports … can be deleted at Sentry on request" | **"Nobody has had to do this yet."** added — `docs/claims.md`'s verdict for that row is "not verified, and not yet tried" |
| 13 | "Every night an encrypted copy" | **"Most nights"** — the first scheduled run started **5h 57m 24s** late, and GitHub publishes that "some queued jobs may be dropped" |

**That is thirteen rather than eleven**, counted again here: items 2 and 3 are the same fix in two
documents, and item 13 belongs with fix 1 above as well as on its own. **Counted in this session, not
carried.**

### What the checks gained

**Four new checks, and one new refusal**, taking section 11 from nine to **thirteen** and the script
from 306 to **310**:

- **the sixth MUST NOT SAY pattern**: `never receives`, `never sees`, `never gets` — in
  `scripts/screen-state-check.mjs` and in the staging script, so it is refused in the source **and** on
  the rendered page;
- **a check that the four fixed sentences are gone and their replacements are there**, by absence and
  presence together — because a fix that only checks the absence would pass on a page that said nothing
  at all;
- **a check that the backup figure is the one `docs/backups.md` measured**, read from that page rather
  than copied, so a revised measurement turns this red instead of leaving the page carrying an old
  number;
- **a check that the usage-count paragraph names #223**;
- **and a check that the four optional paragraphs reach no page**, including that `[COMPANY NUMBER]`
  appears nowhere either page can draw it.

**Two of the four new checks went red on their own expected values first**, and both were findings
about reading a prose file as text: `docs/backups.md` wraps its own sentence across a newline between
"about a day" and "and a quarter", and the governing-law literal check tripped on the optional
paragraph for the registered details — **a different fact that happens to name the same place**, which
is the reason it was narrowed to the sentence rather than coupled through one constant.

### And the one check this change adds to CI, which the owner asked for

**`scripts/staging/build-it-26-legal-pages-checks.mjs` is now named in CI's
`staging-script-selftests` job**, with `EXPECTED_LEGAL_PAGES_CASES: "17"`.

**Rule 5 says `.github/workflows/` changes only when the owner asks, and the owner asked on
2026-10-13** — which is why section 5 above was filed as
[#302](https://github.com/build-once/team-tasks/issues/302) and left undone rather than slipped in on
the reasoning that adding a check is harmless. `node scripts/check-workflows.mjs` after the edit:
**6 workflow files, 27 jobs, 0 problems, 0 warnings.**
