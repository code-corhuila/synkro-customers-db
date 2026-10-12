#!/bin/sh
set -eu

fail() { printf '%s\n' "customers-migrate: $1" >&2; exit 2; }
[ "$#" -le 1 ] || fail 'only one operation is accepted'
operation=${1:-migrate}
case "$operation" in migrate|validate|info) ;; *) fail 'operation must be migrate, validate or info' ;; esac
[ -n "${FLYWAY_USER:-}" ] || fail 'FLYWAY_USER is required'
[ -n "${FLYWAY_URL:-}" ] || fail 'FLYWAY_URL is required'
# Reject embedded passwords, arbitrary JDBC properties and unsafe URL overrides.
printf '%s\n' "$FLYWAY_URL" | grep -Eq '^jdbc:postgresql://[a-zA-Z0-9._-]+:[0-9]{1,5}/[a-zA-Z0-9_-]+(\?sslmode=(disable|require|verify-ca|verify-full))?$' \
    || fail 'FLYWAY_URL must name host:port/database with optional sslmode only'
[ -r "${FLYWAY_PASSWORD_FILE:-}" ] || fail 'administrative password file is required and must be readable'
FLYWAY_PASSWORD=$(cat "$FLYWAY_PASSWORD_FILE")
[ -n "$FLYWAY_PASSWORD" ] || fail 'administrative password file must not be empty'
export FLYWAY_PASSWORD

cd /workspace
# Fixed arguments cannot be overridden by callers. No debug/raw database logs:
# errors can contain credentials, JDBC parameters, SQL literals or customer data.
status=0
/flyway/flyway -configFiles=/workspace/flyway.toml "$operation" >/dev/null 2>&1 || status=$?
unset FLYWAY_PASSWORD
if [ "$status" -ne 0 ]; then
    printf '%s\n' 'customers-migrate: Flyway failed; verify connectivity, admin credentials, customers_app, legacy history and migration checksums in a protected administrative session.' >&2
    exit "$status"
fi
printf 'customers-migrate: %s completed successfully\n' "$operation"
