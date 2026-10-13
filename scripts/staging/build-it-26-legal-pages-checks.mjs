#!/usr/bin/env node
// build-it-26-legal-pages-checks.mjs -- the one thing only a DEPLOYED build can
// answer about the privacy page and the terms: can a SIGNED-OUT visitor reach
// them, and do they carry the sentences they are supposed to carry?
//
// Build it 26, PR 1. Run BEFORE and AFTER, against two different addresses.
//
// ---------------------------------------------------------------------------
// WHY THIS NEEDS A DEPLOYED BUILD AT ALL
// ---------------------------------------------------------------------------
//
// `scripts/screen-state-check.mjs` section 11 holds everything about the WORDS:
// that they all live in one file, that the five forbidden sentences are absent,
// that every figure is interpolated, and that both paths are in PUBLIC_PATHS.
// It runs in CI on every pull request and it is the stronger half.
//
// What it CANNOT answer is whether the Proxy actually lets a signed-out visitor
// through. `PUBLIC_PATHS` is a list in a module; the thing that reads it runs in
// the Edge runtime on a request, and the failure it would hide is silent and
// total -- a privacy page that redirects to /login is a privacy page only people
// with an account can read, which is the exact opposite of what issue #204 asks
// for. One `GET` settles it, and nothing short of a deployed build can make it.
//
// ---------------------------------------------------------------------------
// THE BEFORE AND THE AFTER, AND THEY ARE BOTH PRODUCTION
// ---------------------------------------------------------------------------
//
// CORRECTED 2026-10-13, after the owner ran it and this script misreported what
// it found. The pair is:
//
//   BEFORE  production, before the merge. Expect: both paths redirect or 404.
//           That is what makes the AFTER mean something.
//   AFTER   production, AFTER THE MERGE. Expect: both answer 200, signed out,
//           carrying their headings and the phrases below.
//
// IT IS NOT A PREVIEW, AND THAT IS THE CORRECTION. The first version of this
// header said the AFTER was "this branch's Vercel PREVIEW address", and a
// preview cannot be read by a script at all -- see the section below.
//
// WHICH MEANS THE AFTER COMES AFTER THE MERGE, and there is no way round that:
// the only address a script can read is production's, and production does not
// serve this change until it is merged. The thing a preview CAN answer is a
// person opening it in a browser, which is the owner's third step and is the
// one this script never claimed.
//
// ---------------------------------------------------------------------------
// WHAT WENT WRONG ON 2026-10-13, AND WHY IT IS THIS SCRIPT'S FAULT
// ---------------------------------------------------------------------------
//
// The owner ran it against the Preview at `bdc9f83` and got FAIL on both paths,
// "redirected to /login", with bodies of 334009 and 334001 bytes -- and then
// opened both pages in a browser, SIGNED OUT OF THE APP, and both opened.
//
// Both facts were true and this script's conclusion was wrong. What it met was
// VERCEL'S DEPLOYMENT PROTECTION, not this app's `/login`:
//
//   "Deployment Protection lets you control who can access your preview and
//    production URLs."
//   "Standard Protection: Protects all deployments EXCEPT production domains"
//   "Deployment Protection requires authentication for all requests, INCLUDING
//    THOSE TO ROUTING MIDDLEWARE."
//
//   -- https://vercel.com/docs/deployment-protection, read 2026-10-13
//
// The third sentence is the one that settles it: the gate runs BEFORE this app's
// Proxy, so `PUBLIC_PATHS` was never evaluated and could not have been the
// cause. The second explains why production answered differently from a
// preview. And the owner's browser was signed in to Vercel, which is what
// "Vercel Authentication: Restricts access to only Vercel users with suitable
// access rights" admits.
//
// THE FAULT IN THIS FILE: `judge` compared the final PATH and ignored the HOST.
// Vercel's gate redirects to a path literally called `/login`, on `vercel.com`
// -- so the one string this script matched on was the one string the two cases
// have in common. The 334 KB body was a second signal it ignored: these two
// pages are a few kilobytes.
//
// SO IT NOW COMPARES THE HOST FIRST, and says which of the two it found.
//
// AND IT DOES NOT USE VERCEL'S BYPASS. Vercel documents "Protection Bypass for
// Automation" for exactly this, and it is a SECRET -- which would mean a secret
// on a command line, which this project's rules forbid outright. A script that
// cannot read a preview is the correct outcome rather than a limitation to work
// around.
//
// ---------------------------------------------------------------------------
// WHAT IT SENDS, CREATES AND SPENDS: NOTHING
// ---------------------------------------------------------------------------
//
// Two `GET` requests to two public pages, with NO cookie, NO session, NO key and
// NO account. It cannot sign anybody in, cannot write anything, and cannot spend
// a daily limit -- there is nothing on either page that costs anybody anything.
// It reads no secret and takes no setting from the environment.
//
// SO IT IS SAFE TO POINT AT PRODUCTION, and that is deliberate rather than
// careless: fetching a page this app serves to the public is not a production
// command and is not a dashboard. It is the same thing a visitor does. Nothing
// here is capable of changing production, and the script refuses any method but
// GET by never making one.
//
// WHAT IT NEVER PRINTS: the page's whole body. It prints a status, a length, and
// whether each expected phrase was found -- because a run log of this repository
// is public, and a document is long.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-26-legal-pages-checks.mjs --selftest
//   node scripts/staging/build-it-26-legal-pages-checks.mjs <base address>
//
// Both runs are against PRODUCTION, in Git Bash:
//
//   node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
//
// -- before the merge, where both paths are expected to FAIL, and again after
// it, where both are expected to PASS.
//
// NO SECRET IS EVER ON THE COMMAND LINE, because this script has no secret. The
// only argument is a public web address.

// ---------------------------------------------------------------------------
// What each page must carry
// ---------------------------------------------------------------------------
//
// A SHORT, DISTINCTIVE PHRASE RATHER THAN A WHOLE SENTENCE, so the owner can
// reword a paragraph without this script going red for the wrong reason. What it
// holds is that the SUBJECT reached the browser -- which is a different question
// from the wording, and the wording is section 11's job.
//
// Each phrase is one of the items issue #204 requires, or one the owner added
// afterwards. They are duplicated from nothing: section 11 checks the same
// subjects in the source, and this checks they survived the build and the
// request. A phrase that section 11 passes and this one fails means the page did
// not render what the module holds.
const PAGES = [
  {
    path: "/privacy",
    heading: "Privacy",
    phrases: [
      "dp@raj-dhonota.com",
      "can read the whole database",
      "title of that one task",
      "Nothing that says who asked",
      "West US (Oregon)",
      "about a fortnight",
      "asked to sign in again",
      "cf.turnstile.u",
      "no way to delete your account in this app",
      // THE FOUR THE COACH'S REVIEW OF PR #303 FIXED, checked on the rendered
      // page as well as in the source. Each replaced a sentence that stated
      // more than the code or a cited page supports, so each is worth proving
      // survived the build rather than only the check.
      "about a day and a quarter",
      "the last few counts stay until you come back",
      "removes the ones it can recognise",
      "is the company answerable for the data this app holds",
    ],
  },
  {
    path: "/terms",
    heading: "Terms",
    phrases: [
      "England and Wales",
      "not for anybody under 16",
      "do not keep a record of which version",
      "dp@raj-dhonota.com",
    ],
  },
];

// The SIX sentences docs/claims.md section 7 marks MUST NOT SAY. Checked on the
// rendered page as well as in the source, because the point of this pair is that
// a thing can be right in a module and wrong on a screen.
//
// THE SIXTH ARRIVED WITH THE COACH'S REVIEW OF PR #303: that any outside company
// "never receives" something. The Sentry sentence said it about five things, and
// docs/plan.md already records why it cannot be promised -- "A pattern scrub
// cannot recognise free text that no known phrase introduces".
const FORBIDDEN = [
  /does not store (your )?ip/i,
  /accepted version|you accepted (these )?terms on/i,
  /verif(y|ies|ied|ying) (your |their )?age/i,
  /reviewed by|prepared by|legal (advice|review)/i,
  /no cookies at all|we (use|set) no cookies/i,
  /never receives|never sees|never gets/i,
];

// AND THE PLACEHOLDER NOBODY MAY PUBLISH. `OPTIONAL_PRIVACY` in
// web/src/lib/legal.ts holds four paragraphs for the owner to accept or strike,
// one of which is a blank only the owner can fill in. None of them is rendered,
// and this is the half of that which a deployed page can prove.
const NEVER_RENDERED = ["[COMPANY NUMBER]", "[REGISTERED OFFICE ADDRESS]"];

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// IT IS A SEPARATE PURE FUNCTION SO THE SELFTEST CAN DRIVE THE REAL READING,
// which is the lesson evidence/build-it-16-suspend-functions.md records: a
// selftest that hands every judgement a hand-made object proves the judgement
// and not the reading. This one is handed a `{ status, body, redirected }` of
// exactly the shape the fetch below produces.

/**
 * Is this host one of Vercel's own, rather than the address we asked for?
 *
 * `vercel.com` and anything under it. Vercel's Deployment Protection redirects
 * there, and the only thing this function decides is WHICH SENTENCE the run
 * prints -- so an unknown host still fails, it just fails saying so.
 *
 * It is an exact match or a dot-suffix, never `includes`: a host ending
 * `notvercel.com` is not Vercel's, and `vercel.com.example.invalid` certainly
 * is not.
 */
export function isVercelHost(host) {
  if (typeof host !== "string") return false;
  const h = host.trim().toLowerCase();
  return h === "vercel.com" || h.endsWith(".vercel.com");
}

/**
 * What one page's answer means.
 *
 * @param page one entry of PAGES
 * @param answer { status, body, finalPath, finalHost } -- where the request
 *   ENDED UP, host and path, which is how Vercel's gate is told from this app's
 * @param expectedHost the host that was asked for
 */
export function judge(page, answer, expectedHost) {
  const notes = [];

  if (answer === null) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: ["the request did not arrive at all"],
    };
  }

  // THE HOST FIRST, AND THAT ORDERING IS THE WHOLE OF THE 2026-10-13 FIX.
  //
  // Vercel's Deployment Protection redirects to a path literally called
  // `/login`, on `vercel.com`. This app's Proxy redirects to `/login` on this
  // app's own host. Comparing the PATH alone -- which the first version of this
  // function did -- matches the one string the two cases have in common, and
  // reports a configuration fault in this repository for something that is a
  // setting in somebody else's dashboard.
  if (answer.finalHost !== expectedHost) {
    if (isVercelHost(answer.finalHost)) {
      return {
        verdict: "FAIL",
        reachable: false,
        notes: [
          `Vercel's protection: this address cannot be checked from a script;` +
            ` check production after merge or open it in a browser signed in to Vercel`,
          `(the request ended at ${answer.finalHost}${answer.finalPath}, which is Vercel's own` +
            ` sign-in and not this app's. Vercel's own page: "Deployment Protection requires` +
            ` authentication for all requests, including those to Routing Middleware" -- so this` +
            ` app's PUBLIC_PATHS was never reached and is NOT the cause)`,
        ],
      };
    }

    return {
      verdict: "FAIL",
      reachable: false,
      notes: [
        `redirected off this address, to ${answer.finalHost}${answer.finalPath}.` +
          ` That is not this app's doing -- something between the request and the app answered it`,
      ],
    };
  }

  // SAME HOST, DIFFERENT PATH: now a redirect to /login really is this app's,
  // and it has its own cause and its own one-line fix.
  if (answer.finalPath !== page.path) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: [
        `redirected to ${answer.finalPath} on this app's own host -- a signed-out visitor` +
          ` cannot read it. If that is /login, the path is missing from PUBLIC_PATHS in` +
          ` web/src/lib/supabase/proxy.ts`,
      ],
    };
  }

  if (answer.status !== 200) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: [`answered ${answer.status}, not 200`],
    };
  }

  const body = typeof answer.body === "string" ? answer.body : "";

  // The heading, which is what says the right page rendered rather than some
  // other 200.
  const hasHeading = body.includes(`<h1>${page.heading}</h1>`);
  if (!hasHeading) notes.push(`no <h1>${page.heading}</h1> in the page`);

  const missing = page.phrases.filter((phrase) => !body.includes(phrase));
  for (const phrase of missing) notes.push(`MISSING: ${phrase}`);

  // AND THE FIVE REFUSALS, on the rendered page.
  const said = FORBIDDEN.filter((pattern) => pattern.test(body)).map(
    (pattern) => String(pattern),
  );
  for (const pattern of said) notes.push(`FORBIDDEN SENTENCE MATCHED: ${pattern}`);

  const leaked = NEVER_RENDERED.filter((marker) => body.includes(marker));
  for (const marker of leaked) {
    notes.push(
      `AN UNFILLED PLACEHOLDER REACHED THE PAGE: ${marker}` +
        ` -- an OPTIONAL_PRIVACY paragraph has been accepted without being completed`,
    );
  }

  return {
    verdict:
      hasHeading && missing.length === 0 && said.length === 0 && leaked.length === 0
        ? "PASS"
        : "FAIL",
    reachable: true,
    notes,
  };
}

/**
 * Whether a base address is one this script will fetch.
 *
 * It accepts any https address and refuses anything else, including http: a
 * document served over http is a document somebody on the network can rewrite,
 * and there is no case in which this script should be reading one.
 */
export function usableBase(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return false;

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }

  return url.protocol === "https:";
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where each thing
// has gone wrong, requiring each one to come out FAIL
// ---------------------------------------------------------------------------

function selftest() {
  console.log(
    "build-it-26-legal-pages-checks --selftest: can these checks fail?\n",
  );

  const privacy = PAGES[0];

  // A body that passes everything, built from the page's own expectations so
  // this case cannot drift from them.
  const good =
    `<h1>${privacy.heading}</h1>` + privacy.phrases.map((p) => `<p>${p}</p>`).join("");

  // THE HOST THIS SCRIPT ASKED FOR, and the one every "ours" answer comes back
  // on. A made-up name on purpose: the cases are about the comparison, not about
  // any real deployment.
  const HOST = "team-tasks-example.invalid";

  // An answer from the host we asked, which is the ordinary case.
  const ours = (extra) => ({
    status: 200,
    body: good,
    finalPath: "/privacy",
    finalHost: HOST,
    ...extra,
  });

  const cases = [
    {
      name: "the happy answer PASSES, so the other cases mean something",
      got: judge(privacy, ours(), HOST),
      want: "PASS",
    },

    // ----------------------------------------------------------------- the two
    // THE TWO REDIRECTS, WHICH THE FIRST VERSION OF THIS SCRIPT COULD NOT TELL
    // APART, AND WHICH THE OWNER'S RUN OF 2026-10-13 PROVED IT COULD NOT.
    //
    // Both end at a path called `/login`. One is this app's Proxy and means a
    // path is missing from PUBLIC_PATHS. The other is Vercel's Deployment
    // Protection and means nothing about this repository at all. Each case below
    // requires BOTH that the verdict is FAIL and that the RIGHT SENTENCE came
    // out -- a FAIL with the wrong explanation is what happened on 13 October.
    {
      name: "VERCEL'S GATE: /login on vercel.com FAILS, and says this address cannot be checked from a script",
      got: judge(
        privacy,
        // BUILT FROM WHAT WAS ACTUALLY OBSERVED: the owner's run against the
        // Preview at bdc9f83 gave status 200, a body of 334009 bytes, and a
        // redirect to a path called /login. The body is filled to that length
        // because its SIZE was the second signal the first version ignored:
        // these two pages are a few kilobytes, and 334 KB is somebody else's
        // application.
        ours({
          body: "x".repeat(334009),
          finalPath: "/login",
          finalHost: "vercel.com",
        }),
        HOST,
      ),
      want: "FAIL",
      mustSay: "cannot be checked from a script",
      // NOT the bare word: the Vercel note NAMES PUBLIC_PATHS in order to rule it
      // out, and the first version of this assertion tripped on its own
      // exoneration. What must not appear is the sentence that BLAMES it.
      mustNotSay: "missing from PUBLIC_PATHS",
    },
    {
      name: "and the other one the owner saw, 334001 bytes on /terms, reads the same way",
      got: judge(
        PAGES[1],
        {
          status: 200,
          body: "x".repeat(334001),
          finalPath: "/login",
          finalHost: "vercel.com",
        },
        HOST,
      ),
      want: "FAIL",
      mustSay: "Vercel's protection",
      // NOT the bare word: the Vercel note NAMES PUBLIC_PATHS in order to rule it
      // out, and the first version of this assertion tripped on its own
      // exoneration. What must not appear is the sentence that BLAMES it.
      mustNotSay: "missing from PUBLIC_PATHS",
    },
    {
      name: "THIS APP'S PROXY: /login on OUR OWN host FAILS, and DOES point at PUBLIC_PATHS",
      got: judge(privacy, ours({ finalPath: "/login" }), HOST),
      want: "FAIL",
      mustSay: "missing from PUBLIC_PATHS",
      mustNotSay: "cannot be checked from a script",
    },
    {
      name: "a redirect to some third host FAILS, and blames neither",
      got: judge(
        privacy,
        ours({ finalPath: "/", finalHost: "proxy.example.invalid" }),
        HOST,
      ),
      want: "FAIL",
      mustSay: "redirected off this address",
      // NOT the bare word: the Vercel note NAMES PUBLIC_PATHS in order to rule it
      // out, and the first version of this assertion tripped on its own
      // exoneration. What must not appear is the sentence that BLAMES it.
      mustNotSay: "missing from PUBLIC_PATHS",
    },
    {
      name: "a host that merely ENDS with vercel.com is not Vercel's -- notvercel.com",
      got: { verdict: isVercelHost("notvercel.com") ? "PASS" : "FAIL" },
      want: "FAIL",
    },
    {
      name: "and a host that merely CONTAINS it is not either",
      got: { verdict: isVercelHost("vercel.com.example.invalid") ? "PASS" : "FAIL" },
      want: "FAIL",
    },
    {
      name: "vercel.com itself is",
      got: { verdict: isVercelHost("vercel.com") ? "PASS" : "FAIL" },
      want: "PASS",
    },
    {
      name: "and so is a subdomain of it",
      got: { verdict: isVercelHost("my-team.vercel.com") ? "PASS" : "FAIL" },
      want: "PASS",
    },
    {
      name: "a deployment address under vercel.APP is NOT Vercel's gate -- it is where this app lives",
      got: { verdict: isVercelHost("team-tasks-virid.vercel.app") ? "PASS" : "FAIL" },
      want: "FAIL",
    },

    // ------------------------------------------------- everything else answering
    {
      name: "a 404 FAILS",
      got: judge(privacy, ours({ status: 404, body: "" }), HOST),
      want: "FAIL",
    },
    {
      name: "a 200 with no heading FAILS -- some other page answered",
      got: judge(privacy, ours({ body: "<h1>Sign in</h1>" }), HOST),
      want: "FAIL",
    },
    {
      name: "a 200 missing ONE required phrase FAILS",
      got: judge(
        privacy,
        ours({ body: good.replace("cf.turnstile.u", "something else") }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "a page that says Sentry does not store an IP address FAILS",
      got: judge(
        privacy,
        ours({ body: `${good}<p>Sentry does not store your IP address.</p>` }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "a page that claims a legal review FAILS",
      got: judge(
        privacy,
        ours({ body: `${good}<p>This page was reviewed by a lawyer.</p>` }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "a page that claims an age check FAILS",
      got: judge(privacy, ours({ body: `${good}<p>We verify your age.</p>` }), HOST),
      want: "FAIL",
    },
    {
      name: "a page that claims a version record FAILS",
      got: judge(
        privacy,
        ours({ body: `${good}<p>Your accepted version is stored.</p>` }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "a page that says no cookies at all FAILS",
      got: judge(privacy, ours({ body: `${good}<p>We use no cookies at all.</p>` }), HOST),
      want: "FAIL",
    },
    {
      name: "a page that says Sentry NEVER RECEIVES something FAILS -- the sixth refusal",
      got: judge(
        privacy,
        ours({ body: `${good}<p>Sentry never receives your task text.</p>` }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "an unfilled [COMPANY NUMBER] placeholder on the page FAILS",
      got: judge(
        privacy,
        ours({ body: `${good}<p>Company number [COMPANY NUMBER].</p>` }),
        HOST,
      ),
      want: "FAIL",
    },
    {
      name: "a request that never arrived FAILS",
      got: judge(privacy, null, HOST),
      want: "FAIL",
    },
    { name: "http is refused", got: { verdict: usableBase("http://example.invalid") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "a word that is not an address is refused", got: { verdict: usableBase("preview") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "an empty argument is refused", got: { verdict: usableBase("") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "an https address is accepted", got: { verdict: usableBase("https://example.invalid") ? "PASS" : "FAIL" }, want: "PASS" },
  ];


  let wrong = 0;
  for (const c of cases) {
    // THE VERDICT IS NOT THE WHOLE OF IT ANY MORE, and that is the lesson of
    // 2026-10-13: the first version of this script got the VERDICT right -- FAIL
    // on both paths -- and the EXPLANATION wrong, which sent the owner looking
    // at PUBLIC_PATHS for something that was a setting in Vercel's dashboard. So
    // a case may also require a sentence to be present, or absent, and a case
    // with the right verdict and the wrong words is WRONG.
    const said = (c.got.notes ?? []).join(" ");

    const ok =
      c.got.verdict === c.want &&
      (c.mustSay === undefined || said.includes(c.mustSay)) &&
      (c.mustNotSay === undefined || !said.includes(c.mustNotSay));

    if (!ok) wrong += 1;
    console.log(`  ${ok ? "ok  " : "WRONG"}  ${c.name}`);

    if (!ok && c.got.verdict === c.want) {
      console.log(
        `          the verdict was right and the words were not.` +
          `${c.mustSay ? ` Wanted: "${c.mustSay}".` : ""}` +
          `${c.mustNotSay ? ` Must not have said: "${c.mustNotSay}".` : ""}`,
      );
    }
  }

  console.log(`\n${cases.length} logic cases, ${wrong} wrong.`);

  if (wrong > 0) {
    console.log(
      "\nFAIL the judgements do not behave as described, so a real run would mean nothing.\n",
    );
    process.exit(1);
  }

  console.log(
    `PASS every judgement can fail: ${cases.length} cases, including each of the six sentences docs/claims.md marks MUST NOT SAY, an unfilled placeholder reaching a page, and -- told apart by HOST and checked on the SENTENCE, not just the verdict -- Vercel's own gate against this app's own /login\n`,
  );
}

// ---------------------------------------------------------------------------
// A real run
// ---------------------------------------------------------------------------

async function fetchPage(base, path) {
  const url = new URL(path, base).toString();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html" },
    });

    const ended = new URL(response.url);

    return {
      status: response.status,
      body: await response.text(),
      finalPath: ended.pathname,
      // THE HOST, which the first version of this function did not return and
      // which is the one field that tells Vercel's gate from this app's Proxy.
      finalHost: ended.host,
    };
  } catch {
    return null;
  }
}

async function run(base) {
  // THE HOST WE ASKED FOR, which is what every answer is compared against.
  const expectedHost = new URL(base).host;

  console.log(`\nbuild-it-26-legal-pages-checks\n  address: ${base}\n`);
  console.log(
    "  Two GET requests, no cookie, no session, no key, no account.\n" +
      "  Nothing is created, sent or spent, and no page body is printed.\n" +
      "  A redirect off this host is reported as such -- Vercel's own protection\n" +
      "  is not this app's /login, and the two were confused once.\n",
  );

  let failures = 0;

  for (const page of PAGES) {
    const answer = await fetchPage(base, page.path);
    const result = judge(page, answer, expectedHost);

    const size = answer && typeof answer.body === "string" ? answer.body.length : 0;
    console.log(
      `${result.verdict}  ${page.path} -- status ${answer ? answer.status : "none"},` +
        ` ${size} bytes, ${page.phrases.length} phrase(s) expected`,
    );
    for (const note of result.notes) console.log(`        ${note}`);

    if (result.verdict !== "PASS") failures += 1;
  }

  console.log(
    `\n${PAGES.length - failures} of ${PAGES.length} page(s) passed.\n`,
  );

  if (failures > 0) {
    console.log(
      "WHICH FAIL IS THIS? There are three and they mean different things:\n\n" +
        "  * PRODUCTION BEFORE THE MERGE -- expected. That is the BEFORE.\n" +
        "  * PRODUCTION AFTER THE MERGE -- a real problem. Read the note above.\n" +
        "  * A PREVIEW address -- not a problem and not an answer: Vercel's\n" +
        "    Deployment Protection stops a script reading one at all, and the\n" +
        "    note above says so by name. Open it in a browser instead.\n",
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  selftest();
} else {
  const base = args[0];

  if (!usableBase(base)) {
    console.log(
      "\nbuild-it-26-legal-pages-checks needs one argument: the https address to read.\n\n" +
        "  node scripts/staging/build-it-26-legal-pages-checks.mjs --selftest\n" +
        "  node scripts/staging/build-it-26-legal-pages-checks.mjs https://<address>\n\n" +
        "RUN IT TWICE, BOTH TIMES AGAINST PRODUCTION: once BEFORE the merge\n" +
        "(expect both paths to redirect or 404 -- that is the BEFORE), and once\n" +
        "AFTER it (expect both to answer 200).\n\n" +
        "NOT A PREVIEW ADDRESS. Vercel's Deployment Protection covers every\n" +
        "deployment except production domains and runs before this app's own\n" +
        "code, so a script gets Vercel's sign-in page rather than the app. A\n" +
        "preview is for opening in a browser.\n\n" +
        "It sends two GET requests and nothing else. There is no secret to pass.\n",
    );
    process.exit(1);
  }

  await run(base.trim());
}
