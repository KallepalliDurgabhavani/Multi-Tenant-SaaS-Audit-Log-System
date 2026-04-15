require("dotenv").config();

const TENANTS = ["tenant-acme", "tenant-globex", "tenant-initech"];

const tenantPasswords = {
  "tenant-acme": process.env.TENANT_ACME_PASSWORD || "change-me-acme",
  "tenant-globex": process.env.TENANT_GLOBEX_PASSWORD || "change-me-globex",
  "tenant-initech": process.env.TENANT_INITECH_PASSWORD || "change-me-initech"
};

module.exports = {
  appPort: Number(process.env.APP_PORT || 8080),
  brokers: [(process.env.KAFKA_SASL_BROKER || "kafka:9093").trim()],
  mechanism: process.env.KAFKA_CLIENT_MECHANISM || "scram-sha-256",
  tenants: TENANTS,
  tenantPasswords,
  gatewayPassword: process.env.GATEWAY_PASSWORD || "change-me-gateway",
  archiverPassword: process.env.ARCHIVER_PASSWORD || "change-me-archiver",
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || "minio",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true",
    accessKey: process.env.MINIO_ROOT_USER || "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "kafka-archive"
  },
  archiveMinAgeMs: Number(process.env.ARCHIVE_MIN_AGE_MS || 300000),
  archiverConsumerGroup: process.env.ARCHIVER_CONSUMER_GROUP || "archive-worker-v1"
};
