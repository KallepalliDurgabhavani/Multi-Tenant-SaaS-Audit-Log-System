#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TENANT_GLOBEX_PASSWORD="${TENANT_GLOBEX_PASSWORD:-change-me-globex}"

STDERR_FILE="$(mktemp)"
trap 'rm -f "$STDERR_FILE"' EXIT

set +e
docker compose exec -T kafka bash -lc "cat >/tmp/globex-client.properties <<'EOF'
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"tenant-globex\" password=\"${TENANT_GLOBEX_PASSWORD}\";
EOF
kafka-console-producer --bootstrap-server localhost:9093 --producer.config /tmp/globex-client.properties --topic audit.tenant-acme.events <<'MSG'
{\"should_fail\":true,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
MSG" 2>"$STDERR_FILE"
status=$?
set -e

cat "$STDERR_FILE" >&2

if ! grep -Eiq "TopicAuthorizationException|Not authorized|Authorization" "$STDERR_FILE"; then
  echo "Expected authorization failure text in stderr but did not find it." >&2
  exit 2
fi

if [ "$status" -eq 0 ]; then
  echo "Expected command to fail due to ACL restrictions, but it succeeded." >&2
  exit 3
fi

exit "$status"
