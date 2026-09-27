# Lesson skills

Build Once comes with twelve **skills**. A skill is a short set of instructions, saved as a file, that your AI coding assistant loads when a task matches it. For example, when you say "is it done?", the assistant should pick up the `prove-it` skill and show real evidence instead of saying "should work".

Each skill links to the lessons in *Building Real Apps with AI* where the idea is taught.

## The skills

| Skill | What it is for | Lessons |
|---|---|---|
| [prove-it](../.claude/skills/prove-it/SKILL.md) | Before saying anything is done: name the command, run it, paste the output and exit code, check the count, run a positive control, and give a PASS / FAIL / UNVERIFIED verdict. | Book 1 Ch 8 (G1 to G15) |
| [safe-change](../.claude/skills/safe-change/SKILL.md) | The everyday road for a change: look, branch, small change, pull request with evidence, green checks, merge. Never straight onto main. One command at a time. | Book 1 Ch 4 (L21 to L24) |
| [secrets-check](../.claude/skills/secrets-check/SKILL.md) | Find keys and passwords in files, git history and the built app. Public keys versus secret keys. Exposed means rotate, not just delete. | Book 1 Ch 11; Book 1 Ch 1 (A11) |
| [rls-two-account-test](../.claude/skills/rls-two-account-test/SKILL.md) | Prove the database keeps users apart, using Alice and Bob on staging: signed out, read, change, remove, and storage buckets. | Book 1 Ch 14; Book 1 D23, D24, A22 |
| [migration-safety](../.claude/skills/migration-safety/SKILL.md) | Every database change is a migration file, tested locally then on staging, and deployed by the pipeline. Expand, deploy the code, then contract. | Book 1 Ch 15; Book 2 Ch 10 |
| [production-read](../.claude/skills/production-read/SKILL.md) | Answer questions about live data without giving the assistant access: a read-only, counts-only query, proven on staging, run by the owner. | Book 2 A24 |
| [test-must-fail-first](../.claude/skills/test-must-fail-first/SKILL.md) | Break the feature on purpose and watch the test go red, then restore it. Spot tests that cannot fail. | Book 1 Ch 17 |
| [vet-a-tool](../.claude/skills/vet-a-tool/SKILL.md) | Before installing a skill, plugin or MCP server: read it, check licence and upkeep, pin the version, limit its access, sandbox it, and run `node scripts/vet-tool.mjs`. | Book 3 Ch 3 |
| [handoff](../.claude/skills/handoff/SKILL.md) | End a session with `node scripts/handoff.mjs`, review the notes for secrets, commit them; start the next session by reading and checking them. | Book 2 L26; Book 3 Ch 25 |
| [launch-check](../.claude/skills/launch-check/SKILL.md) | Run `node scripts/launch-check.mjs` and clear every FAIL and UNVERIFIED item, with evidence saved in `evidence/`. | Book 1 Ch 30 |
| [incident-first-steps](../.claude/skills/incident-first-steps/SKILL.md) | A calm first hour: stop the harm, rotate keys, keep evidence, note the 72-hour GDPR clock (not legal advice), write a blameless review. | Book 1 Ch 29; Book 2 Ch 14 |
| [ai-feature-safety](../.claude/skills/ai-feature-safety/SKILL.md) | For AI features in your product: check the write before saying "done", cap spending, gate changes on evals, treat model output as untrusted. | Book 1 Ch 20; Book 2 Ch 18; Book 3 Ch 22 |

## How each skill is laid out

Every `SKILL.md` has the same parts, so you always know where to look:

- **When to use**: the situations that should call it up.
- **Always / Ask first / Never**: three short lists of rules.
- **Steps**: what to do, in order.
- **Evidence to show**: what proof must appear before the step counts as done.
- **Red flags**: things the assistant might say that mean the step is not really done.
- **Course lessons**: where the idea is taught.

Each skill also has `evals/evals.json`, which holds prompts that should call up the skill, prompts that should not, and behaviour checks (a prompt plus the evidence or behaviour we expect to see).

## Checking the skills

Run:

```
node scripts/lint-skills.mjs
```

It needs Node 20 or newer and nothing else. It exits with code 0 when everything is fine and 1 when it finds a problem. It checks that:

- every skill folder has a `SKILL.md` whose frontmatter is valid: `name` matches the folder, uses only lowercase letters, digits and single hyphens, and is at most 64 characters; `description` is present, says when to use the skill, and is at most 1,024 characters; no unknown fields;
- all the section headings above are present;
- each `SKILL.md` is at most 200 lines and 16 KB;
- `evals/evals.json` is valid JSON with at least 3 should-trigger prompts, 3 should-not-trigger prompts and 2 behaviour checks;
- no skill contains obviously dangerous instructions: piping a download into a shell, turning off the assistant's permission prompts, or an unpinned "latest" version tag;
- it found at least 12 skills. A scan that looked at nothing must not report "clean".

It also tests its own danger patterns against a matching example and a near-miss example each time it runs, so a clean result shows the patterns are working.

## The format, and where it comes from

These facts were checked against the official documentation on 2026-09-25:

- A skill is a folder containing a `SKILL.md` file: YAML frontmatter between `---` lines, then Markdown instructions.
- The open Agent Skills specification requires `name` and `description`. `name`: 1 to 64 characters, lowercase letters, digits and hyphens only, not starting or ending with a hyphen, no double hyphens, and it must match the folder name. `description`: 1 to 1,024 characters, saying what the skill does and when to use it. Optional fields: `license`, `compatibility` (up to 500 characters), `metadata` and `allowed-tools` (experimental). It suggests keeping `SKILL.md` under 500 lines. Source: <https://agentskills.io/specification>
- Claude Code treats every frontmatter field as optional, but recommends `description`. The `name` defaults to the folder name. The combined `description` and `when_to_use` text is cut off at 1,536 characters in the skill listing. Claude Code adds its own optional fields, including `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `context` and `paths`. Source: <https://code.claude.com/docs/en/skills>
- Claude Code finds project skills at `.claude/skills/<skill-name>/SKILL.md` in the folder where it starts and in every parent folder up to the repository root. Personal skills live in `~/.claude/skills/`. Skills in `.claude/skills/` folders below the starting folder load when files in that folder are first used. A skill folder must not be named `synced`. Source: <https://code.claude.com/docs/en/skills>

This kit follows the stricter of the two sets of rules, so the skills work with Claude Code and with other tools that follow the open specification.
