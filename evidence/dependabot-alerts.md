# Evidence: dependabot-alerts

Result: PASS — Dependabot alerts and security updates are switched on in the repository settings,
**8 open alerts are listed**, and `web/` is now watched, which it was not until PR #316. Dependabot
has opened pull requests for `web/` and this repository's checks ran on them.
Date: 2026-10-15
How checked: the owner switched both settings on in the repository settings, read the alert list,
and watched Dependabot open `web/` pull requests with App build and App tests running on each.
Checked by: the owner. The assistant added the `web/` entry to `.github/dependabot.yml` in #316 and
**has opened no repository settings page**.

---

## 1. The settings

Both switched on by the owner in the repository settings:

- **Dependabot alerts**
- **Dependabot security updates**

**The config file is not the same thing as the settings**, which is the reason this is an evidence
row at all. `.github/dependabot.yml` says *which manifests to watch for new versions*; the two
settings above decide whether GitHub tells you about a **vulnerability** and whether it opens a
pull request for one. `dependabot-config` is the separate launch row, and it has been PASS on a
file that was watching the wrong folder.

## 2. What was wrong until PR #316, and it is the point of this row

`.github/dependabot.yml` had two entries: `github-actions` at `/`, and **npm at `/`** — the
repository root. The root `package.json` **has no dependencies**. Every package this app actually
runs is in `web/package.json`: Next.js, React, `@supabase/ssr`, `@supabase/supabase-js`,
`@sentry/nextjs`.

**So Dependabot was watching the two files with nothing in them, and not the one with everything in
it.** PR #316 added `directory: "/web"`.

**That was not theoretical.** The push output for that branch, from GitHub, on 15 October 2026:

```
remote: GitHub found 8 vulnerabilities on build-once/team-tasks's default branch
remote: (3 high, 4 moderate, 1 low).
```

**Eight, of which nothing in this repository would have opened a pull request.** The alerts
existed — GitHub was finding them — and the updates half was off and the npm entry pointed at an
empty manifest.

## 3. The alerts

**8 open alerts** listed by the owner. No package name, version or advisory id is written here,
and that is deliberate rather than coy: a count is enough for this row, and a list in a committed
file goes stale against the real one within a day. The authoritative list is the repository's own
Dependabot alerts page.

## 4. It has opened pull requests, and the checks ran on them

Dependabot opened `web/` pull requests. **App build** and **App tests** ran on each, which is the
fourth thing Build it 29 asks for: an update is reviewed like any other change rather than trusted
because a bot made it.

**SEVERAL WERE RED, AND THEY ARE LEFT UNMERGED.** That is the system working rather than a problem
with it: a failing check on a dependency bump is the check doing its job, and merging past it would
be the one thing rule 20 forbids. **Nothing has been merged and nothing has been forced**, and
whether those bumps are wanted is the owner's call on a different day.

**They are a known open thread rather than a finished job**, and this row does not claim otherwise:
eight alerts are open, several bump pull requests are red, and both facts are true at the moment
this file was written.

## 5. The four this repository keeps out of any group

`.github/dependabot.yml` defines **no groups at all**, which is how Build it 29's instruction —
"keep payments, sign-in, the database and error monitoring out of any group" — is kept: with no
`groups:` key, Dependabot opens one pull request per package, so each of the four is already on its
own and so is everything else.

**And payments is not in this file's reach at all**, which is worth knowing rather than discovering:
`stripe` is not an npm dependency of the app. It is a **Deno** import pinned in
`supabase/functions/stripe-checkout/deno.json` and `supabase/functions/stripe-webhook/deno.json` as
`npm:stripe@23.0.0`, and Dependabot has no ecosystem for a Deno import map. **So nothing watches
that version**, and upgrading it is a person editing two JSON files.

## 6. What this does NOT establish

- **The eight alerts are not fixed.** They are reported and visible; that is all this row claims.
- **No Dependabot pull request has been merged**, so nothing here says an update of this app's
  packages is safe.
- **Nothing watches the Deno imports** (section 5), nor the Supabase CLI version pinned in the
  workflows.
- **Nothing was captured from production**; the list of redacted values is empty.
