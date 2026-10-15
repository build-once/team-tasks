# Evidence: storage-rules

Result: PASS — Alice uploaded a file to staging's `attachments` bucket; Bob's list returned 0
entries and his open, sign, upload and delete were all refused, as were a signed-out caller's five
actions.
Date: 2026-10-15 (the run itself: **9 October 2026**)
How checked: the owner ran `scripts/staging/build-it-23-attachment-checks.mjs` against **staging**
twice — before applying `20261008191804_attachments_bucket.sql` and after it — against the real
Supabase Storage service, not a stand-in. The record is
`evidence/build-it-23-attachments-bucket.md`, "Record of the staging apply and runs".
Checked by: the owner, on staging, 9 October 2026; written up here from that record. **The
assistant did not run it** and has never signed in to staging.

---

## 1. The two runs, which is what makes the second one mean anything

| | Totals, the owner's own line |
|---|---|
| **Run 1**, before the migration was applied | **35 PASS, 12 FAIL, 1 UNVERIFIED** — there was no bucket |
| **Run 2**, after it | **49 PASS, 2 FAIL, 0 UNVERIFIED** |

**12 FAIL is the pass mark for a before-run**, as that evidence file puts it: the twelve are the
bucket and every upload that should have worked and could not. A single green run proves far less
than a red one followed by a green one.

## 2. Bob, and a signed-out caller

From the owner's record of run 2:

```
- Alice uploads to her team task; Carol lists, opens and gets a signed link; the link opens with
  no key and no session.
- Bob: list returns 0 entries; open, sign, upload and delete are refused.
- Signed out with the publishable key only, and with no credentials at all: all five actions refused.
- A made-up task ID and a top-level path: refused.
- Carol deleting a file she did not upload on a task she did not create: refused.
```

**Bob's list returning 0 rather than erroring is the right shape**, and is the thing a weaker test
would miss: row-level security refuses by returning nothing. **Carol is the subtler row** — she is
*in* the team and *can* see the task, and she still cannot delete somebody else's file.

**The signed link opening with no key and no session is not a hole**: it is what a signed URL is,
for five minutes, and `docs/plan.md`'s "Links, and what an unexpired one allows" is where that is
written out.

## 3. The rules those refusals come from

`supabase/migrations/20261008191804_attachments_bucket.sql` — three policies on `storage.objects`,
each `to authenticated` only, each asking `exists (select 1 from public.tasks …)` **as the caller**,
so the file inherits its task's audience. Read back on staging the same day by the coach through the
read-only connector: bucket `attachments` **private**, limit 5242880, the six named types, three
policies, trigger `tasks_refuse_delete_with_files` present, **0 objects** afterwards.

## 4. What this does NOT establish

- **Nothing about production's bucket.** Same migration, same pipeline; nobody has read production's
  policies back, which [#243](https://github.com/build-once/team-tasks/issues/243) held and
  `docs/environments.md` records as read on 9–10 Oct by the coach. **Whether production refuses Bob
  is therefore an inference from identical migrations — unchecked here.**
- **The two FAILs in run 2 were not rule faults**: both were the HEIC probe, which is
  [#246](https://github.com/build-once/team-tasks/issues/246) and is why the app no longer offers
  that type.
- **The bucket's own 5 MB and type limits are enforced by the Storage API**, not by Postgres, so the
  local sandbox in `evidence/build-it-23-attachments-bucket.md` could not test them. Run 2 could, and
  did: `5242881` bytes refused `EntityTooLarge`, an executable and an SVG refused `InvalidMimeType`.
- **Nothing was captured from production**; the accounts are Alice, Bob and Carol, and the list of
  redacted values is empty.
