# Evidence folder

Some launch items cannot be checked by a script. Nobody can prove from your code that two-step login is on, or that an uptime alert really reached your phone. For those items **you** check by hand and write down what you saw. That note is the *evidence*.

`node scripts/launch-check.mjs` looks in this folder. An evidence item counts as **PASS** only when its file:

1. exists at the path named in `checklist/launch.json` (for example `evidence/accounts-2fa.md`),
2. is not empty,
3. has a filled-in `Result:` line (not the `<...>` placeholder), and
4. has a `Date:` line with a real date written `YYYY-MM-DD`.

Otherwise the item shows as **TODO**. If your `Result:` line starts with `FAIL`, the item shows as **FAIL**. That is fine: an honest FAIL is more useful than a hopeful PASS.

## How to record one piece of evidence

1. Run `node scripts/launch-check.mjs --json` (or open `checklist/launch.json`) and find the item's `how_to_prove` text.
2. Copy `evidence/TEMPLATE.md` to the file name the checklist asks for, e.g. `evidence/restore-tested.md`.
3. Do the check for real. Do not write down what *should* happen; write down what *did* happen.
4. Fill in:
   - `Result:` PASS, FAIL, or N/A plus a few words (e.g. `Result: PASS - Bob got "permission denied" on read, edit and delete`).
   - `Date:` the day you did it (e.g. `Date: 2026-09-25`).
   - `How checked:` the steps, so someone else could repeat them.
   - Output: paste what you saw, **with secrets removed**.
5. Run the launch check again. The item should now say PASS.

## Remove secrets before you paste

Evidence files are committed to your repository, so treat them as public.

- Replace keys, tokens, passwords, connection strings and email addresses with `[REDACTED]`.
- Never paste the contents of a `.env` file, a recovery code, or a full screenshot of a settings page that shows a key.
- Names of keys are fine (`STRIPE_SECRET_KEY`); values are not.

The launch check scans tracked files for secret-looking strings and will FAIL if you paste one by mistake.

## Keep it fresh

Evidence goes stale. Re-check and update the `Date:` after big changes and before each launch. "N/A" is allowed only when the item really does not apply (for example, store requirements for a web-only app). Write down why.
