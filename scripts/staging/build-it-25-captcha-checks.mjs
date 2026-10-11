#!/usr/bin/env node
// build-it-25-captcha-checks.mjs -- the three things only STAGING can answer
// about the anti-robot check, run BEFORE and AFTER the owner switches CAPTCHA
// on for staging.
//
// Build it 25 part 1, issue #284 section 4. STAGING ONLY.
//
// ---------------------------------------------------------------------------
// WHAT IT ANSWERS, AND WHY EACH ONE NEEDS A RUNNING PROJECT
// ---------------------------------------------------------------------------
//
//   1. A SIGN-IN WITH NO TOKEN AT ALL.
//      Before: accepted, because nothing is checking.
//      After: must be REFUSED -- and this script reports WITH WHAT CODE, which
//      is the one thing docs/rate-limits.md carries as "not confirmed" and
//      calls "the sharpest thing on this list": "Whether Supabase Auth refuses
//      a sign-in that carries no CAPTCHA token, once CAPTCHA is on. The CAPTCHA
//      page does not say." If the answer is "it is accepted", the whole feature
//      protects nothing, and better to know that from one request than from a
//      bot.
//
//   2. A SIGN-IN WITH THE DUMMY TOKEN. Accepted BOTH times, which is what makes
//      the nine automated sign-ins in this repository keep working with CAPTCHA
//      switched on. Cloudflare's test keys work as a matched pair: "Test secret
//      keys: Only accept the dummy token, reject real tokens"
//      (https://developers.cloudflare.com/turnstile/troubleshooting/testing/,
//      read 2026-10-11).
//
//   3. THIRTY-ONE WRONG-PASSWORD SIGN-INS FROM ONE ADDRESS, reporting at which
//      attempt a 429 arrives. This settles decision F, and the question is not
//      the number -- it is WHICH FIELD the number is on. The documentation's
//      row is "Token endpoint requests", `/auth/v1/token`, and says it "covers
//      password, refresh token, ID token, and PKCE grants"; the dashboard's
//      editable field at the same value is labelled "token refreshes". If those
//      are the same thing, decision F lowers the limit on password guessing. If
//      the field is refreshes only, NOTHING EDITABLE LIMITS A PASSWORD SIGN-IN
//      AT ALL and F sets a careful number on the wrong thing.
//
//      So: set the token endpoint to 30 per 5 minutes on STAGING, run this, and
//      read the answer. A 429 at the thirty-first says the field is the sign-in
//      limit. No 429 at all says it never was.
//
// ---------------------------------------------------------------------------
// WHAT IT CREATES, SENDS AND SPENDS: NOTHING
// ---------------------------------------------------------------------------
//
// NO ACCOUNT IS CREATED and NO EMAIL IS SENT. Every request goes to
// `/auth/v1/token?grant_type=password`, which creates nothing and sends nothing
// -- it is the sign-in endpoint. The thirty-one wrong passwords are for an
// address that HAS NO ACCOUNT, so no real account is hammered and nothing can
// be locked out. The two real sign-ins are Alice's, and each is ended with
// `scope=local`, which is the whole point of that scope: 'global' would end
// every session belonging to that account and sign the owner's own browser out
// of Alice every time this ran.
//
// WHAT IT NEVER PRINTS: a password, an access token, a refresh token, the
// publishable key, or the project URL. Statuses, error codes and the owner's
// own test address are printed, because those are what the judgements are
// about.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-25-captcha-checks.mjs --selftest
//       The logic only. No setting is read, no request is made, no account is
//       used. CI runs this on every pull request.
//
//   node scripts/staging/build-it-25-captcha-checks.mjs
//       Against staging. Needs web/.env.local for the URL and the publishable
//       key, and ALICE_EMAIL / ALICE_PASSWORD in the environment. Run it TWICE:
//       once before the owner enables CAPTCHA on staging with a dummy secret
//       key, and once after. The pair is what makes the second run mean
//       something -- a refusal nobody saw being an acceptance first is a
//       refusal that might always have been there.
//
//   --skip-rate-limit
//       Leaves out check 3. Thirty-one requests in a few seconds is most of a
//       five-minute budget on the token endpoint, so a run that only wants
//       checks 1 and 2 should not spend it.
//
// NO PACKAGES. Node built-ins and global fetch only, so this adds no
// dependency (AGENTS.md rule 17). Every endpoint was read out of the clients
// installed in web/node_modules rather than recalled:
//
//   POST {url}/auth/v1/token?grant_type=password  body {email, password,
//        gotrue_meta_security: { captcha_token }}
//        -- @supabase/auth-js GoTrueClient.ts, signInWithPassword, :1243-1251
//   POST {url}/auth/v1/logout?scope=local
//        -- @supabase/auth-js GoTrueAdminApi, and SIGN_OUT_SCOPES in lib/types

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The one place this repository spells Cloudflare's dummy token -- the owner's
// decision J of 11 October 2026.
import { DUMMY_CAPTCHA_TOKEN, captchaBody } from "../lib/captcha.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

// The staging project's reference, and the host built from it. The same value
// its sibling scripts and web/tests/staging.mjs already use.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

// How many wrong-password attempts check 3 makes. Thirty-one, because decision
// F sets the token endpoint to 30 per 5 minutes and the question is whether the
// thirty-first is refused.
const ATTEMPTS = 31;
const RATE_LIMIT_TARGET = 30;

// An address with NO ACCOUNT, so the thirty-one wrong passwords cannot lock
// anybody out and cannot be mistaken for an attack on a real one. A plus
// address of the staging test mailbox, fixed rather than fresh per run: nothing
// is created, so there is nothing for a fresh one to avoid colliding with.
const NOBODY = "teamtasks.staging.test+no-such-account@gmail.com";

// A password that is not anybody's. Composed rather than written as one
// literal, because a random-looking string in a committed file is refused by
// .githooks/pre-commit -- gitleaks cannot tell a fixture from the real thing.
const WRONG_PASSWORD = `not-a-real-password-${"q".repeat(12)}`;

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Reading an answer -- the ONE place a body is turned into something a
// judgement can look at
// ---------------------------------------------------------------------------
//
// IT IS A SEPARATE PURE FUNCTION SO THE SELFTEST CAN DRIVE THE REAL READING
// PATH, which is the lesson `scripts/staging/build-it-23-attachment-checks.mjs`
// records the hard way: its first selftest handed every judgement an object it
// had built itself, so an order-of-operations bug in the reading step was
// invisible to every case. A fixture that skips the parser is a fixture that
// agrees with its author.
//
// `error` for a request that never arrived, which is UNVERIFIED and never a
// refusal. `json` is null for a body that is not JSON -- which Supabase Auth
// does not send, and a proxy in the way might.
export function readAuthAnswer({ status, raw, error }) {
  if (error) return { error };

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  return { status, json };
}

/**
 * The error code off an answer, or null.
 *
 * TWO NAMES, because Supabase Auth sends both shapes and this script must not
 * care which: `error_code` is what the newer bodies carry, and `code` is what
 * the older ones do -- and in the older shape `code` is sometimes the HTTP
 * status as a NUMBER, which is not a code and must not be read as one.
 */
export function codeOf(answer) {
  const bag = answer.json;
  if (bag === null || typeof bag !== "object") return null;
  if (typeof bag.error_code === "string") return bag.error_code;
  if (typeof bag.code === "string") return bag.code;
  return null;
}

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// Every one takes what came back and returns a list of
// { what, verdict, detail }. None sends a request, reads a file or looks at the
// environment.
//
// UNVERIFIED is for an answer that does not settle the question -- a request
// that never arrived, a path this run could not reach. AGENTS.md rule 8: that
// is not a pass.

// Is this URL the staging project, and nothing else? Four requirements, the
// same four scripts/staging/build-it-23-attachment-checks.mjs asks: https, the
// host EXACTLY equal, no user name or password in the URL itself, and the
// default port. A detail line never contains the URL, because a project
// reference identifies an environment.
export function judgeStagingUrl(url) {
  const what = `the Supabase URL is the staging project, exactly ${STAGING_HOST}`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [{ what, verdict: FAIL, detail: "that value does not parse as a URL at all" }];
  }
  if (parsed.protocol !== "https:") {
    return [{ what, verdict: FAIL, detail: `its scheme is "${parsed.protocol}", not "https:"` }];
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "it carries a user name or a password in the URL itself, so its host is not what it reads as",
      },
    ];
  }
  if (parsed.hostname !== STAGING_HOST) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `its host is not ${STAGING_HOST} -- the host it does name is not printed,` +
          ` because a project reference identifies an environment`,
      },
    ];
  }
  if (parsed.port !== "") {
    return [
      {
        what,
        verdict: FAIL,
        detail: `it names port ${parsed.port}; the staging project is served on the default https port`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `https://${STAGING_HOST}` }];
}

// CHECK 1, AND IT IS THE REASON THIS SCRIPT EXISTS. A sign-in carrying no
// `gotrue_meta_security` field at all.
//
// `expectRefused` is which of the two runs this is, and it is passed in rather
// than guessed: before the owner switches CAPTCHA on, an acceptance is the
// right answer and the evidence that the check was not there yet; after, an
// acceptance is the finding.
export function judgeNoToken(answer, expectRefused) {
  const what = expectRefused
    ? "WITH CAPTCHA ON: a sign-in carrying no CAPTCHA token is REFUSED"
    : "before CAPTCHA is on: a sign-in carrying no CAPTCHA token is accepted";

  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }

  const refused = answer.status >= 400;
  const code = codeOf(answer);

  if (!expectRefused) {
    return [
      {
        what,
        verdict: refused ? FAIL : PASS,
        detail: refused
          ? `HTTP ${answer.status} code=${JSON.stringify(code)} -- it was refused, so either CAPTCHA is` +
            ` ALREADY on (in which case run this with --after) or the sign-in itself is broken`
          : `HTTP ${answer.status}, accepted -- which is what says the check is not there yet`,
      },
    ];
  }

  if (!refused) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}, ACCEPTED. This is the finding docs/rate-limits.md warns about:` +
          ` if Supabase Auth accepts a sign-in with no CAPTCHA token, the widget on the screen is` +
          ` the only thing in the way and anything posting by hand walks past it.`,
      },
    ];
  }

  return [
    {
      what,
      verdict: PASS,
      detail:
        `HTTP ${answer.status} code=${JSON.stringify(code)} -- WRITE THIS CODE DOWN. It is the answer` +
        ` to "not confirmed: whether Supabase Auth refuses a sign-in that carries no CAPTCHA token".`,
    },
    {
      // A SECOND JUDGEMENT, on purpose: the app's screens choose their sentence
      // from this code (web/src/lib/auth-messages.ts maps `captcha_failed` to
      // its own words), so whether it IS `captcha_failed` decides whether a
      // person gets the right sentence or the generic one.
      what: "and the code is the one the app's screens have a sentence for",
      verdict: code === "captcha_failed" ? PASS : UNVERIFIED,
      detail:
        code === "captcha_failed"
          ? "captcha_failed, which web/src/lib/auth-messages.ts maps to its own sentence"
          : `it is ${JSON.stringify(code)} and not "captcha_failed", so the three screens would draw` +
            ` their GENERIC sentence for this. Add it to REFUSAL mapping in` +
            ` web/src/lib/auth-messages.ts, or write down that the generic one is accepted.`,
    },
  ];
}

// CHECK 2. A sign-in carrying Cloudflare's dummy token. Accepted both times, or
// the nine automated sign-ins in this repository are broken.
export function judgeDummyToken(answer, whichRun) {
  const what = `${whichRun}: a sign-in carrying Cloudflare's dummy token is accepted`;

  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }

  if (answer.status >= 400) {
    const code = codeOf(answer);
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status} code=${JSON.stringify(code)}. If this is after switching CAPTCHA on,` +
          ` the likeliest cause is a REAL secret key in staging's Auth settings rather than one of` +
          ` Cloudflare's dummy ones: "Production secret keys will reject the dummy token." Every` +
          ` automated sign-in in this repository is refused until that is fixed.`,
      },
    ];
  }

  // The token is NEVER printed, here or anywhere. Only that one arrived.
  const hasToken =
    typeof answer.json?.access_token === "string" && answer.json.access_token !== "";

  return [
    {
      what,
      verdict: hasToken ? PASS : FAIL,
      detail: hasToken
        ? `HTTP ${answer.status}, and a session came back (the token is not printed)`
        : `HTTP ${answer.status} but no access token in the body, so nothing was signed in`,
    },
  ];
}

// CHECK 3. Thirty-one wrong-password sign-ins from one address, and at which
// attempt a 429 arrived.
//
// `statuses` is the list of HTTP statuses, in order, one per attempt. A null
// means that attempt never arrived.
export function judgeRateLimit(statuses, target) {
  const what = `${statuses.length} wrong-password sign-ins from one address: where the limit bites`;

  if (statuses.length === 0) {
    return [{ what, verdict: UNVERIFIED, detail: "no attempt was made" }];
  }
  if (statuses.some((status) => status === null)) {
    const arrived = statuses.filter((status) => status !== null).length;
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: `only ${arrived} of ${statuses.length} attempts arrived, so the count means nothing`,
      },
    ];
  }

  const firstTooMany = statuses.indexOf(429);

  if (firstTooMany === -1) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `no 429 in ${statuses.length} attempts. THAT IS THE ANSWER TO DECISION F AND IT IS THE BAD` +
          ` ONE: either the token endpoint's limit has not been lowered on this project yet, or the` +
          ` dashboard field called "token refreshes" does NOT cover a password sign-in -- in which` +
          ` case nothing editable limits password guessing and the CAPTCHA is the only thing there` +
          ` is. Check the figure was saved, then run this again.`,
      },
    ];
  }

  // `indexOf` is 0-based; attempts are counted from 1 the way a person counts.
  const attempt = firstTooMany + 1;

  return [
    {
      what,
      verdict: PASS,
      detail:
        `the first 429 arrived at attempt ${attempt} of ${statuses.length}` +
        (attempt === target + 1
          ? ` -- exactly one past the ${target} the limit was set to, so THE FIELD IS THE SIGN-IN` +
            ` LIMIT and decision F does what it intends`
          : ` -- the limit was set to ${target}, so a 429 at ${attempt} is not the arithmetic anybody` +
            ` expected. Write the number down rather than rounding it: a shared address, a burst` +
            ` allowance, or an earlier run inside the same five minutes all move it.`),
    },
  ];
}

// WHAT THIS RUN TOUCHED, counted rather than claimed. The same judgement
// scripts/staging/build-it-23-attachment-checks.mjs makes, for the same reason:
// a script that says it creates nothing should be able to prove it from its own
// request log.
const ALLOWED_PATHS = [
  "/auth/v1/token?grant_type=password",
  "/auth/v1/logout?scope=local",
];

export function judgeTouchedNothing(log) {
  const what = "this run made only sign-in and local sign-out requests";
  const strays = log
    .filter((entry) => !ALLOWED_PATHS.includes(entry.path))
    .map((entry) => `${entry.method} ${entry.path}`);

  if (strays.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `it also made: ${strays.join(", ")}. This script creates no account and sends no email.`,
      },
    ];
  }

  const global = log.filter((entry) => entry.path.includes("scope=global"));
  if (global.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "it signed out with scope=global, which ends EVERY session belonging to that account --" +
          " including the owner's own browser.",
      },
    ];
  }

  return [
    {
      what,
      verdict: PASS,
      detail: `${log.length} request(s), all of them to ${ALLOWED_PATHS.join(" or ")}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where the
// check is not there. No network, no account.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-25-captcha-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case is something this script might be handed: a URL from");
  console.log("web/.env.local, or an answer from Supabase Auth. The expectation is");
  console.log("what the judgement must say about it. Nothing is sent anywhere, no");
  console.log("setting is read and no account is used.");
  console.log("");

  // EVERY FIXTURE IS A RAW BODY, PUT THROUGH `readAuthAnswer` -- the same
  // function the real run uses, and the whole reason it is a function. A case
  // that handed a judgement an object built here instead would be blind to
  // anything wrong with the reading step, which is exactly the hole
  // `scripts/staging/build-it-23-attachment-checks.mjs` found in its own
  // selftest on 9 October 2026.
  const answer = (status, raw) => readAuthAnswer({ status, raw });

  // A stand-in for a session body. The access token is deliberately dull: a
  // random-looking literal in a committed file is refused by
  // .githooks/pre-commit, and the judgements care that one is PRESENT, never
  // what shape it has.
  const standInToken = `not-a-real-access-token-${"w".repeat(20)}`;

  const accepted = answer(200, JSON.stringify({ access_token: standInToken }));
  const acceptedWithNoToken = answer(200, "{}");

  // THE SHAPE SUPABASE AUTH REALLY SENDS FOR A REFUSED SIGN-IN: an `error_code`
  // beside a `msg`, with `code` carrying the HTTP STATUS AS A NUMBER. That last
  // part is why `codeOf` exists and why it refuses a non-string `code`: reading
  // it would make every refusal's "code" the number 400.
  const captchaRefused = answer(
    400,
    JSON.stringify({
      code: 400,
      error_code: "captcha_failed",
      msg: "captcha protection: request disallowed",
    }),
  );
  const someOtherRefusal = answer(
    400,
    JSON.stringify({ code: 400, error_code: "validation_failed", msg: "something else" }),
  );
  // THE OLDER SHAPE, with the code under `code` as a STRING and no
  // `error_code` at all. Both shapes have to read the same way, because nobody
  // here chooses which one a project sends.
  const captchaRefusedOldShape = answer(
    400,
    JSON.stringify({ code: "captcha_failed", message: "captcha protection: request disallowed" }),
  );
  // A body that is not JSON at all, which Supabase Auth does not send and a
  // proxy in the way might. It must not read as a code and must not throw.
  const notJson = answer(502, "<html>Bad Gateway</html>");
  const unreachable = readAuthAnswer({ error: "could not reach the sign-in endpoint" });

  const cases = [
    // ---- S1. the staging guard ----
    {
      name: "the staging URL itself",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}`),
      expect: [PASS],
    },
    {
      name: "NOT STAGING, and it contains the staging reference",
      run: () => judgeStagingUrl(`http://127.0.0.1:8799/${STAGING_REF}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the staging host as the start of a longer domain",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}.example.com`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: http rather than https",
      run: () => judgeStagingUrl(`http://${STAGING_HOST}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: a user name in the URL, so the host is not what it reads as",
      run: () => judgeStagingUrl(`https://user:pw@${STAGING_HOST}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: a port, which a proxy in front of something else would have",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}:8443`),
      expect: [FAIL],
    },
    { name: "not a URL at all", run: () => judgeStagingUrl(STAGING_REF), expect: [FAIL] },
    { name: "the empty string", run: () => judgeStagingUrl(""), expect: [FAIL] },

    // ---- S2. check 1, the one the whole feature rests on ----
    //
    // THE CASE THAT MATTERS IS THE SECOND ONE: it feeds judgeNoToken the answer
    // a project with CAPTCHA SWITCHED ON BUT NOT CHECKED gives -- 200, a
    // session -- and requires FAIL. That is the world docs/rate-limits.md names
    // as the one that would make the whole thing protect nothing.
    {
      name: "BEFORE: no token, accepted -- which is what says the check is not there yet",
      run: () => judgeNoToken(accepted, false),
      expect: [PASS],
    },
    {
      name: "THE WORLD WHERE THIS PROTECTS NOTHING: CAPTCHA on, no token, and ACCEPTED anyway",
      run: () => judgeNoToken(accepted, true),
      expect: [FAIL],
    },
    {
      name: "AFTER: no token, refused with captcha_failed -- and the app has a sentence for it",
      run: () => judgeNoToken(captchaRefused, true),
      expect: [PASS, PASS],
    },
    {
      name: "AFTER: refused, but with a code the app's screens have no sentence for",
      run: () => judgeNoToken(someOtherRefusal, true),
      expect: [PASS, UNVERIFIED],
    },
    {
      name: "BEFORE: refused -- so either CAPTCHA is already on or sign-in is broken, and either way not a pass",
      run: () => judgeNoToken(captchaRefused, false),
      expect: [FAIL],
    },
    {
      name: "a request that never arrived is UNVERIFIED, not a pass",
      run: () => judgeNoToken(unreachable, true),
      expect: [UNVERIFIED],
    },
    {
      name: "THE READING PATH: the older body shape, code under `code` as a string, reads the same",
      run: () => judgeNoToken(captchaRefusedOldShape, true),
      expect: [PASS, PASS],
    },
    {
      name: "THE READING PATH: a body that is not JSON is a refusal with NO code, and does not throw",
      run: () => judgeNoToken(notJson, true),
      expect: [PASS, UNVERIFIED],
    },
    {
      name: "THE READING PATH: `code` carrying the HTTP status as a NUMBER is not read as a code",
      run: () => [
        {
          what: "codeOf refuses a numeric `code`, so 400 never becomes a refusal's name",
          verdict:
            codeOf(answer(400, JSON.stringify({ code: 400, msg: "x" }))) === null ? PASS : FAIL,
          detail: JSON.stringify(codeOf(answer(400, JSON.stringify({ code: 400, msg: "x" })))),
        },
      ],
      expect: [PASS],
    },

    // ---- S3. check 2, the dummy token ----
    {
      name: "the dummy token accepted, with a session",
      run: () => judgeDummyToken(accepted, "after"),
      expect: [PASS],
    },
    {
      name: "THE REAL-SECRET-KEY MISTAKE: the dummy token refused, which breaks every test in the repository",
      run: () => judgeDummyToken(captchaRefused, "after"),
      expect: [FAIL],
    },
    {
      name: "200 with no access token in it is not a sign-in",
      run: () => judgeDummyToken(acceptedWithNoToken, "after"),
      expect: [FAIL],
    },
    {
      name: "unreachable is UNVERIFIED",
      run: () => judgeDummyToken(unreachable, "before"),
      expect: [UNVERIFIED],
    },

    // ---- S4. check 3, decision F ----
    {
      name: "a 429 at attempt 31 with the limit at 30: the field IS the sign-in limit",
      run: () =>
        judgeRateLimit([...Array(30).fill(400), 429], RATE_LIMIT_TARGET),
      expect: [PASS],
    },
    {
      name: "THE ANSWER THAT WOULD SINK DECISION F: 31 attempts and no 429 at all",
      run: () => judgeRateLimit(Array(31).fill(400), RATE_LIMIT_TARGET),
      expect: [UNVERIFIED],
    },
    {
      name: "a 429 somewhere else entirely is still reported, with the number rather than a shrug",
      run: () => judgeRateLimit([...Array(12).fill(400), 429], RATE_LIMIT_TARGET),
      expect: [PASS],
    },
    {
      name: "attempts that did not arrive make the count meaningless, so UNVERIFIED",
      run: () => judgeRateLimit([400, null, 400, 429], RATE_LIMIT_TARGET),
      expect: [UNVERIFIED],
    },
    {
      name: "no attempt at all is UNVERIFIED, not a pass",
      run: () => judgeRateLimit([], RATE_LIMIT_TARGET),
      expect: [UNVERIFIED],
    },

    // ---- S5. what this run is allowed to touch ----
    {
      name: "a run that only signed in and signed out locally",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: "/auth/v1/logout?scope=local" },
        ]),
      expect: [PASS],
    },
    {
      name: "A SIGN-UP, which this script must never make",
      run: () =>
        judgeTouchedNothing([{ method: "POST", path: "/auth/v1/signup" }]),
      expect: [FAIL],
    },
    {
      name: "A RESET EMAIL, which this script must never ask for",
      run: () =>
        judgeTouchedNothing([{ method: "POST", path: "/auth/v1/recover" }]),
      expect: [FAIL],
    },
    {
      name: "A GLOBAL SIGN-OUT, which would end the owner's own browser session",
      run: () =>
        judgeTouchedNothing([{ method: "POST", path: "/auth/v1/logout?scope=global" }]),
      expect: [FAIL],
    },

    // ---- S6. the constant every sign-in in this repository shares ----
    {
      name: "the dummy token and the body shape come from scripts/lib/captcha.mjs",
      run: () => [
        {
          what: "one constant, Cloudflare's published value, in the documented field",
          verdict:
            DUMMY_CAPTCHA_TOKEN === "XXXX.DUMMY.TOKEN.XXXX" &&
            JSON.stringify(captchaBody()) ===
              '{"gotrue_meta_security":{"captcha_token":"XXXX.DUMMY.TOKEN.XXXX"}}'
              ? PASS
              : FAIL,
          detail: JSON.stringify(captchaBody()),
        },
      ],
      expect: [PASS],
    },
  ];

  let wrong = 0;
  for (const testCase of cases) {
    const got = testCase.run().map((r) => r.verdict);
    const same =
      got.length === testCase.expect.length &&
      got.every((verdict, i) => verdict === testCase.expect[i]);
    if (!same) wrong += 1;
    console.log(`  ${same ? "ok  " : "WRONG"}  ${testCase.name}`);
    console.log(`          expected ${testCase.expect.join(", ")}; got ${got.join(", ")}`);
    if (!same) {
      for (const r of testCase.run()) {
        console.log(`          ${r.verdict}  ${r.what} -- ${r.detail}`);
      }
    }
  }

  console.log("");
  console.log(`${cases.length} cases, ${wrong} wrong.`);
  if (wrong > 0) {
    console.log("");
    console.log("The judgements in this file do not behave as its comments claim.");
    console.log("Fix them before running anything against staging: a check that");
    console.log("cannot fail is worse than no check, because it reports a pass.");
    return 1;
  }
  console.log("");
  console.log("Every judgement said FAIL or UNVERIFIED to the worlds that matter: a");
  console.log("project with CAPTCHA switched on that accepts a sign-in with no token");
  console.log("at all, a dummy token refused because the secret key is a real one,");
  console.log("thirty-one sign-ins with no 429 anywhere, and a run that created an");
  console.log("account or signed somebody out globally. That is what would make a");
  console.log("green staging run mean something. It is NOT itself a staging result:");
  console.log("nothing was sent anywhere by this run.");
  return 0;
}

if (process.argv.slice(2).includes("--selftest")) {
  process.exit(runSelftest());
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
//
// A small .env reader, the same one the scripts beside this use and for the same
// reason: no dotenv package exists here, and adding one for a staging script
// would need a rule 17 conversation for no benefit.

function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    die(
      `could not read ${path} (${cause.code ?? "unknown error"}).\n` +
        `That file holds the staging URL and publishable key. It is git-ignored, so it\n` +
        `exists only on your own machine.\n` +
        `\n` +
        `If you only wanted to check this script's own logic, that needs none of it:\n` +
        `  node scripts/staging/build-it-25-captcha-checks.mjs --selftest`,
    );
  }

  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const args = process.argv.slice(2);
const afterRun = args.includes("--after");
const skipRateLimit = args.includes("--skip-rate-limit");

const fileEnv = readEnvFile(ENV_FILE);

const supabaseUrl = (fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const publishableKey = (fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

const missingFromFile = [];
if (supabaseUrl === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_URL");
if (publishableKey === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (missingFromFile.length > 0) {
  die(`${ENV_FILE} is missing: ${missingFromFile.join(", ")}.\nNo value is printed by this script.`);
}

// THE STAGING GUARD, FIRST, before a password is read out of the environment
// and long before a request is made.
const urlVerdict = judgeStagingUrl(supabaseUrl)[0];
if (urlVerdict.verdict !== PASS) {
  die(
    `the Supabase URL in web/.env.local is not the staging project: ${urlVerdict.detail}.\n` +
      `This script signs in as a real account. It runs against staging and nothing else\n` +
      `(AGENTS.md rules 1 and 10).`,
  );
}

const aliceEmail = (process.env.ALICE_EMAIL ?? "").trim();
const alicePassword = process.env.ALICE_PASSWORD ?? "";

const missingFromEnv = [];
if (aliceEmail === "") missingFromEnv.push("ALICE_EMAIL");
if (alicePassword === "") missingFromEnv.push("ALICE_PASSWORD");
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `The logic check needs neither of them:\n` +
      `  node scripts/staging/build-it-25-captcha-checks.mjs --selftest`,
  );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;

const REQUEST_LOG = [];

let passes = 0;
let failures = 0;
let unverified = 0;

function record(results) {
  for (const result of results) {
    if (result.verdict === PASS) passes += 1;
    else if (result.verdict === FAIL) failures += 1;
    else unverified += 1;
    console.log(`  ${result.verdict}  ${result.what} -- ${result.detail}`);
  }
}

// One sign-in. `body` is handed in whole, so the ONE difference between check 1
// and check 2 -- the presence of the CAPTCHA field -- is visible at the call
// site rather than hidden behind a flag.
async function signIn(body) {
  const path = "/auth/v1/token?grant_type=password";
  REQUEST_LOG.push({ method: "POST", path });

  let response;
  try {
    response = await fetch(`${authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach the sign-in endpoint (${cause.message})` };
  }

  // THE SAME READING FUNCTION THE SELFTEST DRIVES, which is the point of its
  // being a function: a case that built its own object would be blind to
  // anything wrong in here.
  return readAuthAnswer({ status: response.status, raw: await response.text() });
}

// Ends only the session this run created. scope=local, never global: 'global'
// would end every session belonging to that account and sign the owner's own
// browser out of Alice every time this ran. The three accepted values are
// 'global', 'local' and 'others' -- @supabase/auth-js lib/types, SIGN_OUT_SCOPES.
async function signOutLocally(accessToken) {
  const path = "/auth/v1/logout?scope=local";
  REQUEST_LOG.push({ method: "POST", path });

  try {
    const response = await fetch(`${authUrl}/logout?scope=local`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    return `signed out: HTTP ${response.status}`;
  } catch (cause) {
    return `sign out failed (${cause.message}); the session expires on its own`;
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

console.log("Build it 25 -- the anti-robot check, against STAGING only");
console.log(`  project:        ${STAGING_HOST} (host checked exactly)`);
console.log(`  signing in as:  ${aliceEmail}`);
console.log(`  which run:      ${afterRun ? "AFTER CAPTCHA was switched on" : "BEFORE CAPTCHA is switched on"}`);
console.log(`  dummy token:    ${DUMMY_CAPTCHA_TOKEN} (Cloudflare's published value)`);
console.log("  creates:        no account. sends: no email.");
console.log("");
console.log("  Pass --after on the second run. Without it this script expects a");
console.log("  sign-in with no token to be ACCEPTED, which is the right answer");
console.log("  before the owner enables CAPTCHA and the finding afterwards.");
console.log("");

// ---- 1. a sign-in with NO token at all ------------------------------------
console.log("1. a sign-in carrying no CAPTCHA token");
record(
  judgeNoToken(
    await signIn({ email: aliceEmail, password: alicePassword }),
    afterRun,
  ),
);
console.log("");

// ---- 2. a sign-in with the dummy token -----------------------------------
console.log("2. a sign-in carrying Cloudflare's dummy token");
const withDummy = await signIn({
  email: aliceEmail,
  password: alicePassword,
  ...captchaBody(),
});
record(judgeDummyToken(withDummy, afterRun ? "after" : "before"));

if (!withDummy.error && typeof withDummy.json?.access_token === "string") {
  console.log(`  ${await signOutLocally(withDummy.json.access_token)}`);
}
console.log("");

// ---- 3. thirty-one wrong passwords from one address ----------------------
console.log(`3. ${ATTEMPTS} wrong-password sign-ins for an address with no account (decision F)`);

if (skipRateLimit) {
  record([
    {
      what: `${ATTEMPTS} wrong-password sign-ins: where the limit bites`,
      verdict: UNVERIFIED,
      detail: "--skip-rate-limit was passed, so this was not run",
    },
  ]);
} else {
  console.log(`  address: ${NOBODY} (no account; the password is not printed)`);
  const statuses = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    // THE DUMMY TOKEN IS SENT ON EVERY ONE. With CAPTCHA on and no token, the
    // CAPTCHA refusal would come first and the password path would never be
    // reached -- so the run would measure the wrong limit. Sending the token
    // satisfies the check and leaves the password as the thing being refused.
    const answer = await signIn({
      email: NOBODY,
      password: WRONG_PASSWORD,
      ...captchaBody(),
    });
    statuses.push(answer.error ? null : answer.status);
    if (answer.status === 429) {
      console.log(`  attempt ${attempt}: HTTP 429 -- the limit bit here`);
      // Stop at the first 429. Carrying on would spend more of the window for
      // no extra information, and the judgement only needs the first one.
      break;
    }
  }
  // Pad to the full length so the judgement knows how many were planned: a run
  // that stopped early at a 429 has a shorter list, and a run that finished has
  // the full one.
  record(judgeRateLimit(statuses, RATE_LIMIT_TARGET));
}
console.log("");

// ---- what this run touched ----------------------------------------------
console.log("4. what this run actually did");
record(judgeTouchedNothing(REQUEST_LOG));
console.log("");

const total = passes + failures + unverified;
console.log(`${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED (${total} judgements).`);
console.log("");
console.log("WHAT THIS RUN CANNOT TELL YOU, whichever way it came out:");
console.log("  * that a REAL CAPTCHA refuses anybody. A dummy secret key accepts the");
console.log("    dummy token by definition, so this is a check staging cannot fail.");
console.log("  * that a person on a phone can solve one. A widget, its script and its");
console.log("    appearance are not reachable from a fetch.");
console.log("  docs/rate-limits.md section 4 has the full list, and the two things the");
console.log("  owner can do on production that this script may not.");

if (failures > 0) process.exit(1);
