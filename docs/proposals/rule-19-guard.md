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

**The consequence for `db push` decided the design, and the decision went against allowing it at all.**

`db push` has no `--project-ref`. Its targets are `--local`, `--linked` or `--db-url`. `--linked`
depends on what `supabase link` last pointed at — state *outside* the command — so under the issue's
own test ("if the target cannot be read from the command itself, it stays forbidden") `--linked` had to
stay forbidden. That left only `--db-url` carrying the staging ref in the connection string.

**That turned out to be impossible to use without breaking rule 7.** A Supabase connection string
carries the database password, so a `--db-url` that makes the target provable also puts a password on
the command line — into shell history and into the transcript. Move the password to an environment
variable and the ref is no longer in the command, so the guard refuses it. There was no form that
satisfied both the guard and rule 7.

**Owner decision, 2026-10-01: drop staging `db push` from rule 19** (issue #55 moves staging migrations
to a CI job; until that lands the owner applies them). So:

- `db-remote-write` is **byte-for-byte as on `main`** in this patch. Its pattern is not touched.
- **Every `db push` except `--local` stays forbidden**, staging included.
- The new `should_match` examples pin that down, including the two cases the review found —
  `db push --linked # <staging ref>` and `db push --linked --include-all <staging ref>` — which the
  first draft would have allowed because it looked for the staging ref *anywhere* rather than as the
  target.
- Rule 19's staging bullet now says so in words: migrations are not the assistant's to run anywhere.

---

## The changes, one at a time

### 1. `guard/local.json` — add `staging_patterns`

The staging ref gets the same treatment production already has: it lives in one file, and rules refer
to it by name. No rule hard-codes a ref.

```json
  "production_patterns": ["qnupjabyowxnnwxalcid"],
  "staging_patterns": ["ghskxrhqlhvrhpnivqbd"]
```

### 2. `db-remote-write` — **pattern unchanged**, examples added

The first draft narrowed this rule to let a staging `db push` through. That is reverted: the pattern is
byte-for-byte as on `main`, for the reason in the section above.

What is added is five `should_match` examples, so the behaviour is pinned rather than merely inherited:
`db push --linked`, a production `--db-url`, a **staging** `--db-url`, and the two the review found —
`db push --linked # <staging ref>` and `db push --linked --include-all <staging ref>`. The last two
matter because they are what "the ref appears somewhere in the command" lets through when you meant
"the ref is the target".

### 3. `deploy` (ask) — the `supabase functions deploy` alternative is **removed**

Not narrowed: removed. With rule 4 below owning that command — `forbid` when the target is not provably
staging, `allow` when it is — there is no case left where `deploy` could be the deciding rule.

The first draft narrowed it instead and left it in, which **broke the guard's own self-test**: the
rule's existing example `supabase functions deploy send-email` was still listed under `should_match` for
an `ask` rule, but the new `forbid` rule now wins, so the hook exits 2 instead of asking. That example
moves to rule 4's `should_match` and to this rule's `should_not_match`.

Worth stating because it is the general lesson: adding a `forbid` rule silently changes the outcome of
every `ask` example it overlaps. The 24-case matrix in the first draft did not catch it, because it
tested commands I chose rather than the examples already in the file. The self-test tests both.

### 4. NEW `supabase-functions-deploy-target` (forbid) — owns `functions deploy`

A bare `supabase functions deploy` targets whatever `supabase link` last pointed at, which the command
does not say. This rule forbids any `functions deploy` unless `--project-ref` names staging in the same
segment.

```
\bfunctions\s+deploy\b(?![^|;&]*--project-ref[=\s]+["']?{{local:staging_patterns}})
```

**Ordering matters, and it fails closed.** The lookahead inspects the text *after* `functions deploy`,
so `--project-ref` must come after it — which is where the CLI's own documented example puts it. Write
the flag first and the guard blocks the command. That is the safe direction, and worth knowing rather
than being surprised by.

### 5. `production-access` — carve out exactly one production command

Rule 19 allows production `secrets set` and nothing else. The exemption applies **only when the whole
command is one `supabase secrets set`** — and "whole command" had to be defined much more carefully than
the first draft managed.

```
^(?!\s*(?:npx\s+)?supabase(?:@[\w.-]+)?\s+secrets\s+set\b[^|;&$`()<>\r\n]*$)[\s\S]*{{local:production_patterns}}
```

**The first draft ended the exemption with `[^|;&]*$`, and that was wrong.** It stops at a pipe,
semicolon and ampersand, but a `.` -class exclusion of three characters does not stop at a **newline**,
`$(…)`, a **backtick**, or a redirection. Every one of those let a second production command ride along
inside an "allowed" one. The review found five; the character class now refuses newline, CR, `$`,
backtick, `(`, `)`, `<` and `>`, and every one of them is a `should_match` example.

**The worst of them was `supabase secrets set … <newline> supabase link --project-ref <production>`.**
Linking the CLI to production is not itself a destructive act, which is what makes it dangerous: every
later bare `db push` or `functions deploy` would then target production, and none of those commands
would mention production at all. A guard that reads commands cannot catch what a command does not say.

Why excluding these characters costs nothing: a legitimate `secrets set` needs none of them. Values come
from `--env-file` anyway, which is also what the token section below recommends, so the permitted form is
`supabase secrets set --env-file <path outside the repo> --project-ref <production>`.

Still forbidden, and verified in the matrix: `secrets unset`, `secrets list`, `functions deploy`,
`db push`, a chained `&&`, all five newline/substitution/redirection bypasses, and the production ref
passed as an environment variable instead of a flag.

**A trap worth recording, because it produced a pattern that looked right and was not.** Building this
with `String.replace("…", replacement)` silently ate two characters: in a replacement *string*, `` $` ``
is a special token meaning "the text before the match". So the class was written as
``[^|;&$`()<>\r\n]`` and came out as `[^|;&()<>\r\n]` — missing exactly the `$` and the backtick, which
is why the backtick bypass still worked on the first rebuild. The draft builder now passes a replacer
**function**, which disables `$` handling, and then asserts every character is still present before
writing the file. The matrix caught it; reading the pattern did not.

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

Two kinds of evidence, and they answer different questions.

**1. The patched self-test, run in a scratch clone.** The patch is applied to a **temporary clone**
outside the working tree, never to `guard/` here, and `node <clone>/guard/selftest.mjs` is run there.
That is the owner's first post-apply step, run in advance. The output and exit code are in the pull
request description.

The first attempt at this **failed**, with the `deploy` example described in change 3 — which is the
point of running it: the 33-case matrix below passed while the self-test did not, because the matrix
tests commands chosen by hand and the self-test tests every example already in the file.

**2. The `evaluate()` matrix, main versus patched.** The draft rules are loaded into memory, compiled
exactly as `loadRules()` does, and run through the guard's own exported `evaluate()` alongside the rules
on `main`, so each case shows what changes and what does not. **33 of 33 behave as intended.**

Neither shows that the guard is actually *armed* in a live session. Only the arming probe shows that,
and it needs a restart first.

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
