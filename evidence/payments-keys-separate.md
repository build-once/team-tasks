# Evidence: payments-keys-separate

Result: **PASS.** Test keys and live keys are separated by three independent things — where the keys
live, a startup check in the functions, and a CI check over the repository — and **no live Stripe key
exists at all**, which is the owner's decision of 14 October 2026.
Date: 2026-10-15
How checked: the repository, for what the code and CI do; the owner's report of 15 October, for what
is set on staging. No dashboard, no connector and no browser were used by the assistant.
Checked by: Claude Code, from the repository. Staging settings are owner-reported.

---

## 1. There is no live key to separate from, which is the strongest version of this

**The owner's decision of 2026-10-14: build and test entirely in Stripe's sandbox, and do not create
live keys.** So production's secret store holds no Stripe key of any kind, and the production app
answers that payments are not available — a real answer rather than a broken screen.

That makes this item's usual failure impossible for now: there is no live key anywhere to leak, paste
into the wrong project, or commit.

## 2. Where each key lives

| Key | Where | Which project |
|---|---|---|
| `STRIPE_SECRET_KEY` — a **restricted** `rk_test_…` | Supabase **function secrets** | staging only |
| `STRIPE_WEBHOOK_SECRET` — `whsec_…` | Supabase **function secrets** | staging only |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_test_…` | **Vercel**, Preview environment | Preview only |
| anything live | **nowhere** | — |

**Restricted, not a full secret key.** The four permissions it holds are Checkout Sessions **write**,
and Prices, Subscriptions and Customers **read**. Not granted: Charges, Payment Intents, Payouts,
Refunds, Invoices, Products (write), Webhook Endpoints, or anything under Connect. A key that could
refund or pay out is a key whose leak costs money rather than data, and nothing in this app does
either. `evidence/build-it-27-team-plan.md` section 4 is the full table.

**The publishable key is the only one in a browser**, and it is public by design — like the Supabase
publishable key, the Sentry DSN and the Turnstile site key. No Stripe script is loaded on any page and
no card field exists anywhere in this app, because the card is typed on Stripe's own hosted page.

## 3. The functions refuse to run with the wrong one

`supabase/functions/_shared/stripe-keys.ts` checks the key's mode against `APP_ENVIRONMENT` before
anything else happens, and refuses three ways: a **mismatch**, a **missing** key, and a key whose mode
**cannot be read** — because an unknown is not a yes.

Both halves of the mistake are quiet, which is why this is code and not a note: a live key on staging
would take real money from real cards during a test, and a test key on production would let everybody
in for free. Neither looks different on screen.

**It never prints the key, or any part of it.** The log line names the setting and the two mode words
and nothing else — rule 18 forbids masking as much as printing. **Ten Deno tests** cover it, one of
which asserts that the key, its body and its tail are all absent from what was logged; two more are
the gate itself, proving that with a mismatched key the handler never runs at all.

## 4. A TEST MODE banner, which removes itself

Drawn on every screen whenever the publishable key starts with `pk_test_`, from the root layout. It
reads the key rather than a flag, so when live keys ever exist it disappears by itself rather than by
somebody remembering to take it down.

## 5. CI refuses a live key in the repository

`.github/workflows/ci.yml`, job **"No live Stripe key in the repository"**, is green on PR #312.

It matches a **key**, not a mention — the prefix followed by ten or more key characters, the same
floor `scripts/scan-history.mjs` uses. That distinction was found by running the first version, which
matched this workflow's own comments, two sentences in `docs/` and `scan-history.mjs` itself. A check
that cannot tell a leaked key from a document discussing one gets switched off within a week.

**It is proved able to fail on every run**, by its own second step, which plants a key-shaped string
and requires the pattern to match it:

```
$ live="_live_"; pattern="(sk|rk)${live}[0-9A-Za-z]{10,}"
$ grep -rIEn --exclude-dir=.git "$pattern" .      exit 1  (nothing found — the pass)
$ printf 'rk%sAbCdEf0123456789xyz\n' "$live" > planted.txt
$ grep -qE "$pattern" planted.txt                 matched — the check can fail
```

**And a second, earlier layer caught one for real.** Writing a key-shaped fixture into
`evidence/build-it-27-team-plan.md` was refused at **commit** time by this repository's gitleaks
hook — `stripe-access-token`, by rule, before anything reached a branch. That is recorded in section 3
of that file, and it is why the book's "push a throwaway branch and watch CI fail" test has not been
run here: the commit cannot be made without bypassing a guard, and AGENTS.md rule 5 forbids working
around one. Two independent layers are already seen to refuse the same string, one of them on real
input.

## 6. Not verified

- **No staging or Vercel setting has been read back by the assistant.** Which keys are actually
  installed is the owner's report; nothing in this repository can show it, and if a key were replaced
  tomorrow every sentence here would still read the same.
- **The startup check has never refused anything in a deployed function**, because no mismatched key
  has ever been installed. It is proved by tests, not by an observation.
