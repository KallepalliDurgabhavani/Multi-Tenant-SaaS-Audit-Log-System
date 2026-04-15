const Minio = require("minio");
const {
  tenants,
  tenantPasswords,
  minio,
  archiveMinAgeMs,
  archiverConsumerGroup,
  archiverPassword
} = require("./config");
const { createConsumer } = require("./kafka");

function toIsoOrNow(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

function paddedOffset(offset) {
  return String(offset).padStart(20, "0");
}

async function ensureBucket(client) {
  const exists = await client.bucketExists(minio.bucket);
  if (!exists) {
    await client.makeBucket(minio.bucket, "us-east-1");
  }
}

async function startArchiver(logger = console) {
  const minioClient = new Minio.Client({
    endPoint: minio.endPoint,
    port: minio.port,
    useSSL: minio.useSSL,
    accessKey: minio.accessKey,
    secretKey: minio.secretKey
  });

  await ensureBucket(minioClient);

  const consumer = await createConsumer(
    "audit-archiver",
    "archiver",
    archiverPassword,
    archiverConsumerGroup
  );

  const topics = tenants.map((tenantId) => `audit.${tenantId}.events`);
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      let parsed;
      try {
        parsed = JSON.parse((message.value || Buffer.from("{}")).toString("utf8"));
      } catch (_) {
        parsed = {
          raw_value: (message.value || Buffer.from("")).toString("utf8")
        };
      }

      const eventTs = toIsoOrNow(parsed.timestamp || message.timestamp);
      const age = Date.now() - new Date(eventTs).getTime();
      const delay = Math.max(0, archiveMinAgeMs - age);

      setTimeout(async () => {
        const objectName = `${topic}/partition=${partition}/${paddedOffset(message.offset)}.json`;
        const payload = {
          topic,
          partition,
          offset: message.offset,
          archived_at: new Date().toISOString(),
          event_timestamp: eventTs,
          key: message.key ? message.key.toString("utf8") : null,
          value: parsed
        };

        try {
          await minioClient.putObject(
            minio.bucket,
            objectName,
            Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
            {
              "Content-Type": "application/json"
            }
          );
          logger.info(`archived ${topic}:${partition}:${message.offset} -> ${objectName}`);
        } catch (err) {
          logger.error("archive failed", err);
        }
      }, delay);
    }
  });
}

module.exports = {
  startArchiver
};
