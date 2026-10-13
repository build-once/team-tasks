# Deleting an account, exporting your own data, and asking from outside

Written 2026-10-12 for Build it 26, from `origin/main` at `45d187b`. **This file is a design, not a
build.** No code, no migration and no screen is changed by the pull request that adds it; every
numbered decision below is the owner's to take, and the order of the work is at the end of
`docs/plan.md`'s Build it 26 section.

**Why a design document before any code.** Deleting an account is the first thing this app will do that
**destroys** data, it is the only operation in the app that cannot be undone, and the shape of this
database makes it considerably less simple than it looks: a deletion runs down six foreign keys, past
two triggers, and into a storage bucket whose bytes a SQL `delete` cannot touch. Getting the **order**
wrong leaves either a task nobody can reach or a file nobody can delete, and the free plan has no
point-in-time restore to undo it with.

**What was read to write it.** All fourteen migrations in `supabase/migrations/`,
`web/src/lib/attachment-store.ts`, `web/src/lib/attachments.ts`, `web/src/lib/supabase/proxy.ts`,
`docs/backups.md` → "What a restore promises", and `scripts/backup/restore-backup.mjs`'s role in it. No
dashboard, no connector, no browser, nothing run against staging or production.

---

## 1. What exists today

**Nothing.** There is no way for anybody to delete an account from inside this app, and
`docs/plan.md`'s appendix has reported that as a gap since the first version — twenty-one rows of its
table answer "they cannot" or "the owner deletes by hand".

Two things *do* exist and both shape the design:

- **the cascades.** Six foreign keys reference `auth.users (id)`, and all six are `on delete cascade`:
  `tasks.owner_id`, `teams.owner_id`, `team_members.user_id`, `invitations.invited_by`,
  `profiles.user_id`, `account_status.user_id`, `usage_counts.user_id`. (Seven references, six tables
  plus `usage_counts`; counted in this session by reading the migrations.) So deleting the `auth.users`
  row already removes almost everything.
- **and one trigger that refuses it.** `tasks_refuse_delete_with_files`, from
  `20261008191804_attachments_bucket.sql`, is `before delete on public.tasks` and raises `23503` while
  any object remains under `attachments/<task id>/`. **It fires on a cascade** — proved on a local
  PostgreSQL sandbox in `evidence/build-it-23-attachments-bucket.md` section 8.5, where deleting the
  `auth.users` row is refused with the cascade's own statement as the error's context.

**Which means deleting an account is refused today while any of that person's tasks has a file on it**,
and that is not an accident: it is what makes
[#235](https://github.com/build-once/team-tasks/issues/235) — "deleting an account must remove that
person's files" — a thing nobody can get past rather than a thing somebody has to remember.

---

## 2. The one fact that decides the whole order

**A SQL `delete` cannot delete a file.** Supabase says so in two places, both cited in the attachments
migration:

> "Deleting objects via a SQL query will not remove the object from the bucket and will result in the
> object being orphaned"

and

> "All operations, including uploading, copying, moving, and deleting, should exclusively go through the
> API"

So the bytes come out through the **Storage API**, and the `storage.objects` row goes with them. A
deletion that cascaded the rows away first would leave the bytes paid for and unreachable — which is
precisely the outcome the owner's decision of 8 October 2026 ("leftover files are not acceptable")
forbids.

**And the pattern already exists in this app.** `clearTaskFiles` in
`web/src/lib/attachment-store.ts` lists, removes in one request, **lists again**, and reports `cleared:
false` if anything is left — because "a delete that answered without an error and removed nothing would
otherwise be counted as a success". The account deletion is that function's shape, repeated over every
task the person owns.

---

## 3. What delete-account removes, and in what order

**NINE steps, and it was eight until the owner's decisions of 2026-10-12.** Step 4b is new, and step 3
stopped being a decision. Each step is refusable, and **a refusal stops the whole thing and says so**:
nothing is half-done, the account is still there, the person is told, and they can try again.

| # | Step | Why it is in this position |
|---|---|---|
| **0** | **Read what is about to happen and show it to the person**: how many tasks, how many files, and **the name of every team they own** | The warning in section 5. A deletion that names nothing is a deletion nobody can consent to. **Decision 2: yes** |
| **1** | **Refuse unless the person has just confirmed** — a typed confirmation, not a single click | It is the only irreversible thing in the app |
| **2** | **Delete every file on every task they own, through the Storage API, and read back** | Section 2. This is what unblocks the trigger. **It must read back**, exactly as `clearTaskFiles` does |
| **3** | **Delete every file they uploaded to a task that is going to SURVIVE** — a task somebody else created, in a team — through the Storage API, and read back | **MANDATORY, not a decision, since 2026-10-12.** `storage.objects` has **no foreign key to `auth.users`** (section 7), so nothing in the database removes these files and nothing refuses the deletion over them. Left behind, they are bytes **nobody can reach**: no live account matches their dangling `owner_id`, and the task's-creator branch is the only other way in. **Decision 4: yes** |
| **4a** | **Delete the tasks that are not being kept**: every task they own whose `team_id` is null, and every task they own that is in a team they own | Done explicitly, **before** the account goes, so that step 6's `set null` leaves behind only the tasks that are meant to survive. See section 6 |
| **4b** | **In every team they own, delete the tasks whose `owner_id` is already NULL — a former member's — files first, and read back** | **NEW, 2026-10-12, and it is what makes decision 3's "the orphan arises only from a team deleted by hand" true.** Those are the only rows in a doomed team that would become unreachable: when the team goes, `team_id` becomes null beside an `owner_id` that is already null, and nothing can see or delete the row again. Section 6.2. **It is deliberately NOT every task in the team** — see the paragraph below the table, which is a question rather than a decision |
| **5** | **Delete every pending invitation addressed to their own email address** | **Decision 5: yes.** These do **not** cascade — they are keyed by an address, not by a user id — so without this step the app keeps the email address of somebody who has just left |
| **6** | **Delete the `auth.users` row, with the Admin API** | Everything else goes with it: their teams (and those teams' invitations and memberships), the invitations they sent, their profile, their suspension row, their usage counts, and — **decision 1: yes** — the ownership of the tasks that stay |
| **7** | **Sign them out**, and send them to a page that says it is done | Last, because until step 6 succeeds they are still an account |
| **8** | **Write a tombstone, and a line in `evidence/` with no identity in it** — a date and a count | **Decision 6: option A.** Section 9.2 |

### Does step 4 remove a doomed team's tasks? Asked by the owner on 2026-10-12, and the honest answer is "some of them"

**What the order above did before today: NO.** Step 4a deleted only tasks **the departing person
owns**. Every other task in a team they owned was left to `tasks.team_id`'s `on delete set null`, which
returns each one **to its own creator as a personal task** — and because those rows have a live
`owner_id`, none of them becomes an orphan.

**What it does now: step 4b, which is the orphan-producing subset and nothing else.** A task in a
doomed team becomes unreachable **only if its `owner_id` is already null** — a former member's. Step 4b
deletes exactly those, files first, so after this change **the orphan in section 6.2 can only arise
from a team deleted by hand in the dashboard**, which is what the owner asked for.

**And the literal reading — "remove that team's tasks", all of them — is written down as a QUESTION
rather than taken, because it reverses two decisions that are still standing.** It would destroy
tasks other members wrote:

- `20261002133637_tasks_join_teams.sql` chose `set null` over `cascade` for this exact case, in these
  words: "Carol losing her own task because Alice closed her account is a stranger deleting Carol's
  work, and this database has no point-in-time restore on the free plan to undo it with";
- and **decision 2, taken as "yes" in the same message**, is the warning that says "**nobody loses a
  task they wrote themselves**".

So the two cannot both be true. **ANSWERED BY THE OWNER, 2026-10-13: THE NARROW READING — only the
tasks that would become unreachable.** So step 4b stands exactly as written above, and this is a design
rather than a design with a question in it.

**And the owner asked for the departure to be recorded as one.** The book's Build it 26 text has a
deleted owner's teams go **"with that team's tasks"**, all of them. This app does not, because of a
decision already in this repository and older than the question:
`20261002133637_tasks_join_teams.sql` chose `on delete set null` over `cascade` for exactly this case.
**What it costs is a surprise rather than a loss** — a team whose owner leaves does not take the other
members' tasks with it, and each returns to the person who wrote it as a personal task they may not
expect to find there. Section 5's warning is where they are told.

**"The login last" is step 6, and it is the step everything else exists to make possible.** Two reasons
it is last rather than first:

- **the permission comes from the account.** The right to delete a file on a task comes from the task
  (the DELETE policy's "or you created the task" branch), and the right to read the task comes from the
  session. Delete the login first and there is nothing left that may delete anything — the same argument
  `clearTaskFiles` already makes about files-before-task, one level up.
- **the trigger refuses it** until step 2 has run. So the order is not a preference; it is the only
  order in which the operation is permitted at all.

---

## 4. What goes with it, table by table

Read from the migrations, not from memory.

| What | How it goes | Anything to decide? |
|---|---|---|
| `profiles` — the nickname, the AI-suggestions setting and its date | cascade from `auth.users` | no |
| `account_status` — the suspension and **the owner's free-text reason** | cascade | **no, and it is worth saying out loud**: the owner's note about a person is destroyed with that person, which is the right way round |
| `usage_counts` — the daily counts | cascade | no |
| `team_members` — their memberships | cascade | no. **The team's other members are unaffected** |
| `teams` they own | cascade | **the warning must name them** — section 5 |
| `invitations` they **sent** | cascade through `invited_by` | no. Any pending one stops working, which is correct: the person who vouched for it is gone |
| `invitations` **addressed to them**, still pending | **nothing. They do not cascade** | **Decision 5.** Step 5 above |
| `tasks` they created, personal | step 4, explicitly | no |
| `tasks` they created in a team **they own** | step 4, explicitly — they would go with the team anyway | no |
| `tasks` they created in **somebody else's** team | **this is the whole of decision 1** — section 6 |
| **Other people's tasks** in a team they owned | **they survive.** `tasks.team_id` is `on delete set null`, so each returns to **its own creator as a personal task**, with its title, its tick and **its files** intact | no, and the warning should say it |
| Files on their tasks | step 2 | no |
| Files **they uploaded** to tasks that survive | step 3 | **Decision 4** |
| `auth.users`, `auth.identities`, sessions, refresh tokens, links in flight | the Admin API's delete | **Not confirmed** whether it removes `auth.audit_log_entries` — section 7 |

---

## 5. The warning, and what it has to name

**Decision 2.** The plan's standing rule about a refusal applies here to a confirmation: it has to be
something a person can act on. So the screen before the button says, in this app's own words and with
no code or status in it:

- **how many tasks** will be deleted, and **how many files**;
- **the name of every team they own**, one per line, and that **the team goes** — its members lose the
  team and its shared list, though **nobody loses a task they wrote themselves**, because each returns
  to its creator as a personal task;
- **what stays**: the tasks they created in other people's teams, if decision 1 keeps them — and that
  those tasks will show **"Former member"** where their nickname is now;
- **that it cannot be undone**;
- **that copies of their data remain for up to about a fortnight** and then go, which is the sentence
  `docs/plan.md` already requires of this build;
- **that what has already left the project cannot be recalled** — section 8.

**It must not name the other members**, and it must not name anybody's address. The team's name is
enough to identify it to the person who made it.

---

## 6. "Former member", and exactly what it needs in the schema

**The requirement:** a task the person created in somebody else's team **stays**, and is shown as
created by "Former member".

**Why that is not free.** `tasks.owner_id` is `uuid not null default auth.uid() references auth.users
(id) on delete cascade`. As it stands, **deleting the account deletes every one of their tasks**,
including the ones in other people's teams. Keeping them is a schema change, and it is **five** changes
rather than one. **Decision 1, taken as "yes" on 2026-10-12: keep them.** The fifth was found on the
same day, by working out how step 4b could possibly run.

### 6.1 The five things a migration has to do

1. **`alter column owner_id drop not null`**, and **replace the foreign key with `on delete set
   null`.** A null `owner_id` then means "the person who created this has gone" — "Former member" is a
   word on a screen, not a column.
2. **`tasks_enforce_column_rules` needs a new branch**, and this is the one that would otherwise make
   the whole deletion fail. That trigger raises `42501 owner_id cannot change: a task stays with the
   person who created it.` on **any** change to `owner_id` — and a `set null` foreign-key action is
   performed as an **ordinary UPDATE to the row**, which fires the trigger. So without a new branch,
   step 6 is refused and the account cannot be deleted. The branch is exactly the shape the
   deleted-team branch in that same function already has: *allow it when the new value is null, the old
   value is not, and no `auth.users` row with the old id exists any more.* Inside the cascade the parent
   is already gone, so the two cases tell themselves apart with no flag.
3. **A policy for who may delete a former member's task.** "Owners can remove their own tasks" is
   `using ((select auth.uid()) = owner_id)`, which is false for a null owner — so **nobody could delete
   one**. The natural answer is the team's owner, written the way
   `20261002122203_team_rules.sql` writes "Team owners can remove a member from their team": read
   `teams.owner_id` directly rather than `is_team_member()`, because members must not gain it.
4. **A read for it.** `"Creators and team members can read a task"` already returns it through its team
   branch, so nothing is needed for a team task. The screens need to draw "Former member" instead of a
   nickname, which is `web/src/lib/tasks.ts`'s and the roster's business and not the database's.
5. **AND A BRANCH ON THE STORAGE DELETE POLICY, found 2026-10-12, without which change 3 is useless.**
   `"Attachments: delete a file you attached, or one on your task"` admits the **uploader** or **the
   task's creator** — and a former member's task has **no creator left**: `creator.owner_id =
   auth.uid()` can never hold for a null `owner_id`. So the team's owner, who change 3 has just given
   the right to delete the task, **cannot clear its files** — and `tasks_refuse_delete_with_files`
   refuses the task while they are there. **The deadlock the owner's decision of 8 October removed comes
   straight back**, in the one case nobody looked at.

   The branch: **you may delete a file on a task in a team you own, when that task has no owner.** It
   reads `teams.owner_id` directly, like change 3, so members gain nothing.

   **What it widens, stated rather than slipped in:** a team's owner can delete a file a **third
   member** uploaded to a former member's task. That is the same custodianship the 8 October decision
   already gives a task's creator over everything hanging off their task — handed to the team's owner
   when the creator is gone, and only then.

   **And the alternative was rejected on purpose.** Step 4b could instead remove those files with the
   **service-role key**, which needs no policy at all. `docs/plan.md`'s "Unverified" list says in as
   many words that "a privileged delete path is not needed and is not designed", and the 8 October
   decision's own virtue is that "no part of this app deletes anything with more authority than the
   person asking". **A policy branch keeps that true; a key does not.**

### 6.2 The consequence nobody would find until it happened

**When that team is later deleted, a former member's task becomes unreachable.** `tasks.team_id` is
`on delete set null`, so the task survives the team with `team_id` null **and** `owner_id` null — and
then:

- **the select policy** returns it to nobody: `auth.uid() = owner_id` is false for a null owner, and the
  team branch needs a `team_id`;
- **the delete policy** matches nobody, for the same reason;
- so the row sits in the table, invisible and undeletable, until the operator removes it by hand.

**That is a real orphan and this file is not going to hide it.** Three ways out were put to the owner
as **decision 3**:

| Option | What it costs |
|---|---|
| **Accept it.** The operator clears such rows in the dashboard | A row of somebody's task text, kept after they left and after the team went, reachable only by the operator. It is the smallest change |
| **Delete former-member tasks when the team goes.** An `after update` trigger on `tasks`: when `team_id` has just become null because the team was deleted **and** `owner_id` is null, delete the row | A second trigger on the busiest table, and a delete performed by the database rather than by a person. It also has to get past `tasks_refuse_delete_with_files`, so the files would have to go first — **which a trigger cannot do, because it cannot call the Storage API.** So this option cannot actually be built as described |
| **Do not keep the tasks at all** — decision 1 the other way | "Former member" disappears, and so does this whole section. A team loses the task a departed member wrote, which is a loss the team can see and talk about rather than a row nobody can reach |

**DECIDED BY THE OWNER, 2026-10-12: the first option. Accept the orphan; the operator sweeps it. And
decision 1 stands — "Former member" is kept.**

**With one addition the owner made in the same breath, and it is what shrinks the orphan to almost
nothing: `delete-account` removes a doomed team's former-member tasks EXPLICITLY, rather than leaving
them to the `set null`.** That is step **4b** in section 3. So the orphan is no longer produced by
anybody deleting their account — **it can arise only from a team deleted by hand in the dashboard**,
which is the one path with a person standing in front of it who can look at what is left.

**Why that is the right answer rather than merely the owner's.** The second option was the one this
file leaned towards and it **cannot be built**: a trigger cannot remove the bytes, so it would delete
the row and leave the file — the exact orphan the 8 October decision forbids, traded for a different
one. The third option costs a team the work a departed member did. The first costs **a row nobody can
see, in a case that now requires the operator to have deleted a team by hand** — and the operator is
the person who can see it.

**What "the operator sweeps it" means in practice**, so it is a procedure rather than a hope: after
deleting a team by hand, run `select count(*) from public.tasks where owner_id is null and team_id is
null` and delete what it finds. **A count, not a listing** — the rows hold task text, and this
repository is public. It belongs in the dashboard notes for deleting a team, which is a thing no
document in this project has yet, and **PR 4 is where it gets written**.

---

## 7. What is NOT confirmed, and one of them decides whether step 6 works

1. ~~**What `storage.objects.owner_id` does when its `auth.users` row is deleted.**~~ **SETTLED
   2026-10-12, AND THE ANSWER IS "NOTHING AT ALL" — which was not one of the three possibilities this
   entry listed.** It said: nobody has read the constraint, and offered `on delete set null`, `on
   delete cascade` and `no action`, calling it "the first thing Build it 26's code has to establish".

   **The coach read both projects through the read-only connectors.
   `storage.objects` has exactly ONE foreign key — `objects_bucketId_fkey` → `storage.buckets(id)`.
   `owner` is `uuid`, `owner_id` is `text`, and NEITHER has a foreign key to `auth.users`, on staging
   or on production.** Recorded in `evidence/production-log.md`, 12 Oct, row 6. **Nobody writing this
   opened a dashboard or used a connector.**

   **So there is no constraint, and three things follow:**

   - **deleting an `auth.users` row neither removes nor is refused by that person's object rows.** The
     rows and the bytes stay, carrying a user id that no longer exists;
   - **step 3 is therefore MANDATORY and is no longer a decision** (which is also what decision 4
     answered: yes). Nothing in the database will remove those files and nothing will refuse the
     deletion over them, so the function is the only thing that can;
   - **and a file left behind that way is unreachable by everybody.** The DELETE policy admits the
     uploader (`objects.owner_id::text = auth.uid()::text` — no live account matches a dangling id) or
     the task's creator, through `exists (select 1 from public.tasks …)` — and if the file was on one
     of the departing person's own tasks, that task is gone with the cascade, so the subquery finds
     nothing. **Permanent orphan bytes, paid for, with no route to them but the dashboard.**

   **And the one guard this app does have is narrower than it looked.**
   `tasks_refuse_delete_with_files` still refuses the cascade, because it reads `storage.objects` **by
   path** rather than by owner — so the deletion is still refused while a file sits on one of **that
   person's own** tasks. It says nothing about a file they uploaded to **somebody else's** task, whose
   path names a task that is not going anywhere. **That half cannot be closed by a trigger at all**,
   which is precisely why it is a step in the function and not a rule in the database.

   **It also settles a "not confirmed" that has been in a migration since 8 October.**
   `20261008191804_attachments_bucket.sql` says twice that "no page read states its type" of
   `owner_id` and casts both sides to text for that reason. It is **text** — so every one of those
   casts was right, and `20261012150000`'s `::text::uuid` inside an exception handler was right too: a
   text column can hold something that is not a uuid, which is the case that handler exists for.
2. **Whether the Admin API's delete removes `auth.audit_log_entries`** for that user — the sign-in log,
   with its IP addresses. If it does not, this app keeps a log of a deleted person's sign-ins, and the
   policy has to say so.
3. **Whether `auth.one_time_tokens` rows go** with the user. Each is a confirmation or reset link with a
   clock on it.
4. **What the Storage API answers when a `remove` is refused**, in a way the screen can tell from an
   outage. [#297](https://github.com/build-once/team-tasks/issues/297) is the same problem one door
   along: Storage answered a trigger refusal with HTTP 500 and only a SQLSTATE in a message string.
5. **Whether `auth.admin.deleteUser` exists in the installed client at the version the functions use.**
   Nothing in this repository calls it today — `grep` for `auth.admin` in this session finds no call
   anywhere — so it is an API to confirm against the installed package before it is written, not
   recalled (rule 15).

---

## 8. What cannot be deleted, and what the policy must therefore say

**Three companies hold something this app cannot reach, and the policy has to say so in plain words
rather than implying a deletion is total.**

| Where | What stays | What can be done about it |
|---|---|---|
| **Sentry** | error reports carrying the error, the page, the browser and **their user ID** | **The owner can delete them**, by searching Sentry for that user ID — and the only moment it is possible is **before** the account goes, because after it the id is all that is left to search by and nobody will have written it down. **So this is a step the owner takes by hand, and the policy should say the reports are deleted on request rather than automatically.** Not yet tried: no production event has been seen |
| **Resend** | the sending log — **which addresses were sent what, when**. After 11 October 2026 that includes everybody's own address, from sign-up and every password reset, not only invited addresses | **30 days** on the free plan, and then it goes by itself. The owner can clear it sooner. Nothing in the app can |
| **Anthropic** | a task title, if the person had switched AI suggestions on | **Nothing, and deliberately.** Nothing identifying the asker is sent, so **there is nothing to search by** — the owner cannot find one person's requests. What Anthropic holds runs on its published clock: deleted within 30 days of receipt or generation, with stated exceptions, and up to 2 years for anything flagged as a Usage Policy violation. **The policy must say this**: switching the setting off, or deleting the account, stops anything more going and recalls nothing |
| **The nightly copies at Cloudflare** | **everything**, as ciphertext | section 9 |

**And one that is not a company.** `docs/plan.md`'s own appendix says Supabase, Vercel and Supabase's
logs record IP addresses whether we want them or not, and that none of those can be switched off. A
deleted account does not delete a log line.

---

## 9. The backups, and how a restore must handle a deleted person

**The fact:** a nightly copy holds every table, the accounts with their password hashes, and every
file. Copies are removed after **14 days** by an R2 lifecycle rule (owner-reported), and Cloudflare
allows up to a day for a removal — so **up to about fifteen days**.

**So two things are true at once, and the policy must say both:**

1. **a deleted person is gone from the app at once**, and
2. **they are still in every copy made before the deletion**, until that copy expires.

**And the sharper half: a restore would bring them back.** `docs/backups.md` → "What a restore
promises" is a named set, and it includes every table in `public`, `auth.users`, `auth.identities` and
every file byte for byte. A restore from a copy taken before a deletion therefore **recreates the
account, the tasks, the nickname and the files of somebody who asked to be gone** — and nobody would
notice, because a successful restore is a restore where everything matched.

### 9.1 The problem with the obvious fix

The obvious fix is a list of who has been deleted, so a restore can re-delete them. **A list of deleted
people's data is the one thing this design must not create**: it would outlive them, it would hold the
thing they asked to have removed, and it would be exactly the "permanent record wearing a window's
label" that `docs/plan.md` rejects about retention everywhere else.

### 9.2 Three ways, and the one the owner took — **decision 6, taken 2026-10-12: OPTION A, 30 days**

| | What it is | What it costs |
|---|---|---|
| **A. A short-lived tombstone** — **TAKEN** | One table, two columns: the **`auth.users` id** and the **date**. Nothing else — no address, no nickname, no task text, no reason. **No policy and no privilege for any role**, exactly as `account_status` and `usage_counts` have none. **Rows are removed after 30 days**, by the same statement that writes one, which is the mechanism `count_daily_use` already uses for the 7-day window | It holds a user id and a date about somebody who has left. **But only for 30 days — and 30 is chosen because it outlives the longest-lived copy that could resurrect them (about fifteen days) and nothing more.** So it is not a register of departures; it is a note that expires before the thing it exists to correct does |
| **B. Nothing in the app; the owner's own record** | The runbook gains a step: "has anybody asked to be deleted since this copy was made? If so, re-run the deletion afterwards." The record is the request the owner received, in their own mailbox, outside this project | Collects least, which is this plan's bias. **And it cannot work for a self-service deletion**: somebody who presses the button in the app sends the owner nothing, so there is no request to remember and no way to know who to re-delete |
| **C. Accept it** | A restore brings them back, and the runbook says so | It makes "deleted" conditional on this app never having a bad day, which is not a promise worth making to somebody who asked to be removed |

**Why A rather than B**, in one sentence: B is more private and only works for the people who wrote in,
and the whole point of Build it 26 is that a person does not have to write in.

**And the tombstone is now the SECOND thing in this project whose retention is enforced by the
statement that writes it** — `count_daily_use`'s 7 days is the first. That is deliberate rather than
imitative: `docs/plan.md` rejects a retention period "that depends on somebody doing it" in as many
words, and a tombstone swept by hand would be the permanent register of departures option A exists to
avoid. **With one caveat that A inherits from the first**:
[#223](https://github.com/build-once/team-tasks/issues/223) records that `usage_counts`' sweep only
runs for somebody who comes back — and a tombstone's subject never comes back, **so the sweep cannot
be keyed to them.** It has to run on **every** deletion, over **all** tombstones, which is a different
shape from `count_daily_use`'s and is the one line of PR 4 most likely to be written the wrong way by
copying the old one.

**What the runbook gains either way — one step, after step 4.** *"Read the tombstones. For every row
dated after the copy was made, run the deletion again, in the order in section 3. Then check the table
is empty of rows older than the copy."* And a sentence saying why: **a restore is the one operation in
this project that can undo a deletion.**

---

## 10. A suspended person — **decision 7**

A suspended person is refused by every rule on all five tables and by all four server-function doors.
So as the rules stand, **they could not delete their own account**, and `docs/plan.md` already names
that as suspension sharpening the gap: "Everything about their data is in the owner's hands while the
row is there."

Two answers, and the owner's call:

- **Leave it.** A suspended account exists because somebody is putting other people's details into task
  text or the account has been taken over — and in the second case the person pressing "delete my
  account" may not be the person whose account it is. The deletion-request page in section 12 is their
  route, and the owner checks who is asking.
- **Allow it.** It is their data, and a suspension is not a reason to hold it. It would mean the new
  door does **not** check `account_status`, which would be the first of the five doors not to — and that
  needs saying in the function's own comments so nobody "fixes" it later.

**DECIDED BY THE OWNER, 2026-10-12: leave it. A suspended person asks through the request page.**

Two things follow, and the second is the one to build rather than remember:

- **the new door checks `account_status` like the other four**, so it is not the first of five to skip
  it — which is also what keeps "a suspended person can read and change nothing" true of a fifth door;
- **and the refusal has to say where to go.** A suspended person pressing "delete my account" and being
  told only that they cannot is the shape `docs/plan.md` calls a refusal nobody can act on. The
  sentence has to point at the request page — which means **the request page is not optional for a
  suspended person, it is their only route**, and PR 6 cannot come after PR 5 without leaving a window
  in which that sentence points nowhere. **The order in `docs/plan.md` has PR 6 after PR 5, and this is
  the one reason to consider swapping them.**

---

## 11. The export — one file, their own data, built with their own rights

**DECIDED BY THE OWNER, 2026-10-12: the contents as recommended — 8a yes, 8b no, 8c no, 8d no, and
the policy says the two closed tables exist and how to ask for them. Decision 9: the export is NOT
counted against a daily limit.** The shape below was the proposal and is now the design; each decision
is marked where it bites.

**AND IT IS BUILT — 2026-10-13, PR 3 of the order of work, with no migration and no secret key.**
`web/src/lib/export-data.ts` is the half that decides what ends up in the file, and
`web/src/app/settings/export/route.ts` is the half that makes the requests. **Three things this file
proposed and the build departed from, each written down rather than left in a diff:**

- **no uuid goes in the file at all.** Section 11.2 asks for a task's team by **name**; the build
  extends that to every id — no task id, no team id, not the person's own — so a file is attached to its
  task by that task's **title**. A file somebody keeps for years should read as their own list rather
  than as a database extract.
- **a section whose read failed says `could_not_be_read`, is named at the top of the file, and sets
  `complete` to false.** This file did not say what happens when a read fails, and an empty `[]` in a
  **downloaded file** is this app telling somebody in writing that it holds nothing of theirs.
- **the file listing stops at 200 tasks, 8 at a time, and the file says how many it did not list.** A
  listing is one request per task ([#244](https://github.com/build-once/team-tasks/issues/244)) and the
  cap is 500 tasks per person, so an unbounded version would make up to five hundred requests inside
  one download.

**Nothing has been run against staging and no export file has ever been produced.**
`evidence/build-it-26-export.md` is the record, and its section 7 is the list of what only a staging run
or a browser can say.

### 11.1 What it is

**One JSON file, downloaded by the signed-in person, holding what this app holds about them and nothing
about anybody else.** Not an email, not a link, not a job that runs later: a request and a download,
while they wait.

**And it needs no secret key, which is the best thing about it.** Nearly everything in it is something
the person can already read through row-level security with their own session, and their email address
is on the session's own user object. So the export is **a read with the caller's own rights**, and the
policies are what keep it to their own data — the same preference this project shows about deleting a
task. It is a server route rather than a server action so that the file is an ordinary download with a
`Content-Disposition` header and **needs no JavaScript**, which only the upload box does today.

### 11.2 What is in it

| Section of the file | From |
|---|---|
| `generated_at`, `format_version`, and **a list, in the file, of what is deliberately not in it** | written by the app |
| **account**: email address, when the account was created | the session's own user object |
| **profile**: nickname, when it was set, **AI suggestions on or off and when that last changed** | `profiles`, through `my_ai_suggestions()` for the two closed columns |
| **tasks**: for every task they created — title, done, created_at, and the **name** of its team if it has one | `tasks`, their own rows |
| **teams they own**: name, created_at | `teams` |
| **teams they belong to**: name, when they joined | `team_roster`, `team_members` |
| **invitations they sent**: the team, the status, the failure code if any, when it was sent and when it expires — **and the invited address, because decision 8a is YES**: they typed it, and My teams already shows it to them | `invitations`, through the owner-only read |
| **files**: for every file on their tasks — the file name, its size, when it was uploaded, and which task it is on | `storage.objects`, through the SELECT policy |

### 11.3 What is deliberately NOT in it, and why each

| Not included | Why |
|---|---|
| **Their password hash**, session and refresh tokens | they are credentials, and a hash is not useful to its owner |
| **An invitation's `token_hash`** | the same. It is a credential's hash |
| **The files themselves** | a 100 MB allowance does not fit in a JSON file. The export **lists** them, and the person downloads each one through the app, which already gives them a 5-minute signed link |
| **Anybody else's tasks**, including team tasks written by other members | they are not this person's data. A team's shared list belongs to the team |
| **Anybody else's nickname**, and the other members of their teams | **decision 8b: NO.** The person can see their teams' rosters on screen; an export file is a durable artefact and a roster in one is a list of other people |
| **Their `usage_counts` rows** | **decision 8c: NO.** Nobody can read that table — not even the person it is about — and including them would mean a new privilege and a change to the plan's own sentence. They are four values wide and say which days somebody used the app |
| **Their `account_status` row and the owner's `reason`** | **decision 8d: NO.** Nobody can read that table either, and the reason is the owner's free text *about* a person, which can name a third party. Including it would publish the owner's note to its subject |
| **The sign-in log**, and any IP address | `docs/plan.md` says never to build anything on it |
| **Error reports, Resend's log, and anything at Anthropic** | they are other companies' records. The policy says where to ask |

**The two awkward ones are 8c and 8d**, and they are awkward in opposite directions: a count of
somebody's own activity and a judgement made about them are exactly the things a person asking "what do
you hold about me?" most reasonably wants. The reason to leave them out is that the plan decided
**nobody** may read either through the app, and an export is through the app. **The honest resolution is
not to quietly omit them: it is for the policy to SAY that both exist, what they contain, and that they
are available from the owner on request.** **TAKEN, 2026-10-12.** So two sentences join the privacy
page's list, and they are the kind this project has to hold itself to: *the app counts how many times
each person used each limited feature on each day, and keeps it for seven days*, and *if the owner has
suspended an account there is a row saying so, when, and optionally why* — **and both are available by
asking the owner**, which is a promise somebody will one day hold the owner to. `docs/claims.md` §7d
carries the rows.

### 11.4 Three things about it that are not obvious

- **It is the first thing in this app that assembles everything about one person into one artefact.**
  Each row of it is readable today; the file is new. Somebody who has taken a session can take the
  file — so it should require a **recent** sign-in, or at least say on the page that the file contains
  everything and should be kept carefully.
- **It costs egress and spends nothing at a vendor.** So it is **not** a candidate for
  `usage_counts` on the "money per press" argument — but it is the one new way to pull everything at
  once, repeatedly. **Decision 9, taken 2026-10-12: NOT counted.** `usage_counts` stays at three
  feature words, no migration is needed, and what bounds it is Supabase's own per-IP limits and nothing
  else — **which is stated rather than implied**, because it means a loop holding one person's session
  can ask for their own file as often as the platform allows. Revisit if it is ever abused; a fourth
  feature word is a migration, and that is the cost being deferred rather than avoided.
- **It must not include a file name in an error report** if it fails, which is the rule
  `docs/plan.md` already puts on this app's own code rather than on Sentry's scrub.

---

## 12. The public deletion-request page, for people who cannot sign in

**Who needs it:** somebody who has forgotten their password and cannot get a reset email; somebody whose
account is suspended (section 10); somebody who signed up and never confirmed; and an invited person
whose **address is in the `invitations` table and who never had an account at all** — which this app has
no other way of hearing from.

**That last one matters more than it looks.** The invitations table holds addresses of people who agreed
to nothing, and `docs/plan.md`'s appendix answers "how a user deletes it" with "**They cannot** — not a
user yet; owner deletes". A public page is the only route such a person has.

### 12.1 The shape — **decision 10, taken 2026-10-12: NO FORM**

| | **A. A page with no form** — **TAKEN** | **B. A page with a form** — not taken |
|---|---|---|
| What it is | One public page that says what deleting does, what remains for about a fortnight, and **one address to write to** from the address on the account | A form that takes an email address and sends the owner a message |
| What it collects | **nothing.** No row, no endpoint, no email sent by this app | an email address, from an unauthenticated stranger |
| What it needs built | a page, a link in the footer, and `"/delete-account"` added to `PUBLIC_PATHS` in `web/src/lib/supabase/proxy.ts` — **without which a signed-out visitor is redirected to `/login`**, which is the whole point of the page failing | all of that, **plus** the CAPTCHA, plus a rate limit, plus a new unauthenticated path that sends email — which is the shape [#122](https://github.com/build-once/team-tasks/issues/122) already records as a problem on the one screen that has it |
| What it costs | the owner's mailbox becomes the store, and the owner must check who is asking | a new store of addresses, a new spam vector, and an endpoint that spends the email allowance |

**How the owner checks who is asking**, which is the control and has to be written down rather than
assumed: **the request must come from the address on the account**, and the owner replies to that
address before deleting anything. Without that, anybody who knows a volunteer's address can have their
account destroyed by sending one email. For an **invited address with no account**, the same test works:
the request comes from the address that was invited.

### 12.2 What the page must say

- that deleting is **real** and cannot be undone;
- **what goes and what stays** — the same list as section 5, including that teams they own go and that
  other members' own tasks return to them;
- that **copies remain for up to about a fortnight** and then go;
- that **after a recovery everybody signs in again** (the owner's decision of 11 Oct 2026, which
  `docs/plan.md` already says this build owes people);
- that **error reports at Sentry are deleted on request**, not automatically;
- that **what has already gone to Anthropic cannot be recalled**, and that nothing identifying the
  person was sent with it;
- **where data is held** — or a link to the privacy page that says it;
- and, if decision 7 is "leave it": that a **suspended** person asks here rather than in the app, and
  why.

---

## 13. The decisions, and the owner's answers — ALL TEN TAKEN 2026-10-12

Every one came back the same day, and **every one came back as this file recommended.** They are
gathered here and repeated in `docs/plan.md`'s Build it 26 section, so there is one list to read and
one place the answers live. **Two of the ten carried something extra with them**, and those two are the
rows worth re-reading: 3 and 4.

| # | The decision | **The owner's answer** |
|---|---|---|
| 1 | Do tasks the person created in **other people's teams** survive, shown as "Former member"? | **YES.** Section 6 is the five schema changes it costs, and the fifth was found after this answer |
| 2 | Does the warning name **every team they own**, and say other members keep their own tasks? | **YES.** Section 5 |
| 3 | What happens to a former member's task when **its team is later deleted**? | **ACCEPT THE ORPHAN; the operator sweeps it** — *and* `delete-account` removes a doomed team's former-member tasks **explicitly**, so the orphan can arise only from a team deleted by hand. That second half is **step 4b**, which is new, and section 3 says what it covers and what it deliberately does not |
| 4 | Does the deletion remove files they uploaded to **tasks that survive**? | **YES — and it is now MANDATORY rather than a decision**, because `storage.objects` turns out to have **no foreign key to `auth.users`** at all. Section 7 |
| 5 | Are **invitations addressed to them** deleted? | **YES.** Step 5 |
| 6 | **Tombstones** (A), the owner's own record (B), or accept that a restore brings them back (C)? | **A** — 30 days, two columns, no privilege for anybody. Section 9.2 |
| 7 | May a **suspended** person delete their own account? | **NO** — the request page. Section 10, which also names the one ordering consequence it has |
| 8 | The export's contents: **8a** the invited addresses on invitations they sent; **8b** their teams' rosters; **8c** their usage counts; **8d** their suspension row | **8a YES. 8b, 8c, 8d NO** — and **the policy says the two closed tables exist and how to ask for them.** Section 11.3 |
| 9 | Is the **export** counted against a daily limit? | **NO.** Three feature words, no migration, and the per-IP limits are all that bound it — said plainly in section 11.4 |
| 10 | Does the **deletion-request page** have a form? | **NO.** Section 12.1 |

**And one thing the answers produced that was a question rather than a decision: question 17** in
`docs/plan.md`. Decision 3's instruction, read literally, would have `delete-account` remove **every**
task in a doomed team rather than only the orphan-producing ones — which would destroy other members'
work and reverse both `20261002133637_tasks_join_teams.sql`'s choice of `set null` over `cascade` and
decision 2's own promise that "nobody loses a task they wrote themselves". This file was written to the
narrow reading and said so, rather than choosing for the owner.

**ANSWERED 2026-10-13: the narrow reading was meant.** So nothing in this file is now open, and the
departure from the book it implies is recorded in section 3 and in `docs/plan.md`'s answer 17 rather
than left to be noticed. **What is left of Build it 26 is not a decision but the words**, which
`docs/plan.md`'s answer 5 puts in the owner's hands — and answer 5's own limit, that the owner's
reading is not a legal review, is a drafting rule the pages are held to.
