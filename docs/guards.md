# Guards

**Course link:** *Building Real Apps with AI*, Book 1 Lesson A2 ("Put dangerous actions behind guards that say no by default"). Each rule below also names the lesson that explains the mistake it prevents.

## What a guard is

Before your AI assistant runs a command, edits a file, reads a file or uses a connector, Claude Code asks the guard first. The guard checks the action against a list of rules (`guard/rules.json`) and gives one of three answers:

| Answer | What happens |
|---|---|
| **Forbid** | The action is blocked. The assistant sees why, and is told not to work around it. |
| **Ask** | Claude Code stops and asks **you** to approve or refuse. |
| **Allow** | The guard stays silent, and Claude Code's normal permission prompts apply. The guard never grants permission on its own. |

If more than one rule matches, the strictest wins: forbid beats ask, and ask beats allow.

**It fails closed.** If the guard cannot do its job (the rules file is missing or broken, the input is unreadable, Node is not installed, or it takes longer than 5 seconds), the action is **blocked**. A guard that quietly lets things through when it breaks is worse than no guard, because you believe you are protected.

## The rules

### Blocked (forbid)

| Rule | What it blocks | Why | Lesson |
|---|---|---|---|
| `arming-probe` | One harmless test command (see "Prove the guard is on" below) | Proves the guard is switched on | Book 1 A2 |
| `guard-self-protect` | Changing `guard/`, `.claude/hooks/` or `.claude/settings*` | Only a person may change the guard. An assistant that can edit its own guard has no guard | Book 1 A2 |
| `production-access` | Anything aimed at production: `APP_ENV=production`, `--env production`, `--prod`, plus your own production addresses (see "Tell the guard what production looks like") | The assistant never touches production | Book 1 A23, Book 2 A24 |
| `push-to-main` | `git push` to `main` or `master`, `--all`, `--mirror` | Changes reach main only through a pull request | Book 1 A1, L24 |
| `force-push` | `git push --force`, `-f`, `--force-with-lease`, `+branch` | Rewrites shared history and can destroy work | Book 1 L24 |
| `git-discard-work` | `git reset --hard`, `git clean -f`, `git checkout -- .`, `git restore .`, `git stash drop/clear` | Throws away work you cannot get back | Book 1 L23 |
| `branch-force-delete` | `git branch -D`, deleting a branch on GitHub | Can lose commits that were never merged | Book 1 L21 |
| `recursive-delete` | `rm -rf` on `/`, your home folder, `.`, `..`, `*` or the project folder | Deletes everything | Book 1 A2 |
| `env-files` | Reading or writing any `.env` file except `.env.example` | Real `.env` files hold your secret keys | Book 1 A11, B1 |
| `credential-files` | SSH keys, cloud credentials (`.aws/`, `.kube/` …), certificates (`.pem`, `.p12` …), `.netrc` | Private keys are never the assistant's business | Book 1 A11 |
| `print-secrets` | `printenv`, bare `env`/`export`/`set`, `echo $SOMETHING_KEY`, `gh auth token` | Would put secret values in the chat and the logs | Book 1 B6 |
| `pipe-to-shell` | `curl … \| bash` and similar | Runs whatever the server sends, unread | Book 3 L27 |
| `unpinned-latest` | `npx …@latest`, `npm install …@latest`, `docker run …:latest` | You get whatever was published that day | Book 3 L27, Book 1 A4 |
| `db-remote-write` | `supabase db push`, `prisma migrate deploy`, `psql` to a non-local database | Database changes go through migration files and the pipeline | Book 1 E1, A23 |
| `skip-permissions` | `--dangerously-skip-permissions`, `bypassPermissions`, `disableAllHooks`, `--yolo` | Switches off the safety net | Book 1 A2 |
| `skip-git-hooks` | `git commit --no-verify`, `-n`, `HUSKY=0`, `core.hooksPath=` | Skips the checks the hooks run | Book 1 L6 |
| `chmod-777` | `chmod 777`, `a+rwx` | Opens files to everyone; almost never the right fix | Book 1 A2 |

### You are asked first (ask)

| Rule | What it covers | Why | Lesson |
|---|---|---|---|
| `dependency-install` | `npm install`, `pip install`, `flutter pub add` and similar | Installing runs someone else's code. Check the name is real and the version is pinned | Book 1 A4 |
| `deploy` | Manual deploys: `vercel deploy`, `wrangler deploy`, `supabase functions deploy`, `gh workflow run` … | Deploys normally happen automatically from main | Book 1 I28, I5 |
| `mcp-risky-actions` | Connector actions whose names include deploy, migrate, execute, sql, delete, drop, merge, push, send, publish, and similar | They can change real data or services | Book 3 L27, B11 |
| `history-rewrite` | `git filter-repo`, `git filter-branch`, BFG | Affects every copy of the repository | Book 1 B1 |
| `workflow-edit` | Editing `.github/workflows/` | Workflows decide what gets checked | Book 1 I7, Book 2 I6 |

## What the guard cannot catch

Be clear about the limits. The guard reads the **text** of each action. It does not understand what a program will do once it runs.

- **Which branch you are on.** `git push origin HEAD` while on main looks like any other push. GitHub's branch protection is the real stop for this. Turn it on (see `docs/protect-main.md`).
- **Paths after `cd`.** `cd guard` followed by `rm rules.json` does not mention `guard/` in the second command. AGENTS.md tells the assistant never to change folders, and the file-editing tools are always checked by full path.
- **Code that does the dangerous thing itself.** A script that deletes files or reads `.env` from the inside is not visible to the guard. This is why you read what the assistant writes, and why CI scans for secrets.
- **File contents.** For file edits, the guard checks *which* file, not *what* is written into it.

So the guard is a seatbelt, not a force field. It stops the common, expensive accidents. It does not replace reading the changes.

## Prove the guard is on

Having the files is not proof the guard is running. Claude Code loads hooks when a session starts, so a session started elsewhere may have no guard at all.

1. In your own terminal: `npm run guard:test`. It must print `PASS`.
2. Then run the live probe in the assistant, following `guard/arming-probe.md`. You must see **ARMED**. Treat UNARMED or UNKNOWN as "the guard is off" and stop until it is fixed.

Do this once per new session, and whenever you change `.claude/settings.json`.

## Check a command without running it

In your own terminal:

```
node guard/check.mjs "git push origin main"
node guard/check.mjs --tool Read --path .env
```

It prints the decision and which rules matched. Run it yourself, not through the assistant, because the guard also checks the assistant's command and may block it for the text you are testing.

## Tell the guard what production looks like

The guard cannot know your production addresses. Tell it in `guard/local.json`:

```json
{
  "production_patterns": ["abcd1234yourprodref", "api\\.yourapp\\.com"]
}
```

Each entry is a regular expression (so escape dots as `\\.`). Put in your production database project ID, your live domain, and anything else that only ever means production. Any command or connector call that mentions one of them is then blocked by `production-access`. Leave staging out.

If `guard/local.json` is missing, this part of the rule simply never matches. If the file is there but broken, every action is blocked until it is fixed (fail closed).

## Add or change a rule

Only a person changes the guard. The assistant is blocked from editing these files, on purpose.

1. Open `guard/rules.json` and add an entry:
   - `id`: short, lowercase, with hyphens.
   - `decision`: `forbid`, `ask` or `allow`.
   - `tools`: which tools it applies to (`Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Grep`, or `mcp__*` for connectors). `Bash` means every tool that runs shell commands: Bash and, on Windows, PowerShell. Write your pattern so it also catches the PowerShell form of the command (for example `Remove-Item` as well as `rm`); the self-test runs every plain command example through both tools.
   - `pattern`: a JavaScript regular expression. For shell tools it is matched against the command. For file tools it is matched against the path (relative to the project, the path as given, and the full path). For connectors it is matched against the tool name followed by its input.
   - `flags` (optional): `i` (ignore case, the default), or `""` for case-sensitive.
   - `reason`: one plain sentence the assistant will see.
   - `lesson`: where the course explains it.
   - `examples`: at least one `should_match` (something the rule must catch) and one `should_not_match` (a near-miss it must leave alone). A near-miss proves the rule is not blocking too much.
2. Run `npm run guard:test`. It runs every example through the real hook. It fails if any example is wrong, or if fewer than 60 examples ran.
3. Break your rule on purpose (change one character in the pattern), run the test, and watch it fail. Then put it back. A test you have never seen fail proves nothing.
4. Open a pull request with the test output pasted in.

## If a guard blocks something you really need

That is the guard doing its job. Do not ask the assistant to find another way. Read the reason. If the step is really needed, do it yourself, outside the assistant, and write down why.
