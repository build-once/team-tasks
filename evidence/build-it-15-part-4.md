# Evidence: Build it 15 part 4 (the daily drift check)

Issue #93, part 4 of four. Files added or changed:

- `.github/workflows/drift-check.yml` — new
- `scripts/drift-check.mjs` — new
- `.github/workflows/ci.yml` — one job added, `needs` and `EXPECTED_JOBS` updated
- `package.json` — `drift:test`, and it joins `npm test`

**What this file is, and what it is not.** Everything below was run by the assistant on the
owner's own machine on **2026-10-02**. Nothing in it touched production, or staging, or any remote
project of any kind. **The workflow itself has never run** — section 6 lists exactly what that
leaves unverified, and it is not a short list.

---

## 1. The pinned CLI, on this machine

The workflow pins Supabase CLI **2.117.0**, matching `migrate-production.yml`. The owner's own
installed CLI is **2.75.0** (issue #70), which is **not** the version CI uses — and the two behave
differently in a way that matters here, so 2.75.0 was not used for any of this.

The pinned binary was downloaded from the CLI's own GitHub release, checksum-verified against the
release's `checksums.txt`, and used for every CLI output in this file:

```
$ gh release download v2.117.0 --repo supabase/cli \
    --pattern 'supabase_2.117.0_windows_amd64.zip' --pattern 'checksums.txt' --dir cli-pin
$ grep 'windows_amd64.zip' checksums.txt
ac8d9d23f5ce08ea521a4064e01b0018f8eb5d75cac664ea7b5ce246f8d559c5  supabase_2.117.0_windows_amd64.zip
$ sha256sum --check --strict --ignore-missing checksums.txt
supabase_2.117.0_windows_amd64.zip: OK
$ ./supabase.exe --version
2.117.0
```

It was unpacked into the assistant's scratchpad, outside the repository, and is not committed.

## 2. Are the two commands really read-only?

The constraint in issue #93 is the right one: the database URL can write, so the **commands** are
the only thing keeping this read-only. Both are documented as reads:

- `supabase migration list` — "Lists migration history in both local and remote databases."
  https://supabase.com/docs/reference/cli/supabase-migration-list
  `--db-url <string>`: "Lists migrations of the database specified by the connection string (must be
  percent-encoded)."
- `supabase functions list` — "List all Functions in the linked Supabase project."
  https://supabase.com/docs/reference/cli/supabase-functions-list
  `--project-ref <string>`: "Project ref of the Supabase project."

Documentation is a claim, so `migration list` was also **tested against a database that had nothing
for it to read**. A throwaway PostgreSQL 17 cluster was started in the scratchpad on port 55433,
listening on `127.0.0.1` only, with trust authentication, and a second database `notable` was
created in it with **no `supabase_migrations` schema at all**:

```
$ ./supabase.exe migration list --db-url "postgresql://postgres@127.0.0.1:55433/notable?sslmode=disable"
Connecting to remote database...
{"migrations":[{"local":"20260927182443","remote":"","time":"2026-09-27 18:24:43"},
{"local":"20260930101343","remote":"","time":"2026-09-30 10:13:43"},
{"local":"20260930193813","remote":"","time":"2026-09-30 19:38:13"},
{"local":"20261002122203","remote":"","time":"2026-10-02 12:22:03"},
{"local":"20261002133637","remote":"","time":"2026-10-02 13:36:37"},
{"local":"20261002170244","remote":"","time":"2026-10-02 17:02:44"}],"message":"Migrations listed"}
exit: 0
```

Then, in the same database:

```
$ psql ... -t -c "select count(*) from information_schema.schemata where schema_name = 'supabase_migrations';"
     0
```

So it exited 0, reported every local migration as unapplied, and **did not create the table it
reads**. That is a stronger result than the documentation gives: it is not merely that the command
has no write mode, it is that the one write it might plausibly have made was not made.

`functions list` was **not** run successfully anywhere, because the assistant holds no access token
for any project. See section 6.

The cluster was stopped and its data directory deleted at the end of the session.

## 3. The output format, which is not what it looks like

This is the surprise of the task, and the reason `--output-format json` is passed explicitly in the
workflow rather than left to the default. All four runs below are the same command against the same
database, with the same six migrations applied:

**No format flag** — JSON:

```
$ ./supabase.exe migration list --db-url "...55433/postgres?sslmode=disable"
Connecting to remote database...
{"migrations":[{"local":"20260927182443","remote":"20260927182443","time":"2026-09-27 18:24:43"},
... ,{"local":"20261002170244","remote":"20261002170244","time":"2026-10-02 17:02:44"}],
"message":"Migrations listed"}
```

**`-o json`** — a **table**:

```
$ ./supabase.exe migration list --db-url "..." -o json
Connecting to remote database...

  
   Local            | Remote           | Time (UTC)            
  ------------------|------------------|-----------------------
   `20260927182443` | `20260927182443` | `2026-09-27 18:24:43` 
   ...
```

**`-o pretty`** — the same table.

**`--agent no`, with no format flag** — the same table.

Two things follow, and both were checked rather than reasoned about:

1. **`-o` and `--output-format` are different flags.** `--help` on the pinned binary lists them
   separately: `--output-format choice  Output format: text (default), json, or stream-json
   (NDJSON)` and `--output, -o choice  output format of status variables`. On 2.117.0, passing `-o
   json` produced the table. Anyone reaching for the obvious flag here gets the opposite of what
   they asked for.
2. **The default depends on the surroundings.** `--agent choice  Override agent detection: yes, no,
   or auto (default auto)`. In the assistant's shell the CLI detected an agent and printed JSON;
   with `--agent no` the identical command printed the table. A GitHub Actions runner is a third
   environment, and nothing here has observed which way it falls.

`--output-format json` settles it in both directions:

```
$ ./supabase.exe migration list --db-url "..." --output-format json --agent no
{"migrations":[...],"message":"Migrations listed"}
```

`scripts/drift-check.mjs` reads **both** shapes anyway, and its self-test covers both, so the day
the flag or its default changes is not the day the check silently stops working.

## 4. Drift, made and then read back

One row was deleted from the throwaway cluster's `supabase_migrations.schema_migrations` and one
version the repository does not have was inserted:

```
$ psql ... -c "delete from supabase_migrations.schema_migrations where version = '20261002170244';
               insert into supabase_migrations.schema_migrations (version, name)
               values ('20261003090000','hotfix_applied_by_hand');"
DELETE 1
INSERT 0 1
```

The CLI then reported both directions itself — an empty `remote` for a migration in the repository
that is not applied, and an empty `local` for one applied that the repository does not have:

```
{"migrations":[... ,{"local":"20261002170244","remote":"","time":"2026-10-02 17:02:44"},
{"local":"","remote":"20261003090000","time":"2026-10-03 09:00:00"}],"message":"Migrations listed"}
```

and in table form, where an empty cell is a backtick, a space and a backtick:

```
   `20261002170244` | ` `              | `2026-10-02 17:02:44` 
   ` `              | `20261003090000` | `2026-10-03 09:00:00` 
```

Both of those are the fixtures `RECORDED_JSON_BOTH_WAYS` and `RECORDED_TABLE_BOTH_WAYS` in
`scripts/drift-check.mjs`. They were recorded first and the parser written to them, not the other
way round.

## 5. Proving it can fail

### 5.1 The self-test, green

```
$ node scripts/drift-check.mjs --selftest
PASS  identical lists produce no drift
PASS  a migration in the repository but not applied is drift
PASS  a migration applied but not in the repository is drift
PASS  a function in the repository but not deployed is drift
PASS  both migration directions at once, from recorded output
PASS  the recorded table format is read the same way
PASS  a function deployed with no folder is drift
PASS  a deployed function whose status is not ACTIVE is drift
PASS  the CLI's own error is a refusal, and its message is not repeated
PASS  unreadable migration output is a refusal
PASS  unreadable function output is a refusal
PASS  no migration files is a refusal, not a pass
PASS  no function folders is a refusal, not a pass
PASS  a migration file the repository has and the CLI did not list is a refusal
PASS  a badly named migration file is a refusal
PASS  a _shared folder is not treated as a function
PASS  a non-zero CLI exit is a refusal, naming only the error code
PASS  a non-zero CLI exit with no error code still refuses
PASS  a failing functions list is a refusal too
PASS  both CLI commands exiting 0 is what lets the comparison run
Self-test: 20/20 cases passed.
exit: 0
```

The first four are the four cases issue #93 asks for.

### 5.2 Green is worthless until red is shown

A test that has only ever passed has not been shown to test anything. So the comparison was broken
on purpose, five times, in a scratch copy outside the repository, and the self-test re-run each
time. Each mutation is one line.

| Mutation (in a scratch copy) | Result |
|---|---|
| `if (row.local && !row.remote)` → `if (false)` — blind to an unapplied migration | **13/16**, exit 1. "a migration in the repository but not applied is drift" FAILED: "drift was false, expected true" |
| `else if (!row.local && row.remote)` → `else if (false)` — blind to a migration production has and the repository does not | **13/16**, exit 1. "a migration applied but not in the repository is drift" FAILED: "drift was false, expected true" |
| `if (!deployed)` → `if (false)` — blind to an undeployed function | **15/16**, exit 1. "a function in the repository but not deployed is drift" FAILED |
| the `findings.push(...)` for a missing function → `void (...)`, so it is noticed and then not reported | **15/16**, exit 1. "a function in the repository but not deployed is drift" FAILED: "drift was false, expected true" |
| `if (row.local && !row.remote)` → `if (row.local && row.remote)` — cry drift when the lists agree | **7/16**, exit 1. "identical lists produce no drift" FAILED: "drift was true, expected false" |

(The counts were 16 at the time these were run; four more cases were added afterwards, which is why
section 5.1 shows 20. The mutations were not re-run against the larger set.)

The last row is the one that matters for "identical lists produce none": that case can fail, so its
passing is worth something.

### 5.3 End to end, on the real repository folders

Not fixtures this time: the **recorded CLI output files** from section 4, compared against the real
`supabase/migrations/` and `supabase/functions/` on this branch. The function list is a stand-in
written by hand in the shape section 6 describes, because no real one can be obtained here.

Drift, all three kinds at once:

```
$ DRIFT_RUN_URL=... node scripts/drift-check.mjs \
    --migration-list drifted-migrations.txt --function-list functions-two.txt \
    --migrations-dir supabase/migrations --functions-dir supabase/functions --report report.md
Migration list read as json; function list read as json.
In supabase/migrations/: 20260927182443_create_tasks, 20260930101343_create_teams, 20260930193813_create_invitations, 20261002122203_team_rules, 20261002133637_tasks_join_teams, 20261002170244_tasks_drop_owner_only_rules
In supabase/functions/: accept-invite, create-team, invite-member
Applied to production: 20260927182443, 20260930101343, 20260930193813, 20261002122203, 20261002133637, 20261003090000
Deployed to production: accept-invite (ACTIVE), create-team (ACTIVE)
DRIFT FOUND:
  MIGRATION MISSING FROM PRODUCTION -- `20261002170244` `tasks_drop_owner_only_rules` is in supabase/migrations/ but has not been applied to production.
  MIGRATION EXTRA IN PRODUCTION -- `20261003090000` has been applied to production but is not in supabase/migrations/. (The CLI does not report a name for a version this repository does not have.)
  FUNCTION MISSING FROM PRODUCTION -- `invite-member` is a folder in supabase/functions/ but is not deployed to production.
exit: 3
```

(The two "production" lines say production because that is what the workflow points the script at.
Here they are the throwaway local cluster and a hand-written file.)

And with the cluster put back in step and all three functions listed:

```
$ node scripts/drift-check.mjs --migration-list matching-migrations.txt --function-list functions-three.txt ...
...
No drift. Compared 6 migration file(s) and 3 function folder(s) against production.
exit: 0
```

### 5.4 The workflow's own shell, in scratch copies

The two steps with branching in them were copied verbatim into scratch scripts — paths and a stub
`gh` aside — and both branches of each were run. **Nothing runs these automatically**; that gap is
filed as an issue, listed at the end.

**The comparison step's `case` dispatch**, for all three of the script's outcomes:

```
$ bash compare-step.sh . 0 0 matching-migrations.txt functions-three.txt
No drift. Compared 6 migration file(s) and 3 function folder(s) against production.
--- GITHUB_OUTPUT now holds: ---
drift=false
step exit: 0

$ bash compare-step.sh . 0 0 drifted-migrations.txt functions-two.txt
DRIFT FOUND:
  ... (the three findings above)
--- GITHUB_OUTPUT now holds: ---
drift=true
step exit: 0
```

And the one that must not be mistaken for a pass — a `migration list` that exited 1, with an error
payload shaped exactly like a failed production connection:

```
$ bash compare-step.sh . 1 0 failed-migrations.txt functions-three.txt
::error::UNVERIFIED -- `supabase migration list` exited 1, error code LegacyDbConnectError, so NOTHING was compared. The command's own output is deliberately not shown: it names the host and database user it tried to connect as.
::error::The comparison could not be made (scripts/drift-check.mjs exited 1), so this run proves NOTHING about production. The message above says why. Treat it as unverified, not as a pass.
step exit: 1
```

The fixture's `message` field contained `host=aws-0-eu-west-1.pooler.supabase.com
user=postgres.SOME_REF` — invented, not production's — and **neither reached the output**. The
self-test has a case that fails if it ever does.

**The duplicate-issue step.** The exact-title filter was run against this repository's real issue
list, read-only, on gh 2.87.2:

```
$ gh issue list --state open --search 'Database drift in:title' --json number,title \
    --jq '[.[] | select(.title == "Database drift") | .number] | first // empty'
(no output)
exit: 0
```

Empty means "none open", which is correct today. To show the other half — that it selects an exact
match and ignores a title that merely contains the words:

```
$ gh issue list --state open --search 'drift in:title' --json number,title \
    --jq '[.[] | select(.title == "Build it 15 part 4: daily drift check (read-only)") | .number] | first // empty'
93

$ gh issue list --state open --search 'drift in:title' --json number,title \
    --jq '[.[] | select(.title == "Database drift") | .number] | first // empty'
(no output)
```

The second is the point: issue #93's title contains "drift" and comes back from the search, and the
exact-title test correctly refuses it. A search-only match would have filed a comment on the wrong
issue.

Then the step's branching, with a stub `gh`:

```
$ bash issue-step.sh . ""
[stub] gh issue create --title Database drift --body-file .../drift-report.md
exit: 0

$ bash issue-step.sh . "99"
[stub] gh issue comment 99 --body-file .../drift-report.md
Commented on the open "Database drift" issue #99 rather than opening a second one.
exit: 0
```

## 6. What is unverified, and will stay so until the first real run

**The workflow has never run.** Issue #93 says the owner merges it and starts it by hand, so
everything below is unverified by design, not by oversight. Each line says how to settle it.

- **Unverified — the whole workflow.** No run exists. Settle it: merge, then Actions →
  `drift-check` → "Run workflow" on `main`. Expect a green run whose comparison step prints
  "No drift", given production matches `main` today.
- **Unverified — `supabase functions list`'s output, in every respect.** Not once has it returned
  successfully anywhere in this project. What the parser expects was read out of the pinned
  2.117.0 binary itself — the success path is
  `if (n.format === "json" || n.format === "stream-json") { yield* n.success("", { functions: d }) }`,
  and each entry is built as `{id, slug, name, status, version, created_at, updated_at}` plus
  `verify_jwt`, `import_map`, `entrypoint_path`, `import_map_path`, `ezbr_sha256` — and it matches
  the Management API's own schema for `GET /v1/projects/{ref}/functions`, which requires exactly
  `id, slug, name, status, version, created_at, updated_at`
  (`components.schemas.FunctionResponse_Output` in https://api.supabase.com/api/v1-json). The three
  possible statuses, `ACTIVE`, `REMOVED` and `THROTTLED`, come from the same binary. **Read off a
  binary and a schema is not the same as seen.** If the first run cannot parse it, the job goes red
  with "Could not read the function list", which is the correct outcome. Filed as issue #94.
- **Unverified — that the three secrets work for these two commands.** They are the same three
  `migrate-production.yml` uses, and that workflow has run, but `migration list` and `functions
  list` have never been run with them. In particular the scoped access token's permission is
  "Edge Functions Read-write" (`migrate-production.yml`'s header); whether that covers *listing* is
  not something this file can state.
- **Unverified — which output format the CLI chooses on a GitHub runner.** Section 3 shows the
  default swinging on agent detection. `--output-format json` is passed to make it moot, and the
  table parser is there in case it is not, but no run has confirmed which path is taken. The
  comparison step prints "Migration list read as json" or "... as table", so the first run says
  which.
- **Unverified — the issue is really opened, and really commented on rather than duplicated.** The
  stub in 5.4 proves the branching, not that `gh issue create` works with this job's token and
  `issues: write`. Settle it only by seeing a real drift, which means waiting for one or making one
  deliberately — and making one means writing to production, which nobody here may do.
- **Unverified — the schedule fires.** Cron `17 6 * * *`, and GitHub does not promise the minute.
  It also stops scheduled workflows in a repository idle for 60 days.
- **Not tested automatically — the workflow's shell.** Section 5.4 was scratch copies, run by hand,
  once. The same gap as issue #73 names for `migrate-production.yml`. Filed as issue #95.

## 7. Notes

- **Data captured from production: none.** Nothing was read from production, staging, or any remote
  project. Every value in this file came from the owner's machine, from a throwaway local cluster,
  from public documentation, or from the pinned CLI binary. **Nothing has been redacted, because
  there was nothing to redact** (rule 18). Two values in this file are invented and belong to
  nobody: `20261003090000 hotfix_applied_by_hand`, and the
  `host=aws-0-eu-west-1.pooler.supabase.com user=postgres.SOME_REF` in the failure fixture.
- **Production's address, project ref and site URL appear nowhere in this file**, and nor does
  anything out of the three secrets.
- **No package was installed.** The pinned CLI binary was downloaded to the scratchpad outside the
  repository, used, and left there; it is not a dependency and is not committed.
- `supabase/setup-cli` is pinned to the same SHA as `migrate-production.yml`, and the CLI to the
  same version, 2.117.0. That version is now written out by hand in three places with nothing
  checking they agree. Filed as issue #96.
