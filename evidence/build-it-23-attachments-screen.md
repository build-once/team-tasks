# Evidence: Build it 23 part 2 — attachments on screen, and the tests

Issue [#242](https://github.com/build-once/team-tasks/issues/242). The database half is part 1
(`evidence/build-it-23-attachments-bucket.md`, issue #237), which is now **applied to staging and to
production** — appendix B of that file holds the owner's apply, the coach's read-back and the two script
runs either side of it.

---

## 0. What was run here, and what was not — read this first

**THE ASSISTANT RAN NOTHING AGAINST STAGING OR PRODUCTION.** Not one request. Every command in sections
3 to 5.4 is a local build, a local type check, a lint, or a pure-function script that connects to
nothing. Nothing was deployed and nothing was applied.

**CI IS A DIFFERENT MATTER, AND IT IS SAID HERE RATHER THAN LEFT TO BE NOTICED.** Opening the pull
request ran the `app-tests` job, which signs in to **staging** as Alice, Bob and Carol — it has done that
on every pull request since Build it 17, and section 5.4 is its result. So the 15 new tests DID run
against the real bucket, by the pipeline and on the owner's secrets rather than by me. That is the
established flow for this repository and not a step anybody took specially; it is flagged because
"nothing touched staging" would otherwise read as a claim about the whole change rather than about my own
commands.

**THE OWNER HAS OPENED THIS SCREEN ONCE, FROM A WINDOWS PC, AND ONE THING ON IT FAILED.** That is section
9, added in the follow-up commit of 9 October 2026: every step of the check list passed except attaching a
HEIC photograph, and the app no longer offers that type
([#246](https://github.com/build-once/team-tasks/issues/246)). The sentence here said "**nobody has opened
this screen in a browser**", which was true when it was written. **Still true: no phone, and no
screenshot of anything** — and the assistant has opened nothing at all.

| | Run here? | What it proves |
|---|---|---|
| `tsc --noEmit`, `eslint`, `next build` | **yes** | it compiles, and the bundle is clean |
| `scripts/screen-state-check.mjs` | **yes**, 286 checks | the numbers, the types, the sentences, and the migration's SQL agreeing with all three |
| `scripts/sentry-scrub-check.mjs` | **yes**, 119 checks | a stored file's path does not survive a scrub |
| `scripts/staging/build-it-23-attachment-checks.mjs --selftest` | **yes**, 107 cases | the two fixed defects, and that both fixes can fail |
| the same script against **staging** | **no** — the owner's step | the bucket's own limits, and the HEIC finding, against the real service |
| `web/tests/access-rules.test.mjs` | **not by me — BY CI, AGAINST STAGING, and all 40 passed.** Section 5.4 | the three policies, both sides of each |
| the screen in a browser | **not by me — ONCE BY THE OWNER, on a Windows PC.** Section 9 | seven of eight steps; **the HEIC step failed** |
| the screen on a **phone** | **no** | the device this app is for, and the layout nobody has seen |

**THE THIRD ROW CHANGED AFTER THIS FILE WAS WRITTEN, and it is the most important line in it.** It said
"**no** — it signs in to staging", which was true of me and not of the pull request: the `app-tests` job
has run on every pull request since Build it 17, so opening one ran the 15 new tests against staging.
**All 40 passed.** Section 5.4 is the result, with what each refusal actually answered — and it is a
better class of evidence than anything else in this file, because it is the real service rather than a
pure function.

---

## 1. What this change is

| | |
|---|---|
| **New** | `web/src/lib/attachments.ts` (pure: the numbers, the content-type table, every sentence), `web/src/lib/attachment-store.ts` (the four storage requests, each as the signed-in person), `web/src/app/tasks/AttachFile.tsx` (the upload box — the only client component in this app) |
| **Changed** | `web/src/app/tasks/page.tsx` (the files panel, the count on the row, the banners), `web/src/app/tasks/actions.ts` (`openFile`, `deleteFile`, and `deleteTask` clearing files first), `web/src/lib/tasks.ts` (three new link keys, `TASK_HAS_FILES_CODE`), `web/src/lib/buttons.ts` (two button ids), `web/src/lib/sentry-scrub.ts` (one rule), `web/src/app/components/ActButton.tsx` (a comment that was wrong), `web/src/app/tasks/tasks.module.css` |
| **Tests and checks** | 15 new tests in `web/tests/access-rules.test.mjs` and the storage helpers they need in `web/tests/staging.mjs`; 104 new checks in `scripts/screen-state-check.mjs` (95 with the screen, 9 more with the HEIC follow-up); 24 in `scripts/sentry-scrub-check.mjs`; 10 new selftest cases and two defect fixes in `scripts/staging/build-it-23-attachment-checks.mjs` |
| **NO MIGRATION** | Nothing in this change touches the database's shape. Everything it needs — the bucket, the three policies, the two counted limits, the trigger — was applied on 9 October 2026 |
| **One authorised change to a CI check** | section 3 |

---

## 2. The upload shape, and why it had to be the browser

`docs/architecture.md` left two shapes open and picked neither. The owner picked on 9 October 2026:
**the browser uploads straight to Storage, as the signed-in person.** That is
[#240](https://github.com/build-once/team-tasks/issues/240)'s question answered, and the reason is the
one that issue sets out:

- an upload with the **service-role key** is evaluated against **no policy at all** — "Service keys
  entirely bypass RLS policies" — so `public.attachments_may_add()` is never called and neither counted
  limit is reached;
- and such a file has **no owner**, so it belongs to nobody's 100 MB and nobody but the task's creator
  can delete it.

**So the limits the owner asked for "on the server" are the ones in the database**, reached because the
upload is made by somebody row-level security applies to. Searching `web/src` finds no secret key, no
`createSignedUploadUrl` and no `uploadToSignedUrl`; `scripts/screen-state-check.mjs` section 10h asserts
all four.

**What it costs, and it is in the pull request as well**: attaching a file needs JavaScript, and nothing
else in this app does. There is a `<noscript>` line beside the box saying so. Seeing a file, opening one
and deleting one all still work without it.

---

## 3. The one authorised change to a CI check, and the proof it is a narrowing

**This is the only thing in this change that touches `.github/workflows/`, and the owner authorised it
on 9 October 2026.** AGENTS.md rule 5 reserves that folder to the owner and forbids any change that skips
or weakens a check, so it gets its own section rather than a line in a diff.

**What happened.** Uploading from the browser puts `@supabase/supabase-js` in the browser bundle for the
first time — `web/src/lib/supabase/client.ts` existed and nothing imported it. **The library itself
contains the literal `sb_secret_`**: it ships a test for which kind of key a string is.

```
let sp=e=>e.startsWith("sb_publishable_")||e.startsWith("sb_secret_")
```

So the "No Supabase secret key in the built bundle" step matched it, and that step had passed on PR
#241's final run (`gh run view 37843678046`, App build → "No Supabase secret key in the built bundle" →
success), so this was the change's doing and not pre-existing.

**The change, and nothing else in that file:**

```diff
-          hits=$(grep -ranoE 'sb_secret_|service_role' .next/static)
+          hits=$(grep -ranoE 'sb_secret_[A-Za-z0-9]|service_role' .next/static)
```

**Why it is precision rather than a weakening.** A key is the prefix **followed by the key**, so every
real one still matches. The library's literal is the prefix followed by a quote, which is not a key and
never was. `service_role` is untouched. What it costs, stated: a string of the prefix and nothing else
would now pass — which is not a key, it is the prefix, and it grants nothing.

**Proved rather than argued.** A scratchpad script scanned the real build with both patterns and then fed
the new one three real key shapes and three non-keys:

```
files scanned: 29
OLD pattern hits: 1
NEW pattern hits: 0
  /chunks/1mh722qvej91-.js  old=1 new=0
  ok    a real key shape is still caught
  ok    a real key shape is still caught
  ok    a real key shape is still caught
  ok    not a key, and not caught
  ok    not a key, and not caught
  ok    not a key, and not caught

PASS: nothing in the bundle, and the pattern can still catch a key.
exit=0
```

The script is not committed: its fixtures are prefix-plus-letters strings, which gitleaks refuses in a
tracked file and which the pre-commit hook would block. The three key shapes it used were
`"sb_secret_" + "A" + "1b2c3d4e5f"` and two like it, assembled from pieces for the same reason
`scripts/sentry-scrub-check.mjs` assembles its fixtures.

And the real grep, run against the real build:

```
$ grep -ranoE 'sb_secret_[A-Za-z0-9]|service_role' .next/static
(no output)
```

---

## 4. The two defects in the staging script, both found by the owner's runs

The coach's record on PR #241 names both. Neither was a fault in the rules.

### 4.1 Section 15 reported a signed link in a kept body, and no link was printed

**The coach's first reading was the right one**: "the script is keeping the sign response before the link
is registered for scrubbing."

Every other value the script scrubs exists **before** the request that could carry it — a token, a user
id and an address all exist the moment somebody signs in. **A signed link does not exist until the answer
that carries it arrives.** So the order was:

1. ask for a link;
2. `readStorageBody` scrubs the body against the placeholders **as they are**, and the link is not among
   them;
3. the scrubbed copy is kept in `BODIES_SEEN`, with the live link in it;
4. section 5 then registers the link, for every **later** body;
5. section 15 checks every kept body against the link and finds it in the copy made at step 2.

Nothing was printed, and **the check was not wrong either**: a live credential really was sitting in a
string the run had kept. No number of `remember` calls afterwards can fix that — the copy is already
made.

**The fix.** `signedLinksIn(raw)` finds every credential-bearing string in the bytes that arrived, and
`readStorageAnswer` registers them **and then** reads. `storageJson` calls that one function.

**The fix lives in a pure function on purpose.** Written as two lines inside `storageJson` it would have
been correct and **unreachable**: that function makes a network request, so no selftest can drive it, and
the thing that went wrong would have had no check over it at all.

**SEEN TO FAIL.** With the registration removed from `readStorageAnswer`:

```
$ node scripts/staging/build-it-23-attachment-checks.mjs --selftest
  WRONG  THE WHOLE CHAIN, THROUGH THE FUNCTION THE RUN REALLY USES: an empty registry,
         the raw bytes in, a link issued, and nothing kept that carries it
            expected PASS, PASS, PASS; got PASS, FAIL, FAIL
  WRONG  and it registers the link ONCE however many answers carry it, so the count in
         section 15's detail line stays honest
            expected PASS; got FAIL
107 cases, 2 wrong.
exit=1
```

The `PASS, FAIL, FAIL` is the 9 October symptom exactly: the link was still issued (PASS) and the kept
copy carried it (FAIL). Put back:

```
$ node scripts/staging/build-it-23-attachment-checks.mjs --selftest
107 cases, 0 wrong.
exit=0
```

**And one more case holds the bug itself rather than the fix**: `THE 9 OCTOBER FAILURE, REPRODUCED` drives
the old order by hand — read and keep first, register afterwards — and requires FAIL. A selftest that only
asserted the fix would go green again the day somebody reintroduced the ordering somewhere else.

**The sentence changed too.** The judgement said "reached a printed line" and checks every body the run
**kept**, which is the set it could print. It now says "printed or kept". That wording is how the owner
came to read a FAIL about a link that was never printed with no way to tell whether the script or the
scrub was at fault.

### 4.2 Section 14 asserted the opposite of what staging does

**The finding**: a `.heic` name with **no** content type is refused with `InvalidMimeType`. Supabase works
the declared type out from the extension and does not map that one — so an iPhone photograph, the
commonest thing this feature exists for and the whole reason the owner added HEIC to the bucket's list on
8 October, was refused by the very bucket that had been widened to accept it.

**The old judgement was a probe**: `docs/plan.md` and #239 carried the question as not confirmed, and
`judgeHeicByExtension` answered PASS if the upload was accepted. With the answer known, that assertion
can never pass.

**It is now two checks, and the owner agreed to the change (rule 20).**

| | What it requires |
|---|---|
| 14a | a `.heic` name with no content type is **refused**, and refused carrying `InvalidMimeType` — so a refusal by row-level security instead is a FAIL, because then the type list was never reached |
| 14b | the same bytes under a `.heic` name **with `image/heic` set by the caller** are **accepted** — the BUCKET's answer. *(This row said "which is what the app's own upload path does". It no longer does: the owner tried a HEIC photograph through the app later the same day and it failed. §9 below.)* |

**It is not a loosening**, which is what rule 20 is about. The old judgement was recording an unanswered
question; these two assert more than it did, and 14a would turn red if a future Supabase started mapping
the extension, with a detail line saying where to read before changing anything.

**Six selftest cases cover them**, including both halves refused for the wrong reason.

### 4.3 The output had no section 5

It was a check and never a section: the signed-link open sat inside section 4's `else` and printed no
heading, so a reader counting sections found 4 then 6. It has a heading now, and **keeps the number 5**,
so every section below it keeps the number the owner's two runs referred to.

---

## 5. The checks that ran here, with their exit codes

Every one from the repository root, on Windows, with `(Start-Process … -PassThru).ExitCode` so the number
is the command's own.

### 5.1 The app compiles, lints and builds

```
$ npx tsc --noEmit            (in web/)
(no output)
exit=0

$ npx eslint                  (in web/)
exit=0

$ npm run build               (in web/, with CI's three placeholder settings)
✓ Compiled successfully in 3.3s
  Finished TypeScript in 4.3s
✓ Generating static pages using 15 workers (14/14) in 1032ms
exit=0
```

One type error was found and fixed on the way: `TASK_HAS_FILES_CODE` used in `actions.ts` and not
imported. It is in this file because a compile error nobody mentions reads as a build that never had one.

### 5.2 The pure-function checks

```
$ node scripts/screen-state-check.mjs
286 of 286 checks passed.
exit=0                                         (182 before this change)

$ node scripts/sentry-scrub-check.mjs
119 of 119 checks passed.
exit=0                                         (95 before)

$ node scripts/tasks-filter-check.mjs      47 of 47     exit=0
$ node scripts/password-reset-check.mjs    92 of 92     exit=0
$ node scripts/friendly-words-check.mjs    45 of 45     exit=0
$ node scripts/approved-model-check.mjs    6 PASS, 0 FAIL   exit=0
$ node scripts/check-workflows.mjs
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
exit=0
$ node scripts/drift-check.mjs --selftest  20/20       exit=0
$ node .claude/guard/selftest.mjs
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
exit=0
```

### 5.3 The two things seen to fail first

**The scrub rule.** With the file-path rule replaced by one that cannot match:

```
$ node scripts/sentry-scrub-check.mjs
103 of 119 checks passed.
16 FAILED:
  - A STORED OBJECT'S PATH: the task id stays, the file name goes
  - with the bucket in front of it, which is schema and stays
  - A NAME WITH SPACES IN IT, which is an ordinary file name and not an edge case
  - a name that is itself an address: it goes with the rest of the name, before the address rule ever sees it
  - A STORAGE URL: the host and the endpoint stay, the path goes
  - inside a JSON body, where it stops at the closing quote and the rest of the body survives
  - inside brackets, where it stops at the closing bracket
  - a CAPITALISED task id is still a task id -- Storage is not asked to agree about case
  - two paths in one bare sentence: the first match takes the second with it, so both names go
  - two paths in a JSON body, where the quotes keep them apart, and BOTH task ids survive
  - OVER-REACH, ON PURPOSE: a path in a bare sentence takes the rest of the sentence
  - a newline ends it, so only one line is lost
  - a path in the message
  - a path in an exception value, which is where a client's own error arrives
  - a path in request.url, which is where a failed fetch puts it
  - a path in a tag value
exit=1
```

**The leak fix**, in section 4.1 above.

### 5.4 THE 15 NEW TESTS, AGAINST THE REAL BUCKET ON STAGING — all 40 passed

**Run by CI, not by me**, in the `app-tests` job of run
[37941748170](https://github.com/build-once/team-tasks/actions/runs/37941748170) on pull request #245,
read with `gh run view --job 113857601832 --log`. This is the strongest evidence in this file, because it
is the real Storage service rather than a pure function.

```
# pass 40
# fail 0
App tests: 40 passed, 0 failed, 0 skipped, 0 todo; at least 40 expected to pass.
```

**And what each one actually answered**, from the run's own log lines — these are observations rather
than expectations:

| What was tried | What staging answered |
|---|---|
| Alice attaches a PNG to her own team task, content type set | `HTTP 200, and it is in the folder` — so the upload **and** the read-back |
| Carol lists the task's folder | 200, and the file is in it |
| Carol opens the file | 200, **byte for byte** — the length and the bytes both asserted |
| Bob lists the folder | `HTTP 200 with 0 entry(ies), and it is not one` |
| Bob opens the file | `HTTP 400 -- refused` |
| Bob deletes the file | `HTTP 400 code="AccessDenied", and the file is still there` |
| signed out, with the publishable key: list / open / delete | `HTTP 200 -- nothing` / `HTTP 400` / `HTTP 400`, and the file survived all three |
| 5,242,881 bytes, one over the limit | `HTTP 400 code="EntityTooLarge"` |
| an SVG, declared as one | `HTTP 400 code="InvalidMimeType"` |
| Alice deletes her own task while the file is on it | `HTTP 409 (23503), no file named` |
| Alice deletes the file | accepted, and the folder no longer holds it |
| Alice then deletes the task | one row, and the task is gone |

**Three things in that table are worth drawing out.**

1. **`EntityTooLarge` and `InvalidMimeType` both arrived at HTTP 400**, not at the 413 and 400 the
   error-codes page gives. That is the wrapping the staging script already warns about — "an HTTP 400
   carrying the real status inside the body" — confirmed again, and it is why `uploadRefusal` in
   `web/src/lib/attachments.ts` decides on the **code** and treats the status as a sanity check.
2. **Bob's delete answered `AccessDenied`**, which is a code neither this change nor the staging script
   had seen before. It is handled: `uploadRefusal` reads an unknown code at 400 as a refusal about
   permission, which is what it is.
3. **A signed-out list answered 200 with nothing**, where a signed-out open and delete were refused
   outright. Both shapes of no, exactly as Supabase's own page says listing "may" differ from reading —
   and the tests accept either rather than requiring one, which is why that difference did not fail them.

**What this does NOT cover**, so the table is not read as more than it is: the 100 MB, two simultaneous
uploads, a suspended person, HEIC, and anything through a screen. Section 7 has the full list.

**One cosmetic fault it did find.** The signed-out tests were named with `${what}ed`, which printed "the
file cannot be **deleteed**". Fixed by naming the word rather than building it; a test's name is read by
whoever is looking at a failure.

### 5.5 And four defects found in my own work, three of them by these checks

Written down because a check that has never caught anything is a check nobody should trust.

1. **The scrub rule was not idempotent.** `[file name removed]` contains a `[`, which a file name may
   contain too (`photo[1].jpg`), so `[` could not be excluded from the character class without leaking
   the half of a name after one. The rule therefore matched `[file name removed` on a second pass,
   stopped at the `]`, and put its placeholder in front of the old one — `…/[file name removed]]`,
   growing a bracket per pass. `scrubText` is documented as idempotent and the same string really does
   reach it twice, once as an exception value and once inside the message built from it. **Fixed with a
   lookahead built from the constant**, so the placeholder is spelled once.
2. **One of my own expectations was wrong rather than the code.** "two paths in one message both go"
   expected two placeholders and got one: the first match runs to the end of a bare line, so it takes the
   second path with it. Both names are gone, which is all that matters; the second task id goes too. The
   check now records what the rule **does**, because the alternative is a rule that stops at a space and
   leaks every file name with a space in it. There is a second case beside it for the JSON shape, where
   the quotes keep them apart and both task ids survive.
3. **A check found the wildcard in the migration's own prose.** `count(BUCKET_MIGRATION, "'image/*'")`
   was 1 — because the migration *quotes* `'image/*'` at length to explain why it is not used. The check
   now slices the bucket's `allowed_mime_types` array out of the insert statement: only the statement
   decides anything.
4. **AND ONE NO CHECK HERE WOULD HAVE CAUGHT, found by reading the installed client instead.** It is the
   worst of the four and it is worth the paragraph.

   Both delete paths were written to read a **row count** off the answer — "deleted" against "matched
   nothing" — which is what `Prefer: return=representation` buys for every other write in this app, and
   which `remove`'s own TypeScript type appears to offer: `remove(paths): Promise<{data: FileObject[], …}>`.

   **Two different answers say otherwise, and neither is a row count.** The raw
   `DELETE /object/{bucket}/{path}` endpoint the tests use answers
   `{"message":"Successfully deleted"}` — the body is in
   `scripts/staging/build-it-23-attachment-checks.mjs`'s fixtures verbatim, copied off a real run. And the
   client's `remove`, which the app uses, documents its own response as `{"data": [], "error": null}` for
   a successful delete of one named file (`web/node_modules/@supabase/storage-js/dist/index.mjs`, the doc
   comment on `remove`). **So an empty array is not evidence of anything.**

   What that would have done, had it shipped: `removeOne` would have read the empty array as "nothing
   matched" and the screen would have said *"That file was not deleted. It may have been deleted
   already."* **over a file it had just removed** — a wrong message on the happy path, and the one kind of
   wrong message this app's whole Build it 19 discipline exists to prevent. The test would have failed
   too, asserting `removed === 1`.

   **Both now decide by listing the folder before and after**, and the body is not read at all.
   `removeOne` makes three requests for a delete, which is a rare and destructive action where being sure
   is worth more than being quick, and the cleanup hook in the test file reads back as well — a cleanup
   that trusted the status could report success over a file still sitting in the bucket, which is the one
   thing that hook exists to notice.

   **Nothing in this repository would have caught it.** No pure-function check can see the shape of a
   real answer, and the thing that found it was reading the installed package while writing a citation.
   That is an argument for the staging run being the owner's next step rather than for a cleverer check.

---

## 6. The new counts in CI, and what each one is for

All four are **floors** except the button count, which is an equality on purpose.

| Setting | Was | Now | Why |
|---|---|---|---|
| `EXPECTED_APP_TESTS` | 25 | **40** | 15 new access-rule tests over the three storage policies |
| `EXPECTED_SCREEN_STATE_CHECKS` | 182 | **286** | 104 over `attachments.ts` and the three files that use it |
| `EXPECTED_SENTRY_SCRUB_CHECKS` | 95 | **119** | 24 over the file-path rule |
| `EXPECTED_ATTACHMENT_CASES` | 97 | **107** | 6 HEIC, 4 the leak fix |
| the button count, in `screen-state-check.mjs` | 17 | **19** | `file_open` and `file_delete`. **Two, not three**: the Attach is `type="button"` with an onClick, because no form is posted |

**The button count is an equality**, so raising it is part of the change rather than a consequence of it,
and the comment beside it now names all three of the app's buttons that are not `ActButton` — it said
"one" and named one of the two error boundaries' Try again buttons. Counted by searching `web/src` for
`type="button"`, not carried forward.

---

## 7. What this does NOT settle

The honest list, and it is longer than the one above. **Section 5.4 took the three policies off it** —
they are now seen refusing the right people against the real service — and everything below is what that
run did not reach.

1. **NO PHONE.** This item said "**Nobody has opened the screen**" until the owner did, on a Windows PC —
   section 9. The device the app is actually for is still unchecked, and the files panel's layout on a
   narrow screen is the part nobody has looked at. There is no screenshot of any of it. **The test run in
   5.4 proves the RULES and says nothing about the SCREEN**, which is the distinction to hold on to: it
   makes its requests with `fetch`, not through anything in `web/src/app`.
1a. **AND THE HEIC WARNING IN THIS ITEM CAME TRUE.** It said: "no HEIC photograph has been uploaded by
   this app's own path … **this is the single most likely thing in the change to be wrong**, and it is
   first on the phone list for that reason." The owner tried one and **it failed** — section 9.3. The app
   has stopped offering the type and [#246](https://github.com/build-once/team-tasks/issues/246) records
   what was seen and what was not. **The cause is still unknown**, which is what keeps this on the list
   rather than taking it off: one staging run of section 14 would say whether the bucket or this app's
   path is at fault.
2. **The 100 MB per person has never refused anybody, anywhere.** It is proved on the local sandbox
   (part 1, section 7.2) and the owner's staging run did not fill it. So `FILE_NO_ROOM` is a sentence
   nobody has ever seen.
3. **Two uploads at the same moment have never been raced against the real service.** The advisory locks
   in `attachments_may_add()` are proved on the local sandbox, with and without them, and that is
   PostgreSQL rather than Supabase Storage.
4. **A suspended person has not been tried against the bucket at all**, on staging or locally through the
   real service. `is_active()` is named in all three policies and the local sandbox attacks it; nothing
   else has.
5. **`FILE_STILL_THERE` describes something nobody has seen.** It is there because "File deleted." over a
   file still on the screen is the one outcome a person cannot act on.
6. **Whether `storage.objects` records the declared type is still not confirmed.** The staging script
   reads the info endpoint and reports its fields, and that branch only runs when the HEIC upload
   succeeds — which, in the run that found the finding, it did not. #231 holds it.
7. **`last_accessed_at`: a third source, and still not settled.** The installed client declares
   `last_accessed_at: string \| null` on `FileObject` and marks it `@deprecated`
   (`web/node_modules/@supabase/storage-js/dist/index.d.mts`). That is a type declaration, not a column
   in a real project, and not evidence it is maintained. #232 holds it, and this is noted there.
8. **Production has the migration and has never been looked at.**
   [#243](https://github.com/build-once/team-tasks/issues/243).
9. **One storage request per task drawn.** Named rather than hidden, and
   [#244](https://github.com/build-once/team-tasks/issues/244) is where a cheaper shape is argued, with
   the three alternatives and what each costs.
10. **Whether Supabase meters the upload as well as the download** was not established when
    `docs/costs.md` was written and is not established here.

---

## 8. The claim this file is making, in one paragraph

A person who can see a task can now attach a file to it, see the files on it, open one through a link
that lasts five minutes, and delete one where the rules allow — **in this repository**. The upload is
made as that person, so the database's own counted limits are what refuse a fourth file and a
hundred-and-first megabyte, and no part of this app holds a key that could get past them. Every refusal
has a sentence this app wrote, and not one of them carries a word Supabase chose. A file's name never
reaches a link, a log or an error report, and the scrub has a rule for the path in case something this
app did not write ever quotes one.

**And the rules under all of that have now been seen working against the real service**, by CI, on
staging: 40 tests and 0 failures, with Alice's upload accepted and read back, Carol opening the file byte
for byte, Bob and a signed-out stranger refused all three, the bucket refusing 5,242,881 bytes and an SVG
by name, and the task refusing to be deleted while a file sat on it.

**AND THE OWNER HAS SINCE USED THE SCREEN, AND ONE THING ON IT DID NOT WORK.** The paragraph that stood
here said "**What has NOT been seen is anybody using the screen**", which was true for about an hour.
Section 9 below is the record: every step of the check list passed except attaching a HEIC photograph, and
the app no longer offers that type. **Still not seen: a phone**, which is the device this app is for.

---

## 9. The owner's screen check, and the HEIC failure

**Added in the follow-up commit of 9 October 2026.** The record below is the coach's, copied verbatim from
[their comment on PR #245](https://github.com/build-once/team-tasks/pull/245) — the comment itself asks
for that: "To be copied into the evidence file by the next pull request."

**None of it was done or seen by the assistant.** The check is the owner's, on the pull request's Vercel
preview, from a Windows PC, signed in with the staging accounts.

### 9.1 The coach's record, verbatim

> **Record of the owner's screen check (coach, comment only), 9 Oct 2026.** To be copied into the evidence
> file by the next pull request.
>
> - Owner, on the pull request's preview, from a PC (not a phone), signed in with the staging accounts:
>   reported that every step of the check list passed except one.
> - **Failed: attaching a HEIC photo.** What the screen said was not recorded. So the content-type table
>   did not make a `.heic` file work through the app's own upload path on the owner's Windows PC. Section
>   14b of the staging script (accepted when `image/heic` is set) has not been run by the owner since it
>   was rewritten, so whether the fault is in the app's path or in the bucket is not known.
> - Owner's decision: not to spend time on it now; HEIC is an edge case for this project.
> - Not done: any check on a real phone; the staging script after its two fixes.
>
> Consequence to settle in a follow-up: the bucket allows `image/heic` and the plan says a HEIC photo
> works. Until it does, the app should not say or imply that it does.

### 9.2 What passed, and the limit of that

**Seven of the eight steps on the pull request's phone list**, by the owner's report rather than by
anything in this repository: attaching a photo and seeing it listed back; opening it; deleting it; the
fourth-file refusal; a wrong type refused in words; deleting a task with a file on it; and Carol seeing
and opening a file she may not delete.

**What that is worth, said plainly: it is a report, not an observation.** There is no screenshot, the
owner's own words were "all passed except one", and nobody has recorded what any individual screen said.
It is the first evidence in this whole build that a person has used the feature, and it is thinner than
the test run in section 5.4.

**And it was a PC, not a phone.** `docs/plan.md` says what this app is for — "a web app that works well
in a phone's browser. The organiser checks it on their phone each morning" — so the device that matters
most is the one still unchecked. The files panel's layout on a narrow screen is the thing nobody has
looked at.

### 9.3 The HEIC failure, and what this commit did about it

**Not a fix.** The app stopped claiming the type works:

| | |
|---|---|
| **What is known** | a HEIC photograph did not attach through the app, from a Windows PC, on 9 Oct 2026 |
| **What is NOT known** | what the screen said, and therefore **whether the fault is in the app's upload path or in the bucket** |
| **The owner's decision** | not to pursue it now; HEIC is an edge case for this project |
| **What changed** | `image/heic` is off the app's list, off the file chooser, and out of every sentence on screen and in `docs/claims.md` and `docs/plan.md`. A `.heic` file gets the plain wrong-type message — the same answer a `.zip` gets |
| **What did NOT change** | the bucket. `image/heic` is still in `allowed_mime_types`, so the two lists differ by exactly one type |
| **Where it is recorded** | [#246](https://github.com/build-once/team-tasks/issues/246), with the one staging run that would halve the question |

**Why the bucket was left alone**, because "we removed it from one place and not the other" reads like an
oversight and is not one:

- **changing the bucket means a migration**, applied to staging and to production, to narrow something
  that has not been shown to be at fault;
- nothing reaches the bucket except through the app, which no longer offers the type;
- and leaving it keeps the cheap test available — section 14b of the staging script says whether the
  bucket accepts `image/heic` when a caller declares it, and that answer tells the two possible faults
  apart.

**The difference is asserted by name rather than tolerated.** `scripts/screen-state-check.mjs` requires
the app's list to be a subset of the bucket's and the one type on the bucket's side to be `image/heic`. A
later change that quietly dropped PNG goes red; so does one that puts HEIC back without #246's evidence.

### 9.4 Checks first, and seen to fail

The owner asked for the checks before the code, and that is the order they were written in. **Nine new or
changed checks in `scripts/screen-state-check.mjs` section 10**, run against the unchanged code first:

```
$ node scripts/screen-state-check.mjs
FAIL  AND THE BUCKET ALLOWS EXACTLY ONE TYPE THE APP DOES NOT OFFER: image/heic, which failed through the app and is not fixed
          expected ["image/heic"]
          got      []
FAIL  so the app offers five, named, with no wildcard and no SVG
          expected [5,false,false]
          got      [6,false,false]
FAIL  HEIC and the two neighbours nobody has been asked about are all absent from the APP's list
          expected [false,false,false]
          got      [true,false,false]
FAIL  and it offers NO .heic and no image/heic, so the chooser does not hold one out
          expected [false,false]
          got      [true,false]
FAIL  A .heic PHOTOGRAPH IS REFUSED: it failed through the app and is not fixed
          expected null
          got      "image/heic"
FAIL  and in capitals, as a camera writes it, so neither spelling slips through
          expected null
          got      "image/heic"
FAIL  A HEIC PHOTOGRAPH gets the ordinary wrong-type answer, before anything is sent
          expected {"ok":false,"outcome":"wrongtype"}
          got      {"ok":true,"contentType":"image/heic","storedAs":"IMG-0042.heic"}
FAIL  and the word HEIC appears in no sentence on screen at all
          expected []
          got      ["That kind of file can't be attached. Photos and PDFs only — JPEG, PNG, WebP, GIF, HEIC or PDF."]

278 of 286 checks passed.
8 FAILED
exit=1
```

**The last one is the whole reason this follow-up is more than a one-line edit.** With HEIC off the list
and the sentence left alone, the screen would have named a HEIC photograph as accepted **in the very
message refusing one**. So the check is derived from `ACCEPTED_TYPES` rather than written out: every type
the app accepts must be named in the wrong-type sentence, and no type it does not accept may appear in
that or any other sentence. Change the list and the check decides whether the sentence still agrees.

Then the code, and the same command:

```
$ node scripts/screen-state-check.mjs
286 of 286 checks passed.
exit=0
```

**And everything else still green** after it: `tsc --noEmit` exit 0, `eslint` exit 0, `npm run build`
exit 0 with the bundle scan clean, the attachment selftest 107 cases / 0 wrong, `sentry-scrub-check`
119 of 119.

### 9.5 What is still not settled, after all of it

1. **Why a HEIC photograph fails.** One staging run of section 14 would halve it. #246.
2. **A phone.** Nothing on any screen of this feature has been seen on the device the app is for.
3. **The staging script after its two fixes** — the owner's record says so in as many words, and the
   whole point of those fixes was to make its run mean something.
4. And the four from section 7 that none of this touched: the 100 MB, two simultaneous uploads against
   the real service, a suspended person against the bucket, and a production read-back (#243).
