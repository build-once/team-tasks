#!/usr/bin/env node
// scripts/backup/check-fresh.mjs
//
// ASKS ONE QUESTION: is there a recent copy of production in the backup bucket?
// Nothing else. It lists the bucket, reads the newest object's date out of its
// NAME, and exits 1 if that date is more than 36 hours old -- or if there is no
// copy at all, which is the state this really exists for.
//
// `.github/workflows/backup-freshness.yml` runs it on a schedule. The judgement
// itself is `judgeCopyFreshness` in scripts/backup/lib.mjs, which is pure, so
// scripts/backup/proof.mjs can hand it an empty bucket, a three-day-old copy and
// the measured 29h 57m delay and require the right answer to each.
//
// ---------------------------------------------------------------------------
// WHY IT EXISTS: EVERY OTHER CONTROL WATCHES A RUN THAT FAILS
//
// Issue #264. The nightly copy goes red when it fails, GitHub emails, and a
// second job opens "Backup did not run". **A run that never STARTS trips none of
// them, because there is no run** -- and there are three documented ways to get
// no run:
//
//   * GitHub drops the queued job: "If the load is sufficiently high enough,
//     some queued jobs may be dropped."
//   * A quiet public repository: "In a public repository, scheduled workflows
//     are automatically disabled when no repository activity has occurred in 60
//     days." (Both:
//     https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows,
//     read 2026-10-11.)
//   * Somebody edits the cron, renames the file, changes the environment's
//     branch policy, or archives the repository.
//
// In every one of those the Actions tab shows no failures at all, which looks
// exactly like a backup that is working. This is the one thing in the design
// that goes by what is IN THE BUCKET rather than by what a run said.
//
// AND IT DOES NOT SOLVE ITSELF, which #264's fourth condition asks to be said
// here rather than discovered: this is a scheduled workflow in the same public
// repository, so the 60-day rule switches IT off too, and a bad enough GitHub
// day drops it as well. It catches a dropped backup; it cannot catch its own
// silence. The honest end of that chain is an alert from outside GitHub, and
// nothing here is one.
//
// ---------------------------------------------------------------------------
// WHAT IT HOLDS, AND THE ONE THING IT MUST NOT
//
// IT CANNOT OPEN A COPY. It is given the endpoint, the key and the secret for
// the backup bucket and **not BACKUP_PASSPHRASE** -- that is the point of it
// (#264: "the watcher should not be able to read a copy, only to see that one is
// there"). It never downloads an object either: a listing is all it needs, so
// the only bytes it ever sees are keys and sizes.
//
// It prints the newest object's KEY, which carries a date and nothing else. That
// is the same thing make-backup.mjs already prints, and it is consistent with
// what docs/backups.md says Cloudflare knows anyway: "the fact that this project
// exists, how big its data is, and when the job ran".
//
// Settings:
//   BACKUP_STORAGE_ENDPOINT   variable  https://<account id>.r2.cloudflarestorage.com
//   BACKUP_STORAGE_KEY        secret    reads the backup bucket
//   BACKUP_STORAGE_SECRET     secret    its other half
//   BACKUP_DEST_BUCKET        default team-tasks-backups
//   BACKUP_DEST_REGION        default auto
//   BACKUP_FRESH_HOURS        default 36 -- the owner's decision of 2026-10-11
//
// Exit codes:  0 = there is a copy inside the limit
//              1 = there is not, or the bucket could not be read. Both are
//                  worth waking somebody for: a watcher that cannot see the
//                  bucket is not a watcher that has seen a copy (rule 8).

import { judgeCopyFreshness, COPY_OVERDUE_AFTER_HOURS } from "./lib.mjs";
import { Store } from "./s3.mjs";

const say = (line) => console.log(line);
const problem = (line) => console.error(`::error::${line}`);

const setting = (name) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const REQUIRED = ["BACKUP_STORAGE_ENDPOINT", "BACKUP_STORAGE_KEY", "BACKUP_STORAGE_SECRET"];

async function main() {
  const missing = REQUIRED.filter((name) => !setting(name));
  if (missing.length) {
    problem(
      `These settings are missing or empty, so the backup bucket was not read and nothing was judged: ${missing.join(", ")}. ` +
        "Set them at Settings -> Environments -> supabase-production; docs/backups.md -> 'What the owner must set by hand' lists every one. " +
        "If this was a manual run from a branch other than main, that is the cause: the environment releases its secrets to main only. No value is printed.",
    );
    return 1;
  }

  // THE THRESHOLD IS READ AND CHECKED, not assumed: a variable somebody typed
  // "thirty-six" into must not quietly become zero and alarm every day.
  const hoursSetting = setting("BACKUP_FRESH_HOURS");
  const thresholdHours = hoursSetting === undefined ? COPY_OVERDUE_AFTER_HOURS : Number(hoursSetting);
  if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
    problem(`BACKUP_FRESH_HOURS is set to something that is not a positive number of hours, so nothing was judged. Unset it to use the default of ${COPY_OVERDUE_AFTER_HOURS}.`);
    return 1;
  }

  const bucket = setting("BACKUP_DEST_BUCKET") || "team-tasks-backups";
  const store = new Store({
    endpoint: setting("BACKUP_STORAGE_ENDPOINT"),
    region: setting("BACKUP_DEST_REGION") || "auto",
    bucket,
    accessKeyId: setting("BACKUP_STORAGE_KEY"),
    secretAccessKey: setting("BACKUP_STORAGE_SECRET"),
    label: "the backup bucket",
  });

  let keys;
  try {
    keys = (await store.list()).map((object) => object.key);
  } catch (error) {
    problem(
      `${error.message} So this says nothing about whether a copy exists -- it says the bucket could not be read, which is UNVERIFIED and not a pass (AGENTS.md rule 8). ` +
        "AccessDenied is the R2 token's scope; InvalidAccessKeyId is BACKUP_STORAGE_KEY or the account in the endpoint; SignatureDoesNotMatch is the secret; NoSuchBucket is BACKUP_DEST_BUCKET.",
    );
    return 1;
  }

  const verdict = judgeCopyFreshness({ keys, now: new Date(), thresholdHours });
  say(`The ${bucket} bucket holds ${keys.length} object(s), ${verdict.counted} of them named like a copy this job makes.`);
  if (verdict.newestKey) say(`Newest copy: ${verdict.newestKey}, taken ${verdict.newestAt.toISOString()}.`);
  if (verdict.ignored > 0) say(`${verdict.ignored} object(s) are not named like a copy and were not dated. They count for nothing here.`);

  if (!verdict.overdue) {
    say(`PASS  ${verdict.note}`);
    return 0;
  }
  problem(
    `NO RECENT COPY OF PRODUCTION. ${verdict.note} ` +
      "The attached files have no other backup at all (#248), so every night this stays true is a night they are uncovered. " +
      "Start at the Actions tab: a run that FAILED would have gone red and opened an issue, so no failed run means no run -- GitHub dropped it, the schedule was switched off after 60 quiet days, or something changed the workflow. " +
      "docs/backups.md -> 'Should anything notice when no copy has been made' is the whole of why this check exists.",
  );
  return 1;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  // Nothing of the error but its message, which from s3.mjs carries an
  // operation, a status and a code out of a fixed list. No stack: a stack can
  // quote what the code was holding.
  problem(`The freshness check did not finish: ${error && error.message ? error.message : "an error with no message"}. That is not a pass.`);
  code = 1;
}
// Set and let Node finish, rather than process.exit(), so nothing printed is
// lost on the way out -- the same reason the other two scripts here do it.
process.exitCode = code;
