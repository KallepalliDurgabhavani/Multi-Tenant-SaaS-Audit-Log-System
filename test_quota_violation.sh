#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TENANT_INITECH_PASSWORD="${TENANT_INITECH_PASSWORD:-change-me-initech}"

OUT_FILE="$(mktemp)"
trap 'rm -f "$OUT_FILE"' EXIT

echo "Running high-throughput producer test for at least 15 seconds..."

docker compose exec -T kafka bash -lc "cat >/tmp/initech-client.properties <<'EOF'
bootstrap.servers=localhost:9093
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"tenant-initech\" password=\"${TENANT_INITECH_PASSWORD}\";
EOF
kafka-producer-perf-test --topic audit.tenant-initech.events \
  --num-records 12000 \
  --record-size 2048 \
  --throughput -1 \
  --producer.config /tmp/initech-client.properties \
  --print-metrics" | tee "$OUT_FILE"

if grep -q "produce-throttle-time-avg" "$OUT_FILE"; then
  echo "Detected produce-throttle-time-avg metric in producer output."
else
  echo "No produce-throttle-time-avg metric found in producer output. Check broker logs for throttling evidence." >&2
fi
