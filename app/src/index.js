const express = require("express");
const {
  appPort,
  tenants,
  tenantPasswords,
  gatewayPassword
} = require("./config");
const { createProducer } = require("./kafka");
const { startArchiver } = require("./archive");

const app = express();
app.use(express.json({ limit: "256kb" }));

const tenantProducers = new Map();
let violationProducer;
let archiverStarted = false;

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

async function getTenantProducer(tenantId) {
  if (tenantProducers.has(tenantId)) {
    return tenantProducers.get(tenantId);
  }

  const producer = await createProducer(
    `gateway-${tenantId}`,
    tenantId,
    tenantPasswords[tenantId]
  );
  tenantProducers.set(tenantId, producer);
  return producer;
}

async function sendViolation(req, reason, attemptedTenant) {
  if (!violationProducer) {
    return;
  }

  const payload = {
    reason,
    attempted_tenant_id: attemptedTenant || null,
    source_ip: clientIp(req),
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };

  try {
    await violationProducer.send({
      topic: "audit.violations",
      messages: [{ value: JSON.stringify(payload) }]
    });
  } catch (err) {
    console.error("failed to log violation", err);
  }
}

async function initViolationProducerWithRetry() {
  while (!violationProducer) {
    try {
      violationProducer = await createProducer("gateway-violations", "gateway", gatewayPassword);
      console.log("violation producer connected");
      return;
    } catch (err) {
      console.error("violation producer connect failed, retrying in 5s", err.message || err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function startArchiverWithRetry() {
  while (!archiverStarted) {
    try {
      await startArchiver(console);
      archiverStarted = true;
      return;
    } catch (err) {
      console.error("archiver start failed, retrying in 5s", err.message || err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

app.get("/health", async (_, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/events", async (req, res) => {
  const tenantId = req.header("X-Tenant-ID");
  if (!tenantId || !tenants.includes(tenantId)) {
    await sendViolation(req, "invalid_or_missing_tenant", tenantId);
    return res.status(401).json({ error: "Unauthorized tenant" });
  }

  const event = req.body;
  const required = ["actor_id", "action", "timestamp", "details"];
  const missing = required.filter((k) => event[k] === undefined);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
  }

  try {
    const producer = await getTenantProducer(tenantId);
    await producer.send({
      topic: `audit.${tenantId}.events`,
      messages: [{ value: JSON.stringify(event) }]
    });
    return res.status(202).json({ status: "accepted" });
  } catch (err) {
    console.error("failed to publish event", err);
    return res.status(500).json({ error: "Failed to publish event" });
  }
});

async function start() {
  app.listen(appPort, () => {
    console.log(`gateway listening on ${appPort}`);
  });

  initViolationProducerWithRetry().catch((err) => {
    console.error("violation producer retry loop stopped", err);
  });

  startArchiverWithRetry().catch((err) => {
    console.error("archiver retry loop stopped", err);
  });
}

start().catch((err) => {
  console.error("fatal startup error", err);
  process.exit(1);
});
