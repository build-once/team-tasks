# Protect your main branch

`main` is what your users get: merging to `main` deploys. These settings make GitHub refuse direct pushes to `main` and refuse to merge a pull request until the `required` check is green.

## First: does your plan support it?

Plainly: **on GitHub Free, protected branches and rulesets work only on _public_ repositories.** For a **private** repository you need a paid plan — **GitHub Pro** (personal accounts) or **GitHub Team** (organizations), or Enterprise. This is from GitHub’s own documentation:

- Protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- Rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

If your repo is private and on Free, the settings below will not protect you. Your options: make the repo public (only if nothing in it is secret — and nothing should be), upgrade, or rely on the local guards and your own discipline and write down **"main protection: unverified — plan does not support it"**.

## Before you start

The `required` check must have **run at least once** in your repo (open any pull request and let CI finish). GitHub only offers checks in the list that it has seen recently.

## Option A — a branch ruleset (recommended)

1. On your repository page, go to **Settings → Rules → Rulesets**.
2. Click **New ruleset → New branch ruleset**.
3. **Ruleset name:** `protect main`. **Enforcement status:** `Active`.
4. **Bypass list:** leave it **empty**, so the rules apply to you too.
5. **Target branches → Add target → Include default branch.**
6. Tick these rules:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (if you work alone, set required approvals to 0 — GitHub does not let you approve your own pull request)
   - **Require status checks to pass** → **Add checks** → type `required` and select it. Also tick **Require branches to be up to date before merging**.
7. Click **Create**.

## Option B — classic branch protection

1. **Settings → Branches → Add branch protection rule** (it may say "Add classic branch protection rule").
2. **Branch name pattern:** `main`.
3. Tick **Require a pull request before merging**.
4. Tick **Require status checks to pass before merging**, search for `required`, select it, and tick **Require branches to be up to date before merging**.
5. Tick **Do not allow bypassing the above settings**.
6. Leave **Allow force pushes** and **Allow deletions** unticked. Click **Create**.

Menu names on GitHub change from time to time; if a label differs slightly, look for the nearest match.

## Why only `required`?

`ci.yml` ends with a job called `required` that waits for every other job and passes only if each one **succeeded**. GitHub counts a *skipped* required check as passing, so requiring the individual jobs could let a skipped one slip through. `required` treats skipped as a failure. When new jobs are added to CI, they are added to `required`, and your branch settings never need to change.

## Test it — do not just trust it

Protection you have not tested is **unverified**. Do this yourself from your own computer (not the AI assistant — its guards will rightly block it), on a throwaway change:

1. Switch to `main`, change one line in `README.md`, commit it.
2. Run `git push origin main`.
3. **Expected:** GitHub **refuses** the push, with a message about a rule violation or a protected branch. Copy that message into your notes as evidence.
4. Throw away your local commit so your `main` matches GitHub again: `git reset --hard origin/main` (this deletes only the throwaway change).
5. Now open a pull request with a small change. Confirm the **Merge** button stays blocked until `required` is green.

If the push in step 2 **succeeds**, your protection is not on — check your plan (above) and your settings, then test again.
