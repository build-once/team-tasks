# Proposal: guard changes for rule 19

**Drafted by the assistant. Not applied.** Guard files (`guard/`, `.claude/hooks/`,
`.claude/settings*`) are person-only under rule 5, so the assistant must not apply this. The owner
reviews, applies and commits.

The patch is `docs/proposals/rule-19-guard.patch`. It touches two files: `guard/local.json` and
`guard/rules.json`.

---

## The one thing to understand before reading the patch

**In this guard, `forbid` beats `ask`, and `ask` beats `allow`.** From `.claude/hooks/guard.mjs`:

```js
const pick = (d) => matches.filter((r) => r.decision === d);
const decision = pick('forbid').length ? 'forbid' : pick('ask').length ? 'ask' : 'allow';
```

So **you cannot allow something by adding an `allow` rule.** If any `forbid` rule still matches, the
action is blocked. Rule 19 says production `secrets set` is "allow"; the only way to express that here
is to **narrow the `forbid` rule that currently catches it**.

That is why this patch mostly *subtracts* from existing patterns rather than adding permissive ones.
It is also why each narrowing needs reading carefully: a narrowing is a hole by construction, and the
question is only whether the hole is the right shape.

## Both shell tools are already covered

The issue asks that every changed rule apply to Bash **and** PowerShell. It already does, and no rule
needs a `tools` change. From `guard.mjs`:

```js
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function toolApplies(tools, name) {
  return tools.some(
    (t) =>
      t === '*' ||
      t === name ||
      ((t === 'Bash' || t === 'Shell') && SHELL_TOOLS.has(name)) ||
      (t.endsWith('*') && name.startsWith(t.slice(0, -1))),
  );
}
```

A rule listing `"Bash"` applies to the PowerShell tool too. Adding `"PowerShell"` to any `tools` array
would be redundant, so the patch does not. Every change below has at least one PowerShell example so
the self-test proves it rather than relying on that reading.

---

## What the Supabase CLI docs say about targets

Checked today, because the rule "allowed only when the staging ref is provably the target" depends
entirely on whether a command names its own target.

| Command | Can the target be read from the command? | Flags |
|---|---|---|
| `supabase secrets set` | **Yes** — `--project-ref` | `--project-ref`, `--env-file`. "When not specified, it targets the currently linked Supabase project." |
| `supabase functions deploy` | **Yes** — `--project-ref` | `--project-ref`, `--no-verify-jwt`, `--use-api`, `--import-map`, `--prune`, `--jobs` |
| `supabase db push` | **Only via `--db-url`** | `--db-url`, `--linked`, `--local`, `--dry-run`, `--include-all`, `--include-roles`, `--include-seed`, `-p/--password`. **There is no `--project-ref`.** |

Sources:

- `supabase secrets set` — https://supabase.com/docs/reference/cli/supabase-secrets-set
- `supabase functions deploy` — https://supabase.com/docs/reference/cli/supabase-functions-deploy
- `supabase db push` — https://supabase.com/docs/reference/cli/supabase-db-push
- `supabase db reset` (for the destructive list) — https://supabase.com/docs/reference/cli/supabase-db-reset
- The CLI's own help, version-pinned, where the published page did not state a default:
  `npx supabase@2.117.0 functions deploy --help` → *"Deploy a Function to the linked Supabase
  project"*, and the example *"Deploy all local functions to a specific project:
  `supabase functions deploy --project-ref abcdefghijklmnopqrst`"*.
  `npx supabase@2.117.0 secrets --help` → subcommands `list`, `set`, `unset`.

**The consequence for `db push` is the important one.** It has no `--project-ref`. Its targets are
`--local`, `--linked` or `--db-url`. `--linked` depends on what `supabase link` last pointed at, which
is state *outside* the command — so under the issue's own test ("if the target cannot be read from the
command itself, it stays forbidden") **`--linked` must stay forbidden**. The only staging `db push`
this patch allows is one carrying `--db-url` with the staging ref in the connection string, which
Supabase connection strings do (direct host `db.<ref>.supabase.co`, pooler user `postgres.<ref>`).

If that is too narrow to be useful in practice, the honest fix is to change rule 19, not to loosen the
guard to accept `--linked` — because nothing in a `--linked` command distinguishes staging from
production.

---

## The changes, one at a time

### 1. `guard/local.json` — add `staging_patterns`

The staging ref gets the same treatment production already has: it lives in one file, and rules refer
to it by name. No rule hard-codes a ref.

```json
  "production_patterns": ["qnupjabyowxnnwxalcid"],
  "staging_patterns": ["ghskxrhqlhvrhpnivqbd"]
```

### 2. `db-remote-write` — let a provably-staging `db push` through

Adds one negative lookahead to the `db push` alternative:

```
\bsupabase\s+db\s+push\b(?![^|;&]*--local\b)(?![^|;&]*{{local:staging_patterns}})
```

`[^|;&]*` keeps the check inside **one shell segment**, so chaining a second command cannot borrow the
first one's staging ref.

Still forbidden: `db push`, `db push --linked`, `db push --db-url <production>`.
Now allowed: `db push --db-url <…ghskxrhqlhvrhpnivqbd…>`.
Unchanged: `--local`, and everything else in that rule (Prisma, Drizzle, psql-to-remote).

### 3. `deploy` (ask) — stop prompting for a provably-staging function deploy

```
supabase\s+functions\s+deploy\b(?![^|;&]*--project-ref[=\s]+["']?{{local:staging_patterns}})
```

Without this the staging deploy would still prompt, which rule 19 does not ask for.

### 4. NEW `supabase-functions-deploy-target` (forbid) — close the gap that leaves

`deploy` was only `ask`, so a bare `supabase functions deploy` — which targets whatever `supabase link`
last pointed at — would merely prompt. Rule 19 wants it blocked. This rule forbids any
`functions deploy` unless `--project-ref` names staging in the same segment.

```
\bfunctions\s+deploy\b(?![^|;&]*--project-ref[=\s]+["']?{{local:staging_patterns}})
```

**Ordering matters, and it fails closed.** The lookahead inspects the text *after* `functions deploy`,
so `--project-ref` must come after it — which is where the CLI's own documented example puts it. Write
the flag first and the guard blocks the command. That is the safe direction, and worth knowing rather
than being surprised by.

### 5. `production-access` — carve out exactly one production command

Rule 19 allows production `secrets set` and nothing else. The exemption is deliberately tight: it
applies **only when the whole command is one `supabase secrets set`**, with no `|`, `;` or `&`.

```
^(?!\s*(?:npx\s+)?supabase(?:@[\w.-]+)?\s+secrets\s+set\b[^|;&]*$)[\s\S]*{{local:production_patterns}}
```

Still forbidden, verified: `secrets unset`, `secrets list`, `functions deploy`, `db push`, a chained
`secrets set … && db push --linked`, and the production ref passed as an environment variable instead
of a flag.

**There is no prompt for the allowed case.** Rule 19 says so, and it is why the production log exists:
the log is the only record that a production `secrets set` happened.

### 6. NEW `destructive-remote` (forbid) — no prompt, any remote target

Covers `functions delete`, `projects delete`, `branches delete`, `secrets unset`, `domains delete`,
`--prune`, and — through the MCP connectors, where there is no connection string to inspect — tool
names containing delete/drop/truncate/reset, and SQL containing `drop <object>`, `truncate` or
`delete from`.

**`supabase db reset` locally stays allowed**, as the issue requires. Remote `db reset` was already
forbidden by `db-remote-write` (`--linked`/`--db-url`), so this rule does not repeat it.

Destructive SQL *through a shell* is likewise already covered: `db-remote-write` forbids `psql`,
`pg_dump` and `pg_restore` against any non-local host, so there is no shell path to a remote `drop`.
That is why the SQL half of this rule is scoped to MCP, and why it does not block local SQL work.

---

## Verification

**Against the patched files: `unverified — guard files are person-only.`** The assistant cannot apply
the patch, so it cannot run `node guard/selftest.mjs` against the patched rules. That run is the
owner's, and it is the one that counts.

What the assistant *could* do, and did: load the draft rules into memory, compile them exactly as
`loadRules()` does, and run the guard's own exported `evaluate()` against a matrix of commands —
without writing to `guard/` at all. **24 of 24 behaved as intended.** The output is in the pull
request description.

That is evidence about the patterns, not about the installed guard. Two things it does not show: that
the patch applies (it does — `git apply --check` exits 0, which writes nothing), and that the guard is
actually armed in a session, which only the arming probe shows.

### For the owner, after applying — in this order

```
git apply docs/proposals/rule-19-guard.patch
node guard/selftest.mjs
```

Then **restart the assistant session** (settings and hooks are read at start-up), and run the arming
probe on **both** shell tools, because they are separate tool names in `.claude/settings.json`:

```
Bash:        echo guard-arming-probe n0123456789abcdef
PowerShell:  echo guard-arming-probe n0123456789abcdef
```

Each must be **blocked**, quoting the `arming-probe` rule. A probe that runs means the guard is not
attached for that tool, and nothing else in this proposal can be relied on.

---

## A gap this mechanism has, worth naming

**The guard cannot see inside a patch file.** `git apply docs/proposals/rule-19-guard.patch` modifies
`guard/rules.json`, but the command names only the patch, so `guard-self-protect` does not match and
would not block it. The protection here rests on the assistant choosing not to run it, not on the guard
refusing.

That is worth knowing before patches become a habit. Two things that would make it structural rather
than conventional: a `guard-self-protect` alternative for `git apply`/`patch` commands, and a CI check
that `guard/` is unchanged on any pull request the assistant authored. Both are out of scope here, and
both are **issue #53**, which also notes the real cost of the first one — the guard cannot know what a
patch touches, so forbidding patch application would have to forbid *all* of it.

---

## Token handling: how a production token would reach the CLI

**Described, not done.** The owner creates the token; the assistant never has one, and this section
changes nothing today.

The requirement is that the token must not end up in a file in the repository, in shell history, or in
chat. The obvious approaches all fail at least one:

| Approach | Why it fails |
|---|---|
| `SUPABASE_ACCESS_TOKEN=… supabase …` inline | Git Bash writes the whole command line to `~/.bash_history`. That file exists on this machine and `HISTCONTROL` is unset, so the leading-space trick does not help. |
| `$env:SUPABASE_ACCESS_TOKEN = '…'` | PSReadLine's `HistorySaveStyle` is `SaveIncrementally` and its history file exists, so the line is written as soon as Enter is pressed. |
| A `.env` file, or any file in the repo | Forbidden by rule 7, and the `env-files` guard rule blocks the assistant reading or writing one. |
| Pasting it into chat | Forbidden by rule 7, and it would then be in the transcript for good. |
| `supabase login` | Stores a token on disk for the whole account, not scoped to one project — wrong shape for rule 19. |

**Recommended: prompt for it, in the shell, per session.** What is typed at a prompt is not a command
line, so neither history file receives it:

```bash
read -rsp 'Supabase production token: ' SUPABASE_ACCESS_TOKEN; echo
export SUPABASE_ACCESS_TOKEN
```

```powershell
$env:SUPABASE_ACCESS_TOKEN = Read-Host 'Supabase production token'
```

Then run the one permitted command, and clear it:

```bash
unset SUPABASE_ACCESS_TOKEN          # Bash
Remove-Item Env:SUPABASE_ACCESS_TOKEN # PowerShell
```

Two caveats that belong with the recommendation rather than in a footnote:

- **The assistant cannot do this.** A prompt needs a human at a keyboard, and the assistant's shell
  runs non-interactively with stdin closed — `read` would get EOF. So in practice **the owner exports
  the token into the session the assistant then uses**, or runs the command themselves. The second is
  simpler and strictly safer.
- **`supabase secrets set NAME=value` puts the *secret's* value on the command line**, which lands in
  history exactly as a token would. `--env-file` reads values from a file instead — but that file must
  not be in the repository. So for production secrets the cleanest route is `--env-file` pointing at a
  path outside the repo, deleted afterwards. Worth deciding before the first production `secrets set`,
  not during it.
