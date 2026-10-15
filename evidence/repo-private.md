# Evidence: repo-private

Result: N/A - public by decision
Date: 2026-10-15
How checked: read the decision record, `docs/decisions/public-repo.md`, and confirmed the
repository's visibility: `gh repo view --json visibility` reports `PUBLIC` for
`build-once/team-tasks`, which is what `scripts/launch-check.mjs` reported as a FAIL before this row
became an evidence row.
Checked by: the owner took the decision on 28 September 2026; the assistant wrote it down and read
the visibility back.

---

## 1. Why N/A rather than FAIL

`build-once/team-tasks` is **public on purpose**: Vercel's Hobby plan cannot deploy a private
repository owned by a GitHub organisation, and the budget is £0 a month while building. The
repository was recreated as public on **28 September 2026**, with **noreply-only commit addresses**
so no personal email is in the history, and the old private repository kept as an archive.
**GitHub secret scanning and push protection are on.**

`docs/decisions/public-repo.md` is the record, including what would change it.

## 2. This row changed type, and it is a finding about the kit

Until 15 October 2026 this was an **`auto`** row running the kit's `repo_private` check, which
hard-codes `PUBLIC` to **FAIL** — and `scripts/launch-check.mjs` has **no N/A path for an auto
row**: nothing in it reads an override, an exemption or an `allow_na`. So a project that is public
by a recorded decision had no way to say so, and the launch checklist could never reach "every row
is PASS or N/A with a reason".

**The smallest honest change was to make it an evidence row**, which is what every other
decided-N/A in this checklist already is — `store-requirements` is the precedent, N/A because this
app is web-only. The row's `title` and `lesson` are untouched, and its `how_to_prove` records the
change and why.

**What that costs, stated rather than hidden: nothing now watches the repository's visibility.**
The auto check would have caught the repository being flipped private or public by accident; this
file cannot. That is the price of being able to record the decision, and it is a fair one here
because the visibility is load-bearing in the other direction — if it ever became private, Vercel
would stop deploying and that is noticed in minutes.

## 3. What this does NOT claim

- **Not that a public repository is as safe as a private one.** It is not, and
  `docs/decisions/public-repo.md` lists what it costs: every Actions log, every evidence file and
  every migration is readable by anybody, which is why the backup job echoes only names and byte
  counts and why the production project reference and site address are absent from this repository.
- **Not that secret scanning has caught anything**, or has ever been tested. It is reported as
  switched on by the owner; nobody writing this has opened the settings page. **Unchecked.**
- **Not that the archive repository is still there.** The owner's report of 28 September 2026 is the
  only source, and nothing here re-reads it.
