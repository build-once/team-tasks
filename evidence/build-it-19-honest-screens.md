# Evidence: Build it 19 — screens that tell the truth (issue #173)

Result: **PASS for everything that can be checked without a browser or a deploy, and CI on
PR #177 is green — 18 of 18 checks. Two things remain UNVERIFIED and are named in full in
section 9.**
Date: 2026-10-06
How checked: ran each command below from the repository root on the branch
`feat/honest-screens`, and pasted its exact output and exit code. The two break-it runs
were done by editing the real module, running the check, and restoring the module.
Checked by: Claude Code (assistant), unattended session

**Nothing in this change has been seen on a phone or in a browser by the assistant.** No
`next dev` was opened, no screen was looked at, and no deployed build was visited. Every
claim below is about a command's output or about a file's text. The owner checks the
preview on a real phone.

Started from `main` at **b730448a4adcf398a476fd4af0427e0def4925c2**, which is the merge
commit of PR #172.

```
$ gh pr view 172 --repo build-once/team-tasks --json number,state,mergedAt,mergeCommit,title
{"mergeCommit":{"oid":"b730448a4adcf398a476fd4af0427e0def4925c2"},"mergedAt":"2026-10-06T19:16:08Z","number":172,"state":"MERGED","title":"feat(invitations): the function writes what happened to the email, and the owner sees it"}

$ git log --oneline -1 origin/main
b730448 Merge pull request #172 from build-once/feat/build-it-18-invitation-status-function
```

---

## 1. The new pure-function check, green

```
$ node scripts/screen-state-check.mjs

Checking the pure modules under C:\Users\rajdh\team-tasks\web\src\lib

1. screenState -- the four looks, and which one wins
PASS  the four looks, in the order they are decided
PASS  a read that worked, with rows: data
PASS  a read that worked, with no rows: empty
PASS  one row is data, not nearly-empty
PASS  a read that failed: error
PASS  still loading: loading

1a. A FAILED LOAD IS NEVER EMPTY -- the one rule screenState exists to hold
...
110 of 110 checks passed.

exit: 0
```

## 2. THE BREAK-IT RUN the issue asks for: a failed load treated as empty

The issue asks for a check "seen to fail when a failed load is treated as empty". So
`screenState` in `web/src/lib/screen-state.ts` was edited to consult the row count
**before** `failed`, which is exactly that mistake:

```diff
   if (read.loading === true) return SCREEN_LOADING;
 
-  if (read.failed === true) return SCREEN_ERROR;
-
   const rows = read.rows;
+
+  if (rows === 0) return SCREEN_EMPTY;
+
+  if (read.failed === true) return SCREEN_ERROR;
```

```
$ node scripts/screen-state-check.mjs
...
FAIL  a read that failed: error
FAIL  failed with nought rows is ERROR, not empty: this is the `data ?? []` case, and the whole point
FAIL  not one of the three arguments is enough to turn a failure into an empty list
107 of 110 checks passed.

3 FAILED:
  - a read that failed: error
  - failed with nought rows is ERROR, not empty: this is the `data ?? []` case, and the whole point
  - not one of the three arguments is enough to turn a failure into an empty list

exit: 1
```

The module was restored and the check went green again:

```
$ node scripts/screen-state-check.mjs
110 of 110 checks passed.
```

## 3. The friendly-words check, green — and its break-it run

The list of roles and the list of statuses are **read out of the migrations**, not written
in the script, so the script cannot pass by agreeing with a second copy of its own opinion.

```
$ node scripts/friendly-words-check.mjs

Reading the database's own lists out of:
  C:\Users\rajdh\team-tasks\supabase\migrations\20261002122203_team_rules.sql
  C:\Users\rajdh\team-tasks\supabase\migrations\20261006095847_invitation_status.sql

0. the lists were actually found in the migrations
PASS  roles were found in the view
PASS  the roles the view derives
PASS  the status constraint was found
PASS  the statuses it allows
PASS  the failure-code constraint was found
PASS  the codes it allows
...
45 of 45 checks passed.

exit: 0
```

Then one role and one status were deleted from the mapping in `web/src/lib/words.ts`
(`member` from `ROLE_WORDS`, `failed` from `INVITATION_STATUS_WORDS`):

```
$ node scripts/friendly-words-check.mjs
FAIL  THE MAPPING COVERS EVERY ROLE THE DATABASE ALLOWS -- this is what goes red when a migration adds a third
        expected []
        got      ["member"]
FAIL  the two lists are the same size, so neither direction above passed on an empty list
        expected [2,2]
        got      [2,1]
FAIL  member reads as a word
        expected "Member"
        got      "Role not known"
FAIL  and so does a padded one
        expected "Member"
        got      "Role not known"
FAIL  THE MAPPING COVERS EVERY STATUS THE DATABASE ALLOWS -- this is what goes red when a migration adds a fourth
        expected []
        got      ["failed"]
FAIL  the two lists are the same size, so neither direction above passed on an empty list
        expected [3,3]
        got      [3,2]
FAIL  failed reads as 'could not be sent': the send is what did not work, not the person who typed the address
        expected "could not be sent"
        got      "sending"
FAIL  padded
        expected "could not be sent"
        got      "sending"
37 of 45 checks passed.

exit: 1
```

Restored, and green again:

```
$ node scripts/friendly-words-check.mjs
45 of 45 checks passed.
```

## 4. No raw error message or code can reach a screen

### 4a. The one path that printed one is gone

`web/src/app/teams/actions.ts` had a helper called `messageFrom` that read a failed
function's own body, pulled `error` out of it, trimmed it to 200 characters, and put it in
`/teams?error=<that text>` for the page to print.

```
$ grep -rn "messageFrom" web/src
web/src/lib/teams.ts:294:// web/src/app/teams/actions.ts had a helper called `messageFrom` that read the
```

One hit, and it is the comment explaining why the helper went.

### 4b. No error field is rendered anywhere

```
$ grep -rn --include=*.tsx --include=*.ts -E "error\.(message|code|details|hint|digest)|\berr\.message\b" web/src | grep -v "^\S*:[0-9]*: *//"
web/src/app/tasks/actions.ts:108:    if (error.code === REFUSED_CODE) {
web/src/app/tasks/actions.ts:195:    if (error.code === REFUSED_CODE) {
web/src/app/tasks/actions.ts:268:    if (error.code === REFUSED_CODE) {
web/src/app/tasks/actions.ts:341:    if (error.code === REFUSED_CODE) {
web/src/app/tasks/actions.ts:393:    if (error.code === REFUSED_CODE) {
```

Five hits, all five the same shape, and none of them a render: `error.code` is **compared**
with the constant `REFUSED_CODE` (`"42501"`, Postgres's insufficient_privilege) to decide
which of this page's own sentences to show. The code itself is never put in a URL, a
message or a banner. No `error.message`, `error.details`, `error.hint` or `error.digest`
appears in `web/src` outside comments.

### 4c. Every single thing the seven screens interpolate

The complete list, so this is an audit and not a sample. Every `{...}` in the seven page
files, sorted and de-duplicated:

```
$ PAGES="web/src/app/tasks/page.tsx web/src/app/teams/page.tsx web/src/app/invite/[token]/page.tsx web/src/app/login/page.tsx web/src/app/signup/page.tsx web/src/app/forgot-password/page.tsx web/src/app/reset-password/page.tsx"
$ grep -ohE '\{[^{}]+\}' $PAGES | sort -u
```

```
$ grep -ohE '\{[^{}]+\}' $PAGES | sort -u | wc -l
157
```

157 lines, which fall into five groups and nothing else:

| Group | Examples | Where the text comes from |
|---|---|---|
| Imports, actions, classes, keys, props | `{ Banner }`, `{addTask}`, `{styles.row}`, `{task.id}` | not text on a screen at all |
| Constants from this repository | `{TITLE_MAX}`, `{NAME_MAX}`, `{PASSWORD_TOO_SHORT}`, `{DEAD_LINK_MESSAGE}`, `{RESET_SENT_MESSAGE}`, `{TEAM_NOT_SHOWN}`, `{INVITATION_DAYS}` | written in `web/src/lib` |
| Counts of rows this page is about to draw | `{doneCount}`, `{visible.length}`, `{pending.length}`, `{ownedTeams.length}`, `{entries.length}` | counted here |
| This person's own data, shown on purpose | `{task.title}`, `{team.name}`, `{invitation.email}`, `{claimsData.claims.email}` | the database, through the policies |
| Mapped through an allow-list | `{plainText(...)}`, `{roleWord(entry.role)}`, `{delivery.label}`, `{delivery.sentence}`, `{expiryLabel(...)}`, `{failure}`, `{createFailure ?? ...}`, `{inviteFailure ?? ...}` | a code or value turned into **this repository's own** words |

**Only four interpolations take anything at all from the query string**, and every one
passes through an allow-list that drops what it does not recognise:
```
$ grep -n "{failure}\|{createFailure ??\|{inviteFailure ??\|Task moved to \${movedName}" \
    "web/src/app/invite/[token]/page.tsx" web/src/app/teams/page.tsx web/src/app/tasks/page.tsx
web/src/app/invite/[token]/page.tsx:110:            {failure}
web/src/app/teams/page.tsx:574:            {inviteFailure ?? INVITE_SENTENCES.broke}
web/src/app/teams/page.tsx:581:            {createFailure ?? CREATE_TEAM_SENTENCES.broke}
web/src/app/tasks/page.tsx:324:            {movedName === null ? "Task moved." : `Task moved to ${movedName}.`}
```

| Interpolation | The allow-list it passes through |
|---|---|
| `{failure}` | `messageFor(reason)` — `INVITE_REASONS`, eight codes |
| `{inviteFailure ?? INVITE_SENTENCES.broke}` | `sentenceFor(outcome, …)` — `TEAM_ACTION_OUTCOMES`, eight codes |
| `{createFailure ?? CREATE_TEAM_SENTENCES.broke}` | the same, with the other sentence map |
| `movedName` | `readFilter(moved)`, then looked up in a map built from the teams query — so it is a team name the database returned, or the fixed word `Personal`, or nothing |

### 4d. Where the detail goes instead

```
$ grep -rn "Sentry.captureException" web/src
web/src/app/error.tsx:50:    Sentry.captureException(error, { tags: { boundary: "app" } });
web/src/app/global-error.tsx:41:    Sentry.captureException(error, { tags: { boundary: "global" } });
web/src/app/teams/actions.ts:73:    Sentry.captureException(error, {
```

All three go through `beforeSend`, which is `scrubEvent` in `web/src/lib/sentry-scrub.ts`
(wired up in `web/src/sentry/options.ts`) — the existing scrub, unchanged by this branch
and still checked by `scripts/sentry-scrub-check.mjs`:

```
$ node scripts/sentry-scrub-check.mjs
95 of 95 checks passed.
```

## 5. No screen can show "null" or "undefined"

Every nullable value that reaches a screen, and what guards it:

```
$ grep -rn "plainText(entry.display_name\|accountLabel(account)\|account={claims" web/src/app --include=*.tsx
web/src/app/components/Header.tsx:114:                {accountLabel(account)}
web/src/app/invite/[token]/page.tsx:103:      <Header signedIn={signedIn} account={claimsData?.claims?.email} />
web/src/app/tasks/page.tsx:225:      <Header signedIn current="tasks" account={claimsData.claims.email} />
web/src/app/teams/page.tsx:123:            {plainText(entry.display_name, NO_DISPLAY_NAME)} —{" "}
web/src/app/teams/page.tsx:354:      <Header signedIn current="teams" account={claimsData.claims.email} />
```

- `team_roster.display_name` is nullable (the view left-joins `profiles`) and goes through
  `plainText(…, NO_DISPLAY_NAME)`.
- `claims.email` is **optional on Supabase's own type** —
  `web/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts` line 2028 reads
  `email?: string` — and goes through `accountLabel`, which falls back to `"Signed in"`.
- `tasks.team_id` is nullable and is only ever used as `task.team_id ?? ""` in a
  `defaultValue`, or compared.
- `APP_COMMIT` is an empty string off Vercel, never `undefined`, because
  `web/next.config.ts` writes `?? ""` — and `appVersion` refuses anything that is not 40
  hex digits in any case.

`plainText` refuses **four** shapes, and the two that matter are the words: React draws
nothing for `null` and `undefined`, but it draws the five characters `null` exactly as it
would draw a name.

```
$ node scripts/screen-state-check.mjs 2>/dev/null | sed -n '/^3\. plainText/,/^4\./p' | grep -c '^PASS'
17
```

Those 17 include `plainText("null", …)`, `plainText("NULL", …)`, `plainText(" Undefined ", …)`,
`plainText(["Carol"], …)`, a check that a real name merely CONTAINING one of the words is kept
(`"Nullable Nora"`), and a final one that **no input at all** makes it return something
undrawable. `appVersion` gets the same treatment in section 5a, ending with "and no label ever
contains the words a missing value turns into".

`A missing display name shows "Unnamed member"`, as the issue asks:

```
$ grep -n "NO_DISPLAY_NAME = " web/src/lib/words.ts
83:export const NO_DISPLAY_NAME = "Unnamed member";
```

It used to read `"(no name yet)"`.

## 6. Buttons act by a fixed identifier

Every submit button in the app is `ActButton`, which is the one place that writes the
`name`/`value` pair. A submit button written out by hand would be found by this search, and
there are none:

```
$ grep -rn '<button' web/src
web/src/app/components/ActButton.tsx:13:// `<button type="submit"`, which should find none: a submit button in a page is
web/src/app/components/ActButton.tsx:47:    <button
web/src/app/components/Header.tsx:121:                    `<button type="submit"` finds nothing. */}
web/src/app/error.tsx:70:        <button className="btn btn--primary" type="button" onClick={() => retry()}>
web/src/app/global-error.tsx:63:            <button type="button" onClick={() => retry()}>
```

Five hits, two of them comments explaining this search. Of the three real `<button>` elements,
one is `ActButton` itself and the other two are `type="button"` with an `onClick` — the error
boundaries, where `retry` is a function the boundary was handed and there is nothing for an
identifier to travel to. **No page writes a submit button of its own.**

Sixteen identifiers, every one unique, every one in a shape no label could be:

```
$ node scripts/screen-state-check.mjs 2>/dev/null | sed -n '/^6\. buttons/,/^6a\./p'
6. buttons -- the identifier is what a press IS
PASS  the field every button submits
PASS  every identifier is unique: a copied line that kept the old value is caught here
PASS  every identifier has the right shape -- lower case and underscores, so a label pasted into one of these slots fails rather than working
PASS  NO IDENTIFIER IS A LABEL: none contains a space or a capital, which every label in this app does
PASS  the buttons that actually exist, counted from the list

6a. readButtonId -- only what this app wrote
```

And the check that makes it mean something — every identifier against every one-button
gate, so the diagonal is true and nothing else is:

```
PASS  ACROSS ALL 16 BUTTONS: each one-button gate accepts exactly itself
```

## 7. Every other check in CI, run locally

```
$ node .claude/guard/selftest.mjs
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.

$ node scripts/lint-skills.mjs
lint-skills: PASS - 12 skills, 0 problems

$ node scripts/launch-check.mjs --selftest
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)

$ node scripts/check-workflows.mjs
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).

$ node scripts/vet-tool.mjs --selftest
vet-tool selftest: PASS (34/34 assertions; 20 malicious detections, 24 findings on malicious fixture, 0 HIGH/MEDIUM on benign near-miss control)

$ node scripts/handoff.mjs --selftest
handoff selftest: PASS (57/57 assertions; 11 secret types redacted, 9 controls unchanged, end-to-end ran)

$ node scripts/drift-check.mjs --selftest
Self-test: 20/20 cases passed.

$ node scripts/tasks-filter-check.mjs
47 of 47 checks passed.

$ node scripts/password-reset-check.mjs
84 of 84 checks passed.

$ node scripts/sentry-scrub-check.mjs
95 of 95 checks passed.

$ node scripts/staging/build-it-16-checks.mjs --selftest | grep -c '^  ok  '
39

$ node scripts/staging/build-it-16-suspend-checks.mjs --selftest | grep -c '^  ok  '
40

$ node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest | grep -c '^  ok  '
57

$ npm test
... AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
exit: 0

$ cd web && npm run lint
> web@0.1.0 lint
> eslint
(no output: clean)

$ cd web && npm run build
✓ Compiled successfully in 1666ms
  Finished TypeScript in 3.9s ...
✓ Generating static pages using 15 workers (13/13)
```

The three staging-script self-test counts are the numbers `.github/workflows/ci.yml` expects
as floors (39, 40, 57) and they are unchanged by this branch.

## 8. Two existing checks said no first, and the code changed rather than the check

Both worth recording, because AGENTS.md rule 20 is the reason the code looks the way it
does in two places.

**8a. `scripts/password-reset-check.mjs`, "a refused call takes the dead-link path."** The
first version of this branch put a plain `if (!pressed(...)) redirect(newPasswordPath("stale"))`
at the top of `setNewPassword`. That check requires `mayChangePassword(` to appear **before**
`newPasswordPath("stale")`, because a gate written after the thing it guards is not a gate —
so the guard turned it red:

```
FAIL  a refused call takes the dead-link path
```

Fixed in the code, not the check: the button test is now folded into the one `allowed`
question, with `mayChangePassword(...)` first and `&& pressed(...)` after it. One question,
one answer, one way out — which is the better shape anyway, since a press from somewhere
else and a stale link both mean "this call may not change a password".

**8b. The same check, "the request page never echoes the address back: no `defaultValue`, no
`value=`."** Spelling `value={BUTTON_IDS.resetRequest}` on the forgot-password button turned
that red:

```
FAIL  the request page never echoes the address back: no defaultValue, no value=, and the address is not in the redirect
```

Fixed in the code, not the check, and the fix is what section 6 relies on: the `name`/`value`
pair is written **once**, in `web/src/app/components/ActButton.tsx`, and no page writes it.
That is why "does every button carry an identifier?" is now answerable by searching for
`<button`.

`signIn` is a third case of the same rule, caught before it was committed rather than after:
that check uses `signIn` as its CONTROL — the function in the same file that legitimately has
two redirects, one branch and two mentions of an outcome, proving its searches are specific.
An ordinary guard would have made that three and two. So the guard is a ternary on the one
branch that was already there, and `requestPasswordReset`'s guard lives in a helper, because
that action is required to contain no branch at all.

```
$ node scripts/password-reset-check.mjs
84 of 84 checks passed.
```

## 9. UNVERIFIED — two things left, and how to settle each

The third item in this section when it was written — the access-rule tests on staging — was
settled by CI on the pull request, and the run is at the end of this section.

**Unverified — nothing here has been seen in a browser or on a phone.** No `next dev` was
opened and no deployed page was visited. The build compiles, the types check, the lint is
clean and every pure function is checked — none of which is the same as a screen looking
right. In particular: that the loading look appears at all (it needs a slow enough read to
be visible), that the Try again button is reachable with a thumb, that the account menu does
not wrap badly on a narrow phone, and that the two error boundaries render as intended. The
owner checks the preview on a real phone.

**Unverified — what the footer says on Vercel.** `appVersion` is checked over 20 inputs, and
`web/next.config.ts` reads `VERCEL_GIT_COMMIT_SHA` because the installed Next.js reads that
exact name for that exact purpose (`web/node_modules/next/dist/lib/helpers/git.js`, lines
48–57). Nothing in this repository can show what Vercel actually sets, so **the footer has
never been read on a deployed build.** To settle it: open the Production and the Preview
deployments and compare the seven characters in the footer with
`git log -1 --format=%h` of the commit each was built from. The CI build and a laptop both
produce `Local development — no deployed version`, which is correct for both and is the only
form that has actually been observed — in the local `npm run build` above.

**SETTLED BY CI, and it was the third item here.** `.github/workflows/ci.yml`'s `app-tests`
job runs `web/tests/access-rules.test.mjs` against staging and needs the five environment
secrets, which this session does not have. CI has them, and it ran — run 37531705585, job
112502457404:

```
All five settings are present. No value is printed.
# pass 25
# fail 0
App tests: 25 passed, 0 failed, 0 skipped, 0 todo; at least 25 expected to pass.
```

25 passed, 0 skipped, 0 todo, which is the floor the job expects. The file is unchanged by
this branch and nothing under `supabase/` is changed.

## 12. CI on the pull request, and what it counted

Every check on PR #177, run 37531705585: **18 of 18 pass**, including `required`, which is
the one that refuses a skipped job.

The two new scripts were not merely added to the job — the job counted what each one actually
checked, which is what stops a script that compiled and checked nothing being a green tick:

```
$ gh run view 37531705585 --job 112502457400 --log | grep -E "counted [0-9]+ PASS"
tasks-filter-check: counted 47 PASS lines; at least 47 expected.
password-reset-check: counted 84 PASS lines; at least 84 expected.
sentry-scrub-check: counted 95 PASS lines; at least 95 expected.
screen-state-check: counted 110 PASS lines; at least 110 expected.
friendly-words-check: counted 45 PASS lines; at least 45 expected.
```

The last two lines are the new ones, and they are the proof the issue's "it has a check in the
pure-function checks job" is satisfied by a job that ran rather than by a line in a file.

**Not a limitation, but worth saying: no migration, no change under `supabase/`, and no new
package.**

```
$ git diff --stat main...HEAD -- supabase package.json web/package.json web/package-lock.json
(no output: none of these changed)
```

## 10. One thing this change makes worse, on purpose, and it is filed

My teams used to show the exact sentence a refused server function sent — "That person is
already in this team", "You own 3 teams, the most allowed". Those sentences are gone, because
the page must not print text it did not choose (rule 2, and the phishing problem that the
invitation page already fixed). The wording now comes from the **HTTP status**, which the
function sets and a caller cannot forge.

`invite-member` answers **409 to three different refusals** — the address is already in the
team, it is the owner's own address, or the team is at its 20-invitation limit — so one
status means one sentence, which names all three and claims none:

> No invitation was sent. That address may already be in the team, may already have one
> waiting, or may be your own — and a team may have at most 20 invitations waiting.

That is less precise than before. The fix is for the function to send a code per refusal, the
way `accept-invite` already does — which is a change under `supabase/` and so outside this
issue's limits. Filed as **#174**.

## 11. Issues filed by this task

| Issue | What it holds |
|---|---|
| [#174](https://github.com/build-once/team-tasks/issues/174) | The two server functions should send a refusal code, not only a message — the precision lost in section 10 |
| [#175](https://github.com/build-once/team-tasks/issues/175) | Unverified: the footer's version has never been read on a Vercel build — the second UNVERIFIED item in section 9 |
| [#176](https://github.com/build-once/team-tasks/issues/176) | Unverified: none of Build it 19's screens has been seen in a browser or on a phone — the first UNVERIFIED item in section 9 |

The third UNVERIFIED item in section 9 — the access-rule tests on staging — is not filed,
because CI settled it on this pull request: 25 passed, 0 skipped. See the end of section 9.
