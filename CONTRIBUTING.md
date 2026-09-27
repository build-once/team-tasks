# Contributing to Build Once

Thank you for helping. This kit exists to show evidence instead of promises, so contributions follow the same rule.

## The three rules

1. **Every new guard rule needs self-test examples.** Add at least one example the rule must **block** and one near-miss it must **allow** (something that looks similar but is safe). A rule with no allow-example cannot prove it is not blocking too much. Add them where `guard/selftest.mjs` reads them (see `docs/guards.md`), and run `npm run guard:test`.
2. **Every skill needs evals.** A new or changed skill in `.claude/skills/<name>/` must come with evals (see `docs/skills.md`), and `npm run skills:lint` must pass.
3. **Every pull request needs evidence.** Fill in the pull-request template. Paste the **exact** command, output and exit code for what you ran — at minimum `npm test`. List anything you could not check as `unverified — <reason>`. "Works for me" is not evidence.

## How to contribute

1. Fork the repository and create a branch (never work on `main`).
2. Make one focused change per pull request.
3. Run `npm test` and paste the output into the pull request.
4. Keep docs in plain English. The readers are beginners; explain every term the first time.
5. If you copy anything from elsewhere, follow the policy in `THIRD_PARTY_NOTICES.md` and log it there.

## CI changes

If you add a job to `.github/workflows/ci.yml`, give it `permissions` (least privilege) and `timeout-minutes`, pin any third-party action to a full commit SHA with the version in a comment, add the job to the `needs` list of the `required` job, and bump `EXPECTED_JOBS`. `node scripts/check-workflows.mjs` checks the first two.

## Licence of contributions

By contributing, you agree that your contribution is licensed under the Apache License 2.0, as described in section 5 of `LICENSE`.

## Reporting security problems

Do not open a public issue. See `SECURITY.md`.
