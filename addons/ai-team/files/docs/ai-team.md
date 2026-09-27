# The AI team

Five agents work on this project. Four use AI; the watchdog does not. Every AI step can only **propose**. Plain code with no AI in it, the **harness**, checks each proposal and does all the writing. People hold the three buttons that matter: **go** (the `agent:build` label), **ready** and **merge**.

The machine-readable rules (label allow-list, path allow-lists, risk tiers, turn caps, attempt limit, cost limit) live in `.github/ai-team/config.json`. This file explains them. If the two ever disagree, the config file is what runs; fix whichever is wrong.

## The switch

- `AI_TEAM_MODE` (a repository **variable**, set only by a person in Settings → Secrets and variables → Actions → Variables): `off`, `shadow` or `on`.
- Anything else, including missing, empty, `Shadow` or ` on`, is **off**.
- Per-agent switches (`AI_TRIAGE_MODE`, `AI_BUILDER_MODE`, `AI_REVIEWER_MODE`, `AI_FIXER_MODE`) can only make one agent more cautious than the master switch, never less. Unset means "follow the master switch".
- **off**: no AI step runs at all. **shadow**: the AI runs, the harness reports what it would do in the run's summary, and nothing is written to GitHub. **on**: the harness acts.

## Identities and budget

- **AI steps** use the job's own `GITHUB_TOKEN`, with read-only permissions. They never get a personal token or the team app's token.
- **Harness writes** use the team's own GitHub App (`AI_TEAM_APP_CLIENT_ID` variable, `AI_TEAM_APP_PRIVATE_KEY` secret). Each harness job mints a one-hour token limited to exactly what that job writes, and only when the switch is on. The app has no permission to change workflow files or settings.
- **The watchdog** uses only the job's own token, so it keeps working if the app or the AI key breaks.
- **Budget**: `ANTHROPIC_API_KEY` belongs to a separate `ai-team` workspace with its own monthly spend limit and alerts at 50% and 80%. The watchdog also flags a day's cost over `watchdog.daily_cost_usd`.

## Job cards

The "risky triangle" columns ask: does the AI step see private data, read untrusted text, and can it send data out? No AI step may have all three. Here, no AI step can send data out at all.

### Triage

| | |
| --- | --- |
| Starts when | An issue is opened (anyone can do this). |
| Reads | The issue (**UNTRUSTED**) and the titles of open issues, saved to files by a plain step. It does not see the repository. |
| May propose | A form: kind, urgency, duplicate issue number, missing information (from a fixed list), suggested labels, suspicious yes/no. |
| The harness then | Keeps only labels on the allow-list; if the form is broken or marked suspicious, adds `needs-human` and nothing else; otherwise applies the labels and posts one comment built entirely from fixed wording. |
| Triangle | Private data: no. Untrusted text: **yes**. Send out: **no**. |
| Limits | 5 turns, 5 minutes, one run per issue. |
| Never, and what enforces it | Write to GitHub: the job's permissions are read-only. Run commands or reach the web: `Bash`, `WebFetch` and `WebSearch` are disallowed. Put its own words on the issue: the harness posts only templated text. Apply a label off the list: the harness drops it. Suggest the go label: it is not on the allow-list, and the self-test checks that. |

### Builder

| | |
| --- | --- |
| Starts when | A person with write access adds `agent:build` **and** a person with write access has written a comment starting `/spec`. |
| Reads | The newest such `/spec` and a copy of main. Never the issue text. |
| May propose | A change to its throwaway copy, plus a form: files changed, summary, tests run. |
| The harness then | Takes the diff itself (with a clean git folder the agent could not touch), refuses it if the files differ from the form, any file is outside `web/src/**`, `web/test/**` or `supabase/migrations/**` or is protected, main has moved on, the execution file shows no `npm --prefix web test`, the diff contains a secret, or it is binary. Works out the risk tier from the real diff. In on mode opens a **draft** pull request, or posts why it refused. |
| Triangle | Private data: yes (the code). Untrusted text: no (a maintainer's spec). Send out: **no**. |
| Limits | 30 turns, 30 minutes, one run per issue. |
| Never, and what enforces it | Push or open pull requests: read-only permissions. Run commands other than the tests: only `Bash(npm --prefix web test…)` is allowed. Change workflows, guards or these rules: the protected-path list, and the app has no workflow permission. Mark ready or merge: no code for it (the self-test scans for it), and GitHub will not merge a draft. |

### Reviewer

| | |
| --- | --- |
| Starts when | A pull request into main is opened, updated or marked ready. |
| Reads | Main (its rules and tools) and the pull request as a saved diff (**UNTRUSTED**). |
| May propose | Findings: rule id, file, line, severity, problem. |
| The harness then | Keeps only findings for a rule in `docs/review-rules.md` on main and a file the pull request changes. Makes the text safe (no working mentions, links, images or HTML). Posts or updates one plain "AI review" comment. |
| Triangle | Private data: yes. Untrusted text: **yes**. Send out: **no**. |
| Limits | 15 turns, 10 minutes, the newest run per pull request wins. |
| Never, and what enforces it | Approve, request changes or merge: no code for it (scanned by the self-test). Read rules from the pull request: main is checked out, never the pull request's code. Run commands: `Bash` is disallowed. |

### Fixer

| | |
| --- | --- |
| Starts when | The `ci` workflow fails on an `agent/` branch with an open pull request, for its latest commit, with fewer than 3 attempts so far and no `needs-human` label. |
| Reads | The end of each failing job's log, and the pull request's code in a subfolder. Main at the root for its rules and tools. |
| May propose | A classification of every failure (flake, wrong_test, broken_app, unclear_spec) and, only for broken_app, a change to `web/src/**`. |
| The harness then | Refuses a change without a broken_app, any deleted, skipped or weakened test, anything outside `web/src/**`, a stale branch, or no test run. In on mode moves the counter label (`fix-attempt-N`) **first**, then pushes an accepted repair, or adds `needs-human` and explains. After 3 attempts it stops and says so once. |
| Triangle | Private data: yes. Untrusted text: partly (logs of code the builder wrote). Send out: **no**. |
| Limits | 20 turns, 20 minutes, 3 attempts per pull request. |
| Never, and what enforces it | Weaken a test: `check-assertions` in the harness. Keep going forever: the counter is a label on GitHub, read before every run. Run the pull request's settings: its code is in a subfolder, never at the root. |

### Watchdog

| | |
| --- | --- |
| Starts when | Every hour, and by hand. |
| Reads | The last day's runs of the four AI workflows and their records. |
| Writes | One issue, "AI team health", and an outside heartbeat. |
| Uses AI | **No.** Nor the team app, nor the AI key. |
| Checks | Each run finished; if its AI step ran, the record exists, the run ended cleanly and within its turn cap; builder runs (and fixer runs that edited code) really ran the tests; the day's cost is under the limit. |
| If it stops | The heartbeat stops and the outside uptime service alerts a person. |

## Records

Every AI step saves its execution file (every message and tool call), the form it returned and, for the builder and fixer, the diff, as an artifact called `ai-record`, kept 30 days, even when the step fails. Known secrets and anything shaped like a key or token are replaced with `[REDACTED]` before saving. In a **public** repository, anyone signed in can download artifacts: keep the AI team's repository private, or accept that records are public.

## Known limits

- A pull request that edits `.github/workflows/ai-reviewer.yml` runs its own version of the reviewer on itself (that is how GitHub's `pull_request` event works). Only people with write access can push branches here, and the builder and fixer cannot touch `.github/`.
- The job's read-only token is visible to the AI's tools during the run (in the git settings of its copy). It can only read, and it expires when the job ends.
- Scrubbing secrets from the agent's commands is best-effort, according to the action's own docs. That is why the AI steps hold no write access and cannot reach the web.
- Scrubbing needs a sandbox, bubblewrap, and Claude Code refuses to start without it. Each AI job installs it first. On Ubuntu 24 this also means relaxing one kernel protection, `kernel.apparmor_restrict_unprivileged_userns=0`, so the sandbox can start. The change applies only to that job's throwaway GitHub machine, and the official action makes the same change for untrusted input. The owner decided this in exchange for keeping the AI key out of the agent's commands.
- On a private repository with GitHub's free plan there are no branch rules, so "only people merge" rests on the app's code (which has none that merges, checked by the self-test) and on draft pull requests. With branch rules available, also require a review from a person.

## Prompt-only rules still to make real

None of the "Never" rows above relies on the prompt alone. The prompts repeat the rules so the agents waste fewer turns, not to enforce them.
