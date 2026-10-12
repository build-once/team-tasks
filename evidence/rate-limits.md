# Evidence: Build it 25 part 2 — the screens for the three new limits

Result: **PASS for everything this repository can decide.** Four new sentences, each chosen from a code
this project raises rather than from a status or from somebody else's prose, and seven new drift guards
tying each one to the migration that produces it. **UNVERIFIED for everything that needs a browser**:
nobody has seen any of the four drawn.

Date: 2026-10-12
Build it 25 part 2, the screens. The migrations are
`20261012094500_task_cap_and_input_limits.sql` (the 500-task cap and the two control-character
constraints) and `20261012150000_upload_count_from_owner_id.sql` (the daily upload count).
Checked by: the coding assistant.

**NO MIGRATION IN THIS CHANGE.** Nothing under `supabase/migrations/` is added or edited. **Nothing was
run against staging or production**, no MCP connector and no browser tool was used, and no dashboard
was opened.

---

## 1. The four sentences, and what chooses each

| Sentence | Where | Chosen by |
|---|---|---|
| `You have as many tasks as this app will hold. Delete one you have finished with to make room.` | `web/src/app/tasks/page.tsx`, `problem === "cap"` | a `42501` on an INSERT, **then asking `public.tasks_may_add()`** |
| `That title has a line break or a tab in it, which a task cannot hold. Put it on one line and try again.` | same file, `problem === "titlechars"` | `23514` **and** the constraint named `tasks_title_no_control_chars` |
| `That name has a line break or a tab in it, which a name cannot hold. Type it on one line and try again.` | `web/src/app/teams/page.tsx`, `problem === "namechars"` | `23514` **and** `profiles_display_name_no_control_chars` |
| `You've reached today's limit. It resets tomorrow.` | the files panel, `FILE_SENTENCES.dailylimit` | the refusal carrying **SQLSTATE 54000** |

**Not one of them names a number, a code, a status or a company.** `scripts/friendly-words-check.mjs`
asserts that of every sentence in the app and still passes 45 of 45.

---

## 2. The task cap: it ASKS, and an unknown is not a cap

**A bare `42501` on an insert now has two meanings** — a team the creator does not belong to, and the
cap — and the comment in `web/src/app/tasks/actions.ts` used to say in as many words that it had **one**.
That sentence is corrected rather than deleted, because it was true until part 2a and is the clearest
example of what a cap added in the database does to a screen written before it.

So the action asks:

```
a 42501 on the insert
  -> supabase.rpc("tasks_may_add")
       false and no error  ->  problem=cap
       true, or an error    ->  problem=refused   (the sentence it always had)
```

**ONLY A DEFINITE `false` EARNS THE CAP'S WORDS.** A database that has stopped answering shows "you
cannot do that" rather than telling somebody their list is full — the same direction `create-team`
fails in, where an unknown is not a zero. The owner's decision of 2026-10-12, and the reason is #174:
one status standing for two meanings is what the asking removes.

**And the second half of the sentence is the half that was measured.** "Delete one you have finished
with to make room" is advice, and the staging run of 12 October 2026 deleted a task at the cap and found
the next insert allowed — `evidence/build-it-25-task-cap.md` section 3.2. A sentence telling somebody to
do something that does not work would be worse than "that did not save".

---

## 3. The daily upload limit: matched on 54000 and on nothing else

**The sentence the database chose does not reach the browser.** Observed on staging, 12 October 2026:

```
HTTP 500
{"statusCode":"500","error":"DatabaseError","message":"database error, code: 54000","code":"DatabaseError"}
```

**And HTTP 500 is shared with a real outage**, so the status cannot decide. The rule, in order:

1. the answer carries `54000` → **the daily-limit sentence**;
2. otherwise, a refusal with the task already full → the per-task sentence, from the count the screen
   already has;
3. **anything else → `That file could not be attached. Please try again.`**

**The limit sentence is reached only on positive evidence, and every unknown falls to the ordinary
one.** An outage gets an apology; a limit gets a fact.

### 3.1 What this changed about a stated principle, and why it is a narrowing

`web/src/app/tasks/AttachFile.tsx` said **"A status and a code, never the message"**, and
`uploadRefusal`'s own note said of both that **"NEITHER IS EVER DRAWN"**. The message is now read.

**It is read for five characters this project chose and raises in its own migration**, and the string is
never stored, returned or drawn — `uploadRefusal` answers with one of this app's own outcome words.
That is not parsing English and it is not showing Supabase's sentence. Both files say so where the
reading happens.

**If Supabase rewords that wrapper**, the daily sentence stops appearing and somebody at their limit
gets the ordinary one. **A degradation and not a lie**, which is why the match is this way round:
matching a bare 500 would make every outage announce a limit. **Nothing here would notice** — the string
is another company's. `scripts/staging/build-it-25-upload-count-checks.mjs` would, because its "does the
SQLSTATE survive it?" judgement would stop passing.

---

## 4. The two control-character sentences: a code is not enough

**`public.tasks` carries four check constraints and `public.profiles` three**, so a `23514` says only
that *some* rule about this value refused it — and the length ones already have their own sentences.
So both branches match on the **constraint's name**, read by `constraintNamed()` in
`web/src/lib/tasks.ts`.

**That reads a message too, and for the same kind of reason**: PostgreSQL puts a constraint's name in
the message and nowhere else a client can reach — not `details`, not `hint`. The name being looked for
is an identifier this project chose in its own migration, the pattern can only yield such a name, and
the function returns one of this app's constants or `null`. **If PostgreSQL rewords it, both refusals
fall to "that did not save"** — a degradation, not a lie.

**Both write paths for each**, which is not symmetry for its own sake: a title is typed on an insert and
on a rename, and a nickname on an insert and on an update, and **paste is at least as likely in a field
somebody is editing**. The rename keeps the row open with `rename: id`, as its length refusal does, so
nothing typed is lost.

**And the sentences name what somebody will have done, not a codepoint.** "A line break or a tab" is
what arrives with a paste out of a document; `U+0009` is a fact about the file format. The first
wording was "invisible characters", which is worse: it describes something a person can neither see nor
find.

**The real cost is named in `docs/plan.md` and is not softened here**: this refuses a paste that worked
before part 2a. Two lines out of a document used to become one task with a line break in it.

---

## 5. The seven new drift guards

`scripts/screen-state-check.mjs`, **290 → 297**, and every one ties a screen to a migration:

| | |
|---|---|
| the files panel's daily-limit sentence **is** the function's `DAILY_LIMIT_MESSAGE` | the fourth copy of that sentence, compared against the real exported constant |
| and it names no number | as the other three do not |
| the SQLSTATE the screen matches **is** the one the trigger raises | the pair that would otherwise fail silently: a screen looking for a code nothing raises draws the ordinary sentence for ever |
| `TASK_CAP` **is** `c_tasks_per_person` | the screen names no number, so this is the only thing tying the app's idea of the cap to the database's |
| the two constraint names **are** the migration's two `add constraint` statements | a typo in a name falls to the ordinary sentence and nothing notices |
| the 30 is in the current migration once, as a named constant | unchanged in intent |
| **and once in the migration it replaced** | which is applied to staging and must not be edited — this is what would notice if somebody edited it anyway |

---

## 6. THE RULE 20 LINE: one existing check was narrowed

**`"and the two file actions read a CODE and never a message"` went red**, and it was right to: the
owner asked for the behaviour it forbade, on 2026-10-12, in two places at once — the daily limit arrives
as a SQLSTATE inside a message string, and PostgreSQL puts a constraint's name nowhere else.

**What it asserted:** `error.message` appears **zero** times in the tasks actions and in the client
component.

**What it asserts now**, which is the thing it was protecting rather than a proxy for it:

- **every** message read in either file is an argument to one of **this project's own readers** —
  `constraintNamed()`, which yields one of our constraint names or null, or `uploadRefusal()`, which
  searches for our SQLSTATE and returns an outcome word. A read that is not one of those two **fails**;
- and a second check: **no message reaches a redirect, a banner or a template** in either file.

**So a later `problem: error.message`, or a sentence built from one, is caught exactly as before.** The
protection is the same and it is now asserted directly.

**Agreed by the owner on 12 October 2026**, in the instruction that asked for both sentences and said
"Rule 20 applies to any existing check you need to touch". **No other check was changed, and nothing
was skipped, deleted or lowered.** The two existing upload checks that also needed attention were made
**stricter**, not looser: they now read the current migration by name rather than a concatenation of
both, because a count over two files would have forced "once, as a named constant" down to `>= 1` — and
`>= 1` would pass a migration that spelled 30 at four call sites.

---

## 7. Checks, run locally

```
$ node scripts/screen-state-check.mjs     -> 297 of 297 checks passed.   (was 290)
$ node scripts/friendly-words-check.mjs   -> 45 of 45 checks passed.
$ node scripts/tasks-filter-check.mjs     -> 47 of 47 checks passed.
$ node scripts/auth-screens-check.mjs     -> 90 of 90 checks passed.
$ node scripts/check-workflows.mjs        -> 6 workflow file(s), 27 job(s): 0 problem(s), 0 warning(s).
$ cd web && npx tsc --noEmit              -> (no output)
```

**`tsc` found two real faults while this was being written**, both in the nickname branches:
`updateError` and `insertError` are possibly null at the point the new conditions read them. Fixed with
`?.` rather than by moving the branches, so the generic `problem=profile` redirect below each stays the
last word.

---

## 8. What is UNVERIFIED (rule 8)

| What | What settles it |
|---|---|
| **That any of the four sentences has been drawn** | the owner, on a Preview deploy. No screen was opened by anybody writing this |
| **That the cap sentence appears rather than "you cannot do that"** | 500 tasks on a Preview, which is what `scripts/staging/build-it-25-limits-checks.mjs` creates — but it uses the Data API and not the screen |
| **That the daily-limit sentence appears on the files panel** | 30 uploads on a Preview, as one account. `build-it-25-upload-count-checks.mjs` reaches the limit but never opens a page |
| **That `tasks_may_add()` is reachable from a server action** on a real project | the owner's Preview. It is granted to `authenticated` and was read back on staging; nothing here has called it over the Data API |
| **Whether a 500 that is NOT the daily limit really draws the ordinary sentence** | it cannot be provoked on purpose. The logic is checked; the path is not |
| **Anything about production** | the merge, and then a screen |

---

## 9. Redaction (rule 18)

**Nothing was captured from production or from staging.** The two bodies quoted in sections 3 and 4 are
the owner's report of what the Storage API returned, and both are plumbing — a status, an error name
and a SQLSTATE. Neither carries an address, a path, a file name, a task title or an id.

**The list of replaced values is empty, and that is a complete answer.**
