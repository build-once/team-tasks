#!/bin/sh
# scripts/backup/install-pg17.sh
#
# Installs the PostgreSQL 17 client programs on a GitHub Actions runner, from
# the PostgreSQL project's own apt repository, with the repository's signing key
# verified before it is trusted -- and then CHECKS that what landed really is
# major version 17 before saying it worked.
#
# Usage:
#   sh scripts/backup/install-pg17.sh                 the client only
#   sh scripts/backup/install-pg17.sh --with-server   client and server, for the CI proof
#
# It writes BACKUP_PG_DUMP and BACKUP_PSQL to $GITHUB_ENV when that is set, so
# the scripts in this folder use the client it installed and not the runner's
# own. Both workflows call this one file, so the key, the fingerprint and the
# major version cannot drift between the nightly job and the job that proves it.
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS AT ALL
#
# The ubuntu-24.04 image carries PostgreSQL 16.15, and **production is
# PostgreSQL 17.6** -- read through the production read-only connector by the
# coach on 10 October 2026 (evidence/production-log.md). `pg_dump` refuses to
# dump a server newer than itself, so the nightly copy with a 16 client would
# stop at its own version check every night and copy nothing. Issue #262.
#
# THE OWNER APPROVED INSTALLING A CLIENT (AGENTS.md rule 17) and left the way
# of doing it to be proposed. This is the proposal, and the reasoning is below
# rather than in a pull request comment, because the next person to read this
# file is the one who needs it.
#
# ---------------------------------------------------------------------------
# WHY THE APT REPOSITORY, AND NOT A PINNED CONTAINER IMAGE
#
# The two candidates were this and the official `postgres:17` image pinned by
# digest. This one wins on four counts, and the fourth is the one that decided
# it:
#
#   1. IT IS THE POSTGRESQL PROJECT'S OWN PACKAGING. apt.postgresql.org is
#      maintained by the people who release PostgreSQL, and the runner's own
#      16.15 came from it ("16.15-1.pgdg24.04+2"). The Docker image is a
#      different set of maintainers one step further from the source.
#   2. EVERY PACKAGE IS SIGNED, AND APT REFUSES AN UNSIGNED OR WRONGLY SIGNED
#      ONE. That is a stronger guarantee than "these bytes match a hash I wrote
#      down", because it keeps holding for versions nobody has written down yet.
#   3. SECURITY FIXES ARRIVE. A digest-pinned image needs a person to bump it,
#      and nobody will. A pinned digest is a snapshot of a day's known bugs.
#   4. IT KEEPS DOCKER OUT OF THE BACKUP PATH. The nightly job briefly holds
#      production's whole database in plaintext on a runner; the fewer moving
#      parts between the dump and the encryption the better. With a container
#      the dump has to cross a volume mount, which is one more place for a
#      plaintext file to be left behind.
#
# WHAT "PINNED" MEANS HERE, EXACTLY, because it does not mean byte-exact:
#
#   * THE KEY IS PINNED TWO WAYS -- by the SHA-256 of the file as served on
#     2026-10-10, and by its 40-character fingerprint. The fingerprint is the
#     key's real identity; the hash is the belt to that brace.
#   * THE MAJOR VERSION IS PINNED, in the package name itself
#     (`postgresql-client-17`) and again by the check at the end, which fails
#     unless `pg_dump --version` says 17.
#   * THE PATCH VERSION IS NOT PINNED, on purpose. `=17.6-1.pgdg24.04+1` would
#     be byte-exact and would STOP THE NIGHTLY BACKUP the day that version left
#     the pool, which is a worse failure than a client moving from 17.6 to
#     17.7. A client is not the thing whose behaviour this project depends on;
#     the server is, and the server is not ours.
#
# WHAT THAT TRADE COSTS, said rather than left to be noticed: a compromise of
# apt.postgresql.org or of the signing key would reach this job. So would a
# compromise of a container registry. The thing that would NOT reach it is a
# compromise of a third-party GitHub Action, which is why there is no
# `uses:` here at all.
#
# AND THE ONE WAY THIS CAN FAIL FOR A HARMLESS REASON: if the key file is
# re-armoured upstream -- new signatures appended, say -- its SHA-256 changes
# while the fingerprint stays the same. Then this script stops, and the message
# says exactly that: check the fingerprint, and if it matches, the key is the
# same key and the hash below is what to update. A backup job that stopped
# without saying why would be worse than either.

set -eu

EXPECTED_MAJOR=17

# Read in this session on 2026-10-10, not remembered:
#   curl -sSfL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sha256sum
#   gpg --show-keys --with-colons ACCC4CF8.asc   -> fpr, and uid "PostgreSQL Debian Repository"
#
# THE THREE NAMES BELOW DELIBERATELY AVOID THE WORD "KEY", and that is not
# squeamishness: `KEY_SHA256="0144…"` is a 64-character hex string beside the
# word key, which is precisely what gitleaks' generic-api-key rule is for, and
# it refused this commit. Neither value is a secret -- one is the checksum of a
# PUBLIC file and the other is a PUBLIC fingerprint, both printable and both
# printed below -- so the right fix is a name that does not look like a
# credential, not a hash chopped into pieces to get it past the scan. Do not
# rename these back.
PGDG_ASC_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
PGDG_ASC_SHA256="0144068502a1eddd2a0280ede10ef607d1ec592ce819940991203941564e8e76"
PGDG_FINGERPRINT="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"

WITH_SERVER="no"
if [ "${1:-}" = "--with-server" ]; then WITH_SERVER="yes"; fi

work="${RUNNER_TEMP:-/tmp}"
key="$work/pgdg-ACCC4CF8.asc"

echo "Installing the PostgreSQL $EXPECTED_MAJOR client from the PostgreSQL project's own repository."

# --- 1. the key, verified twice before it is trusted ------------------------
curl -sSfL -o "$key" "$PGDG_ASC_URL"

if ! echo "$PGDG_ASC_SHA256  $key" | sha256sum --check --strict; then
  echo "::error::The PostgreSQL repository signing key does not match the SHA-256 pinned in scripts/backup/install-pg17.sh, so NOTHING was installed and no copy was made. Compare its fingerprint with $PGDG_FINGERPRINT by hand ('gpg --show-keys'): if the fingerprint matches, it is the same key re-armoured upstream, and the hash in that script is what to update. If the FINGERPRINT differs, do not install it and tell the owner."
  exit 1
fi

# The fingerprint is the key's identity; the hash above is only the identity of
# one file containing it. Checked with gpg's machine-readable output rather
# than by reading a human-formatted block.
found_fpr="$(gpg --show-keys --with-colons "$key" | awk -F: '$1 == "fpr" { print $10; exit }')"
if [ "$found_fpr" != "$PGDG_FINGERPRINT" ]; then
  echo "::error::The PostgreSQL repository signing key's fingerprint is not the one pinned in scripts/backup/install-pg17.sh. NOTHING was installed. Expected $PGDG_FINGERPRINT. This is the check that matters: do not work around it, and tell the owner."
  exit 1
fi
echo "The signing key matches both the pinned SHA-256 and the pinned fingerprint $PGDG_FINGERPRINT."

# --- 2. the repository ------------------------------------------------------
# Any apt source already naming apt.postgresql.org is removed first. Two
# sources for one repository with different signed-by settings makes `apt-get
# update` fail with "Conflicting values set for option Signed-By", and the
# runner image's own PostgreSQL came from this repository -- so the file may or
# may not be there, depending on the image. Removing it is safe: the runner is
# destroyed when the job ends, and this script then writes the only source for
# it, with the key it has just verified.
for existing in /etc/apt/sources.list.d/*; do
  [ -f "$existing" ] || continue
  if grep -q "apt.postgresql.org" "$existing" 2>/dev/null; then
    echo "Removing an existing apt source for apt.postgresql.org: $(basename "$existing")"
    sudo rm -f "$existing"
  fi
done

codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
sudo install -d -m 0755 /etc/apt/keyrings
sudo install -m 0644 "$key" /etc/apt/keyrings/pgdg.asc
echo "deb [signed-by=/etc/apt/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list > /dev/null
echo "Added the ${codename}-pgdg repository, signed by that key and no other."

# --- 3. the packages --------------------------------------------------------
sudo apt-get update -qq
if [ "$WITH_SERVER" = "yes" ]; then
  # The server as well, for the CI proof: it must run against a version 17
  # server, or it is not proving what the nightly job does. Installing the
  # server package also creates and starts a cluster, on the next free port.
  sudo apt-get install -y -qq --no-install-recommends "postgresql-$EXPECTED_MAJOR" "postgresql-client-$EXPECTED_MAJOR"
else
  sudo apt-get install -y -qq --no-install-recommends "postgresql-client-$EXPECTED_MAJOR"
fi

# --- 4. and then CHECK, because "it installed" is not "it is 17" ------------
bin="/usr/lib/postgresql/$EXPECTED_MAJOR/bin"
if [ ! -x "$bin/pg_dump" ] || [ ! -x "$bin/psql" ]; then
  echo "::error::The install reported success and $bin/pg_dump is not there, so NOTHING was copied. Treat this as a failure, not a pass (AGENTS.md rule 8)."
  exit 1
fi

dump_version="$("$bin/pg_dump" --version)"
psql_version="$("$bin/psql" --version)"
echo "$dump_version"
echo "$psql_version"
case "$dump_version" in
  *"PostgreSQL) $EXPECTED_MAJOR."*) : ;;
  *)
    echo "::error::pg_dump at $bin is not major version $EXPECTED_MAJOR, so NOTHING was copied. It said: $dump_version. Production is PostgreSQL 17.6 and pg_dump refuses a newer server, so a 16 client here would copy nothing every night (#262)."
    exit 1
    ;;
esac

# The scripts in this folder read these two names, so the client just installed
# is the one they use -- not whichever pg_dump happens to be first on PATH,
# which on this image is the 16 one.
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "BACKUP_PG_DUMP=$bin/pg_dump" >> "$GITHUB_ENV"
  echo "BACKUP_PSQL=$bin/psql" >> "$GITHUB_ENV"
  echo "BACKUP_PG_BIN=$bin" >> "$GITHUB_ENV"
fi
echo "The PostgreSQL $EXPECTED_MAJOR client is installed at $bin and is what this job will use."
