# Evidence — the production smoke test (`smoke-test` job)

What was checked before the job could ever run for real, how, and what is still
**unverified**. Written 2026-10-02 for issue #72.

The job is the third in `.github/workflows/migrate-production.yml`. It runs only on a push to `main`,
after `deploy-functions`, so nothing in this file is a production run: a pull request cannot start that
workflow at all.

## What the job claims

1. Every folder under `supabase/functions/` that is not prefixed with `_` answers a **POST with no
   `Authorization` header** with **HTTP 401** and the code **`UNAUTHORIZED_NO_AUTH_HEADER`**.
2. The production home page answers **HTTP 200**.
3. Any other answer fails the job, with a message naming the check and what came back — status and the
   `code` field only, never a response body, never the site address, never the project ref.

## 1. The function check, run against staging

The step's script was copied **verbatim** out of the workflow and run with `SUPABASE_PROJECT_REF` set
to **staging's** ref, which lives in this repository already
(`scripts/staging/bob-invites-to-alices-team.mjs` line 47). Staging runs the same three functions with
the same `verify_jwt = true`, so the expected answer is the same one.

Nothing was signed in, no key or token was sent, and nothing was written: the request is refused at
the gateway before any function code runs. A temporary `_shared` folder was planted in a **copy** of
the folder tree, to exercise the underscore skip without adding one to the repository.

```
$ bash run-step-against-staging.sh
folders present: _shared accept-invite create-team invite-member

SKIP  _shared: a folder prefixed with _ is shared code, not a function.
PASS  accept-invite: HTTP 401, code UNAUTHORIZED_NO_AUTH_HEADER -- the platform refused before the function ran.
PASS  create-team: HTTP 401, code UNAUTHORIZED_NO_AUTH_HEADER -- the platform refused before the function ran.
PASS  invite-member: HTTP 401, code UNAUTHORIZED_NO_AUTH_HEADER -- the platform refused before the function ran.
All 3 function(s) refused a signed-out POST with HTTP 401 and code UNAUTHORIZED_NO_AUTH_HEADER.
```

Three functions checked, `_shared` skipped and **not** counted. The raw answer, for the record:

```
$ curl -s -i --max-time 30 -X POST "https://<staging-ref>.supabase.co/functions/v1/create-team"
HTTP/1.1 401 Unauthorized
...
sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER
x-served-by: supabase-edge-runtime
...
{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}
```

That is the same body recorded from **production** in `evidence/create-team.md` on 2026-09-30, and the
same code recorded for the other two functions in `evidence/invitations.md`.

**`jq` is not installed on this Windows machine.** So the script ran with a one-purpose stand-in — a
shell script named `jq` on `PATH` that handles exactly `jq -r '.code // empty' FILE` via node, and
refuses any other arguments. Real `jq` is on the GitHub runner image, where `ci.yml`'s `required` job
already uses it. The stand-in is why this check is evidence of the **step's logic**, not of `jq` itself.

## 2. Every failure branch

A live run cannot produce most of these on purpose, so the decision block was copied verbatim and fed
canned `(status, code)` pairs. All seven behaved as designed:

| Case | Fed to it | Verdict |
|---|---|---|
| 1 | 401 + `UNAUTHORIZED_NO_AUTH_HEADER` | PASS, `failed` stays 0 |
| 2 | 401, no `code` in the body | FAIL — names `verify_jwt = false` as the likely cause |
| 3 | 401 + a different code | FAIL, and the code is printed because it is a plain identifier |
| 4 | 201 | FAIL — "the function RAN for a caller with no token at all" |
| 5 | 000, curl exit 28 | FAIL — could not be reached, exit code reported |
| 6 | 404 | FAIL — not deployed under that name |
| 7 | 401 + a code containing spaces, HTML and an `@` | FAIL, and the code is **not** printed |

Case 7 is the one worth keeping: a `code` field that is not a plain identifier is replaced with
`(not a plain identifier; not printed)`, so a body carrying anything else cannot reach a public log
through it.

## 3. "Nothing to check" is a failure, not a pass

Run from a folder with no `supabase/functions/` at all (AGENTS.md rule 8):

```
running from an empty folder: /tmp/tmp.BI9rm53FHi
::error::No function folders were found under supabase/functions/, so NOTHING was checked. That is a failure, not a pass: either the checkout is wrong or the folder moved.
exit 1
```

The loop body never ran, and the guard turned an empty sweep into a failure.

## 4. The site steps

The "is it set" check and the fetch were both run verbatim with stand-in addresses. No production
address was used, and none is known to the assistant.

| Case | Result |
|---|---|
| variable unset (an unset `vars.X` is an empty string) | fails, naming `PRODUCTION_SITE_URL` and where to add it |
| variable set to whitespace only | fails the same way |
| variable set to a real value | passes, printing only "its value is not printed" |
| `https://example.com` | HTTP 200 → pass |
| `https://example.com/this-page-does-not-exist` | HTTP 404 → fail, with the 404 named |
| a host that does not resolve | HTTP 000, curl exit 6 → fail |

The last one is the one that matters for privacy: **the host name did not appear in the output.** That
is what `-s` without `-S` buys — curl's own error text would have said "Could not resolve host: ...",
and these run logs are public.

## 5. The workflow file itself

```
$ node scripts/check-workflows.mjs
Checked 3 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
```

Parsed with `js-yaml` (already present in `web/node_modules`; nothing was installed) to confirm the
structure rather than trusting the indentation by eye:

```
job order: migrate, deploy-functions, smoke-test

--- smoke-test
  needs: "deploy-functions"
  environment: "supabase-production"
  timeout-minutes: 10
  permissions: {"contents":"read"}
  step: uses actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
  step: Check the production project ref is set
    env names: SUPABASE_PROJECT_REF
  step: Check the production site address is set
    env names: SITE_URL
  step: Every server function refuses a signed-out call
    env names: SUPABASE_PROJECT_REF
  step: The production site answers
    env names: SITE_URL
```

## Unverified

- **The job has never run.** It triggers only on a push to `main`, so the first real run is the merge
  of the pull request that adds it. Everything above is the same script against staging, canned inputs,
  or the file's structure — not a production run.
- **Unverified — the production function URLs have never been called by this job.** The shape
  `https://<ref>.supabase.co/functions/v1/<name>` is the documented one
  (https://supabase.com/docs/guides/functions/quickstart) and is what the staging run used
  successfully, but the ref the job will use comes from a secret the assistant cannot read.
- **Unverified — the production home page's status code.** No production address is known here and
  rule 10 forbids opening one. If `PRODUCTION_SITE_URL` points anywhere that answers 3xx, 401 or 403,
  the job's first run will say so; the message explains each case.
- **Unverified — `jq -r '.code // empty'` against the real `jq`.** Checked against a node stand-in
  only, because `jq` is not installed on this machine. The first run on the runner settles it.
- **The job's shell is not covered by `npm test`.** The checks above were run by hand from a scratch
  folder and are not repeatable by a command in this repository. Filed as issue #73.

## Personal data in this file

Nothing identifying and nothing that grants access. The staging project ref is replaced with
`<staging-ref>` in the one place a URL is quoted, even though that ref is already in this repository,
because there was no reason to repeat it. The values quoted are HTTP statuses, a documented error code,
a fixed error message, `example.com`, and a deliberately invalid host name. No production address, no
project ref for production, no email addresses, no tokens, no request ids (the `sb-request-id` and
cookie lines from the raw response are cut, shown as `...`).
