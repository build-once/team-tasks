# Security policy

## Reporting a vulnerability

If you find a security problem in Build Once — for example, a way to get past a guard, a CI setting that leaks a secret, or advice in the docs that would leave an app exposed — please report it **privately**. Do not open a public issue.

1. On this repository’s GitHub page, open the **Security** tab and choose **Report a vulnerability** (GitHub’s private vulnerability reporting). If that button is missing, the maintainers have not switched it on yet; email info@dhtamedia.com instead, with "Build Once security" in the subject.
2. Tell us:
   - what the problem is, in plain words,
   - the steps to reproduce it, with exact commands and output,
   - which version or commit you used,
   - what harm you think it allows.
3. **Never include real secrets, keys or other people’s data** in a report. Use made-up values.

We aim to acknowledge reports within a few days, keep you updated, and credit you in the fix unless you ask us not to. This is a volunteer project, so we cannot promise fixed response times.

## What is in scope

- The guards (`.claude/hooks/`, `.claude/guard/`) failing to block something they claim to block.
- The CI workflows (`.github/workflows/`) granting too much permission or exposing secrets.
- Scripts in `scripts/` doing something unsafe.
- Docs that give advice which would make an app less safe.

## What this kit does not promise

Build Once blocks the most common mistakes. It does **not** make any app secure, and a guard that can be bypassed by a determined person is still worth reporting — but please do not treat the kit as a security product. Security problems in **your own app** built from the template are yours to handle; this policy covers the kit itself.

## Supported versions

Only the latest release on the default branch receives fixes.
