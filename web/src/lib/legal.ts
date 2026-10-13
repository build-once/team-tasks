// legal.ts -- every sentence the privacy page and the terms say, in ONE place.
//
// Build it 26, PR 1. docs/plan.md, "The documents, your own data, and deleting an
// account", parts 1, 2 and 3.
//
// ---------------------------------------------------------------------------
// THESE WORDS ARE A DRAFT, AND MERGING IS WHAT MAKES THEM THE OWNER'S
// ---------------------------------------------------------------------------
//
// docs/plan.md has said since 7 October that writing these words is the owner's,
// "not least because they carry legal weight", and issue #204 says the same:
// "Writing the page's actual words is a content decision with legal weight, and
// it is the owner's. This issue is the requirement and the gate, not a draft."
//
// So what is below is a draft assembled from docs/claims.md section 7 -- one
// sentence per row, and NOT ONE sentence the register does not already have a
// verdict for. The owner's answer 5 of 2026-10-13 is that the owner reads both
// documents himself before launch, and that this is NOT A LEGAL REVIEW. Merging
// the pull request that adds this file is what turns the draft into the owner's
// own words; nothing else does.
//
// ---------------------------------------------------------------------------
// THE FIVE SENTENCES THAT MAY NEVER APPEAR HERE
// ---------------------------------------------------------------------------
//
// docs/claims.md section 7 marks these MUST NOT SAY -- permanently, not "yet".
// scripts/screen-state-check.mjs section 11 refuses each of them by pattern, so
// a later edit cannot slip one in:
//
//   1. that Sentry does not STORE an IP address. We do not SEND one -- that is
//      our code, in web/src/sentry/options.ts. What Sentry records is a
//      dashboard setting nobody here has seen. Answer 16.
//   2. that anybody accepted a particular version of these terms. No such
//      record is kept, on purpose. Answer 4.
//   3. that anybody's age is verified. Nothing asks and nothing holds one.
//      Answer 3.
//   4. that either document was reviewed by a lawyer, prepared by anybody, or
//      checked against any law. Answer 5.
//   5. that this app uses no cookies at all. True of a signed-out visitor and
//      false the moment they sign in. Answer 15.
//
// ---------------------------------------------------------------------------
// WHY EVERY NUMBER IS A CONSTANT AND NOT A LITERAL
// ---------------------------------------------------------------------------
//
// A policy that says "5 MB" as a literal is a policy that goes stale against the
// bucket. Every figure below is interpolated from the constant the app itself
// uses, so a limit cannot change in one place and stay wrong here -- the same
// discipline web/src/lib/attachments.ts already applies to the file sentences,
// and that scripts/screen-state-check.mjs already compares against the
// migration's SQL.
//
// The three figures that have no constant in `web/` are declared here with the
// file that holds the authority, and section 11 of that script reads those files
// as text and refuses a mismatch.
//
// ---------------------------------------------------------------------------
// NO SENTENCE LIVES IN A PAGE
// ---------------------------------------------------------------------------
//
// web/src/app/privacy/page.tsx and web/src/app/terms/page.tsx map over the
// arrays at the bottom of this file and render nothing of their own. That is the
// shape web/src/lib/turnstile.ts's TURNSTILE_WORDS already has, for the reason
// Build it 25 gives: four sentences drawn by one component "so they cannot drift
// into saying three things". Two long documents have far more room to drift.

import {
  LINK_SECONDS,
  MAX_FILE_WORDS,
  MAX_FILES_PER_TASK,
  PER_PERSON_WORDS,
} from "@/lib/attachments";
import { TITLE_MAX } from "@/lib/tasks";
import { INVITATION_DAYS, NAME_MAX } from "@/lib/teams";

// ---------------------------------------------------------------------------
// Who, where, and under what law
// ---------------------------------------------------------------------------

/**
 * The organisation answerable for all of this. The owner's answer 1, 13 Oct 2026.
 */
export const CONTROLLER = "DHTA Ltd";

/**
 * The one address every right in this plan is exercised through.
 *
 * Answer 1, 13 Oct 2026. TWO THINGS TRAVEL WITH IT and both are in the pages:
 * it is a PUBLIC address on a PUBLIC page, so it will be scraped and will
 * receive rubbish -- and it is the ONLY route for somebody who cannot sign in,
 * because answer 14 left the app with no form on purpose. So it is the one
 * address in this project that must not go unread.
 */
export const CONTACT_ADDRESS = "dp@raj-dhonota.com";

/** Answer 2, 13 Oct 2026. Both the governing law and the venue. */
export const GOVERNING_LAW = "England and Wales";

/**
 * Answer 3, 13 Oct 2026: 16, STATED and NOT CHECKED.
 *
 * The distinction has to survive into the wording. The terms say the app is not
 * for anybody younger; they do NOT say anybody's age is verified, because
 * nothing asks for an age and nothing holds one.
 */
export const MINIMUM_AGE = 16;

/**
 * When these words last changed.
 *
 * NOT a review date, and it must never be drawn as one (answer 5). Update it in
 * the same change as any edit to the two arrays below.
 */
export const LAST_UPDATED = "13 October 2026";

// ---------------------------------------------------------------------------
// The three figures with no constant in web/
// ---------------------------------------------------------------------------

/**
 * How long a daily usage count is kept.
 *
 * The authority is supabase/migrations/20261008115900_usage_counts.sql, whose
 * `count_daily_use` deletes `day <= l_today - 7`. There is no TypeScript
 * constant for it, because nothing in `web/` reads that table -- nothing CAN:
 * no role holds any privilege on it.
 */
export const USAGE_COUNT_DAYS = 7;

/**
 * How long a nightly copy of production is kept, and the slack on it.
 *
 * The authority is an R2 object lifecycle rule in Cloudflare, which nothing in
 * this repository can read. docs/backups.md records the number and the slack:
 * Cloudflare allows up to a day for a removal, so the real window is "up to
 * about fifteen days". The pages say "about a fortnight" rather than a figure
 * dressed as a promise.
 */
export const BACKUP_DAYS = 14;

/**
 * How long the email service keeps its sending log, on the free plan.
 *
 * Resend's own figure, as recorded in docs/plan.md's appendix. The pages
 * ATTRIBUTE it rather than asserting it (answer 5's second consequence).
 */
export const EMAIL_LOG_DAYS = 30;

// ---------------------------------------------------------------------------
// The shape the pages render
// ---------------------------------------------------------------------------

/** One heading and its paragraphs. The pages draw nothing else. */
export type LegalSection = {
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
};

export const PRIVACY_TITLE = "Privacy";
export const TERMS_TITLE = "Terms";

/**
 * The `<head>` for each page.
 *
 * HERE RATHER THAN IN THE PAGE, which looks like over-tidiness and is not: a
 * page's `description` is a sentence, it is shown to people in a search result
 * and in a link preview, and it is therefore a claim. Every other sentence in
 * these two documents lives in this file so that one reviewer can read the lot
 * in one place; leaving two in the page files would mean two sentences nobody
 * reviewing the wording would ever see. `scripts/screen-state-check.mjs`
 * section 11 refuses a sentence-shaped literal in either page, which is what
 * makes that true rather than intended.
 */
export const PRIVACY_META = {
  title: `${PRIVACY_TITLE} — Team Tasks`,
  description:
    "What Team Tasks holds about you, who else receives any of it, where it is held, how long it is kept, and what you can ask for.",
};

export const TERMS_META = {
  title: `${TERMS_TITLE} — Team Tasks`,
  description:
    "What Team Tasks is, who can use it, what you agree to, and what it does not promise.",
};

export const PRIVACY_INTRO =
  "This page says what Team Tasks holds about you, who else receives any of it, where it is held, how long it is kept, and what you can ask for. It is written to be read rather than to cover anybody, so where something is not known it says so.";

export const TERMS_INTRO =
  "Team Tasks is a small shared to-do list for a volunteer group. These terms say what it is, what it is not, and what you agree to by using it.";

// ---------------------------------------------------------------------------
// The privacy page
// ---------------------------------------------------------------------------
//
// Every paragraph below has a row in docs/claims.md section 7, with the file and
// line that keeps it. The six items issue #204 requires are in sections 3, 4, 6
// and 7; the three the owner added on 10 and 11 October -- where data is held,
// that copies remain for about a fortnight, and that a recovery signs everybody
// out -- are in sections 3 and 7.

export const PRIVACY: ReadonlyArray<LegalSection> = [
  {
    heading: "Who holds this data, and how to reach us",
    paragraphs: [
      `${CONTROLLER} is answerable for the data this app holds. Write to ${CONTACT_ADDRESS} about anything on this page.`,
      `That address is published here on purpose, and it is the only way to reach us. If you cannot sign in — a forgotten password, a suspended account, or an invitation to an address that never became an account — it is also how you ask for your data to be deleted.`,
      `One person runs this app, and that person can read the whole database, including everything listed below. There is no larger organisation behind it.`,
    ],
  },
  {
    heading: "What the app holds about you",
    paragraphs: [
      `Your email address and a one-way hash of your password, which is how you sign in. The hash cannot be turned back into your password.`,
      `A nickname, if you set one. We ask for a nickname rather than your name, and the app has no field for a real name, a phone number, an address or a date of birth.`,
      `Your tasks: what each one says, whether it is ticked, when it was made, and which of your teams it belongs to if any. Task text is free text of up to ${TITLE_MAX} characters and the app does not read it — so please do not put other people's personal details in it.`,
      `Your teams: their names, up to ${NAME_MAX} characters, and who belongs to which. A team name is visible to that team.`,
      `Invitations you send: the address you typed, when you sent it, whether the email went, and a short code if it did not. An invited address belongs to somebody who may have no account at all, which is why only the team's owner can see it and nobody else in the team can.`,
      `Files you attach to a task: up to ${MAX_FILES_PER_TASK} per task, ${MAX_FILE_WORDS} each, ${PER_PERSON_WORDS} in total per person. A photograph can carry the place and the moment it was taken, inside the file, and this app does not remove it — the upload box says so where you attach one.`,
      `Whether you have switched AI suggestions on, and when you last changed it.`,
      `A count of how many times you used each limited feature on each day. It is a number and a date: nothing about which task, which address or what time of day. Nobody can see it through the app, not even you.`,
      `If your account has been suspended, a row saying so, when, and optionally a short note from the owner about why. Nobody can see that through the app either.`,
      `Those last two are available by writing to ${CONTACT_ADDRESS}.`,
      `Supabase, which runs the database and the sign-in, also keeps a sign-in log that includes the address your requests come from, and Vercel, which serves the pages, keeps its own access log. Neither is something this app asked for and neither can be switched off. We add no logging of our own, and there is no analytics and no tracker anywhere in this app.`,
    ],
  },
  {
    heading: "Who else receives any of it, and where it is held",
    paragraphs: [
      `Supabase holds the database, the sign-in and the attached files. Production's database and files are in West US (Oregon).`,
      `Vercel serves the pages and sees each request, including the address it came from. Where Vercel holds that, we have not established, and we would rather say so than guess.`,
      `Resend sends this app's email: invitations, and — on this site — the sign-up confirmation and the password-reset email. So Resend sees the recipient's address and keeps a record of which addresses were sent what, for ${EMAIL_LOG_DAYS} days on its free plan. Where it holds that, we have not established.`,
      `Sentry receives a report when the app breaks: what went wrong, which page, which browser and operating system, and the identifier of whoever hit it. It never receives your email address, your task text, a team name, a file name or any sign-in token. We do not send your IP address to Sentry. Sentry's organisation data region is the United States. How long Sentry keeps a report we have not established.`,
      `Anthropic receives one thing, and only if you ask for it: if Suggest subtasks is available to you and you have switched AI suggestions on, pressing it sends the title of that one task, with fixed instructions written by this app. Nothing that says who asked goes with it — no address, no nickname, no identifier, no team name, and no other task. Anthropic publishes that it deletes inputs and outputs within 30 days of receipt or generation, with stated exceptions, and keeps up to 2 years — classification scores up to 7 years — for anything flagged as a usage policy violation. Where it holds a request we have not established.`,
      `Cloudflare receives something about every visitor to the sign-in, sign-up and password-reset screens, because the anti-robot check on those three screens is Cloudflare's. Cloudflare states that it processes "client IP address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin", that the purpose "is not to identify, profile or target any individuals but solely to detect and block bots", and that Turnstile "does not access, store, or transmit user communications, form entries, or other page inputs" — so the password typed into the box beside it is not part of this. How long Cloudflare keeps any of it, it does not publish, and we have not been able to find out.`,
      `Cloudflare also holds a nightly copy of everything above, in Western Europe. It is encrypted before it leaves the machine that makes it, so Cloudflare holds a file it cannot open.`,
      `Nothing else receives any of it. There is no advertising, no data sold or shared, and no tracker.`,
    ],
  },
  {
    heading: "How long each thing is kept",
    paragraphs: [
      `Your tasks, your teams, your nickname and your settings are kept until they or your account are deleted. Nothing is cleared out automatically.`,
      `An invitation's link stops working after ${INVITATION_DAYS} days. The row recording that you invited that address is not removed when the link expires — nothing in this app can delete an invitation today — so it is kept until the team or the account it belongs to goes.`,
      `A daily usage count is kept for ${USAGE_COUNT_DAYS} days and then removed.`,
      `A file is kept until it or its task is deleted. Deleting a task deletes its files, and the database refuses to delete a task while any file is still on it, so a file never outlives the task it was attached to.`,
      `A link to open a file lasts ${LINK_SECONDS / 60} minutes. For those ${LINK_SECONDS / 60} minutes anybody holding that link can open that file, whether or not they are signed in, so please do not paste one into a chat.`,
      `The nightly copies are removed after about a fortnight. Section "Backups" below says what that means for something you have deleted.`,
      `Resend's sending log, Sentry's reports and whatever Anthropic holds run on those companies' own clocks, quoted above where they publish one.`,
    ],
  },
  {
    heading: "Cookies, and what is stored on your device",
    paragraphs: [
      `We do not use cookies for analytics, advertising or tracking, and this app contains no tracker.`,
      `Signed out, on the sign-in screen, this app stores nothing on your device at all — no cookie, and nothing in your browser's storage.`,
      `When you sign in, a cookie keeps you signed in. While a password-reset link is being used there is a second, short-lived cookie that tells the new-password screen a link was just accepted. Both are needed for those things to work, and neither is used for anything else.`,
      `The anti-robot check stores one item in your browser, under the key cf.turnstile.u. It belongs to Cloudflare rather than to us, it sits in Cloudflare's own part of the page where this app cannot read it, and Cloudflare does not document what it is or how long it stays. We would rather name it and say that than leave it out.`,
      `There is no consent banner, because there is nothing here to consent to beyond the things that make signing in work.`,
    ],
  },
  {
    heading: "What you can ask for",
    paragraphs: [
      `You can change your tasks and your nickname yourself, and you can switch AI suggestions off at any time, which stops anything more being sent immediately.`,
      `There is no way to delete your account in this app yet. Write to ${CONTACT_ADDRESS} from the address on the account and we will delete it. Asking from that address is how we know it is you — without that, anybody who knew your address could have your account destroyed.`,
      `Changing the email address on an account is also done by hand. Write to the same place.`,
      `To ask what is held about you, or for the two things above that nobody can see through the app, write to ${CONTACT_ADDRESS}.`,
      `Error reports about you can be deleted at Sentry on request, and the only time that is possible is before the account goes — afterwards the identifier in them is the only thing left to search by. So ask for both in the same message.`,
    ],
  },
  {
    heading: "What cannot be undone",
    paragraphs: [
      `Switching AI suggestions off stops anything more being sent. It does not recall what was already sent, and it cannot. What Anthropic holds runs on the clock quoted above.`,
      `What has already gone to Anthropic also cannot be found, let alone removed on request, because nothing identifying you was sent with it. That is the price of sending nothing about who asked, and it is the right way round.`,
      `Resend's record of which addresses were sent what is that company's, and goes on its own ${EMAIL_LOG_DAYS}-day clock.`,
      `The sign-in log and the hosting access log are written by Supabase and Vercel whether we want them or not, and nothing we do removes a line from either.`,
    ],
  },
  {
    heading: "Backups, and what “deleted” means",
    paragraphs: [
      `Every night an encrypted copy of the whole database and every attached file is made and kept by Cloudflare for about a fortnight. It exists because the one thing in this app nobody can retype is a photograph of a job that has since been done.`,
      `So when something is deleted it is gone from the app at once, and gone from the copies when the last copy made before the deletion expires — up to about a fortnight later. A backup that honoured deletions would have honoured the wrong one too, which is the whole reason it exists.`,
      `If this app ever has to be rebuilt from one of those copies, nothing anybody typed is lost, and everybody will be asked to sign in again.`,
    ],
  },
  {
    heading: "Changes to this page",
    paragraphs: [
      `These words last changed on ${LAST_UPDATED}. If what the app does changes, this page changes with it, and the date above changes too.`,
    ],
  },
];

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

export const TERMS: ReadonlyArray<LegalSection> = [
  {
    heading: "What Team Tasks is",
    paragraphs: [
      `A small shared to-do list, run by ${CONTROLLER} for a volunteer group. You can make tasks, tick them off, make teams of up to a few people, and invite others by email.`,
      `It is free, and there is nothing to pay for.`,
    ],
  },
  {
    heading: "Who can use it",
    paragraphs: [
      `This app is not for anybody under ${MINIMUM_AGE}. Nothing here asks your age, so by using it you are confirming that.`,
      `You need an email address you can receive mail at, because signing up and resetting a password both send you a link.`,
    ],
  },
  {
    heading: "What you agree to",
    paragraphs: [
      `What you type is yours and you are responsible for it. Please do not put other people's personal details into a task, a team name or a nickname — the app does not read what you type, so nothing stops you, and the people in your team can see it.`,
      `A file you attach can be opened by everybody who can see the task it is on. Please do not attach anything you would not show them.`,
      `Do not use this app to send bulk email, to upload anything you do not have the right to, or to try to reach other people's data.`,
    ],
  },
  {
    heading: "What we do not promise",
    paragraphs: [
      `We do not promise that the app will be available, that it will keep working, or that anybody will answer a message quickly. One person runs it.`,
      `We do not promise to keep your data for any length of time, and you should not use this app as the only place something important is written down.`,
      `We do not keep a record of which version of these terms you agreed to, or when. If this page changes, there is nothing in the app that would say which version you saw.`,
    ],
  },
  {
    heading: "Suspending an account",
    paragraphs: [
      `The owner can stop an account from reading or changing anything, without deleting it or its work. It is there for two cases: somebody putting other people's personal details into task text, and an account that has been taken over.`,
      `Nobody is emailed when this happens, and a suspended account sees an app with nothing in it. If that happens to you, write to ${CONTACT_ADDRESS}.`,
      `A suspended account cannot delete itself, which is why that address is the route.`,
    ],
  },
  {
    heading: "Your data",
    paragraphs: [
      `The Privacy page says what is held, who else receives it, where it is held and for how long. It is part of these terms.`,
    ],
  },
  {
    heading: "The law these terms are read under",
    paragraphs: [
      `${GOVERNING_LAW}, and any dispute is heard there.`,
    ],
  },
  {
    heading: "Changes to these terms",
    paragraphs: [
      `These words last changed on ${LAST_UPDATED}. If they change, this page changes and the date above changes with it. There is no notification.`,
    ],
  },
];
