# Decision: this repository is public

Date: 28 September 2026. Decided by: Raj Dhonota (owner). Written down 15 October 2026.

**The decision.** `build-once/team-tasks` is public on purpose.

**Why.** Vercel's Hobby plan cannot deploy a private repository owned by a GitHub organisation. The
app had to deploy, and the budget is £0 a month while building (`docs/plan.md`), so on 28 September
2026 the repository was recreated as the public `build-once/team-tasks`. The old private repository
is kept as an archive.

**What was done about it at the time.** Commits use **noreply-only** addresses, so no personal email
address is in the history. **GitHub Secret Protection and push protection are on** — read by the
owner in Settings → Advanced Security on **15 October 2026**, both showing a "Disable" button, which
is a page saying they are enabled. Nothing in this repository can check either, so a change would go
unnoticed by every check here; `evidence/repo-private.md` section 4 is the reading and that limit.

**What this costs, and it is not nothing.** Everything in this repository is readable by anybody:
every Actions run log, every evidence file, every migration, and every comment explaining how the
app is put together. That is why so many decisions here are shaped by it —
`.github/workflows/backup-production.yml` echoes only names and byte counts, the production project
reference and site address are deliberately absent, and a run log is treated as public because it
is. Those are not precautions against a hypothetical.

**What would change it.** Any one of:

- a paid Vercel plan, which removes the reason entirely;
- a real user's data ever being reachable from something in here;
- a need to keep a dependency, a vendor arrangement or a security finding private.

**What it does NOT mean.** No secret is in this repository (`evidence/secret-audit.md`, and the
`no-secrets-in-repo` launch row), and nothing here grants access to anything: production's
credentials live in GitHub environment secrets and in each project's own settings.

**The launch checklist's view of this.** `checklist/launch.json` carries a row asking whether the
repository is private, which for this project is **N/A by decision** rather than a failure.
`evidence/repo-private.md` is that answer, and it links here.
