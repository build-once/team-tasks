#!/usr/bin/env node
// password-reset-check.mjs -- the Forgot password screens, checked against the
// real files rather than against a copy of them.
//
// WHAT IT IS FOR. Build it 16 step 4 (issue #120) added three screens: ask for a
// reset link, land on the link, set a new password. Every rule the issue sets is
// a rule about what is said and where somebody is sent, and all of them are the
// kind that look obviously right and quietly stop being true after an edit:
//
//   rule 1  the request screen says the SAME WORDS whether or not the address
//           has an account, and whether Supabase answered happily or with an
//           error such as a rate limit. Two branches that happen to say the same
//           sentence today are not the same sentence.
//   rule 2  the reset code is never shown, never logged, and never travels into
//           a URL, a cookie or a redirect of ours.
//   rule 3  the new-password page shows nothing useful without a link Supabase
//           accepted, and its password rule is sign-up's rule.
//   rule 4  the address the email links back to comes from a setting -- never a
//           hard-coded localhost, preview or production address, and never a
//           request header.
//
// TWO KINDS OF CHECK, and the second kind is the point:
//
//   * the pure functions in web/src/lib/password-reset.ts are IMPORTED and
//     called. That file has no imports of its own and nothing but constants and
//     plain functions in it, so Node can read it with no bundler and no
//     packages, the same arrangement scripts/tasks-filter-check.mjs uses for
//     web/src/lib/tasks.ts.
//
//   * the SOURCE of the pages, the action and the route handler is read and
//     searched. A function that returns one outcome cannot stop rule 1 being
//     true; an `if` added to the action can, and no amount of testing the
//     function would notice. So the action is checked for a second exit, the
//     pages are checked for a second message, and web/src is checked for a
//     hard-coded address and for anything that logs.
//
// EVERY "FOUND NOTHING" CHECK HAS A CONTROL (AGENTS.md rule 8), because zero
// matches is also what a broken search looks like. The control is a string that
// does contain what is being looked for, run through the same code.
//
// NODE 22.6 OR NEWER, because Node strips the TypeScript types as it loads the
// module. On Node 24 (`node --version`) this needs no flag. On 22.x it needs
// `node --experimental-strip-types scripts/password-reset-check.mjs`.
//
// WHAT IT DOES NOT COVER, said plainly: it sends no email, signs nobody in, and
// opens no browser. It cannot tell you that a real reset link works -- that is
// the owner's test on localhost:3000 against staging, written out in the pull
// request and in evidence/build-it-16-password-reset.md. Nothing here touches
// Supabase, staging or production.
//
// ONE HARMLESS WARNING. Node prints MODULE_TYPELESS_PACKAGE_JSON when it loads
// the .ts file, because web/package.json has no "type" field. Do not add one to
// silence it: that file configures the Next.js build, and this script is not a
// reason to change it.
//
// It reads files, writes nothing and connects to nothing. Run it from anywhere:
//   node scripts/password-reset-check.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..", "web", "src");

const MODULE_PATH = resolve(WEB, "lib", "password-reset.ts");

const {
  DEAD_LINK_MESSAGE,
  NEW_PASSWORD_PATH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT,
  RESET_LANDING_PATH,
  RESET_MARKER_COOKIE,
  RESET_MARKER_MAX_AGE_SECONDS,
  RESET_REQUESTED_PATH,
  RESET_SENT_MESSAGE,
  mayChangePassword,
  newPasswordPath,
  newPasswordView,
  outcomeAfterRequest,
  passwordProblem,
  resetLandingPath,
  resetRedirectTo,
} = await import(pathToFileURL(MODULE_PATH).href);

// The files whose source is searched below. Named here so a check that reads one
// fails loudly if it is renamed, rather than quietly looking at nothing.
const FILES = {
  actions: resolve(WEB, "app", "auth", "actions.ts"),
  route: resolve(WEB, "app", "auth", "reset", "route.ts"),
  request: resolve(WEB, "app", "forgot-password", "page.tsx"),
  newPassword: resolve(WEB, "app", "reset-password", "page.tsx"),
  login: resolve(WEB, "app", "login", "page.tsx"),
  signup: resolve(WEB, "app", "signup", "page.tsx"),
  proxy: resolve(WEB, "lib", "supabase", "proxy.ts"),
  module: MODULE_PATH,
};

// LINE ENDINGS ARE NORMALISED TO LF BEFORE ANYTHING IS SEARCHED. This
// repository is worked on from Windows with core.autocrlf=true (see
// .gitattributes), so a file that has been through a checkout has CRLF and a
// file just written by hand has LF -- in the same folder, at the same time. Two
// of the checks below look for a brace at the start of a line, and without this
// they found it in one file and not the other. A check whose answer depends on
// which machine checked out the file is not a check.
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

// ---------------------------------------------------------------- the toolbox
//
// Comments are stripped before any search for a hard-coded address, because the
// comments in these files TALK about localhost and about preview addresses --
// explaining why none is hard-coded is most of why those comments exist. A
// search that counted them would be a search that can only fail.
//
// It is a simple stripper: line comments to end of line, block comments across
// lines. It does not understand a `//` inside a string literal, which is why it
// is checked against a fixture below before anything relies on it.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Every occurrence of a plain string, counted. Used both for "this must appear
// exactly once" and for "this must not appear at all".
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Does `first` appear before `second`, with both present? Used for the one
// question about the new-password action that counting cannot answer: a gate
// that runs AFTER the change is not a gate. Missing either side is false, not
// true, so a deleted check cannot pass this by vanishing.
function orderedBefore(text, first, second) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
}

// The body of one named function in a source file, from its `export ... name(`
// to the closing brace at column 0. Used to ask questions about ONE function --
// "how many exits does the request action have?" -- without the answer changing
// when a different function in the same file does.
//
// It relies on this repository's formatting: a top-level function's closing
// brace is the first `\n}` after it. If that ever stops being true the slice
// runs long, which makes the counts too high and the checks go red rather than
// green -- the safe direction.
function functionBody(text, name) {
  // Both spellings, because the actions are `export async function` and the
  // module's own helpers are `export function`. A name that matches neither
  // returns null, and every caller turns that into a failing check rather than
  // into an empty string that would quietly pass a "must not contain" test.
  const start = [
    text.indexOf(`export async function ${name}(`),
    text.indexOf(`export function ${name}(`),
  ].find((index) => index !== -1);

  if (start === undefined) return null;

  // The closing brace is the first `}` alone at the start of a line -- `\n}\n`
  // and not `\n}`, because a parameter type written across several lines closes
  // with `}): "form" | "dead" {` at column 0, and matching that would cut the
  // body off before it began. (It did: this check was written with `\n}` and the
  // "page asks the same function" case failed on a function whose body was not
  // in the slice.)
  const end = text.indexOf("\n}\n", start);
  if (end === -1) return null;

  return text.slice(start, end + 2);
}

console.log(`\nChecking ${MODULE_PATH}\n  and the files that use it\n`);

// ------------------------------------------------------- 1. the one sentence
//
// Rule 1, as the issue words it: "the page always says 'If that address has an
// account, we've sent a link', whether or not the address has an account. The
// same words, the same screen and the same behaviour in both cases, including
// when Supabase answers with an error such as a rate limit."
console.log("1. the one sentence, and the one outcome");

check(
  "the message is the exact sentence issue #120 rule 1 requires",
  RESET_SENT_MESSAGE,
  "If that address has an account, we've sent a link",
);

// The four worlds. Three of them are what Supabase can actually hand back, and
// the fourth is an answer of a shape nobody planned for.
//
// A KNOWN AND AN UNKNOWN ADDRESS ARE THE SAME ANSWER, which is not this app
// being careful -- it is Supabase's own guide: "When no user is associated with
// the address, Supabase Auth won't send an email, though the method still
// returns without an error" (https://supabase.com/docs/guides/auth/passwords).
// So they are written here as two separate worlds that happen to be identical,
// because the thing being checked is that the app treats them identically even
// when it CAN tell them apart -- which is exactly the case for the third.
const WORLDS = [
  ["a known address: Supabase sent a link", { data: {}, error: null }],
  ["an unknown address: Supabase sent nothing, and said so with no error", { data: {}, error: null }],
  [
    "AN ERROR FROM SUPABASE: the rate limit, which CAN be told apart",
    {
      data: null,
      error: {
        name: "AuthApiError",
        message: "For security purposes, you can only request this after 54 seconds.",
        status: 429,
        code: "over_email_send_rate_limit",
      },
    },
  ],
  ["an answer of a shape nobody expected", undefined],
];

const outcomes = WORLDS.map(([, answer]) => outcomeAfterRequest(answer));

for (const [index, [label]] of WORLDS.entries()) {
  check(`${label} -- same outcome`, outcomes[index], {
    path: RESET_REQUESTED_PATH,
    message: RESET_SENT_MESSAGE,
  });
}

check(
  "all four worlds give ONE outcome, counted as distinct values rather than compared by eye",
  new Set(outcomes.map((o) => JSON.stringify(o))).size,
  1,
);

check(
  "the outcome sends the person back to the same screen",
  RESET_REQUESTED_PATH,
  "/forgot-password?sent=1",
);

// ------------------------------ 2. the request action has exactly one exit
//
// The check above cannot fail if somebody adds a branch to the ACTION instead of
// to the function -- `if (error) redirect("/forgot-password?problem=1")` would
// break rule 1 and leave every check above green. So the action's own source is
// read.
console.log("\n2. the request action: one exit, no branch, nothing logged");

const requestAction = functionBody(source.actions, "requestPasswordReset");

check(
  "requestPasswordReset was found in web/src/app/auth/actions.ts",
  requestAction !== null,
  true,
);

check(
  "it has exactly one redirect",
  count(requestAction ?? "", "redirect("),
  1,
);
check(
  "it has no branch at all: no if, no ternary, no &&",
  [
    count(requestAction ?? "", "if ("),
    count(requestAction ?? "", " ? "),
    count(requestAction ?? "", " && "),
  ],
  [0, 0, 0],
);
check(
  "it never looks at an error",
  count(withoutComments(requestAction ?? ""), "error"),
  0,
);

// THE CONTROL for the three counts above. signIn, in the same file, read by the
// same code: it has two exits, a branch, and it does look at the error. If the
// searches above were broken, these would be zero too.
const signInAction = functionBody(source.actions, "signIn");
// Read here, used as a control in section 6b: a function in the same file that
// legitimately has no reset gate.
const signUpAction = functionBody(source.actions, "signUp");
check(
  "CONTROL -- signIn, in the same file, really does have two redirects, a branch and an error",
  [
    count(signInAction ?? "", "redirect("),
    count(signInAction ?? "", "if ("),
    count(withoutComments(signInAction ?? ""), "error"),
  ],
  [2, 1, 2],
);

// ---------------------------------- 3. the sentence exists in exactly one place
console.log("\n3. the sentence lives in one place, and the page prints it");

const PAGE_FILES = ["request", "newPassword", "login", "signup"];

check(
  "the sentence appears once in the whole of web/src, in the module that defines it",
  [...PAGE_FILES, "actions", "route", "module"].map((key) =>
    count(source[key], RESET_SENT_MESSAGE),
  ),
  [0, 0, 0, 0, 0, 0, 1],
);

check(
  "the request page prints the constant rather than a sentence of its own",
  count(withoutComments(source.request), "RESET_SENT_MESSAGE"),
  2, // the import, and the one place it is drawn
);

check(
  "the request page draws exactly one banner, so there is no second message to drift",
  count(source.request, "<Banner"),
  1,
);

check(
  "the request page never echoes the address back: no defaultValue, no value=, and the address is not in the redirect",
  [
    count(source.request, "defaultValue"),
    count(source.request, "value="),
    count(requestAction ?? "", "email="),
  ],
  [0, 0, 0],
);

// -------------------------------------------- 4. where the email links back to
console.log("\n4. where the email links back to: a setting, and nothing else");

check("no setting means no redirectTo at all", resetRedirectTo(undefined), undefined);
check("an empty setting is no setting", resetRedirectTo(""), undefined);
check("a setting of spaces is no setting", resetRedirectTo("   "), undefined);
check("not a string is no setting", resetRedirectTo(null), undefined);
check(
  "the owner's local test address, from the setting",
  resetRedirectTo("http://localhost:3000"),
  "http://localhost:3000/auth/reset",
);
check(
  "a trailing slash gives the same address, not a doubled one",
  resetRedirectTo("http://localhost:3000/"),
  "http://localhost:3000/auth/reset",
);
check(
  "several trailing slashes, as a dashboard field can collect",
  resetRedirectTo("https://example.com///"),
  "https://example.com/auth/reset",
);
check(
  "surrounding whitespace is trimmed",
  resetRedirectTo("  https://example.com  "),
  "https://example.com/auth/reset",
);
check(
  "the landing path is the fixed one, so every allow-list entry ends the same way",
  RESET_LANDING_PATH,
  "/auth/reset",
);

// NOTHING IS HARD-CODED. Rule 4's "never a hard-coded localhost, preview or
// production address" is a claim about the whole app, not about one function, so
// the whole of web/src is searched -- with comments stripped, because the
// comments discuss exactly these words.
console.log("\n   and nothing anywhere in web/src is a hard-coded address");

const HOSTISH = ["localhost", "vercel.app", ".supabase.co", "http://", "https://"];

const codeOnly = Object.fromEntries(
  Object.entries(source).map(([key, text]) => [key, withoutComments(text)]),
);

for (const needle of HOSTISH) {
  const hits = Object.entries(codeOnly)
    .filter(([, text]) => text.includes(needle))
    .map(([key]) => key);

  check(`no "${needle}" in the code of any of these files`, hits, []);
}

// THE CONTROL for the stripper and for the eight searches above: a fixture with
// one address in a comment and one in a string. Only the string may survive. If
// withoutComments ate everything, the searches above would pass no matter what
// the files said.
const FIXTURE = [
  "// a comment mentioning http://localhost:3000 and the preview on vercel.app",
  "/* a block comment about https://abc.supabase.co */",
  'const hardCoded = "http://localhost:3000/auth/reset";',
].join("\n");

const strippedFixture = withoutComments(FIXTURE);

check(
  "CONTROL -- the stripper removes both kinds of comment and keeps the code beside them",
  [
    strippedFixture.includes("a comment mentioning"),
    strippedFixture.includes("a block comment"),
    strippedFixture.includes("const hardCoded"),
  ],
  [false, false, true],
);
check(
  "CONTROL -- a hard-coded address in code is found by the same search",
  HOSTISH.filter((needle) => strippedFixture.includes(needle)),
  ["localhost", "http://"],
);

// The one place the setting is read, and the name it is read from. A name
// without the NEXT_PUBLIC_ prefix is never inlined into the browser bundle by
// Next.js, which is what keeps this setting server-side.
check(
  "the setting is read once, from a server-only name",
  [
    count(codeOnly.module, "process.env.SITE_URL"),
    count(codeOnly.module, "NEXT_PUBLIC_SITE_URL"),
    count(codeOnly.actions, "process.env"),
  ],
  [1, 0, 0],
);

// And it is not read from a header, unlike the sign-up confirmation in the same
// file. The control is that same confirmation, which does read headers.
check(
  "the reset action reads no request header",
  [
    count(requestAction ?? "", "headers()"),
    count(requestAction ?? "", "x-forwarded"),
    count(requestAction ?? "", "origin"),
  ],
  [0, 0, 0],
);
check(
  "CONTROL -- the sign-up confirmation in the same file really does read headers",
  [
    count(source.actions, "headerList.get"),
    count(source.actions, "x-forwarded-host"),
  ],
  [4, 1],
);

// ------------------------------------------- 5. the code goes nowhere of ours
console.log("\n5. the reset code: never printed, never logged, never carried");

check(
  "nothing under web/src logs anything at all",
  Object.entries(codeOnly)
    .filter(([, text]) => text.includes("console."))
    .map(([key]) => key),
  [],
);
check(
  "CONTROL -- the same search finds a console call when there is one",
  withoutComments('const x = 1;\nconsole.log("hello");').includes("console."),
  true,
);

// The route handler's two exits are both the fixed paths from resetLandingPath,
// so nothing taken from the link decides where anybody lands.
// Read as one flattened string rather than line by line, because the repository
// formats a long call across several lines -- so "the line with redirect( on it"
// does not contain the destination at all.
function redirectTargets(text) {
  return text
    .replace(/\s+/g, " ")
    .split("redirect(")
    .slice(1)
    .map((part) => part.trimStart().slice(0, 30));
}

const routeRedirects = redirectTargets(codeOnly.route);

check("the route handler has exactly one redirect", routeRedirects.length, 1);
check(
  "and it goes to a fixed path from resetLandingPath",
  routeRedirects.every((target) =>
    target.startsWith("new URL(resetLandingPath("),
  ),
  true,
);
check(
  "CONTROL -- a redirect to something built from the link is not mistaken for a fixed one",
  redirectTargets(
    "return NextResponse.redirect(\n  new URL(searchParams.get('next'), request.url),\n);",
  ).every((target) => target.startsWith("new URL(resetLandingPath(")),
  false,
);
check(
  "the two fixed paths, neither carrying anything from the link",
  [resetLandingPath(true), resetLandingPath(false)],
  ["/reset-password", "/reset-password?link=0"],
);
check(
  "both of them are the new-password page",
  [
    resetLandingPath(true).startsWith(NEW_PASSWORD_PATH),
    resetLandingPath(false).startsWith(NEW_PASSWORD_PATH),
  ],
  [true, true],
);

// Where the code is allowed to appear in the route handler, and where it is not.
// Reading it from the address bar and handing it to Supabase is the whole of its
// permitted life; a line that puts it into a template string, a URL, a cookie or
// a redirect is a line that would carry it somewhere it must not go.
const codeCarryingLines = codeOnly.route
  .split("\n")
  .filter((line) => /\bcode\b/.test(line))
  .filter(
    (line) =>
      line.includes("`") ||
      line.includes("URL(") ||
      line.includes("cookies.set") ||
      line.includes("redirect("),
  );

check(
  "no line puts the code into a template string, a URL, a cookie or a redirect",
  codeCarryingLines,
  [],
);
check(
  "CONTROL -- such a line is found when it exists",
  ['const back = `/reset-password?code=${code}`;']
    .filter((line) => /\bcode\b/.test(line))
    .filter((line) => line.includes("`")).length,
  1,
);

// The type of email token this route will verify is written in the file, never
// taken from the link. With it taken from the link, this one route would hand a
// sign-up or an email-change token the password form.
check(
  "the token type is written in the code, not read from the address bar",
  [
    count(codeOnly.route, 'type: "recovery"'),
    count(codeOnly.route, 'searchParams.get("type")'),
  ],
  [1, 0],
);

// -------------------------- 6. the new-password page, with and without a link
console.log("\n6. the new-password page: two states, and only one has a form");

check("a link Supabase accepted, and a session: the form", newPasswordView({ marked: true, signedIn: true, deadLink: false }), "form");
check("no marker, but signed in -- somebody who typed the address", newPasswordView({ marked: false, signedIn: true, deadLink: false }), "dead");
check("a marker but no session -- the session lapsed", newPasswordView({ marked: true, signedIn: false, deadLink: false }), "dead");
check("neither: a stranger opening the page", newPasswordView({ marked: false, signedIn: false, deadLink: false }), "dead");
check("?link=0 wins over everything else", newPasswordView({ marked: true, signedIn: true, deadLink: true }), "dead");

check(
  "the dead-link state says one sentence and draws no form and no password field",
  (() => {
    const start = source.newPassword.indexOf('if (view === "dead")');
    const end = source.newPassword.indexOf("\n  }", start);
    const deadBranch = source.newPassword.slice(start, end);
    return [
      start !== -1,
      deadBranch.includes("DEAD_LINK_MESSAGE"),
      deadBranch.includes("<form"),
      deadBranch.includes('name="password"'),
    ];
  })(),
  [true, true, false, false],
);

check(
  "the page draws exactly one form in total",
  count(source.newPassword, "<form"),
  1,
);

check(
  "the dead-link sentence gives no reason away: it names every cause at once",
  DEAD_LINK_MESSAGE,
  "That link has expired, has already been used, or was opened in a different browser. Ask for a new one.",
);

check(
  "the marker cookie is set by the route handler, and read by BOTH the page and the action",
  [
    count(codeOnly.route, "RESET_MARKER_COOKIE"),
    count(codeOnly.newPassword, "RESET_MARKER_COOKIE"),
    count(codeOnly.actions, "RESET_MARKER_COOKIE"),
  ],
  // route: import + set. page: import + read. action: import + read + three
  // deletes (the refused call, the lapsed session, and the successful change).
  //
  // THIS LINE USED TO SAY "read only by the page", with 3 for the action, and
  // that was the bug the coach's review of PR #124 found: the page read the
  // marker and the action did not. Section 9 below is the check that would now
  // fail if the action stopped reading it.
  [2, 2, 5],
);
check(
  "the marker is httpOnly, same-site and short-lived",
  [
    count(codeOnly.route, "httpOnly: true"),
    count(codeOnly.route, 'sameSite: "lax"'),
    RESET_MARKER_COOKIE,
    RESET_MARKER_MAX_AGE_SECONDS,
  ],
  [1, 1, "reset-link-used", 900],
);

// --------------------- 6b. the gate is on the server, not only on the page
//
// THE CHANGE THE COACH'S REVIEW OF PR #124 ASKED FOR. The page hid the form
// without the marker; `setNewPassword` accepted a post from any signed-in
// session and changed that account's password. A page that hides a form is not
// a check -- the decision belongs on the server -- and issue #120 rule 3 says
// opening the page without a valid reset link "changes nothing".
//
// So these checks are about the ACTION, and they are written to go red in the
// one way that matters: if the gate is removed, weakened to one of its two
// halves, or moved to after the change.
console.log("\n6b. the action refuses before it changes anything");

const setAction = functionBody(source.actions, "setNewPassword");

check(
  "setNewPassword was found in web/src/app/auth/actions.ts",
  setAction !== null,
  true,
);

// The decision itself, as a function: both halves required, and the same
// function the page asks.
check("marker and session: allowed", mayChangePassword({ marked: true, signedIn: true }), true);
check("a signed-in person who never followed a link: refused", mayChangePassword({ marked: false, signedIn: true }), false);
check("a marker with no session: refused", mayChangePassword({ marked: true, signedIn: false }), false);
check("neither: refused", mayChangePassword({ marked: false, signedIn: false }), false);

check(
  "the page asks the same function rather than repeating its test, so the two cannot drift",
  count(withoutComments(functionBody(source.module, "newPasswordView") ?? ""), "mayChangePassword("),
  1,
);

const gatedAction = withoutComments(setAction ?? "");

check(
  "the action READS the marker cookie, not merely deletes it",
  count(gatedAction, "get(RESET_MARKER_COOKIE)"),
  1,
);
check(
  "the action verifies the session itself, with getClaims rather than getSession",
  [count(gatedAction, "getClaims("), count(gatedAction, "getSession(")],
  [1, 0],
);
check(
  "the action asks mayChangePassword",
  count(gatedAction, "mayChangePassword("),
  1,
);
check(
  "A GATE THAT RUNS AFTER THE CHANGE IS NOT A GATE: mayChangePassword comes before updateUser",
  orderedBefore(gatedAction, "mayChangePassword(", "updateUser("),
  true,
);
check(
  "and before the password is even read, so a refused call learns nothing from which answer it got",
  orderedBefore(gatedAction, "mayChangePassword(", 'formData.get("password")'),
  true,
);
check(
  "a refused call takes the dead-link path",
  orderedBefore(gatedAction, "mayChangePassword(", 'newPasswordPath("stale")'),
  true,
);

// THE CONTROLS for the four ordering checks. The first is a fixture with the
// gate in the wrong place, which is the mistake those checks exist to catch; the
// second is a fixture with no gate at all, which is the state this section was
// written to refuse. Both must come out false -- if orderedBefore said true for
// either, every check above would be decoration.
check(
  "CONTROL -- a gate written AFTER the change is not mistaken for a gate",
  orderedBefore(
    'const { error } = await supabase.auth.updateUser({ password });\nif (!mayChangePassword(state)) redirect(newPasswordPath("stale"));',
    "mayChangePassword(",
    "updateUser(",
  ),
  false,
);
check(
  "CONTROL -- an action with no gate at all comes out false, not true",
  [
    orderedBefore(
      'const { error } = await supabase.auth.updateUser({ password });',
      "mayChangePassword(",
      "updateUser(",
    ),
    count('const { error } = await supabase.auth.updateUser({ password });', "mayChangePassword("),
  ],
  [false, 0],
);
check(
  "CONTROL -- signUp, in the same file, has no gate, so these searches are specific rather than everywhere",
  [
    count(withoutComments(signUpAction ?? ""), "mayChangePassword("),
    count(withoutComments(signUpAction ?? ""), "RESET_MARKER_COOKIE"),
  ],
  [0, 0],
);

// ---------------------------------- 7. the same password rule as sign-up
console.log("\n7. the password rule is sign-up's rule, from one constant");

check("the minimum", PASSWORD_MIN_LENGTH, 8);
check("one character short", passwordProblem("1234567"), PASSWORD_TOO_SHORT);
check("exactly the minimum is allowed", passwordProblem("12345678"), null);
check("longer is allowed", passwordProblem("a-whole-sentence-of-a-password"), null);
check("empty", passwordProblem(""), PASSWORD_TOO_SHORT);
check("missing altogether", passwordProblem(undefined), PASSWORD_TOO_SHORT);
check("not a string", passwordProblem(12345678), PASSWORD_TOO_SHORT);
check(
  "spaces count as characters, and nothing is trimmed: a password may begin and end with one",
  [passwordProblem("        "), passwordProblem(" abcdef ")],
  [null, null],
);
check(
  "the refusal says what to do and names no account",
  PASSWORD_TOO_SHORT,
  "A password needs at least 8 characters.",
);

check(
  "both forms take their minimum from the constant, and neither writes a number of its own",
  [
    count(source.signup, "minLength={PASSWORD_MIN_LENGTH}"),
    count(source.newPassword, "minLength={PASSWORD_MIN_LENGTH}"),
    count(source.signup, "minLength={8}"),
    count(source.newPassword, "minLength={8}"),
  ],
  [1, 1, 0, 0],
);

check(
  "where the new-password form goes next, for each of the three results",
  [newPasswordPath("done"), newPasswordPath("problem"), newPasswordPath("stale")],
  ["/tasks", "/reset-password?problem=1", "/reset-password?link=0"],
);

// ------------------------- 7b. sign-up enforces it too, on the SERVER (#197)
console.log("\n7b. sign-up refuses a short password on the server, not in the browser");

// WHAT THIS SECTION IS FOR. The number and the sentence were already shared (section
// 7 above), and the sign-up SCREEN has said "At least 8 characters" from the start.
// What was missing was anybody applying it: the only thing enforcing it at sign-up
// was `minLength={PASSWORD_MIN_LENGTH}` on the input, which is an attribute in a page
// and which a post made by hand skips entirely. docs/claims.md recorded that as NOT
// ENFORCED, and issue #197 is the owner's decision to make it true.
//
// SO THESE CHECKS ARE ABOUT THE ACTION, and they are written to go red if the guard
// is deleted, moved after the thing it guards, or quietly changed to a different
// message. Each one has its control, as everything else in this file does.
check(
  "the sign-up action is found, so the checks below are reading something",
  signUpAction !== null,
  true,
);

// THE GUARD IS THERE AT ALL. Counted rather than eyeballed, and over the body with
// comments stripped -- the comment beside the guard names `passwordProblem`, and a
// search that counted the comment would still pass with the code deleted.
check(
  "signUp asks passwordProblem, and redirects when it answers",
  [
    count(withoutComments(signUpAction ?? ""), "passwordProblem("),
    count(withoutComments(signUpAction ?? ""), "?problem=password"),
  ],
  [1, 1],
);

// AND IT IS AHEAD OF THE THING IT GUARDS. This is the check that cannot be done by
// counting: a refusal written after `supabase.auth.signUp` would let the account be
// created and then redirect, which is not a guard. Two orderings, because the client
// is created before the call and a password this app refuses should not reach either.
check(
  "the refusal comes BEFORE the account is created, and before the client is made",
  [
    orderedBefore(
      withoutComments(signUpAction ?? ""),
      "passwordProblem(",
      "auth.signUp(",
    ),
    orderedBefore(
      withoutComments(signUpAction ?? ""),
      "passwordProblem(",
      "createClient(",
    ),
  ],
  [true, true],
);

// THE SAME MESSAGE THE SCREEN SHOWS, which is the half of #197 that stops the two
// screens drifting. The page draws the constant rather than spelling a sentence, so
// the words on sign-up and on the reset screen cannot diverge; and it draws it for
// the code the action actually sends.
check(
  "the sign-up screen draws the shared constant for that code, and spells no sentence of its own",
  [
    // Comments stripped, for the reason the guard count above strips them: the
    // note beside the import names the constant, and a search that counted the
    // note would still pass with the import and the usage both gone.
    count(withoutComments(source.signup), "PASSWORD_TOO_SHORT"),
    count(source.signup, 'problem === "password"'),
    // The hint INTERPOLATES the number rather than spelling it -- the same
    // property section 7 checks for `minLength`. Written as the source writes it,
    // because "At least 8 characters" as a literal is absent on purpose and a
    // check looking for it would be a check that can only fail.
    count(source.signup, "At least {PASSWORD_MIN_LENGTH} characters"),
    count(source.signup, "A password needs at least"),
  ],
  // PASSWORD_TOO_SHORT twice: the import and the one place it is drawn. The
  // sentence itself is spelled nowhere -- it comes from the constant, which is
  // what keeps this screen and the reset screen saying one thing.
  [2, 1, 1, 0],
);

// CONTROL for the ordering checks: the same question asked of a fixture with the
// guard in the wrong place, and of one with no guard at all. Both must come out
// false, or the two orderings above are decoration.
check(
  "CONTROL -- a refusal written after the sign-up call is not mistaken for a guard",
  orderedBefore(
    'const { data, error } = await supabase.auth.signUp(c);\nif (passwordProblem(p)) redirect("/signup?problem=password");',
    "passwordProblem(",
    "auth.signUp(",
  ),
  false,
);
check(
  "CONTROL -- an action with no password guard counts nought, not one",
  count(
    'const { data, error } = await supabase.auth.signUp(credentials(formData));',
    "passwordProblem(",
  ),
  0,
);

// CONTROL for the whole section: signIn, in the same file, legitimately has no
// password rule -- it is not the place a password is chosen. If the searches above
// matched everywhere, this would not be nought.
check(
  "CONTROL -- signIn has no password rule, so these searches are specific rather than everywhere",
  [
    count(withoutComments(signInAction ?? ""), "passwordProblem("),
    count(withoutComments(signInAction ?? ""), "?problem=password"),
  ],
  [0, 0],
);

// AND THE RULE ITSELF IS THE SAME RULE, asked through the same function the action
// now calls. Not a new number, not a second copy: section 7 above proves what
// `passwordProblem` answers, and this says the sign-up path reaches that answer for
// the value a form actually carries -- including the missing-field case, which
// arrives as null rather than as a short string.
check(
  "the rule the action applies: seven characters refused, eight allowed, a missing field refused",
  [
    passwordProblem("1234567"),
    passwordProblem("12345678"),
    passwordProblem(null),
  ],
  [PASSWORD_TOO_SHORT, null, PASSWORD_TOO_SHORT],
);

// ------------------------------------------------- 8. the doors on the screens
console.log("\n8. which screens a signed-out person may open");

const publicPaths = (() => {
  const start = source.proxy.indexOf("const PUBLIC_PATHS = [");
  const end = source.proxy.indexOf("];", start);
  return source.proxy.slice(start, end);
})();

check(
  "the request screen and the new-password screen are both reachable while signed out",
  [
    publicPaths.includes('"/forgot-password"'),
    publicPaths.includes('"/reset-password"'),
    publicPaths.includes('"/auth"'),
  ],
  [true, true, true],
);
check(
  "CONTROL -- /tasks is NOT in that list, so the list means something",
  publicPaths.includes('"/tasks"'),
  false,
);

check(
  "the sign-in page offers the link, and it points at the request screen",
  count(source.login, 'href="/forgot-password"'),
  1,
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
