// sentry-user.ts -- the one thing about a person that goes into an error report.
//
// docs/plan.md, "What may be sent, and nothing else", ends its list with "the
// signed-in person's user ID -- the Supabase `auth.users` id, which is not an
// email address". This file is the only place in the app that puts it there,
// and it is a whole file for a two-line function so that there is exactly one
// place to read, and so that a search for `setUser` finds one hit.
//
// THE ID AND NOTHING ELSE. Sentry's own User type has fields for `email`,
// `username` and `ip_address`, and docs/plan.md forbids all three. Two separate
// things make sure none of them is filled in: `dataCollection.userInfo: false`
// stops the SDK populating them by itself (web/src/sentry/options.ts), and
// `scrubEvent` rebuilds `event.user` as `{ id }` and drops everything else
// (web/src/lib/sentry-scrub.ts, scrubUser), so even a mistake in this file
// could not send an address.
//
// WHY THE ID IS WORTH SENDING AT ALL, given that the plan's whole direction is
// to collect less: it answers the question the owner actually has when a report
// arrives -- is this one person or everyone? -- without an address. And it is
// what the owner searches by to delete somebody's reports, which is the only
// deletion route the plan has for them.
//
// IT IS SET ON THE ISOLATION SCOPE, which in Node is the scope belonging to one
// request: `Sentry.setUser` is `getIsolationScope().setUser(user)`
// (web/node_modules/@sentry/core/build/esm/exports.js, lines 41-43). So one
// request's id cannot leak into another request's report.
//
// UNVERIFIED -- whether the id actually arrives on an event. No DSN is set in
// any environment, so no report has ever been sent from this app, and nothing
// in this repository can look at a delivered event. What is verified is where
// the call goes and what it passes. Whether Next.js' `onRequestError` runs
// inside the same isolation scope as the page render that failed is a question
// only a real event answers.

import * as Sentry from "@sentry/nextjs";

/**
 * Tell Sentry who this request is for, by id.
 *
 * Call it with the `sub` claim from a VERIFIED token -- the value
 * `supabase.auth.getClaims()` returns, which is checked for a real signature,
 * and never the one out of `getSession()`, which trusts a cookie anybody can
 * write.
 *
 * Anything falsy clears the user rather than leaving the last one in place. A
 * stale id is worse than none: it would attach one person's identity to
 * another person's error.
 */
export function rememberUserForErrorReports(userId: string | null | undefined): void {
  Sentry.setUser(typeof userId === "string" && userId !== "" ? { id: userId } : null);
}
