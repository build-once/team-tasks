# Evidence: the anti-robot check, switched on — staging and production, 11 October 2026

Result: **PASS for the thing the whole feature rested on — Supabase Auth refuses a sign-in that
carries no CAPTCHA token.** It answers HTTP **400**, code **`captcha_failed`**, which is the code the
three screens already have a sentence for. **FAIL for nothing.** **STILL UNVERIFIED: decision F** —
what the dashboard field called "token refreshes" actually covers — and five of the eleven things
[#285](https://github.com/build-once/team-tasks/issues/285) asks the owner to observe.

Date: 2026-10-11 (recorded 2026-10-12)
Issues: [#284](https://github.com/build-once/team-tasks/issues/284) (part 1),
[#285](https://github.com/build-once/team-tasks/issues/285) (the eleven),
[#281](https://github.com/build-once/team-tasks/issues/281) (the inventory and the thirteen decisions)
Recorded by: the coding assistant.

---

## 0. WHO SAW WHAT, and this section is the most important one in the file

**Nothing below was run, opened or observed by the assistant.** No MCP connector and no browser tool
was used in the session that wrote this file; no command was run against staging or production; no
dashboard was opened. **Rule 19 permits the assistant no production command at all**, and the
instructions for this change forbade the connector and the browser in as many words.

| What | Who |
|---|---|
| Both runs of `scripts/staging/build-it-25-captcha-checks.mjs` against **staging** | **The owner** |
| Switching CAPTCHA on, on staging and then on production | **The owner**, in each Supabase dashboard |
| Correcting `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel, and the redeploy | **The owner** |
| Replacing the two email templates on production | **The owner** |
| Every browser observation — the widget, the sentences, the reset link in a second browser | **The owner** |
| Three attempted reads of the Auth logs on both projects | **The coach (claude.ai)**, through the read-only connectors |
| Reading the conclusions of CI run 38165493741 with `gh run view --json` | **the assistant** |
| Reading **this pull request's own check results** — which corroborate two of the owner's reports from outside. **Section 9**, and it is the only independent evidence here | **the assistant** |
| Reading the sentences and the arithmetic quoted below out of this repository | **the assistant** |

**So every figure, status and code below is REPORTED, not observed here — with one exception, which is
section 9.** Where this file says a number is consistent with something, that is the assistant checking
the owner's report against this repository's own code, which is a different and weaker thing than
having watched the request. **Section 9 is different**: this pull request's own CI signed in to staging
three times with the dummy token and built a Vercel Preview, both of which only work if two of the
owner's reports are true.

**The production project's reference is not written in this file**, for the reason
`evidence/production-log.md`'s header gives about itself: it is already in `.claude/guard/local.json`
and repeating it spreads it for no gain. Staging is named as "staging" for symmetry, though its
reference is already written openly in `scripts/staging/build-it-25-captcha-checks.mjs`.

---

## 1. STAGING — the before-and-after pair, which is what makes the second run mean anything

The owner ran `scripts/staging/build-it-25-captcha-checks.mjs` twice: once before switching CAPTCHA
on for staging, and once with `--after` afterwards. Between the two runs the owner enabled CAPTCHA
protection in staging's **Authentication → Bot and Abuse Protection**, provider **Cloudflare
Turnstile**, with **Cloudflare's dummy secret key `1x0000000000000000000000000000000AA`** — which is
row 6 of `docs/rate-limits.md` section 3, and decision **I**.

| | Before | After (`--after`) |
|---|---|---|
| **Reported totals** | **3 PASS, 0 FAIL, 1 UNVERIFIED** | **4 PASS, 0 FAIL, 1 UNVERIFIED** |
| 1. a sign-in carrying **no** CAPTCHA token | **accepted (200)** | **REFUSED — HTTP 400, code `captcha_failed`** |
| 2. a sign-in carrying Cloudflare's **dummy** token | accepted | **accepted** |
| 3. thirty-one wrong passwords from one address | **no 429** | **no 429** |
| 4. what the run touched | sign-in and local sign-out only | the same |

### 1.1 The answer, and it is the one the whole design rested on

`docs/rate-limits.md` section 5 called this "the sharpest thing on this list" and
`docs/plan.md` called it "the most important sentence missing from this design":

> **Whether Supabase Auth refuses a sign-in that carries no CAPTCHA token, once CAPTCHA is on.** The
> CAPTCHA page says what to switch on and **does not say what happens to a request that arrives
> without one**. If the answer is "it is accepted", the whole thing protects nothing.

**It refuses. HTTP 400, `captcha_failed`.** So the widget on the screen is not the only thing in the
way, and something posting to `/auth/v1/token` by hand does not walk past it. **That is the finding
this build was for**, and it came from one request.

**And the code is the one the app already has words for**, which is the second judgement the script
makes on purpose. `REFUSAL_SENTENCES.robot_check` in `web/src/lib/auth-messages.ts:137-138` is:

```
The check that you are not a robot did not pass. Reload the page and try again.
```

and `captcha_failed` is mapped to it on all four screens that choose a refusal —
`web/src/lib/auth-messages.ts:225`, `:245`, `:289-290`, `:315`, read in this session. So a person on
`/login`, `/signup` or `/auth/confirm` gets that sentence rather than the generic one, and nothing in
`web/src/lib/auth-messages.ts` had to change.

### 1.2 The arithmetic of those totals, checked against the script rather than taken on trust

The two totals are not round numbers, and they are the ones this script's own judgements produce for
exactly this pair of worlds. Read out of
`scripts/staging/build-it-25-captcha-checks.mjs` in this session:

| | Why that total |
|---|---|
| **Before: 3 PASS, 1 UNVERIFIED** | `judgeNoToken(answer, false)` returns **one** judgement (`:258-269`), PASS for an acceptance. `judgeDummyToken` → PASS. `judgeRateLimit` with no 429 → **UNVERIFIED** (`:372-385`). `judgeTouchedNothing` → PASS |
| **After: 4 PASS, 1 UNVERIFIED** | `judgeNoToken(answer, true)` returns **two** judgements for a refusal (`:284-306`) — the refusal itself, and whether the code is `captcha_failed`. **Both PASS is only possible if the code really was `captcha_failed`**: the second answers UNVERIFIED for any other code (`:298`). So the total is itself a check on the reported code |

**That is the strongest thing this file can say without having watched the request**, and it is worth
saying: the owner reported a code, and the owner's reported pass count independently implies the same
code. A different code would have made the after-run **3 PASS, 2 UNVERIFIED**.

### 1.3 What the dummy token being accepted buys, which is why CI still works

`XXXX.DUMMY.TOKEN.XXXX` is accepted on staging **with CAPTCHA switched on**. That is Cloudflare's
matched pair doing its job — "Test secret keys: Only accept the dummy token, reject real tokens" — and
it is what keeps the nine automated sign-ins in this repository working. Decision **J**'s constant,
`scripts/lib/captcha.mjs`, is now a thing CI depends on rather than a precaution.

### 1.4 Check 3 found nothing, and the reason is arithmetic rather than a gap

**No 429 in 31 attempts, on both runs.** The script's own UNVERIFIED message names the two possible
causes, and **the first one is what happened**: staging's token-endpoint limit has not been lowered.
`docs/rate-limits.md` records both projects at the documented default of **150 requests per 5
minutes**, so **31 attempts cannot reach it** — and 31 was chosen for a limit of 30, which is set
nowhere.

So check 3's UNVERIFIED is correct and carries no information about decision F either way. **It must
not be read as "no limit was found".** Section 3 below, and the new issue it names, is what would
settle it.

---

## 2. PRODUCTION — and the first sign-in was refused, which turned out to be the useful part

### 2.0 The pipeline run that put part 1 there

**Verified by the assistant**, with `gh run view --json`, not inferred from a green tick. Run
[38165493741](https://github.com/build-once/team-tasks/actions/runs/38165493741), event `push`,
head `aff6ca1b375bec3b9ba0993ecbe9ba9946d3fe70` ("Merge pull request #289"), created
2026-10-11T18:50:26Z, finished 18:51:07Z, **conclusion `success`**. All three jobs `success`:

```
Apply migrations to production        success   (part 1 carries no migration)
Deploy server functions to production success
Smoke-test production from outside    success
```

Every step inside all three reported `success`, including "Apply migrations to production", "Deploy
every function to production", "Every server function refuses a signed-out call" and "The production
site answers".

### 2.1 What the owner did, in order, and what the app said at each step

All reported by the owner.

1. Enabled CAPTCHA protection on production with the **real** secret key from the Turnstile widget —
   row 9 of `docs/rate-limits.md` section 3.
2. **The first sign-in was refused**, with:

   ```
   The check that you are not a robot did not pass. Reload the page and try again.
   ```

3. **The cause, read off the live page: Cloudflare's own "For testing only" line was showing** — so
   the production build was serving **the dummy site key**, not the real one.
4. Turned CAPTCHA **off** on production.
5. Corrected the **Production** value of `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel to the real site
   key, and **redeployed production**.
6. Turned CAPTCHA **on** again, and **signed in**.

### 2.2 THE THING THAT WENT WRONG IS ALSO THE THING THAT PROVED THE MOST

**A real secret key was seen to reject the dummy token, on production.** That is
[#285](https://github.com/build-once/team-tasks/issues/285)'s ninth condition, and
`docs/plan.md` asks for it in these words:

> **post to production's token endpoint with the dummy token**, using a wrong password for an address
> that has no account, where a real secret key must reject the dummy token — so a CAPTCHA refusal
> rather than "wrong password" is what says the check is actually running.

**It happened by accident, through a browser, with a real account and a correct password** — which is
not the request that was designed, and settles the same question in a stronger way. The point of that
condition is to tell **"CAPTCHA is configured"** from **"CAPTCHA is configured and actually being
checked"**. A correct password that was refused *for a CAPTCHA reason* can only mean the second: the
password path was never reached, so something checked the token and rejected it. Cloudflare's own
sentence is why — "Production secret keys will reject the dummy token."

**What it does NOT establish**, said plainly because the accident is easy to over-read:

- **not** that a *real* visitor's real token is accepted by a *bot*-like request — nothing here tests
  Cloudflare's judgement, only that a token is checked at all;
- **not** the designed request. Nobody has posted to production's token endpoint by hand with a wrong
  password for a non-existent address, so #285's ninth condition is answered **in substance and not in
  form**. The by-hand version remains the cheap repeat if anybody wants it;
- **not** anything about the sentence being correct *in that situation*. It was the right sentence for
  a CAPTCHA refusal and the wrong diagnosis for the person reading it: nothing had failed about them,
  and "Reload the page and try again" was advice that could not have worked. See section 4.

### 2.3 AND IT IS A BUILD THAT SHOULD NOT HAVE BEEN POSSIBLE, which is issue (a)

`web/src/lib/env.ts:152-176` already refuses a Vercel Production or Preview build whose site key is
**empty**. It accepts one whose site key is **Cloudflare's published dummy** — a value this repository
spells out, in `web/src/lib/turnstile.ts:105`, as
`TURNSTILE_DUMMY_SITE_KEY = "1x00000000000000000000AA"`.

So the one mistake the guard exists to prevent — a Production deploy whose three sign-in screens
cannot produce a token a real secret will take — is the mistake it let through. **The failure was not
silent**, which is the one good thing about it: it refused everybody loudly, at sign-in, with a
sentence on the screen. It cost the owner a diagnosis and two dashboard round-trips, and on a day with
volunteers on the app it would have cost them the app.

**Filed, not fixed here**: [#290](https://github.com/build-once/team-tasks/issues/290). Nothing in
this change touches `web/src/lib/env.ts`.

### 2.4 The two email templates, and a reset link that worked in a second browser

Reported by the owner. The **"Reset Password"** and **"Confirm signup"** templates on **production**
were replaced with the two bodies in `docs/rate-limits.md` section 3 → "The two email templates, word
for word" — rows 12 and 13. Then:

> a reset requested **in one browser**, the link opened **in a different browser**, the button
> pressed, a new password set, and signed in with it.

**That is what Build it 25's "Login emails that work in any browser" was for**, and on 11 October the
owner had watched the opposite happen on production: a PKCE `code=` link opened in a second browser
was accepted by Supabase (303) and the app said "That link didn't work". The whole chain is now
observed end to end on production: the template, the `/auth/confirm` page, the button, `verifyOtp`,
the marker cookie, `/reset-password`, and a sign-in with the new password.

**Three things in that chain were observed and three were not.** Observed: the link worked in a
second browser; the button's press did the work; the new password took. **Not** observed, and all
three are still #285's:

- **a mail scanner fetching the new link first, and the person then using it.** This is what
  `/auth/confirm` exists for — the page calls Supabase nowhere, which
  `scripts/auth-screens-check.mjs` asserts — and nobody has watched the sequence;
- **a sign-up confirmation link**, either half. The template was replaced; no sign-up was made;
- **nothing about redirect URLs needed adding**, which is section 5 below.

### 2.5 Leaked-password protection — row 10, still open

**Not confirmed on.** The owner has not reported it as set, and it is left open. It is decision **G**
and row 10 of `docs/rate-limits.md` section 3, and nothing in this repository can read it.

---

## 3. DECISION F IS NOT ANSWERED, AND NO RATE-LIMIT FIGURE HAS BEEN CHANGED ON EITHER PROJECT

**Reported by the owner: by-hand row 11 is on hold.** Both projects' Authentication → Rate Limits
pages are still at the documented defaults — the same state decision **D**'s reading found on 11
October. So:

- **decision E** — sign-ups and sign-ins, 5 per 5 minutes, from a default of 30 — **is set nowhere**;
- **decision F** — the token endpoint, 30 per 5 minutes, from a default of 150 — **is set nowhere**;
- and the question underneath F is untouched: **whether the dashboard field labelled "token refreshes"
  is the documentation's "Token endpoint requests" row**, which covers a password sign-in, **or
  something narrower**. If it is narrower, nothing editable limits password guessing at all.

**This is the right order and not a delay.** Row 11 is last on the by-hand list on purpose —
"Lowering a limit is the change most likely to lock somebody out" — and row 11's own text says to read
the help text beside that field **before** setting it. Holding it until the question is answered is
that instruction being followed.

**Filed**: [#291](https://github.com/build-once/team-tasks/issues/291), which carries what Supabase's
documentation does and does not say, and a measurement that settles it **without changing any setting
and without touching CI's budget**.

---

## 4. The two browser observations, including the one that was the OLD code behaving correctly

Both reported by the owner, both on Vercel previews.

| Preview | What was seen | What it means |
|---|---|---|
| **`6f94868`** — the head of part 1's branch | **Cloudflare's box was shown.** Alice signed in. A wrong password showed `That email and password don't match. Check them and try again.` | **A rendered widget has now been seen**, which no row in `docs/claims.md` §1i could say before. And the wrong-password sentence is the one sentence #284 required **not** to change — `web/src/app/login/page.tsx:72`, read in this session |
| **`5cd9e60`** — an older preview, with **none** of the CAPTCHA code | The **same** wrong-password sentence, for what must have been a CAPTCHA refusal | **Expected, and it is the old behaviour by construction.** `git log` shows `web/src/lib/auth-messages.ts` and `web/src/app/components/CaptchaGate.tsx` arriving in `d7b19c6`, which is after `5cd9e60` — so that build had no `captcha_failed` mapping and `signIn` had **one** failure path. It drew the password sentence for every refusal, which is the thing #284 repaired |

**Why the second row is written down at all, rather than dismissed.** It is the clearest available
demonstration of what the old code did wrong: a refusal that had nothing to do with the password,
reported as a password that did not match. It is **not** a defect in anything merged, and anybody
re-reading this file should not go looking for one. **An old preview is a live copy of old code**, and
that is the general lesson worth keeping — a preview URL that still answers is not evidence about
`main`.

**And one thing the production refusal in section 2.1 says about the new code, which is not a
complaint.** `The check that you are not a robot did not pass. Reload the page and try again.` was the
**correct** sentence for the code Supabase sent, and **useless advice** in that situation: reloading
could not have helped, because the build itself carried the wrong key. No sentence chosen from an error
code could have known that. The honest fix is the build guard in
[#290](https://github.com/build-once/team-tasks/issues/290), so the state never reaches a screen —
**not** a vaguer sentence, which would be the shape `web/src/lib/teams.ts` argues against at length.

---

## 5. THE EMAIL TEMPLATES CANNOT BE CHANGED ON STAGING AT ALL, and that is decision M's bill arriving

**Reported by the owner: the Supabase dashboard locks the email templates while the project uses the
built-in sender.** Staging uses the built-in sender, and **decision M** is that it keeps it — so rows
12 and 13 of `docs/rate-limits.md` section 3 are **production-only in practice**, not "both projects".
That correction is made in that file in this change.

**So `/auth/confirm` was never tried on staging, and cannot be until decision M changes.** The one
place the token-hash link could have been exercised where a mistake is cheap is closed to it.

**This is the same cost decision M already carried, arriving somewhere nobody had looked.**
`docs/plan.md` states it about the sender: *"the first time this arrangement is exercised is on
production."* It is now true of the **emailed links** as well — and that is not a new decision, it is
the one the owner took on 11 October with the reasons in front of them. The reasons have not weakened:
a staging project with custom SMTP would be a second place holding a credential that can send email as
this app, for no benefit, because nothing on staging needs a real person to receive anything.

**What it costs, stated rather than discovered later:** the production template edit of section 2.4 was
made against a path nobody had served a link to anywhere, and it worked. Had it not, the first person
to find out would have been somebody resetting their password on production.

### Redirect URLs — nothing needed adding, on either project

Reported by the owner, read off both dashboards. **`docs/environments.md` has been carrying
"Unverified — what is on either project's allow-list today" since 3 October; this answers it**, and
that file is corrected in this change.

| | Site URL | Redirect URLs |
|---|---|---|
| **Staging** | `http://localhost:3000` | `http://localhost:3000/**` and `https://*-info423.vercel.app/**` |
| **Production** | `https://team-tasks-virid.vercel.app` | `https://team-tasks-virid.vercel.app/**` and `.../auth/reset` |

**Row 12 is done by being unnecessary, and the reason matters more than the row.** It asked for
`/auth/confirm` to be added "for every address the app is served at". Nothing was added, because **the
`/**` wildcard entries already cover it** — on both projects. So the row is satisfied, and the thing
to notice is that the allow-lists were already permissive enough that a new path needed no entry. That
is convenient here and is not obviously the setting anybody would choose on purpose; it is recorded
rather than acted on, because an allow-list is the owner's and narrowing one would be a change nobody
has asked for.

---

## 6. The coach could not read either project's Auth logs — three attempts, no data

**Reported by the coach.** Three calls through the **read-only** connectors, on **both** projects, to
read the Auth logs. **Every call returned a backend error and no data.**

**Why it was wanted.** An Auth log read is the one thing that could have shown the *paths, statuses and
codes* of the requests behind sections 1 and 2 — the same reading that produced #284's three
observations on 11 October. Without it, every status and code in this file is the owner's report and
the script's output, and nothing independent corroborates them.

**It is an attempted read that returned nothing, and it is recorded as that in
`evidence/production-log.md`** rather than left out. Rule 8: a check that could not run is not a pass,
and an attempt that returned no data is not an absence of attempts. **No cause is established** — the
connector reported a backend error and nothing here can say whether that is the log retention, the
project, the connector or the service.

**What would settle the thing it was for**: either the same read working later, or the owner reading
Logs → Auth in each dashboard and reporting paths, statuses and codes only. Neither is the
assistant's.

---

## 7. #285's eleven, scored

| # | What | Where it stands |
|---|---|---|
| 1 | Staging, before: no token **accepted** | **DONE** — §1 |
| 2 | Staging, after: no token **refused**, and the code written down | **DONE — HTTP 400, `captcha_failed`** — §1.1 |
| 3 | Both runs: the **dummy token accepted** | **DONE** — §1.3 |
| 4 | Which attempt a 429 arrives at, and so what "token refreshes" covers | **NOT DONE.** 31 attempts against a budget of 150, both runs, no 429. [#291](https://github.com/build-once/team-tasks/issues/291) — §1.4, §3 |
| 5 | A reset link opened in a **different browser** | **DONE, on production** — §2.4 |
| 6 | The same link **fetched by a mail scanner first**, then used | **NOT DONE** — §2.4 |
| 7 | A **sign-up** confirmation link, both checks | **NOT DONE** — the template is in place, no sign-up was made — §2.4 |
| 8 | Production's sign-in page with **JavaScript off** | **NOT DONE** |
| 9 | Production's token endpoint posted to with the **dummy token** | **ANSWERED IN SUBSTANCE, NOT IN FORM.** A real secret was seen to reject the dummy token on production, through a browser and by accident — §2.2 |
| 10 | A **rendered widget** looked at, on a phone, and whether Cloudflare's branding appears | **HALF.** A widget was seen on a Preview and the dummy key's "For testing only" line was seen on production. **Not on a phone, and no branding note** — §2.3, §4 |
| 11 | `docs/claims.md` §1i's "NOT VERIFIED" paragraph removed or narrowed | **NARROWED in this change** — a widget has been rendered; the phone and the branding are what is left |

**Five of eleven done, one answered sideways, one half, four not started.** #285 stays open.

---

## 8. What is still UNVERIFIED, in full (rule 8)

Nothing here is a hedge; each line names what would settle it, and every one is the owner's.

| What | Why it could not be settled here | What settles it |
|---|---|---|
| **What the dashboard field "token refreshes" covers** | no figure has been changed on either project, and 31 attempts cannot reach a limit of 150 | [#291](https://github.com/build-once/team-tasks/issues/291): the help text beside the field, or 151 wrong-password attempts from the owner's own machine against staging |
| **That decisions E and F are set at all** | row 11 is on hold | the owner, after #291 |
| **Leaked-password protection** (decision G) | not reported as set | the owner, row 10 |
| **That a mail scanner's fetch now spends nothing** | nobody has watched the sequence | the owner's own mail provider, and one reset email |
| **A sign-up confirmation link, end to end** | no sign-up has been made on production | one sign-up to the test mailbox — which also settles whether production delivers to a non-team address |
| **Production's sign-in page with JavaScript off** | nothing here opens a browser | the owner |
| **A widget on a phone, and whether Cloudflare's branding is on it** | the two sightings were on a desktop, and branding was not noted | the owner, on a phone |
| **Everything in sections 1, 2, 4 and 5** | **the assistant observed none of it.** No connector, no browser, no command against either project | it is already the owner's report; the Auth log read of §6 is what would corroborate it |
| **Whether `verifyOtp` refuses a token of the wrong kind** | unchanged by anything here | [#287](https://github.com/build-once/team-tasks/issues/287) |

---

## 9. AND TWO THINGS THIS PULL REQUEST'S OWN CI CORROBORATED, WHICH IS THE ONLY INDEPENDENT EVIDENCE IN THIS FILE

**Added after this change's checks ran. Read by the assistant from the public check results of run
[38220333124](https://github.com/build-once/team-tasks/actions/runs/38220333124)** — event
`pull_request`, head `08344f4`, created **2026-10-12T07:53:54Z**, **every check `pass`**. The assistant
started nothing, holds no credential of either project, and read nothing but the run's own status.

**Section 0 says every figure in this file is reported rather than observed. These two are the
exception**, and they land on the two reported facts that mattered most:

| What CI did | What it corroborates |
|---|---|
| **`App tests (access rules on staging)` passed** — the one job in this repository that signs in to a real project, **three accounts**, each sending Cloudflare's dummy token from `scripts/lib/captcha.mjs` | **That staging's CAPTCHA is on AND that the dummy pair works.** On PR #289's run the same job passed with CAPTCHA **off**, where the token field is simply ignored — so that run said nothing. This run is **after** the owner switched CAPTCHA on with the dummy secret key, and three sign-ins still succeeded. **Had the secret been a real one, or the field been in the wrong place, this job would be red.** It is check 2 of §1, seen from outside |
| **`Vercel` passed — "Deployment has completed"** | **That `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is now set for Vercel Preview.** On PR #289 this deploy **failed**, and `evidence/build-it-25-sign-in-screens.md` section 8a reproduced the only cause that change could have: a Preview build with no site key is stopped by `web/src/lib/env.ts`. The setting did not exist then; this Preview built, so it exists now. **Row 7 of the by-hand list, observed rather than reported** |

**What neither of them says.** Nothing about **production** — CI never touches it, and the one production
fact in this file remains the owner's report. Nothing about the **real** keys, the Turnstile widget's
mode, or anything a browser would show. And `App tests` passing is **not** evidence that a tokenless
sign-in is refused: it only ever sends the token.

**Why this is worth its own section rather than a footnote.** `docs/rate-limits.md`'s own coda says
reading a sentence in this repository tells you what somebody saw when they wrote it. A green check on
**this** pull request is the opposite kind of thing: a running project answering today, read off a public
log. It is the only such thing in this file, and it is small — which is the honest size of it.

---

## 10. Redaction (rule 18)

**Three values were given to the assistant in this session that are not written in this file**, and
they are named rather than printed:

| Value | Where it came from | Why it is not here |
|---|---|---|
| The **production project reference** | the owner, in chat | `evidence/production-log.md`'s header: it is in `.claude/guard/local.json` and repeating it spreads it for no gain. This repository is public. **A command that contained this literal was refused by the guard in this session** — see the pull request |
| The **real Turnstile secret key** | never given, and never asked for | it is a secret, it belongs only in a Supabase project's Auth settings, and rule 7 keeps it out of every file |
| The **real Turnstile site key** | never given | it is public, and this repository holds names and not values (`docs/environments.md`) |

**No password, token, link, address or row of anybody's data was captured.** The two reset emails in
§2.4 carried a live credential each; neither link, nor any part of one, was given to the assistant or
is written here.

**Two values in this file look like credentials and are not**, and both are Cloudflare's own published
test values, already in this repository on purpose:

| Value | What it is |
|---|---|
| `1x00000000000000000000AA` | the dummy **sitekey**, which always passes — `web/src/lib/turnstile.ts:105` |
| `1x0000000000000000000000000000000AA` | a dummy **secret** key, which accepts only the dummy token — `docs/rate-limits.md` section 3 row 6, a document and not code |

**One address is written: `https://team-tasks-virid.vercel.app`**, in §5. It is the production site's
own public address, which anybody can read off the app, and it is written because an allow-list entry
is meaningless without it.
