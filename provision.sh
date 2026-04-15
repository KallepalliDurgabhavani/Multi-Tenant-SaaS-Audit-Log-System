#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TENANT_ACME_PASSWORD="${TENANT_ACME_PASSWORD:-change-me-acme}"
TENANT_GLOBEX_PASSWORD="${TENANT_GLOBEX_PASSWORD:-change-me-globex}"
TENANT_INITECH_PASSWORD="${TENANT_INITECH_PASSWORD:-change-me-initech}"
GATEWAY_PASSWORD="${GATEWAY_PASSWORD:-change-me-gateway}"
ARCHIVER_PASSWORD="${ARCHIVER_PASSWORD:-change-me-archiver}"

run_kafka() {
  docker compose exec -T kafka bash -lc "$1"
}

echo "Creating required topics..."
run_kafka "kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic audit.tenant-acme.events --partitions 1 --replication-factor 1"
run_kafka "kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic audit.tenant-globex.events --partitions 1 --replication-factor 1"
run_kafka "kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic audit.tenant-initech.events --partitions 1 --replication-factor 1"
run_kafka "kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic audit.violations --partitions 1 --replication-factor 1"

echo "Creating SCRAM users..."
run_kafka "kafka-configs --zookeeper zookeeper:2181 --alter --add-config 'SCRAM-SHA-256=[iterations=4096,password=${TENANT_ACME_PASSWORD}]' --entity-type users --entity-name tenant-acme"
run_kafka "kafka-configs --zookeeper zookeeper:2181 --alter --add-config 'SCRAM-SHA-256=[iterations=4096,password=${TENANT_GLOBEX_PASSWORD}]' --entity-type users --entity-name tenant-globex"
run_kafka "kafka-configs --zookeeper zookeeper:2181 --alter --add-config 'SCRAM-SHA-256=[iterations=4096,password=${TENANT_INITECH_PASSWORD}]' --entity-type users --entity-name tenant-initech"
run_kafka "kafka-configs --zookeeper zookeeper:2181 --alter --add-config 'SCRAM-SHA-256=[iterations=4096,password=${GATEWAY_PASSWORD}]' --entity-type users --entity-name gateway"
run_kafka "kafka-configs --zookeeper zookeeper:2181 --alter --add-config 'SCRAM-SHA-256=[iterations=4096,password=${ARCHIVER_PASSWORD}]' --entity-type users --entity-name archiver"

echo "Applying ACLs per tenant..."
for tenant in tenant-acme tenant-globex tenant-initech; do
  topic="audit.${tenant}.events"
  group="audit.${tenant}.group"

  run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:${tenant} --operation WRITE --topic ${topic}"
  run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:${tenant} --operation READ --topic ${topic}"
  run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:${tenant} --operation DESCRIBE --topic ${topic}"
  run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:${tenant} --operation READ --group ${group}"

done

echo "Applying tenant quotas (1MB/s producer and consumer)..."
for tenant in tenant-acme tenant-globex tenant-initech; do
  run_kafka "kafka-configs --bootstrap-server localhost:9092 --alter --entity-type users --entity-name ${tenant} --add-config 'producer_byte_rate=1048576,consumer_byte_rate=1048576'"
done

echo "Applying service ACLs..."
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:gateway --operation WRITE --topic audit.violations"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation READ --topic audit.tenant-acme.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation DESCRIBE --topic audit.tenant-acme.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation READ --topic audit.tenant-globex.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation DESCRIBE --topic audit.tenant-globex.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation READ --topic audit.tenant-initech.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation DESCRIBE --topic audit.tenant-initech.events"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation READ --group archive-worker-v1"
run_kafka "kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 --add --allow-principal User:archiver --operation DESCRIBE --group archive-worker-v1"

echo "Provisioning complete."
