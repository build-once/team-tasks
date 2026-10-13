# Evidence: Build it 26 PR 1 — the privacy page and the terms

Result: **PASS, and the production AFTER run is now done as well.** Nothing in this file is outstanding
except a screenshot: PR #303 merged, the owner ran the script against production and got **PASS on both
paths**, and the owner read both pages and looked at them **on a phone**. Section 9 is that run.
Date: 2026-10-13, and updated the same day three times — once for the review of the wording (section 7),
once because **the owner ran the script and it misreported what it found** (section 8), and once after
the merge for the production AFTER run and the phone (section 9).
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
25 logic cases, 0 wrong.
PASS every judgement can fail: 25 cases, including each of the six sentences docs/claims.md marks
MUST NOT SAY, an unfilled placeholder reaching a page, and -- told apart by HOST and checked on the
SENTENCE, not just the verdict -- Vercel's own gate against this app's own /login
```

Exit code **0**. **15 cases at the first commit, 17 after the review of the wording, 25 after the
owner's run found the script misreporting Vercel's gate** — section 8.

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

1. ~~**No screen has been opened.**~~ **THE LAPTOP HALF IS DONE, 2026-10-13**: the owner opened
   `/privacy` and `/terms` on the Preview at `bdc9f83`, **signed out of the app**, and both opened.
   **The phone is still unchecked**, which is the device `docs/plan.md` says this app is for — two long
   documents on a narrow screen is the layout nobody has looked at, the same item
   `evidence/build-it-23-attachments-screen.md` has carried about the files panel since 9 October. No
   screenshot of either.
2. **No deployed build has been fetched by the script and passed.** `PUBLIC_PATHS` is a list in a
   module; the thing that reads it runs in the Edge runtime, on a request. Section 2.1 proves the list;
   only a `GET` proves the Proxy — and **the only address a script can read is production's**, which
   does not serve this change until it is merged (section 8). **The owner's browser is what stands in
   for it until then**, and it is a person's reading rather than a check.
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

## 6. The before/after the owner runs — CORRECTED 2026-10-13, and BOTH RUNS ARE PRODUCTION

**This section said the AFTER was against this branch's Vercel Preview. That was wrong, the owner found
it by running it, and section 8 is what happened.** A preview cannot be read by a script at all.

Two runs of one command, each taking a public web address and **no secret of any kind** — the script
has none, sends two `GET` requests, and creates, sends and spends nothing.

**BEFORE** — production, **before the merge**. **DONE: the owner ran it and got FAIL on both paths**,
which is the expected before:

```sh
node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
```

**AFTER** — production, **after the merge**. The same line, against the same address:

```sh
node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
```

Expect **PASS on both** — status 200 signed out, both headings, and every required phrase.

**Why the after cannot come earlier**, which is the cost of the correction rather than a preference:
the only address a script can read is production's, and production does not serve this change until it
is merged. **So the deployed half of this evidence is written after the merge, not before it** — and
what stands in for it beforehand is the owner opening the Preview in a browser, which is the next
paragraph and which the owner has now done.

**And one thing no script can do: open both pages in a phone browser and read them.** That is the
check that answers 3 and 4 of section 4, and it is the one worth doing last and carefully. **The laptop
half is done** — section 8.

---

## 8. The owner's run of 2026-10-13, and the script was wrong about it

**Reported by the owner. Nobody writing this opened a browser or made a request.**

| What | What happened |
|---|---|
| The script against **production** | **FAIL on both paths** — the expected BEFORE |
| The script against the **Preview at `bdc9f83`** | **FAIL on both**, reported as `redirected to /login`, with bodies of **334009** and **334001** bytes |
| The owner then opened **`/privacy` and `/terms` on that Preview in a browser**, **signed out of the app** | **both pages opened** |

**Both of those are true, and the script's conclusion was false.** It said the paths were missing from
`PUBLIC_PATHS`; a page cannot both be missing from that list and open for a signed-out visitor.

### What it had actually met, confirmed from both sides

**From Vercel's own documentation**, [Deployment
Protection](https://vercel.com/docs/deployment-protection), read **2026-10-13**:

> "Deployment Protection lets you control who can access your preview and production URLs."

> "**Standard Protection**: Protects all deployments **except** production domains"

> "Deployment Protection requires authentication for all requests, **including those to Routing
> Middleware**."

**The third sentence settles it.** The gate runs **before** this app's Proxy, so `PUBLIC_PATHS` was
never evaluated and could not have been the cause. The second explains why production answered
differently from a preview. And of the method itself: "**Vercel Authentication**: Restricts access to
only Vercel users with suitable access rights" — the owner's browser was signed in to Vercel, which is
why the pages opened for a person and not for a script.

**From the script**, which is where the fault is: `judge()` compared `finalPath` and **ignored the
host**. Vercel's gate redirects to a path literally called `/login`, on `vercel.com`; this app's Proxy
redirects to `/login` on this app's own host. **The one string it matched on was the one string the two
cases have in common.** The **334 KB** body was a second signal it ignored — these two pages are a few
kilobytes, and 334 KB is somebody else's application.

### What changed

- **`judge()` compares the HOST first**, and `isVercelHost()` decides which sentence comes out:
  `vercel.com` or a subdomain of it gets **"Vercel's protection: this address cannot be checked from a
  script; check production after merge or open it in a browser signed in to Vercel"**, with the
  documentation's own sentence beside it and **`PUBLIC_PATHS` explicitly ruled out**. Any other foreign
  host gets "redirected off this address", which blames neither. **Only a redirect on our own host**
  points at `PUBLIC_PATHS`.
- **`fetchPage()` returns `finalHost`**, which the first version did not.
- **Eight new selftest cases, 17 → 25**, and the two that matter are **built from what was observed**:
  status 200, bodies of 334009 and 334001 bytes, a redirect to `/login` on `vercel.com`.
- **And the cases now check the SENTENCE, not only the verdict.** That is the lesson rather than the
  fix: the first version got the **verdict** right — FAIL on both — and the **explanation** wrong, which
  sent the owner looking at a list in this repository for something that is a setting in somebody
  else's dashboard. A case may now require a sentence to be present and another to be absent, and a
  case with the right verdict and the wrong words is **WRONG**.
- **`isVercelHost` is an exact match or a dot-suffix**, never `includes`: `notvercel.com` and
  `vercel.com.example.invalid` are not Vercel's, and **`team-tasks-virid.vercel.app` is not either** —
  that is `.app`, and it is where this app lives. Four cases cover those.
- **The owner steps and this file's section 6 are corrected**: the AFTER run is **production after the
  merge**.

### And Vercel's bypass is deliberately not used

Vercel documents "Protection Bypass for Automation" for exactly this case. **It is a secret**, which
would mean a secret on a command line — which rule 7 forbids outright. **A script that cannot read a
preview is the correct outcome**, not a limitation to work round, and the script now says so in the one
place somebody would look: its own output.

### The third time a comment tripped a check it was describing

Worth recording because it happened three times in one pull request, each time in the same shape: a
comment or an assertion **naming the string it exists to forbid**.

1. `longLiterals` counted the quotations inside file headers — fixed by stripping comments first.
2. The Vercel cases' `mustNotSay: "PUBLIC_PATHS"` **tripped on its own exoneration**: the note names
   `PUBLIC_PATHS` in order to rule it out. Narrowed to `missing from PUBLIC_PATHS`, the sentence that
   actually blames it.
3. The comment in `legal.ts` explaining that the registered-details placeholder was **deleted** spelled
   the placeholder, and section 11 refuses it anywhere in that file. Reworded to "a blank in square
   brackets".

**All three were the check being right.** None of them was a false positive.

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
`staging-script-selftests` job**, with `EXPECTED_LEGAL_PAGES_CASES: "25"`.

*That number said **17** in this file until 2026-10-13 and the workflow says **25**.* It was written when
the line was added and section 8's eight new cases arrived afterwards, in the same pull request — so the
sentence here went stale between two edits of one change. The workflow's value is the one that decides
anything, it is a floor (`-lt`), and `.github/workflows/ci.yml:719` is where it is. Corrected by reading
that line rather than by remembering it.

**Rule 5 says `.github/workflows/` changes only when the owner asks, and the owner asked on
2026-10-13** — which is why section 5 above was filed as
[#302](https://github.com/build-once/team-tasks/issues/302) and left undone rather than slipped in on
the reasoning that adding a check is harmless. `node scripts/check-workflows.mjs` after the edit:
**6 workflow files, 27 jobs, 0 problems, 0 warnings.**

---

## 9. AFTER THE MERGE — the production run, and the phone. 2026-10-13

**Reported by the owner. Nobody writing this opened a browser, made a request, or ran the script.** What
this session did verify for itself is the merge, with `gh pr view 303 --json`, and nothing else.

### 9.1 The merge

| | |
|---|---|
| Pull request | **#303**, "feat: a privacy page and terms -- every sentence in one file, and five it may never say" |
| State | **MERGED** |
| Merged at | **2026-10-13T08:56:44Z** |
| Merged by | **info423**, the owner — which is rule 2: the assistant never merges its own pull request |
| Merge commit | `2e2926a6fe179ed962f386752bc360efff512748` |

Read with `gh pr view 303 --json number,state,mergedAt,mergeCommit,mergedBy,title`. That is a read of
GitHub's own record of what happened, not a claim about what is deployed.

### 9.2 The AFTER run — PASS on both paths

The run section 6 has been waiting for, which could not happen before the merge because the only address
a script can read is production's:

```sh
node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
```

What the owner reports it printed:

| Path | Status | Bytes | Phrases expected | Verdict |
|---|---|---|---|---|
| `/privacy` | **200** | **50927** | **13** | **PASS** |
| `/terms` | **200** | **19646** | **4** | **PASS** |

**2 of 2 pages passed.**

**What that settles, and it is the one thing no check in this repository could:** a **signed-out** request
reaches both pages on production. `scripts/screen-state-check.mjs` section 11 proves `"/privacy"` and
`"/terms"` are in `PUBLIC_PATHS`; that list is a module, and the thing that reads it runs in the Edge
runtime on a request. Section 4 item 2 of this file is now answered.

**And it settles three smaller things in the same two requests**, because the judgement is not only about
reachability: the **headings** rendered, all **seventeen** required phrases survived the build and the
request, none of the **six** sentences `docs/claims.md` section 7 marks MUST NOT SAY appeared on either
rendered page, and **neither placeholder** reached a page.

**The pair is what makes it mean something.** Section 8 records the BEFORE: the same command, the same
address, **FAIL on both**, before the merge. A page that was always reachable would have passed both
times.

**The byte counts are worth keeping** for the reason section 8 gives about the 334 KB ones: these are the
sizes of *these two documents*, so a later run answering 334 KB again is answering about somebody else's
application rather than about this app.

### 9.3 The phone, which was the last thing section 4 was waiting for

**The owner read both pages and looked at them on a phone: "mobile view is fine".** So section 4's items
1 and 3 are answered — the laptop half was already done on the Preview at `bdc9f83`, and the phone is the
device `docs/plan.md` says this app is for.

**What that is, said exactly:** a person's reading, reported in a sentence. It is not a screenshot, it is
not a measurement, and no check in this repository can repeat it. **Item 4 of section 4 therefore stands:
there is still no screenshot of either page**, and the layout of two long documents on a narrow screen is
held by one person having looked once. That is the same shape
`evidence/build-it-23-attachments-screen.md` has carried about the files panel since 9 October.

### 9.4 What #204's three conditions now stand at

[#204](https://github.com/build-once/team-tasks/issues/204) is the gate on the production `AI_API_KEY`,
and `docs/plan.md`'s "The gate this does not move" lists the three things that must be true before the
owner installs it:

| | Condition | Where it stands |
|---|---|---|
| **1** | the consent setting **live on production** and **seen to refuse with it off, on production** | **STILL OPEN.** Staging has been seen to refuse (`evidence/build-it-21-ai-consent-function-and-screen.md`); production has **no profile rows at all**, because nobody has signed up. Nothing in this change moves it |
| **2** | **a privacy page exists in the app and is reachable from every screen**, carrying every item #204 lists | **MET.** Section 9.2 is the signed-out production read; the footer is in the root layout, which section 11's own check holds |
| **3** | **a row in `docs/claims.md` for each of those sentences**, naming the file and line that makes it true | **MET.** Section 7 of that file, with the location convention written down: a row is found by its **document and heading**, because every sentence lives in `web/src/lib/legal.ts` |

**So two of the three are met and the third is untouched**, which is what PR 1 was for and is the whole of
what it claims. **Nobody should read this section as clearing the gate.** Condition 1 needs a real account
on production, and `docs/plan.md`'s Build it 26 section says in as many words that this build "does not
deliver 1, and nothing in it should be read as doing so".

### 9.5 And one issue closes with the merge

[#302](https://github.com/build-once/team-tasks/issues/302) — the staging script being named in no CI job
— is answered by the line section 7 above records, which is now on `main`.
