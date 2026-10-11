// email-links.ts -- a link in an email that works in ANY browser, and that a
// scanner cannot use up before the person clicks it.
//
// Build it 25 part 1, issue #284. The owner's decision of 11 October 2026.
//
// ---------------------------------------------------------------------------
// THE TWO THINGS THAT WERE WRONG, both observed on production on 11 Oct 2026
// ---------------------------------------------------------------------------
//
// 1. A RESET LINK OPENED IN A DIFFERENT BROWSER DID NOT WORK. Supabase accepted
//    the link (303) and this app then showed "That link didn't work". The cause
//    is not a bug in either: `@supabase/ssr` asks for the reset with PKCE, so
//    `resetPasswordForEmail` sends a code challenge
//    (web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:4481-4500) and the
//    matching verifier is stored in a cookie IN THE BROWSER THAT ASKED. The
//    email's link comes back with an authorization code that only that browser
//    can exchange. The library says so itself, in the error it raises:
//    "This can happen if the auth flow was initiated in a different browser or
//    device" (web/node_modules/@supabase/auth-js/src/lib/errors.ts:260-272).
//
//    A volunteer who asks for a reset on their phone and opens their mail on a
//    laptop is the ordinary case, not the odd one.
//
// 2. THE OWNER'S MAIL PROVIDER FETCHED THE LINK BEFORE ANYBODY CLICKED IT. A
//    HEAD request, answered 405. Supabase names the problem on its own
//    documentation: "certain email providers may have spam detection or other
//    security features that prefetch URL links from incoming emails"
//    (https://supabase.com/docs/guides/auth/auth-email-templates, "Email
//    prefetching", read 2026-10-11). A prefetch that reaches a route which
//    SPENDS the token leaves the person with a link that is already used.
//
// ---------------------------------------------------------------------------
// THE APPROACH, WHICH IS SUPABASE'S OWN AND IS CITED RATHER THAN INVENTED
// ---------------------------------------------------------------------------
//
// For a server-rendered app, Supabase documents putting a TOKEN HASH in the
// email and pointing it at a page of your own. From
// https://supabase.com/docs/guides/auth/passwords (read 2026-10-11), the reset
// template it gives is:
//
//     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password">
//
// and the route it describes calls:
//
//     const { error } = await supabase.auth.verifyOtp({ type, token_hash })
//
// A token hash carries NO PKCE verifier, so it works in any browser and on any
// device. That is the whole of fix 1.
//
// And the same documentation names the second half, in the prefetching section
// cited above: its two remedies are to use the OTP token instead of the link,
// or to "create a custom link that redirects to a confirmation page where users
// click a button containing the actual confirmation link". This app takes the
// second: `/auth/confirm` is a PAGE, a GET draws a form and verifies NOTHING,
// and the token is spent only by the POST a button makes. So a scanner's GET or
// HEAD costs the person nothing.
//
// ---------------------------------------------------------------------------
// WHAT IS DIFFERENT FROM THE DOCUMENTED SHAPE, AND WHY
// ---------------------------------------------------------------------------
//
// THERE IS NO `next` PARAMETER. The documented route reads one and redirects to
// it. This app will not: a destination taken out of a link is a destination an
// attacker chooses, and issue #120 rule 2 already settled that both of
// /auth/reset's exits are fixed paths written in the code. Where each kind of
// link goes is decided by `destinationAfter` below and by nothing in the
// address bar.
//
// THE TYPE IS READ FROM THE LINK, which /auth/reset deliberately does not do,
// and the difference is worth being exact about rather than quietly reversing.
// That route's comment says: "`recovery` is written here, never taken from the
// link. With the type read from the address bar instead, this one route would
// verify every kind of email token Supabase issues ... and hand each of them
// the password form." Here the type IS read -- it has to be, because one page
// serves both emails, which is the documented shape -- and three things keep
// the original worry closed:
//
//   * only TWO words are accepted, from the fixed list below. Everything else,
//     including every other kind of token Supabase can issue, draws the dead
//     screen and sends nothing.
//   * the DESTINATION for each word is written here, so the type decides which
//     of two fixed paths and nothing else.
//   * the password form is still gated on the marker cookie AND a session
//     (web/src/lib/password-reset.ts, `mayChangePassword`), and the marker is
//     set only on the `recovery` path.
//
//     What is left, stated rather than left to be found: if Supabase were to
//     accept a SIGN-UP token under `type=recovery`, somebody holding that token
//     could reach the password form. It would be their own account's form --
//     a sign-up token confirms its own address and creates that person's
//     session -- and web/src/lib/password-reset.ts already says in as many
//     words that this form is not a security boundary, because "a signed-in
//     person can change their own password through Supabase directly whatever
//     this app does". So the exposure is not larger than holding the token
//     already is. WHETHER verifyOtp ACCEPTS A MISMATCHED TYPE AT ALL IS NOT
//     CONFIRMED: no page read says, and nobody has tried it. Issue #287 holds
//     it, with the one request against staging that settles it.
//
// ---------------------------------------------------------------------------
// LINKS SENT BEFORE THIS CHANGE KEEP WORKING
// ---------------------------------------------------------------------------
//
// Nothing about /auth/reset or /auth/callback is touched. Both still accept the
// `code=` shape the old templates produce, in the browser that asked for it. So
// a reset email or a confirmation sent minutes before the owner edits a
// template still works, and this file adds a second door rather than moving the
// first one.
//
// NO IMPORTS, so scripts/auth-screens-check.mjs can load this module with a
// plain `node` run.

// ------------------------------------------------------------- the two kinds
//
// The only two emails this app causes Supabase to send with a link in them.
// Written out as a list rather than inferred, because the list IS the guard:
// `readLinkType` accepts nothing else.
export const LINK_TYPES = ["recovery", "signup"] as const;

export type LinkType = (typeof LINK_TYPES)[number];

/**
 * The kind of link this is, or null.
 *
 * Null for everything this app did not send: a missing parameter, a repeated
 * one (which arrives as an array), `email_change`, `invite`, `magiclink`, and
 * anything somebody typed. A page draws the dead screen for null and the action
 * sends nothing, so an unexpected word costs a request to nobody.
 */
export function readLinkType(value: unknown): LinkType | null {
  if (typeof value !== "string") return null;

  const word = value.trim();
  return (LINK_TYPES as readonly string[]).includes(word)
    ? (word as LinkType)
    : null;
}

// ------------------------------------------------------------- the token hash
//
// WHAT THE SHAPE CHECK IS FOR, because it is not security: the token hash is a
// credential until it is spent, and nothing here can tell a real one from a
// made-up one. It is a cheap refusal, so a page reached with junk in the
// address bar draws the dead screen instead of sending a request -- the same
// reason `invite-member` checks a uuid's shape before any database call.
//
// Deliberately loose about the alphabet: Supabase's own pages do not say what a
// `{{ .TokenHash }}` is made of, so nothing here pretends to know. What it does
// insist on is that there is no whitespace and no angle bracket in it, and that
// it is not absurdly long -- the three things that would mean somebody is
// sending something other than a token.
const TOKEN_HASH_MAX = 500;
const TOKEN_HASH_SHAPE = /^[A-Za-z0-9._~\-+/=%]+$/;

export function readTokenHash(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text === "" || text.length > TOKEN_HASH_MAX) return null;

  return TOKEN_HASH_SHAPE.test(text) ? text : null;
}

// ------------------------------------------------------------ where each goes
//
// Two fixed paths, chosen by the kind of link and by nothing else.
//
// `recovery` goes to the password form, which draws itself only with the marker
// cookie the action sets. `signup` goes to My tasks, because verifying a
// sign-up token signs the person in -- which is what the confirmation was for.
export function destinationAfter(type: LinkType): string {
  return type === "recovery" ? "/reset-password" : "/tasks";
}

// ---------------------------------------------------------- what each one says
//
// The words on the confirm page, one set per kind of link, in one place. The
// heading says what the button will do; the lede says why there is a button at
// all, because a person who expected to be taken straight in deserves a reason
// for the extra press.
//
// NOTHING HERE NAMES THE LINK, the token, a company or a status, and nothing is
// taken from the address bar.
export const LINK_WORDS: Readonly<
  Record<LinkType, { heading: string; lede: string; button: string }>
> = {
  recovery: {
    heading: "Set a new password",
    lede:
      "Press the button to use this link. It works once, and it works in any browser.",
    button: "Use this link",
  },
  signup: {
    heading: "Confirm your email address",
    lede:
      "Press the button to use this link. It works once, and it works in any browser.",
    button: "Confirm my email address",
  },
};

// ----------------------------------------------------- what the page may draw
//
// TWO STATES AND NOTHING ELSE, the same shape as the new-password screen's
// `newPasswordView`: either there is a usable link to offer a button for, or
// there is not and the page says so. There is no state in which this page shows
// an address, a name, or anything about whether an account exists.
export function confirmView(state: {
  tokenHash: string | null;
  type: LinkType | null;
  refused: boolean;
}): "ask" | "dead" {
  if (state.refused) return "dead";
  if (state.tokenHash === null || state.type === null) return "dead";
  return "ask";
}

// --------------------------------------------------- the path, and the fields
//
// The page's own path, and the two hidden fields the form carries. One place,
// so the page, the action and the email templates below cannot drift.
export const CONFIRM_LINK_PATH = "/auth/confirm";
export const TOKEN_HASH_FIELD = "token_hash";
export const LINK_TYPE_FIELD = "type";

// ------------------------------------------- the two templates, word for word
//
// WHAT THE OWNER HAS TO PASTE, and the only copy of it in this repository.
//
// It is here rather than only in a document for one reason:
// scripts/auth-screens-check.mjs requires docs/rate-limits.md to contain both
// of these strings verbatim. So the instruction a person follows in a dashboard
// and the path this app actually serves are compared by a check on every pull
// request, instead of drifting the first time somebody renames a route.
//
// `{{ .SiteURL }}` is the Supabase project's own Site URL setting, so the
// link's HOST still comes only from a setting on the server and never from a
// request header -- which is issue #120 rule 4, and issue #284 asks for it
// again in those words.
//
// THE COST OF `{{ .SiteURL }}`, stated rather than discovered: a sign-up made
// on a Vercel Preview deploy gets a confirmation link pointing at the project's
// Site URL host rather than at the preview's own address. Today
// `confirmationRedirect()` in web/src/app/auth/actions.ts reads the request's
// origin so a preview confirms back to itself, and a template that names
// `{{ .SiteURL }}` does not use that value at all. `{{ .RedirectTo }}` would
// keep the preview behaviour and would produce a BROKEN link whenever no
// redirect was sent -- `SITE_URL` is optional (docs/environments.md) -- which
// is the worse failure of the two, on production of all places. So the robust
// shape is the one written here, and the preview consequence is a known cost --
// issue #286, which also names the two things nobody has established about
// `{{ .RedirectTo }}` that would change the answer.
export const RECOVERY_LINK_HREF =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery";

export const SIGNUP_LINK_HREF =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup";
