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

**Eight steps. Each one is refusable, and a refusal stops the whole thing and says so.** Nothing is
half-done: the account is still there, the person is told, and they can try again.

| # | Step | Why it is in this position |
|---|---|---|
| **0** | **Read what is about to happen and show it to the person**: how many tasks, how many files, and **the name of every team they own** | The warning in section 5. A deletion that names nothing is a deletion nobody can consent to |
| **1** | **Refuse unless the person has just confirmed** — a typed confirmation, not a single click | It is the only irreversible thing in the app |
| **2** | **Delete every file on every task they own, through the Storage API, and read back** | Section 2. This is what unblocks the trigger. **It must read back**, exactly as `clearTaskFiles` does |
| **3** | **Delete every file they uploaded to a task that is going to SURVIVE** — a task somebody else created, in a team — through the Storage API, and read back | **Decision 4.** These are their uploads sitting on other people's tasks. If they are left, `storage.objects.owner_id` points at an account that is about to vanish, and section 7's unknown decides whether that even works |
| **4** | **Delete the tasks that are not being kept**: every task they own whose `team_id` is null, and every task they own that is in a team they own | Done explicitly, **before** the account goes, so that step 6's `set null` leaves behind only the tasks that are meant to survive. See section 6 |
| **5** | **Delete every pending invitation addressed to their own email address** | **Decision 5.** These do **not** cascade — they are keyed by an address, not by a user id — so without this step the app keeps the email address of somebody who has just left |
| **6** | **Delete the `auth.users` row, with the Admin API** | Everything else goes with it: their teams (and those teams' invitations and memberships), the invitations they sent, their profile, their suspension row, their usage counts, and — if decision 1 is taken — the ownership of the tasks that stay |
| **7** | **Sign them out**, and send them to a page that says it is done | Last, because until step 6 succeeds they are still an account |
| **8** | **Write a line in `evidence/` with no identity in it** — a date and a count | **Decision 6.** The alternative is that nothing anywhere records that a deletion happened, which makes section 8 impossible |

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
including the ones in other people's teams. Keeping them is a schema change, and it is four changes
rather than one.

### 6.1 The four things a migration has to do

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

### 6.2 The consequence nobody would find until it happened

**When that team is later deleted, a former member's task becomes unreachable.** `tasks.team_id` is
`on delete set null`, so the task survives the team with `team_id` null **and** `owner_id` null — and
then:

- **the select policy** returns it to nobody: `auth.uid() = owner_id` is false for a null owner, and the
  team branch needs a `team_id`;
- **the delete policy** matches nobody, for the same reason;
- so the row sits in the table, invisible and undeletable, until the operator removes it by hand.

**That is a real orphan and this file is not going to hide it.** Three ways out, and it is **decision
3**:

| Option | What it costs |
|---|---|
| **Accept it.** The operator clears such rows in the dashboard | A row of somebody's task text, kept after they left and after the team went, reachable only by the operator. It is the smallest change and the least honest answer |
| **Delete former-member tasks when the team goes.** An `after update` trigger on `tasks`: when `team_id` has just become null because the team was deleted **and** `owner_id` is null, delete the row | A second trigger on the busiest table, and a delete performed by the database rather than by a person. It also has to get past `tasks_refuse_delete_with_files`, so the files would have to go first — which a trigger cannot do, because it cannot call the Storage API |
| **Do not keep the tasks at all** — decision 1 the other way | "Former member" disappears, and so does this whole section. A team loses the task a departed member wrote, which is a loss the team can see and talk about rather than a row nobody can reach |

**The recommendation, stated as one:** take decision 1 **and** the second option, *but* note that the
second option cannot clear the files — so the honest combination is decision 1 with **step 3 above made
unconditional** (every file the departing person uploaded goes, wherever it is) and the orphan accepted
and swept by the operator. If the owner would rather not have a design with a known orphan in it at
all, **decision 1 the other way is the cleaner answer** and costs one sentence in the warning.

---

## 7. What is NOT confirmed, and one of them decides whether step 6 works

1. **What `storage.objects.owner_id` does when its `auth.users` row is deleted.** Nobody has read the
   constraint. Three possibilities and they are not equally survivable:
   - **`on delete set null`** — the file survives with no owner, belongs to nobody's 100 MB, and can be
     deleted only by the task's creator. Workable, and step 3 makes it moot.
   - **`on delete cascade`** — the **row** goes and the **bytes stay**, which is the orphan this whole
     design is built to prevent. Step 3 becomes mandatory rather than a decision.
   - **no action** — **deleting the account is refused** while any of their uploads exists anywhere.
     Step 3 becomes mandatory *and* has to cover files on tasks that are not theirs.

   **It is the first thing Build it 26's code has to establish**, and it is one read, not a
   measurement: the foreign keys on `storage.objects` in a real project. A local sandbox cannot answer
   it, because that sandbox's `storage` schema is a stand-in this project wrote.
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

### 9.2 Three ways, and the one this file recommends — **decision 6**

| | What it is | What it costs |
|---|---|---|
| **A. A short-lived tombstone** — *recommended* | One table, two columns: the **`auth.users` id** and the **date**. Nothing else — no address, no nickname, no task text, no reason. **No policy and no privilege for any role**, exactly as `account_status` and `usage_counts` have none. **Rows are removed after 30 days**, by the same statement that writes one, which is the mechanism `count_daily_use` already uses for the 7-day window | It holds a user id and a date about somebody who has left. **But only for 30 days — and 30 is chosen because it outlives the longest-lived copy that could resurrect them (about fifteen days) and nothing more.** So it is not a register of departures; it is a note that expires before the thing it exists to correct does |
| **B. Nothing in the app; the owner's own record** | The runbook gains a step: "has anybody asked to be deleted since this copy was made? If so, re-run the deletion afterwards." The record is the request the owner received, in their own mailbox, outside this project | Collects least, which is this plan's bias. **And it cannot work for a self-service deletion**: somebody who presses the button in the app sends the owner nothing, so there is no request to remember and no way to know who to re-delete |
| **C. Accept it** | A restore brings them back, and the runbook says so | It makes "deleted" conditional on this app never having a bad day, which is not a promise worth making to somebody who asked to be removed |

**Why A rather than B**, in one sentence: B is more private and only works for the people who wrote in,
and the whole point of Build it 26 is that a person does not have to write in.

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

**Recommended: leave it, and say so on the deletion-request page**, because the taken-over-account case
is the one where getting it wrong destroys somebody's data on somebody else's instruction.

---

## 11. The export — one file, their own data, built with their own rights

**Decision 8 is its contents; the shape below is the proposal.**

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
| **invitations they sent**: the team, the status, the failure code if any, when it was sent and when it expires — **and the invited address: decision 8a** | `invitations`, through the owner-only read |
| **files**: for every file on their tasks — the file name, its size, when it was uploaded, and which task it is on | `storage.objects`, through the SELECT policy |

### 11.3 What is deliberately NOT in it, and why each

| Not included | Why |
|---|---|
| **Their password hash**, session and refresh tokens | they are credentials, and a hash is not useful to its owner |
| **An invitation's `token_hash`** | the same. It is a credential's hash |
| **The files themselves** | a 100 MB allowance does not fit in a JSON file. The export **lists** them, and the person downloads each one through the app, which already gives them a 5-minute signed link |
| **Anybody else's tasks**, including team tasks written by other members | they are not this person's data. A team's shared list belongs to the team |
| **Anybody else's nickname**, and the other members of their teams | **decision 8b.** The person can see their teams' rosters on screen; an export file is a durable artefact and a roster in one is a list of other people |
| **Their `usage_counts` rows** | **decision 8c.** Nobody can read that table — not even the person it is about — and including them would mean a new privilege and a change to the plan's own sentence. They are four values wide and say which days somebody used the app |
| **Their `account_status` row and the owner's `reason`** | **decision 8d.** Nobody can read that table either, and the reason is the owner's free text *about* a person, which can name a third party. Including it would publish the owner's note to its subject |
| **The sign-in log**, and any IP address | `docs/plan.md` says never to build anything on it |
| **Error reports, Resend's log, and anything at Anthropic** | they are other companies' records. The policy says where to ask |

**The two awkward ones are 8c and 8d**, and they are awkward in opposite directions: a count of
somebody's own activity and a judgement made about them are exactly the things a person asking "what do
you hold about me?" most reasonably wants. The reason to leave them out is that the plan decided
**nobody** may read either through the app, and an export is through the app. **The honest resolution is
not to quietly omit them: it is for the policy to SAY that both exist, what they contain, and that they
are available from the owner on request.** That is recommended over including them.

### 11.4 Three things about it that are not obvious

- **It is the first thing in this app that assembles everything about one person into one artefact.**
  Each row of it is readable today; the file is new. Somebody who has taken a session can take the
  file — so it should require a **recent** sign-in, or at least say on the page that the file contains
  everything and should be kept carefully.
- **It costs egress and spends nothing at a vendor.** So it is **not** a candidate for
  `usage_counts` on the "money per press" argument — but it is the one new way to pull everything at
  once, repeatedly. **Decision 9:** count it, or leave it to the per-IP limits. Recommended: leave it,
  and revisit if it is ever abused, because a fourth feature word means a migration.
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

### 12.1 The shape — **decision 10**

| | **A. A page with no form** — *recommended* | **B. A page with a form** |
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

## 13. The decisions this file needs, in one view

Gathered here and repeated in `docs/plan.md`'s Build it 26 section, so that there is one list to answer
and one place the answers are recorded.

| # | The decision | This file's recommendation |
|---|---|---|
| 1 | Do tasks the person created in **other people's teams** survive, shown as "Former member"? | **Yes** — it is what the owner asked for. Section 6 is what it costs |
| 2 | Does the warning name **every team they own**, and say other members keep their own tasks? | yes |
| 3 | What happens to a former member's task when **its team is later deleted**? | accept the orphan and let the operator sweep it, or take decision 1 the other way |
| 4 | Does the deletion remove files they uploaded to **tasks that survive**? | **yes, unconditionally** — and section 7's first unknown may make it mandatory |
| 5 | Are **invitations addressed to them** deleted? | yes. Step 5 |
| 6 | **Tombstones** (A), the owner's own record (B), or accept that a restore brings them back (C)? | **A**, 30 days, two columns, no privilege for anybody |
| 7 | May a **suspended** person delete their own account? | no — the request page instead |
| 8 | The export's contents: **8a** the invited addresses on invitations they sent; **8b** their teams' rosters; **8c** their usage counts; **8d** their suspension row | 8a **yes** (they typed it and the app already shows it to them); 8b **no**; 8c and 8d **no, and the policy says both exist and are available from the owner** |
| 9 | Is the **export** counted against a daily limit? | no, for now |
| 10 | Does the **deletion-request page** have a form? | **no** |
