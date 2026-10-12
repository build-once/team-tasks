# Evidence: Build it 25 part 2 — the screens for the three new limits, and the production read-back

Result: **PASS with one deliberate gap** — every sentence the owner checked on a Preview behaved as
designed; **the 500-task sentence was not seen in a browser, by the owner's decision.**
Date: 2026-10-12
How checked: two reports, neither of them the assistant's. The **owner** signed in to the pull
request's Vercel Preview as **Bob** on **staging** and worked through the list below. The **coach**
read **production** through the read-only Supabase connector after the merge of PR #296. Both are
recorded here because `docs/plan.md` rule 14 asks for the state to be checked before it is stated, and
neither of these could be checked from this repository.
Checked by: recorded by Claude Code from the owner's and the coach's reports, 2026-10-12. **Nobody
writing this file opened a browser, a dashboard or a connector, and nothing was run against staging or
production.**

---

## 1. What this file is, and what it is not

It is the record of two things that happened around PR #299 and that nothing in this repository can
show. **It is not a run of anything**: every line below is somebody else's observation, attributed, and
where a figure or a screen's exact words were not written down, this file says so rather than filling
the gap in.

**Why it exists at all.** PR #299 merged on 2026-10-12 (`45d187b`, `git log --oneline -3` in this
session). The checks in it were made on its Preview before the merge, and the production read-back was
made after the merge of PR #296 — so by the time the next pull request opened there was nowhere in this
repository that either had been written down. `docs/plan.md` rule 13: text that only exists in a reply
is lost the moment the window closes.

---

## 2. The owner's checks on PR #299's Preview — reported, not observed here

**Signed in as Bob, against staging, on the pull request's Vercel Preview deploy.**

| What was tried | What was seen | Verdict |
|---|---|---|
| Add a task normally | works | **PASS** |
| Rename a task normally | works | **PASS** |
| **Paste two lines into the add-task box** | the line-break sentence was shown | **PASS** |
| **Paste two lines into a rename** | the line-break sentence was shown | **PASS** |
| **Paste two lines into the nickname box** | the line-break sentence was shown | **PASS** |
| **Attach a file while at the daily upload limit** — Bob had already been counted for **30** | **"You've reached today's limit. It resets tomorrow."** | **PASS**, and it is the first time that sentence has been seen on a screen |
| **Attach a `.zip`** | refused with the existing wrong-type sentence | **PASS** |
| **The 500-task sentence** | **NOT SEEN, by the owner's decision.** Reaching it needs 500 tasks on one account | **not verified** |

**Three things this does and does not establish, said precisely:**

- **the upload-limit sentence has now been seen by a person**, on a real screen, over a real refusal —
  which is the half that `evidence/build-it-25-upload-count.md` could not reach, because that file is a
  local PostgreSQL sandbox;
- **the three line-break refusals were seen on three different inputs**, which is what makes it the
  constraint working rather than one screen being right;
- **the 500-task sentence is untested in a browser.** It is checked by
  `scripts/screen-state-check.mjs` against the migration's own number, and the path that chooses it is
  the one `20261012094500_task_cap_and_input_limits.sql` section 4 designs: a `42501` refusal, then a
  call to `public.tasks_may_add()` to tell the cap from everything else. **Nobody has watched that
  happen.** It stays on the "not seen in a browser" list that
  [#176](https://github.com/build-once/team-tasks/issues/176) and
  [#212](https://github.com/build-once/team-tasks/issues/212) already keep for other screens.

**And one thing not recorded, which is the usual cost of a reported check:** no screenshot, and the
exact characters of each sentence as drawn were not written down — only that each was the expected one.
So what is established is **which sentence appeared**, not that it was character-for-character the
constant. `scripts/screen-state-check.mjs` is what holds the characters.

---

## 3. The coach's production read-back after PR #296 — reported, not observed here

**Read through the read-only Supabase connector for the production project.** Rule 19 permits the
assistant no production command of any kind and this session used none; this is the coach's reading,
copied here.

| What was read | What it said |
|---|---|
| Migrations recorded | **14** |
| `attachments_count_upload` on `storage.objects` | **present and enabled** |
| What the function identifies the uploader by | **it reads `owner_id`** — the row, not only the session, which is the whole of what `20261012150000_upload_count_from_owner_id.sql` changed |
| `attachments_count_upload` and `uploads_used_today` | **both `security definer`**, and **EXECUTE false for `authenticated` and for `service_role`** |

**Why each of those four was worth reading, and what is still not known:**

- **14 migrations** matches `git ls-files supabase/migrations`, counted in this session: fourteen files.
  So production has every migration this repository holds, including both upload-count ones.
- **The trigger being enabled** is the thing a green deploy job cannot tell you. `20261012120000`'s
  section 0 refuses the whole push if the role has no TRIGGER privilege on `storage.objects`, so the
  push getting past it was already a fact — **that the trigger then exists and is enabled is the
  separate fact**, and it is now read rather than inferred.
- **"It reads `owner_id`"** is the read-back the second migration's own section 5 asks for by name, and
  it is what distinguishes the fixed function from the one that counted nothing.
- **EXECUTE false for both roles on both functions** is the privilege half, and it is the one this
  feature's privacy rests on: `docs/plan.md` says of `usage_counts` "Who can see it: no app user, not
  even the person whose count it is", and a function nobody holds EXECUTE on is not a read anybody has.
- **What is still not read on production:** whether `usage_counts` holds any row at all, for any
  feature. [#222](https://github.com/build-once/team-tasks/issues/222) has held that since 8 October and
  is unaffected by this reading.

---

## 4. What neither report settles

1. **No screenshot of anything**, on either report.
2. **The 500-task sentence has never been drawn.**
3. **Nothing has been checked on a phone**, which is the device `docs/plan.md` says this app is for.
   Both of the owner's sessions in Build it 25 were a Windows PC.
4. **`FILE_NO_ROOM` — the 100 MB sentence — is still a sentence nobody has ever seen**, and
   [#300](https://github.com/build-once/team-tasks/issues/300), filed alongside this change at the
   owner's approval, records something worse than that: **no function in the app returns the outcome
   that draws it.** `uploadRefusal` in `web/src/lib/attachments.ts` can answer `toomany`,
   `notallowed` or `failed`, and never `noroom` — so somebody who actually reaches their 100 MB is shown
   the **permission** sentence instead.
