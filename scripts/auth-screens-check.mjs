#!/usr/bin/env node
// auth-screens-check.mjs -- the three sign-in screens, the emailed links, and
// the anti-robot check, checked against the real files rather than a copy.
//
// Build it 25 part 1, issue #284.
//
// WHAT IT IS FOR. The issue sets three rules, and every one of them is the kind
// that looks obviously right and quietly stops being true after an edit:
//
//   rule 1  every refusal Supabase Auth can give when a password is set or an
//           account is made gets its OWN plain sentence, chosen from the error
//           code and never from the service's text -- and only a link that is
//           REALLY dead says the link did not work.
//   rule 2  an emailed link works in any browser, and a mail scanner's GET or
//           HEAD spends nothing, because the token is only spent on a press.
//   rule 3  the anti-robot check is on all three screens, the token goes to
//           Supabase with the request, and the screen never submits without
//           one.
//
// THE THING THAT WENT WRONG, which is why rule 1 is first. On production on 11
// October 2026 the owner followed a real reset link in the browser that asked
// for it, the form loaded, and saving the password was refused with HTTP 422
// and the code `same_password`. The screen said "That link didn't work." The
// link had worked. Nothing in this repository would have noticed.
//
// TWO KINDS OF CHECK, and the second kind is the point:
//
//   * the pure modules are IMPORTED and called --  web/src/lib/auth-messages.ts,
//     web/src/lib/email-links.ts, web/src/lib/turnstile.ts. All three have no
//     imports of their own, so Node can read them with no bundler and no
//     packages: the same arrangement scripts/password-reset-check.mjs uses for
//     web/src/lib/password-reset.ts.
//
//   * the SOURCE of the pages, the actions and the component is read and
//     searched. A table of sentences cannot stop an action sending every error
//     down one path; only reading the action can. So the actions are checked
//     for which function chooses their refusal, the confirm page is checked for
//     NOT calling Supabase at all, and the three screens are checked for
//     drawing the component that owns the button.
//
// EVERY "FOUND NOTHING" CHECK HAS A CONTROL (AGENTS.md rule 8), because zero
// matches is also what a broken search looks like.
//
// AND IT COMPARES TWO MODULES THAT CANNOT IMPORT EACH OTHER. Three strings are
// deliberately spelled twice -- the dead-link path, the new-password screen's
// path, and the reset marker's name -- because both modules have to stay
// import-free for a plain `node` run to load them. This script imports BOTH and
// requires the copies to agree, which is the only thing that would notice a
// drift.
//
// AND IT COMPARES CODE WITH A DOCUMENT. The two email templates the owner has
// to paste into a dashboard are exported from web/src/lib/email-links.ts, and
// this script requires docs/rate-limits.md to contain both verbatim. An
// instruction that tells the owner to point a link at a path this app no longer
// serves is the failure that would otherwise be found by a volunteer.
//
// NODE 22.6 OR NEWER, because Node strips the TypeScript types as it loads the
// modules. On Node 24 this needs no flag.
//
// WHAT IT DOES NOT COVER, said plainly: it sends no email, signs nobody in,
// opens no browser, and renders no React. It cannot tell you that a real
// CAPTCHA refuses anybody, that a token hash works in a second browser, or that
// a widget loads on a phone. Those are the owner's runs --
// scripts/staging/build-it-25-captcha-checks.mjs is the staging half, and
// docs/rate-limits.md section 4 says what staging can and cannot prove.
//
// It reads files, writes nothing and connects to nothing:
//   node scripts/auth-screens-check.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WEB = resolve(ROOT, "web", "src");

const MODULES = {
  messages: resolve(WEB, "lib", "auth-messages.ts"),
  links: resolve(WEB, "lib", "email-links.ts"),
  turnstile: resolve(WEB, "lib", "turnstile.ts"),
  reset: resolve(WEB, "lib", "password-reset.ts"),
};

const {
  REFUSAL_CODES,
  REFUSAL_SENTENCES,
  REFUSED_FIELD,
  linkRefusedPath,
  newPasswordRefusedPath,
  readAuthFailure,
  refusalSentence,
  refusedCodeIn,
  signInRefusedPath,
  signUpRefusedPath,
} = await import(pathToFileURL(MODULES.messages).href);

const {
  CONFIRM_LINK_PATH,
  LINK_TYPES,
  LINK_TYPE_FIELD,
  LINK_WORDS,
  RECOVERY_LINK_HREF,
  SIGNUP_LINK_HREF,
  TOKEN_HASH_FIELD,
  confirmView,
  destinationAfter,
  readLinkType,
  readTokenHash,
} = await import(pathToFileURL(MODULES.links).href);

const {
  TURNSTILE_DUMMY_SITE_KEY,
  TURNSTILE_SCRIPT_URL,
  TURNSTILE_TOKEN_FIELD,
  TURNSTILE_WORDS,
  maySubmit,
  readCaptchaToken,
  turnstileView,
} = await import(pathToFileURL(MODULES.turnstile).href);

const { NEW_PASSWORD_PATH, RESET_MARKER_COOKIE, newPasswordPath } = await import(
  pathToFileURL(MODULES.reset).href
);

// Cloudflare's dummy token, from the one place this repository spells it.
const { DUMMY_CAPTCHA_TOKEN, CAPTCHA_BODY_FIELD, captchaBody } = await import(
  pathToFileURL(resolve(ROOT, "scripts", "lib", "captcha.mjs")).href
);

// The files whose source is searched. Named here so a check that reads one
// fails loudly if it is renamed, rather than quietly looking at nothing.
const FILES = {
  actions: resolve(WEB, "app", "auth", "actions.ts"),
  confirmAction: resolve(WEB, "app", "auth", "confirm", "actions.ts"),
  confirmPage: resolve(WEB, "app", "auth", "confirm", "page.tsx"),
  resetRoute: resolve(WEB, "app", "auth", "reset", "route.ts"),
  callbackRoute: resolve(WEB, "app", "auth", "callback", "route.ts"),
  login: resolve(WEB, "app", "login", "page.tsx"),
  signup: resolve(WEB, "app", "signup", "page.tsx"),
  request: resolve(WEB, "app", "forgot-password", "page.tsx"),
  newPassword: resolve(WEB, "app", "reset-password", "page.tsx"),
  gate: resolve(WEB, "app", "components", "CaptchaGate.tsx"),
  turnstileModule: MODULES.turnstile,
  messagesModule: MODULES.messages,
  linksModule: MODULES.links,
  env: resolve(WEB, "lib", "env.ts"),
  rateLimits: resolve(ROOT, "docs", "rate-limits.md"),
  ci: resolve(ROOT, ".github", "workflows", "ci.yml"),
};

// LINE ENDINGS ARE NORMALISED TO LF BEFORE ANYTHING IS SEARCHED, for the reason
// scripts/password-reset-check.mjs gives: this repository is worked on from
// Windows with core.autocrlf=true, so a file that has been through a checkout
// has CRLF and one just written by hand has LF, in the same folder at the same
// time. A check whose answer depends on which machine checked the file out is
// not a check.
const source = Object.fromEntries(
  Object.entries(FILES).map(([key, path]) => [
    key,
    readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
  ]),
);

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    passed += 1;
    console.log(`PASS  ${name}`);
    return;
  }

  failures.push(name);
  console.log(`FAIL  ${name}\n        expected ${b}\n        got      ${a}`);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

// Comments are stripped before any search that would otherwise match a comment
// ABOUT the thing being looked for. These files argue at length about what they
// do not do, so a search that counted the arguments would be a search that can
// only pass.
//
// THE `[^:]` IS NOT DECORATION, and it is copied from
// scripts/password-reset-check.mjs for the reason that file found the hard way:
// `https://` contains `//`, so a plain line-comment rule eats the second half
// of every URL in the file -- including the one URL this script exists to
// assert the presence of. Written here first without it, and the Cloudflare
// check came out 0.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// The body of one named function, by brace matching from its declaration.
function functionBody(text, name) {
  const at = text.search(new RegExp(`function ${name}\\s*\\(`));
  if (at === -1) return null;

  const open = text.indexOf("{", at);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

function orderedBefore(text, first, second) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
}

// --------------------------------------------------------- 0. the toolbox
console.log("0. the searches this file relies on can find something");

const FIXTURE = [
  "// a comment naming same_password and verifyOtp",
  "/* a block comment naming captchaToken */",
  'const code = "same_password";',
].join("\n");

check(
  "CONTROL -- the stripper removes both kinds of comment and keeps the code beside them",
  [
    withoutComments(FIXTURE).includes("a comment naming"),
    withoutComments(FIXTURE).includes("a block comment"),
    withoutComments(FIXTURE).includes("const code"),
  ],
  [false, false, true],
);
check(
  "CONTROL -- and it does NOT eat the second half of a URL, which is the bug it was written with",
  withoutComments('const u = "https://example.com/x";').includes("https://"),
  true,
);
check(
  "CONTROL -- functionBody finds a body and stops at its own closing brace",
  functionBody("function one() {\n  return 1;\n}\nfunction two() { return 2; }", "one"),
  "\n  return 1;\n",
);
check(
  "CONTROL -- functionBody answers null for a function that is not there",
  functionBody("function one() { return 1; }", "nope"),
  null,
);
check(
  "CONTROL -- orderedBefore says false when the second thing comes first",
  [
    orderedBefore("a then b", "a", "b"),
    orderedBefore("b then a", "a", "b"),
    orderedBefore("only a", "a", "b"),
  ],
  [true, false, false],
);

// ============================================================================
// 1. one plain sentence per refusal, chosen from the code
// ============================================================================
console.log("\n1. the sentences: one per refusal, and not one of them Supabase's");

check(
  "every code in the table has a sentence, and the table is the only list",
  [REFUSAL_CODES.length, Object.keys(REFUSAL_SENTENCES).length],
  [12, 12],
);

check(
  "every sentence ends in a full stop and says more than a word",
  REFUSAL_CODES.filter(
    (code) =>
      !REFUSAL_SENTENCES[code].endsWith(".") ||
      REFUSAL_SENTENCES[code].split(" ").length < 4,
  ),
  [],
);

// NOT ONE OF THEM NAMES A COMPANY, A STATUS, A CODE OR A COLUMN. The same rule
// supabase/functions/_shared/limits.ts keeps about its own sentence, and the
// reason web/src/lib/teams.ts has a long note about it: a message this app did
// not write, in this app's styling, is a sentence nobody here can be held to.
const FORBIDDEN_IN_A_SENTENCE = [
  "Supabase",
  "Cloudflare",
  "Turnstile",
  "CAPTCHA",
  "HTTP",
  "422",
  "429",
  "token",
  "_",
];

check(
  "no sentence names a company, a status, a code or an underscore word",
  FORBIDDEN_IN_A_SENTENCE.filter((word) =>
    REFUSAL_CODES.some((code) => REFUSAL_SENTENCES[code].includes(word)),
  ),
  [],
);
check(
  "CONTROL -- the same search finds those words when they are there",
  FORBIDDEN_IN_A_SENTENCE.filter((word) =>
    "Supabase answered HTTP 422 with same_password".includes(word),
  ),
  ["Supabase", "HTTP", "422", "_"],
);

check(
  "a code this app did not write draws NOTHING, so nothing from an address bar is printed",
  [
    refusalSentence("same_as_old"),
    refusalSentence("made_up"),
    refusalSentence(""),
    refusalSentence(undefined),
    refusalSentence(["same_as_old"]),
    refusalSentence("<b>hello</b>"),
  ],
  [REFUSAL_SENTENCES.same_as_old, null, null, null, null, null],
);

// ---- what came back ------------------------------------------------------
console.log("\n1a. reading an answer, including the ones that are not errors");

check(
  "an AuthError's three fields",
  readAuthFailure({ name: "AuthApiError", status: 422, code: "same_password" }),
  { name: "AuthApiError", status: 422, code: "same_password" },
);
check(
  "the `{ error: true }` constant signIn uses for a press its page did not make",
  readAuthFailure(true),
  { name: "", status: null, code: null },
);
check(
  "nothing at all, and every other shape that is not an object",
  [readAuthFailure(undefined), readAuthFailure(null), readAuthFailure("oops")],
  [
    { name: "", status: null, code: null },
    { name: "", status: null, code: null },
    { name: "", status: null, code: null },
  ],
);
check(
  "a status that arrived as a string is not read as a number",
  readAuthFailure({ status: "429", code: 7 }),
  { name: "", status: null, code: null },
);

// ---- THE ONE THE OWNER WATCHED GO WRONG ----------------------------------
console.log("\n1b. setting a new password: the refusal the owner saw, and the rest");

const DEAD_LINK_PATH = newPasswordPath("stale");

check(
  "the two modules agree on the dead-link path, which neither can import from the other",
  [DEAD_LINK_PATH, `${NEW_PASSWORD_PATH}?link=0`],
  ["/reset-password?link=0", "/reset-password?link=0"],
);

check(
  "same_password -- 11 Oct 2026, HTTP 422, the one that said the link didn't work",
  newPasswordRefusedPath({ status: 422, code: "same_password" }),
  "/reset-password?refused=same_as_old",
);
check(
  "and its sentence is about the password and names no link",
  refusalSentence(refusedCodeIn(newPasswordRefusedPath({ code: "same_password" }))),
  "That is the password you are already using. Choose a different one.",
);
check(
  "weak_password gets its own sentence rather than the link's",
  refusedCodeIn(newPasswordRefusedPath({ status: 422, code: "weak_password" })),
  "password_refused",
);
check(
  "a rate limit, by code and by status alone",
  [
    refusedCodeIn(newPasswordRefusedPath({ code: "over_request_rate_limit" })),
    refusedCodeIn(newPasswordRefusedPath({ status: 429 })),
    refusedCodeIn(newPasswordRefusedPath({ status: 429, code: "something_new" })),
  ],
  ["too_many", "too_many", "too_many"],
);
check(
  "a CAPTCHA failure",
  refusedCodeIn(newPasswordRefusedPath({ code: "captcha_failed" })),
  "robot_check",
);

// ONLY A LINK THAT IS REALLY DEAD SAYS THE LINK DID NOT WORK. This is the whole
// of rule 1's second half, so it is asked of every answer that means the
// recovery session is gone AND of every answer that does not.
check(
  "a session that is really gone: the dead-link screen, by code and by name",
  [
    newPasswordRefusedPath({ code: "session_expired" }),
    newPasswordRefusedPath({ code: "session_not_found" }),
    newPasswordRefusedPath({ code: "refresh_token_not_found" }),
    newPasswordRefusedPath({ code: "bad_jwt" }),
    newPasswordRefusedPath({ name: "AuthSessionMissingError", status: 400 }),
    newPasswordRefusedPath({ name: "AuthInvalidJwtError", status: 400 }),
  ],
  [
    DEAD_LINK_PATH,
    DEAD_LINK_PATH,
    DEAD_LINK_PATH,
    DEAD_LINK_PATH,
    DEAD_LINK_PATH,
    DEAD_LINK_PATH,
  ],
);
check(
  "AND NOTHING ELSE DOES: an answer nobody here recognises is told it did not work, not that the link is dead",
  [
    newPasswordRefusedPath({ status: 500, code: "unexpected_failure" }),
    newPasswordRefusedPath({ status: 400, code: "validation_failed" }),
    newPasswordRefusedPath({}),
    newPasswordRefusedPath(true),
  ],
  [
    "/reset-password?refused=try_again",
    "/reset-password?refused=try_again",
    "/reset-password?refused=try_again",
    "/reset-password?refused=try_again",
  ],
);
check(
  "CONTROL -- the old behaviour, every answer on the dead-link path, is NOT what this returns",
  [
    "same_password",
    "weak_password",
    "over_request_rate_limit",
    "unexpected_failure",
  ].filter((code) => newPasswordRefusedPath({ code }) === DEAD_LINK_PATH),
  [],
);

// ---- sign in -------------------------------------------------------------
console.log("\n1c. signing in: three refusals that are not about the password");

check(
  "a rate limit no longer says the password did not match",
  [
    signInRefusedPath({ status: 429 }),
    signInRefusedPath({ code: "over_request_rate_limit" }),
  ],
  ["/login?refused=too_many", "/login?refused=too_many"],
);
check(
  "a CAPTCHA failure, and an unconfirmed address",
  [
    refusedCodeIn(signInRefusedPath({ code: "captcha_failed" })),
    refusedCodeIn(signInRefusedPath({ code: "email_not_confirmed" })),
  ],
  ["robot_check", "confirm_first"],
);
check(
  "and the one sentence that must NOT change: wrong credentials, and a press from somewhere else",
  [
    signInRefusedPath({ status: 400, code: "invalid_credentials" }),
    signInRefusedPath(true),
    signInRefusedPath({ code: "user_banned" }),
  ],
  ["/login?problem=1", "/login?problem=1", "/login?problem=1"],
);

// ---- sign up -------------------------------------------------------------
console.log("\n1d. signing up: six refusals, and the one that must stay generic");

check(
  "the six, each with its own code",
  [
    refusedCodeIn(signUpRefusedPath({ code: "captcha_failed" })),
    refusedCodeIn(signUpRefusedPath({ status: 429 })),
    refusedCodeIn(signUpRefusedPath({ code: "weak_password" })),
    refusedCodeIn(signUpRefusedPath({ code: "over_email_send_rate_limit" })),
    refusedCodeIn(signUpRefusedPath({ code: "email_address_not_authorized" })),
    refusedCodeIn(signUpRefusedPath({ code: "email_address_invalid" })),
    refusedCodeIn(signUpRefusedPath({ code: "signup_disabled" })),
  ],
  [
    "robot_check",
    "too_many",
    "password_refused",
    "email_limit",
    "address_blocked",
    "address_refused",
    "signup_off",
  ],
);

// THE ONE THAT MUST STAY GENERIC, AND IT IS A PRIVACY RULE RATHER THAN AN
// OVERSIGHT. "That address already has an account" is how a list of addresses
// gets sorted into accounts and not-accounts, which is the same reason
// web/src/lib/password-reset.ts has one sentence for every reset request.
check(
  "an address that already has an account is NOT told so",
  [
    signUpRefusedPath({ status: 422, code: "email_exists" }),
    signUpRefusedPath({ status: 422, code: "user_already_exists" }),
  ],
  ["/signup?problem=1", "/signup?problem=1"],
);
check(
  "CONTROL -- no sentence in the table mentions an existing account",
  REFUSAL_CODES.filter((code) =>
    /already has an account|already registered|address exists/i.test(
      REFUSAL_SENTENCES[code],
    ),
  ),
  [],
);

// ---- the actions actually ask these functions ----------------------------
console.log("\n1e. the actions choose their refusal with these functions, not with one path");

const signInAction = functionBody(source.actions, "signIn");
const signUpAction = functionBody(source.actions, "signUp");
const setAction = functionBody(source.actions, "setNewPassword");

check(
  "all three actions were found, so the checks below are reading something",
  [signInAction !== null, signUpAction !== null, setAction !== null],
  [true, true, true],
);
check(
  "each action asks its own chooser, exactly once",
  [
    count(withoutComments(signInAction ?? ""), "signInRefusedPath("),
    count(withoutComments(signUpAction ?? ""), "signUpRefusedPath("),
    count(withoutComments(setAction ?? ""), "newPasswordRefusedPath("),
  ],
  [1, 1, 1],
);
// THE LINE THAT LIED. It was `redirect(newPasswordPath("stale"))` on the
// `updateUser` error branch, for every answer Supabase could give. There is now
// exactly ONE redirect to that path in the whole function -- the gate's own
// refusal -- and the error branch COMPARES against it instead, which is what
// decides whether the marker cookie is kept.
check(
  "THE LINE THAT LIED IS GONE: exactly one redirect to the dead-link path, and it is the gate's",
  [
    count(withoutComments(setAction ?? ""), 'redirect(newPasswordPath("stale"))'),
    count(withoutComments(setAction ?? ""), 'newPasswordPath("stale")'),
  ],
  [1, 2],
);
check(
  "and the one that is left is the gate's refusal, which comes BEFORE the password is read",
  orderedBefore(
    withoutComments(setAction ?? ""),
    'newPasswordPath("stale")',
    "updateUser(",
  ),
  true,
);
check(
  "the marker is kept for a refusal the person can fix, and deleted only for the dead-link path",
  [
    count(withoutComments(setAction ?? ""), `${RESET_MARKER_COOKIE}`),
    orderedBefore(
      withoutComments(setAction ?? ""),
      "newPasswordRefusedPath(",
      "redirect(refusedPath)",
    ),
  ],
  [0, true],
);
check(
  "CONTROL -- the cookie's name is a constant in both files rather than a string either spells",
  [
    count(withoutComments(source.actions), "RESET_MARKER_COOKIE"),
    count(withoutComments(source.confirmAction), "RESET_MARKER_COOKIE"),
    count(withoutComments(source.actions), '"reset-link-used"'),
  ],
  [5, 2, 0],
);
check(
  "no action prints or forwards a word Supabase wrote: `error.message` appears nowhere",
  [
    count(withoutComments(source.actions), ".message"),
    count(withoutComments(source.confirmAction), ".message"),
  ],
  [0, 0],
);
check(
  "CONTROL -- the same search finds a forwarded message when there is one",
  count(withoutComments("redirect(`/login?why=${error.message}`);"), ".message"),
  1,
);

// ============================================================================
// 2. a link that works in any browser, and that a scanner cannot spend
// ============================================================================
console.log("\n2. the emailed link: any browser, and a press rather than a fetch");

check("the page's own path", CONFIRM_LINK_PATH, "/auth/confirm");
check("the two fields the press carries", [TOKEN_HASH_FIELD, LINK_TYPE_FIELD], [
  "token_hash",
  "type",
]);

check(
  "the two kinds of link, and nothing else is accepted",
  [
    LINK_TYPES.slice(),
    readLinkType("recovery"),
    readLinkType("signup"),
    readLinkType("  recovery  "),
    readLinkType("email_change"),
    readLinkType("invite"),
    readLinkType("magiclink"),
    readLinkType(""),
    readLinkType(undefined),
    readLinkType(["recovery"]),
  ],
  [
    ["recovery", "signup"],
    "recovery",
    "signup",
    "recovery",
    null,
    null,
    null,
    null,
    null,
    null,
  ],
);

check(
  "where each kind goes: two fixed paths, and the recovery one is the password form",
  [destinationAfter("recovery"), destinationAfter("signup"), NEW_PASSWORD_PATH],
  ["/reset-password", "/tasks", "/reset-password"],
);
check(
  "the recovery destination IS the new-password screen, compared across the two modules",
  destinationAfter("recovery") === NEW_PASSWORD_PATH,
  true,
);

check(
  "a token hash has to be a token-shaped string, so junk in the address bar sends no request",
  [
    readTokenHash("abc123") !== null,
    readTokenHash("pkce_0123456789abcdef-_.~") !== null,
    readTokenHash("") === null,
    readTokenHash("   ") === null,
    readTokenHash(undefined) === null,
    readTokenHash(["abc"]) === null,
    readTokenHash("has a space") === null,
    readTokenHash("<script>") === null,
    readTokenHash("x".repeat(501)) === null,
  ],
  [true, true, true, true, true, true, true, true, true],
);

check(
  "the page draws a button only for a link that is the right shape, and says so otherwise",
  [
    confirmView({ tokenHash: "abc", type: "recovery", refused: false }),
    confirmView({ tokenHash: "abc", type: "signup", refused: false }),
    confirmView({ tokenHash: null, type: "recovery", refused: false }),
    confirmView({ tokenHash: "abc", type: null, refused: false }),
    confirmView({ tokenHash: "abc", type: "recovery", refused: true }),
    confirmView({ tokenHash: null, type: null, refused: true }),
  ],
  ["ask", "ask", "dead", "dead", "dead", "dead"],
);

check(
  "both kinds of link have their own heading and button, and neither names a company",
  [
    LINK_WORDS.recovery.heading,
    LINK_WORDS.signup.heading,
    LINK_TYPES.filter((type) =>
      /Supabase|Cloudflare|token|link=|http/i.test(
        `${LINK_WORDS[type].heading} ${LINK_WORDS[type].lede} ${LINK_WORDS[type].button}`,
      ),
    ),
  ],
  ["Set a new password", "Confirm your email address", []],
);

// ---- THE HALF THAT MAKES A SCANNER HARMLESS ------------------------------
console.log("\n2a. the page verifies NOTHING, and the action needs a press");

check(
  "the confirm PAGE never calls Supabase at all: no client, no verifyOtp, no exchange",
  [
    count(withoutComments(source.confirmPage), "createClient("),
    count(withoutComments(source.confirmPage), "verifyOtp("),
    count(withoutComments(source.confirmPage), "exchangeCodeForSession("),
    count(withoutComments(source.confirmPage), "cookies("),
  ],
  [0, 0, 0, 0],
);
check(
  "CONTROL -- /auth/reset, the route that still serves links sent before this change, DOES call Supabase",
  [
    count(withoutComments(source.resetRoute), "createClient("),
    count(withoutComments(source.resetRoute), "verifyOtp("),
    count(withoutComments(source.resetRoute), "exchangeCodeForSession("),
  ],
  [1, 1, 1],
);
check(
  "LINKS SENT BEFORE THIS CHANGE STILL WORK: both old landing routes are untouched and still read `code`",
  [
    count(withoutComments(source.resetRoute), 'searchParams.get("code")'),
    count(withoutComments(source.callbackRoute), 'searchParams.get("code")'),
    count(withoutComments(source.resetRoute), 'searchParams.get("token_hash")'),
  ],
  [1, 1, 1],
);

const useLink = functionBody(source.confirmAction, "useEmailLink");

check(
  "the action was found",
  useLink !== null,
  true,
);
check(
  "it spends the token exactly once, and only after the button has been checked",
  [
    count(withoutComments(useLink ?? ""), "verifyOtp("),
    count(withoutComments(useLink ?? ""), "pressed("),
    orderedBefore(withoutComments(useLink ?? ""), "pressed(", "verifyOtp("),
  ],
  [1, 1, true],
);
check(
  "THE PRESS IS THE GATE: it re-reads both fields through the same two functions the page used",
  [
    count(withoutComments(useLink ?? ""), "readTokenHash("),
    count(withoutComments(useLink ?? ""), "readLinkType("),
    orderedBefore(withoutComments(useLink ?? ""), "readTokenHash(", "verifyOtp("),
    orderedBefore(withoutComments(useLink ?? ""), "readLinkType(", "verifyOtp("),
  ],
  [1, 1, true, true],
);
check(
  "and the type it hands Supabase comes from that fixed list, never straight from the request",
  [
    count(withoutComments(useLink ?? ""), 'type: "recovery"'),
    count(withoutComments(useLink ?? ""), "searchParams"),
    count(withoutComments(useLink ?? ""), "request."),
  ],
  [0, 0, 0],
);
check(
  "NO DESTINATION IS TAKEN FROM THE LINK: no `next`, and the two exits are destinationAfter's",
  [
    count(withoutComments(source.confirmAction), '"next"'),
    count(withoutComments(source.confirmPage), '"next"'),
    count(withoutComments(useLink ?? ""), "destinationAfter("),
  ],
  [0, 0, 1],
);
check(
  "the marker is set only for a recovery link",
  [
    count(withoutComments(useLink ?? ""), 'type === "recovery"'),
    orderedBefore(withoutComments(useLink ?? ""), "verifyOtp(", "cookieStore.set("),
  ],
  [1, true],
);
check(
  "the token hash is never drawn, logged or put in a redirect",
  [
    count(withoutComments(source.confirmAction), "console."),
    count(withoutComments(source.confirmPage), "console."),
    // The hidden field is the only place the value appears in the page, and it
    // is an input's value rather than text.
    count(withoutComments(source.confirmPage), "{token}"),
  ],
  [0, 0, 1],
);

// ---- what the owner has to paste, compared with what this app serves -----
console.log("\n2b. the two email templates: word for word, and pointing at this app");

check(
  "each template points at this page, carries the token hash, and names its own type",
  [
    RECOVERY_LINK_HREF.includes(`{{ .SiteURL }}${CONFIRM_LINK_PATH}?`),
    SIGNUP_LINK_HREF.includes(`{{ .SiteURL }}${CONFIRM_LINK_PATH}?`),
    RECOVERY_LINK_HREF.includes(`${TOKEN_HASH_FIELD}={{ .TokenHash }}`),
    SIGNUP_LINK_HREF.includes(`${TOKEN_HASH_FIELD}={{ .TokenHash }}`),
    RECOVERY_LINK_HREF.endsWith(`${LINK_TYPE_FIELD}=recovery`),
    SIGNUP_LINK_HREF.endsWith(`${LINK_TYPE_FIELD}=signup`),
  ],
  [true, true, true, true, true, true],
);
check(
  "NEITHER CARRIES A `next`, so no destination can come out of an email",
  [RECOVERY_LINK_HREF.includes("next"), SIGNUP_LINK_HREF.includes("next")],
  [false, false],
);
check(
  "THE HOST COMES FROM A SETTING, not from a request: `{{ .SiteURL }}` and no literal address",
  [
    count(RECOVERY_LINK_HREF, "{{ .SiteURL }}"),
    count(SIGNUP_LINK_HREF, "{{ .SiteURL }}"),
    /https?:\/\//.test(RECOVERY_LINK_HREF),
    /https?:\/\//.test(SIGNUP_LINK_HREF),
  ],
  [1, 1, false, false],
);
// THE WHOLE `href="..."`, not just the address, and that is not fussiness: the
// document also QUOTES Supabase's own documented example, which is this string
// plus `&next=/account/update-password` -- so a bare substring search finds two
// and could not tell the instruction from the quotation. Written without the
// quotes first, and this check came out 2.
check(
  "AND THE DOCUMENT THE OWNER FOLLOWS CARRIES BOTH, VERBATIM, as the href of a link",
  [
    count(source.rateLimits, `href="${RECOVERY_LINK_HREF}"`),
    count(source.rateLimits, `href="${SIGNUP_LINK_HREF}"`),
  ],
  [1, 1],
);
check(
  "CONTROL -- a template naming a path this app does not serve is NOT in that document",
  count(
    source.rateLimits,
    'href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup"',
  ),
  0,
);
check(
  "CONTROL -- and the quoted Supabase example really is in there, so the two are distinguishable",
  count(source.rateLimits, `${RECOVERY_LINK_HREF}&next=`),
  1,
);

// ============================================================================
// 3. the anti-robot check
// ============================================================================
console.log("\n3. the anti-robot check: on three screens, and never a submit without a token");

check(
  "the script is Cloudflare's own, asked for explicit rendering",
  TURNSTILE_SCRIPT_URL,
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
);
check(
  "ONE address in that module, and it is Cloudflare's challenges host and nothing of ours",
  [
    (withoutComments(source.turnstileModule).match(/https:\/\//g) ?? []).length,
    withoutComments(source.turnstileModule).includes(
      "https://challenges.cloudflare.com/",
    ),
    /localhost|vercel\.app|\.supabase\.co/.test(
      withoutComments(source.turnstileModule),
    ),
  ],
  [1, true, false],
);
check(
  "the field the widget creates, which is how the token reaches the action",
  TURNSTILE_TOKEN_FIELD,
  "cf-turnstile-response",
);
check(
  "Cloudflare's published dummy sitekey, for CI's build and for Vercel's Preview",
  TURNSTILE_DUMMY_SITE_KEY,
  "1x00000000000000000000AA",
);

check(
  "the four states, and the one the site key decides alone",
  [
    turnstileView({ siteKey: "", failed: false, token: "" }),
    turnstileView({ siteKey: "", failed: true, token: "" }),
    turnstileView({ siteKey: "   ", failed: true, token: "x" }),
    turnstileView({ siteKey: "k", failed: false, token: "" }),
    turnstileView({ siteKey: "k", failed: false, token: "   " }),
    turnstileView({ siteKey: "k", failed: true, token: "x" }),
    turnstileView({ siteKey: "k", failed: false, token: "x" }),
  ],
  ["off", "off", "off", "waiting", "waiting", "failed", "solved"],
);
check(
  "IT NEVER SUBMITS WITHOUT A TOKEN: only `off` and `solved` may post",
  [
    maySubmit("off"),
    maySubmit("solved"),
    maySubmit("waiting"),
    maySubmit("failed"),
  ],
  [true, true, false, false],
);
check(
  "CONTROL -- a gate that allowed `waiting` would be the thing this is written to refuse",
  ["off", "solved", "waiting", "failed"].filter((view) => maySubmit(view)),
  ["off", "solved"],
);

check(
  "the token is read off the form, and an absent one stays absent rather than becoming an empty string",
  [
    readCaptchaToken("XXXX.DUMMY.TOKEN.XXXX"),
    readCaptchaToken("  abc  "),
    readCaptchaToken(""),
    readCaptchaToken("   "),
    readCaptchaToken(undefined),
    readCaptchaToken(null),
    readCaptchaToken(["abc"]),
  ],
  ["XXXX.DUMMY.TOKEN.XXXX", "abc", undefined, undefined, undefined, undefined, undefined],
);

check(
  "the words cover all four states a visitor can be in, and none names a company",
  [
    Object.keys(TURNSTILE_WORDS).sort(),
    Object.values(TURNSTILE_WORDS).filter((words) =>
      /Supabase|Cloudflare|Turnstile|CAPTCHA/.test(words),
    ),
  ],
  [["failed", "noScript", "retry", "waiting"], []],
);
check(
  "and the no-JavaScript line says that signing in needs it, in the place the box would be",
  [
    TURNSTILE_WORDS.noScript.includes("JavaScript"),
    count(withoutComments(source.gate), "<noscript>"),
  ],
  [true, 1],
);

// ---- the three screens ---------------------------------------------------
console.log("\n3a. all three screens draw it, and the token travels with all three requests");

for (const [screen, key] of [
  ["sign in", "login"],
  ["sign up", "signup"],
  ["the reset request", "request"],
]) {
  check(
    `${screen} draws the gate, with the site key from the settings file`,
    [
      count(withoutComments(source[key]), "<CaptchaGate"),
      count(withoutComments(source[key]), "TURNSTILE_SITE_KEY"),
      // AND NO BARE SUBMIT BUTTON BESIDE IT. A screen that kept its old
      // ActButton as well would post without waiting for anything.
      count(withoutComments(source[key]), "<ActButton"),
    ],
    [1, 2, 0],
  );
}

check(
  "CONTROL -- the new-password screen is NOT one of the three, so these searches are specific",
  [
    count(withoutComments(source.newPassword), "<CaptchaGate"),
    count(withoutComments(source.newPassword), "<ActButton"),
  ],
  [0, 1],
);

const requestHelper = functionBody(source.actions, "askForResetEmail");

check(
  "all three calls to Supabase carry the token, and each in the shape that call takes",
  [
    count(withoutComments(signInAction ?? ""), "captchaToken: captchaToken(formData)"),
    count(withoutComments(signUpAction ?? ""), "captchaToken: captchaToken(formData)"),
    count(withoutComments(requestHelper ?? ""), "captchaToken: captchaToken(formData)"),
  ],
  [1, 1, 1],
);
check(
  "the field's name is spelled in ONE place, and the action reads it from there",
  [
    count(withoutComments(source.actions), "TURNSTILE_TOKEN_FIELD"),
    count(withoutComments(source.actions), '"cf-turnstile-response"'),
    count(withoutComments(source.turnstileModule), '"cf-turnstile-response"'),
  ],
  [2, 0, 1],
);
check(
  "nothing in the sign-in path holds the token in a variable of its own, so nothing can log it",
  [
    count(withoutComments(source.gate), "setToken"),
    count(withoutComments(source.gate), "console."),
    count(withoutComments(source.actions), "console."),
  ],
  [0, 0, 0],
);

// ---- the setting, and CI's placeholder -----------------------------------
console.log("\n3b. the site key: required where it matters, placeholder where it does not");

check(
  "the setting is read once, statically, from a NEXT_PUBLIC_ name so Next.js inlines it",
  [
    count(withoutComments(source.env), "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    count(withoutComments(source.env), "export const TURNSTILE_SITE_KEY"),
    // A dynamic lookup is NOT inlined by Next.js -- the version-matched docs say
    // so and web/src/lib/env.ts's header quotes them -- so the browser would get
    // `undefined` and the widget would quietly never appear.
    count(withoutComments(source.env), "process.env["),
  ],
  [1, 1, 0],
);
check(
  "a Production or Preview build with no site key is stopped, the same way the Sentry DSN is",
  [
    count(withoutComments(source.env), "requireTurnstileSiteKeyWhereItMatters()"),
    count(withoutComments(source.env), "requireSentryDsnWhereItMatters()"),
    count(withoutComments(source.env), "MUST_BE_SET_ON_VERCEL"),
  ],
  [2, 2, 3],
);
check(
  "and both checks use ONE list of environments, so they cannot be insisted on in different places",
  withoutComments(source.env).includes(
    'const MUST_BE_SET_ON_VERCEL: ReadonlyArray<string> = ["production", "preview"]',
  ),
  true,
);
check(
  "CI's build sets the name, with Cloudflare's published dummy sitekey as the value",
  count(source.ci, `NEXT_PUBLIC_TURNSTILE_SITE_KEY: "${TURNSTILE_DUMMY_SITE_KEY}"`),
  1,
);

// ---- the nine files that sign in -----------------------------------------
console.log("\n3c. the nine automated sign-ins: one constant, imported everywhere");

const SIGNING_IN = [
  "web/tests/staging.mjs",
  "scripts/staging/bob-invites-to-alices-team.mjs",
  "scripts/staging/build-it-14-checks.mjs",
  "scripts/staging/build-it-15-checks.mjs",
  "scripts/staging/build-it-16-checks.mjs",
  "scripts/staging/build-it-16-suspend-checks.mjs",
  "scripts/staging/build-it-18-invitation-status-checks.mjs",
  "scripts/staging/build-it-20-ai-checks.mjs",
  "scripts/staging/build-it-23-attachment-checks.mjs",
];

const signingIn = Object.fromEntries(
  SIGNING_IN.map((path) => [
    path,
    readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n"),
  ]),
);

check(
  "Cloudflare's dummy token, and the field it goes in",
  [DUMMY_CAPTCHA_TOKEN, CAPTCHA_BODY_FIELD, captchaBody()],
  [
    "XXXX.DUMMY.TOKEN.XXXX",
    "gotrue_meta_security",
    { gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" } },
  ],
);
check(
  "a fresh object each call, so no two callers can share and mutate one",
  captchaBody() !== captchaBody(),
  true,
);
check(
  "all nine import that one constant, and all nine call it",
  [
    SIGNING_IN.filter(
      (path) =>
        !/^import \{ captchaBody \} from "\.\.?\/(\.\.\/scripts\/)?lib\/captcha\.mjs";$/m.test(
          signingIn[path],
        ),
    ),
    SIGNING_IN.filter(
      (path) => count(withoutComments(signingIn[path]), "captchaBody()") !== 1,
    ),
  ],
  [[], []],
);
check(
  "AND NOT ONE OF THEM SPELLS THE TOKEN ITSELF -- decision J's whole point",
  SIGNING_IN.filter((path) =>
    withoutComments(signingIn[path]).includes(DUMMY_CAPTCHA_TOKEN),
  ),
  [],
);
check(
  "the token is spelled once in the whole repository, in the module that exports it",
  count(
    readFileSync(resolve(ROOT, "scripts", "lib", "captcha.mjs"), "utf8"),
    `"${DUMMY_CAPTCHA_TOKEN}"`,
  ),
  1,
);
check(
  "CONTROL -- the same search would find a ninth copy if somebody pasted one",
  withoutComments(
    'body: JSON.stringify({ email, password, gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" } })',
  ).includes(DUMMY_CAPTCHA_TOKEN),
  true,
);
check(
  "and every one of the nine still carries the field in the body it actually posts",
  SIGNING_IN.filter(
    (path) =>
      !/body: JSON\.stringify\(\{[\s\S]{0,200}?\.\.\.captchaBody\(\)/.test(
        signingIn[path],
      ),
  ),
  [],
);
// A NEW FILE DOES NOT RUN JUST BECAUSE IT EXISTS.
// .github/workflows/ci.yml names each staging script by path in its "Staging
// script self-tests" job, so a script nobody added to that list runs nowhere and
// cannot fail a pull request -- which is exactly what issue #167 found about
// build-it-18-invitation-status-checks.mjs and its 57 cases. The run LINE is
// counted rather than the path, because the path is also in two comments.
check(
  "the new staging script is named in the workflow's run list, and its count is there too",
  [
    count(source.ci, "run_and_count build-it-25-captcha-checks"),
    count(source.ci, 'EXPECTED_CAPTCHA_CASES: "31"'),
    count(source.ci, "run_and_count auth-screens-check"),
  ],
  [1, 1, 1],
);

// ------------------------------------------------------------------- the score
const total = passed + failures.length;
console.log(`\n${passed} of ${total} checks passed.`);

if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const name of failures) console.log(`  - ${name}`);
  console.log("");
  process.exit(1);
}

console.log("");
