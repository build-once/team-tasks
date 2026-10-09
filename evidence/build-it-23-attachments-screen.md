# Evidence: Build it 23 part 2 — attachments on screen, and the tests

Issue [#242](https://github.com/build-once/team-tasks/issues/242). The database half is part 1
(`evidence/build-it-23-attachments-bucket.md`, issue #237), which is now **applied to staging and to
production** — appendix B of that file holds the owner's apply, the coach's read-back and the two script
runs either side of it.

---

## 0. What was run here, and what was not — read this first

**NOTHING IN THIS FILE WAS RUN AGAINST STAGING OR PRODUCTION.** Not one request. Every command below is
a local build, a local type check, a lint, or a pure-function script that connects to nothing. The
assistant deployed nothing and applied nothing.

**AND NOBODY HAS OPENED THIS SCREEN IN A BROWSER.** There is no screenshot in this file and no run of the
app. What the pull request asks the owner to check on a phone is listed in it, and section 7 below says
what that leaves unproved — which is most of what a person would call "does it work".

| | Run here? | What it proves |
|---|---|---|
| `tsc --noEmit`, `eslint`, `next build` | **yes** | it compiles, and the bundle is clean |
| `scripts/screen-state-check.mjs` | **yes**, 277 checks | the numbers, the types, the sentences, and the migration's SQL agreeing with all three |
| `scripts/sentry-scrub-check.mjs` | **yes**, 119 checks | a stored file's path does not survive a scrub |
| `scripts/staging/build-it-23-attachment-checks.mjs --selftest` | **yes**, 107 cases | the two fixed defects, and that both fixes can fail |
| the same script against **staging** | **no** — the owner's step | the bucket's own limits, and the HEIC finding, against the real service |
| `web/tests/access-rules.test.mjs` | **no** — it signs in to staging | the three policies, both sides of each |
| the screen in a browser | **no** | everything a person would call working |

---

## 1. What this change is

| | |
|---|---|
| **New** | `web/src/lib/attachments.ts` (pure: the numbers, the content-type table, every sentence), `web/src/lib/attachment-store.ts` (the four storage requests, each as the signed-in person), `web/src/app/tasks/AttachFile.tsx` (the upload box — the only client component in this app) |
| **Changed** | `web/src/app/tasks/page.tsx` (the files panel, the count on the row, the banners), `web/src/app/tasks/actions.ts` (`openFile`, `deleteFile`, and `deleteTask` clearing files first), `web/src/lib/tasks.ts` (three new link keys, `TASK_HAS_FILES_CODE`), `web/src/lib/buttons.ts` (two button ids), `web/src/lib/sentry-scrub.ts` (one rule), `web/src/app/components/ActButton.tsx` (a comment that was wrong), `web/src/app/tasks/tasks.module.css` |
| **Tests and checks** | 15 new tests in `web/tests/access-rules.test.mjs` and the storage helpers they need in `web/tests/staging.mjs`; 95 new checks in `scripts/screen-state-check.mjs`; 24 in `scripts/sentry-scrub-check.mjs`; 10 new selftest cases and two defect fixes in `scripts/staging/build-it-23-attachment-checks.mjs` |
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
| 14b | the same bytes under a `.heic` name **with `image/heic` set by the caller** are **accepted** — which is what the app's own upload path does |

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
277 of 277 checks passed.
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

### 5.4 And four defects found in my own work, three of them by these checks

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
| `EXPECTED_SCREEN_STATE_CHECKS` | 182 | **277** | 95 over `attachments.ts` and the three files that use it |
| `EXPECTED_SENTRY_SCRUB_CHECKS` | 95 | **119** | 24 over the file-path rule |
| `EXPECTED_ATTACHMENT_CASES` | 97 | **107** | 6 HEIC, 4 the leak fix |
| the button count, in `screen-state-check.mjs` | 17 | **19** | `file_open` and `file_delete`. **Two, not three**: the Attach is `type="button"` with an onClick, because no form is posted |

**The button count is an equality**, so raising it is part of the change rather than a consequence of it,
and the comment beside it now names all three of the app's buttons that are not `ActButton` — it said
"one" and named one of the two error boundaries' Try again buttons. Counted by searching `web/src` for
`type="button"`, not carried forward.

---

## 7. What this does NOT settle

The honest list, and it is longer than the one above.

1. **Nobody has opened the screen.** No browser, no screenshot, no phone. Every sentence in
   `docs/claims.md` §2e is checked as a **string in a module**, and that one is really drawn where the
   check says is a question for the diff and for a person looking at it. The pull request asks the owner
   to check seven things on a phone and says so.
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
app did not write ever quotes one. **None of it has been seen working by anybody**, and the two things
that would settle most of it — a staging run of the script and a person with a phone — are both the
owner's step.
