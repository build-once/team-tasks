# Evidence: Build it 27 — a paid Team plan, in Stripe's sandbox

Result: **PASS for everything this repository can decide by itself, and NOTHING IS APPLIED OR DEPLOYED
ANYWHERE.** No migration has been run, neither Edge Function has been deployed, no Stripe object
exists, no key is set in any project, and no payment — test or otherwise — has ever been made. What is
proved here is the code's decisions; what is not proved is anything about Stripe.
Date: 2026-10-14
How checked: five commands, below, with their exit codes, plus one deliberate breakage to show the new
CI check can fail.
Checked by: Claude Code. **No dashboard, no connector, no browser, and nothing run against staging or
production.**

---

## 1. What was built

| | |
|---|---|
| `docs/plan.md` | **Payments leave the "deliberately not in the first version" list** — the last of the original five to go — and "A paid Team plan, and the first team size limit" is the design. Three appendix rows, a budget paragraph |
| `docs/architecture.md` | the seventh shape of arrow: the first one that **points into this project** |
| `docs/costs.md` | the Stripe row, with what is **not read** marked as such |
| `docs/environments.md` | four new settings, with where each belongs |
| `supabase/migrations/20261014120000_team_plan.sql` | `entitlements`, `stripe_events`, `team_member_limit()`, `my_entitlement()`, one policy, every grant written out |
| `supabase/functions/_shared/stripe-keys.ts` | the setting names and the **startup check** (Lesson O9) |
| `supabase/functions/stripe-webhook/` | signature verification, idempotency, re-fetch from Stripe (Lesson R16) |
| `supabase/functions/stripe-checkout/` | the hosted-checkout session and the price read (Lesson O8) |
| `invite-member`, `accept-invite` | the team size check, in **both** doors |
| `web/src/lib/env.ts`, `components/TestModeBanner.tsx` | the **TEST MODE** banner |
| `web/src/lib/plan.ts`, `app/teams/page.tsx`, `app/teams/actions.ts` | **the screen, added after the owner found there was no way to buy anything.** The plan panel on My teams: current plan, the member limit, the price read from Stripe, the button, and the success look |
| `.github/workflows/ci.yml` | the live-key check, **and its can-this-fail proof** |
| `.github/workflows/migrate-production.yml` | the smoke-test exception for the one function that cannot answer 401 |

## 2. The commands

```
$ deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions \
    --config supabase/functions/create-team/deno.json supabase/functions/_tests
ok | 297 passed | 0 failed (1s)                                    exit 0

$ node scripts/screen-state-check.mjs
440 of 440 checks passed.                                          exit 0

$ node scripts/check-workflows.mjs
Checked 6 workflow file(s), 28 job(s): 0 problem(s), 0 warning(s).  exit 0

$ npx eslint            (in web/)                                  exit 0
$ npm run build         (in web/)   18 routes                      exit 0
```

**The screen was missing from the first version of this change**, which the owner found on the
Preview: everything server-side existed and nothing could reach it. `web/src` changed only the banner,
the layout, the CSS and `env.ts`. The plan panel, the button and the success look were added after
that, and `scripts/screen-state-check.mjs` section 14 is nine checks over them — including that the
two numbers and the three copies of the entitling statuses all agree, that the page never calls
`team_member_limit()` and never reads `entitlements` directly, and that the success look writes
nothing. One of them was seen to fail first, by pointing the success address back at `/settings`.

**19 of those 297 are new**, in `supabase/functions/_tests/stripe_test.ts`. The CI job's expected
count moved from 250 to 297 — 250 was itself stale, because Build it 26's 28 tests landed without it
being updated.

## 3. The live-key check, and that it can fail

**It matches a KEY, not a mention, and that was found by running the first version.** A bare search
for the two prefixes matched this workflow's own comments, two sentences in `docs/`, and
`scripts/scan-history.mjs` — whose job is to look for the same thing. A check that cannot tell a
leaked key from a document discussing leaked keys gets switched off within a week.

So the pattern is the shape: the prefix plus ten or more key characters, the same floor
`scan-history.mjs` already uses.

```
$ live="_live_"; pattern="(sk|rk)${live}[0-9A-Za-z]{10,}"

$ grep -rIEn --exclude-dir=.git "$pattern" .
                                                    exit 1  (nothing found — the pass)

$ printf 'rk%sAbCdEf0123456789xyz\n' "$live" > planted.txt
$ grep -qE "$pattern" planted.txt
PASS: pattern catches a planted key                 exit 0
```

**The planted key is composed in that snippet rather than written out, and so is the pattern — and
that is not tidiness.** Writing the fixture literally is what this commit was first refused for:
gitleaks' own `stripe-access-token` rule matched it in this file, at this line. Which is the check
working exactly as it should, on a document describing a check for the same thing, and is worth
leaving in the record rather than quietly fixing.

The second is in the workflow as its own step, so the check proves it can fail on every run rather
than on the day somebody remembers to try.

**One test fixture had to be composed rather than written out** — `"rk" + "_live_" + "SUPER…"` — so
the test file does not itself contain something key-shaped. The same reason the workflow builds its
pattern from fragments.

## 4. WHAT THE OWNER MUST CREATE — Stripe objects, in the sandbox

Nothing in this repository creates any of these, and nothing can.

| | What | Where the id goes |
|---|---|---|
| **Product** | one, named e.g. "Team Tasks — Team plan" | nowhere; it only holds the price |
| **Price** | one **recurring** price on that product, monthly, a fixed amount | `STRIPE_PRICE_TEAM` |
| **Restricted key** | an `rk_test_…` key, permissions below | `STRIPE_SECRET_KEY` |
| **Publishable key** | the sandbox `pk_test_…` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Webhook endpoint** | pointed at `…/functions/v1/stripe-webhook`, sending the six events below | its signing secret → `STRIPE_WEBHOOK_SECRET` |

### The restricted key's permissions, which the owner asked to be listed

**Four, and three of them are read-only.** Anything not listed should be left at **None**.

| Resource | Permission | Why the code needs it |
|---|---|---|
| **Checkout Sessions** | **Write** | `stripe-checkout` creates the hosted session. The only write on the list |
| **Prices** | **Read** | the pricing page reads the amount from the same id the checkout charges |
| **Subscriptions** | **Read** | `stripe-webhook` re-fetches the subscription on every access event, because the event is a nudge and not a fact |
| **Customers** | **Read** | so a second checkout reuses the existing customer instead of creating a duplicate |

**Not granted, deliberately:** Charges, Payment Intents, Payouts, Refunds, Invoices, Products (write),
Webhook Endpoints, or anything under Connect. A key that could refund or pay out is a key whose leak
costs money rather than data, and nothing in this app does either.

### The six events the endpoint should send

`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.

Anything else is acknowledged with 200 and ignored — the list is fixed in
`supabase/functions/stripe-webhook/entitlement.ts`.

### Where each setting goes

| Setting | Where |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TEAM`, `APP_ENVIRONMENT` | **Supabase function secrets, staging project only** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Vercel, Preview environment only** |
| anything production | **nothing.** The owner's decision of 2026-10-14: no live key is created |

## 5. What is NOT verified — and it is most of what matters

- **Nothing is applied.** The migration has been run on no database, local included. So `entitlements`,
  `stripe_events` and both functions exist as text and nowhere else.
- **Neither Edge Function has been deployed**, so no Stripe event has ever reached this code, no
  signature has ever been verified, and no checkout session has ever been created.
- **The Stripe library has never been loaded.** `npm:stripe@23.0.0` is pinned in two `deno.json`
  files and the tests deliberately do not import it — they test our decisions, not Stripe's. **Whether
  the Supabase Edge runtime bundles it at all is unverified**, and the first deploy is what settles it.
  The same unknown `limits.ts` carried about a `_shared` import, which turned out fine.
- **`constructEventAsync` is used rather than `constructEvent`** because this runtime has Web Crypto
  and not Node's. That is read off Stripe's library having both; **nobody has watched it verify
  anything here.**
- **The Stripe API version string `2025-09-30.clover` is pinned and has not been checked against the
  account's own version.** If the sandbox is on a different one, the first call says so.
- **The team size limit has never refused anybody.** 10 and 25 exist in SQL that has not run.
- **The TEST MODE banner has not been seen.** It is drawn when the publishable key starts with
  `pk_test_`, and no key is set in any environment, so no build has ever drawn it.
- **No price has been read from Stripe**, so the pricing page's number is a code path and not a figure.
- **`docs/costs.md`'s Stripe row is mostly NOT READ**, on purpose: the fee for the owner's country is
  not written from memory.

## 5b. THE FIRST REAL CHECKOUT FAILED, AND WHAT IT COST

**2026-10-14, on staging, owner-reported.** Alice completed a test checkout. Stripe created the
subscription (`livemode: false`) and delivered the event — and `stripe-webhook` answered **HTTP 502**:

```
TypeError: First argument to 'respondWith' must be a Response or a promise
resolving to a Response
    at Object.respondWith (ext:runtime/http.js:91:19)
```

`stripe_events` and `entitlements` both held **zero rows** while a real subscription existed at
Stripe. That is precisely the split this design exists to prevent, and it was caused by one line.

**The cause**, read off `@supabase/server@1.9.0`'s own type declarations in the Deno cache rather
than guessed: `withSupabase` has **two overloads**.

```
withSupabase(config, handler)  ->  (req, ctx?) => Promise<Response>
withSupabase(config)           ->  Entry<SupabaseContext<Database>>
```

`stripe-webhook` called it with **one argument** — the handler — on the reasoning that a webhook has
no user to authenticate. That matches the second overload, so the handler was taken as the config and
what came back was a middleware **Entry**, not a fetch handler. The runtime had a non-Response to
answer with.

**And an empty config would have been its own bug**, which is why `{}` is not the fix:
`WithSupabaseConfig` documents `auth` as defaulting to `"user"`, so `withSupabase({}, handler)` would
have refused Stripe just as thoroughly with a tidier status code. The fix is `{ auth: "none" }` —
a real `AuthMode` (`'none' | 'publishable' | 'secret' | 'user'`), documented as matching
unconditionally. `ctx.supabaseAdmin` is on `SupabaseContext` whatever the mode.

**Why the type checker did not catch it:** nothing in CI type-checks the function entry points. The
Deno job runs `supabase/functions/_tests` against one function's import map, and the handlers import
`@supabase/server` through per-function maps that are not in scope there — so `deno test` on the
folder reports `TS2307 Import "@supabase/server" not a dependency` for every `index.ts` and checks
none of them. **That gap is unchanged by this fix** and is the thing that would have caught it.

**What now checks it instead**, in `scripts/screen-state-check.mjs` section 15 — three checks, found
by reading the folder rather than a list, so a seventh function is covered the day it is written:

- every function's `fetch:` entry passes a config **naming an auth mode**;
- **exactly one** is `"none"`, and it is `stripe-webhook`;
- `config.toml` has **exactly one** `verify_jwt = false`, which is the same fact from the platform's
  side.

**Seen to fail first**: putting the one-argument call back turns the first two red, 440 → 438.

## 6. The one thing in this change that is a judgement rather than a rule

**`stripe-webhook` runs with `verify_jwt = false`** — the only `false` in `supabase/config.toml` —
because Stripe sends no Supabase token. What replaces the platform's lock is the signature check, and
the owner authorised on 2026-10-14 that the production smoke test probe this function for **400**
instead of 401. That is a stronger check than the one it replaces: 401 proves the platform refused,
and 400 proves **our** door worked, on production, after a deploy.
