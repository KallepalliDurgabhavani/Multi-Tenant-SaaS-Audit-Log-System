const { Kafka, logLevel } = require("kafkajs");
const { brokers, mechanism } = require("./config");

function normalizedMechanism() {
  const value = String(mechanism || "").toLowerCase();
  if (value === "scram-sha-512") {
    return "scram-sha-512";
  }
  return "scram-sha-256";
}

function buildKafka(clientId, username, password) {
  return new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.INFO,
    ssl: false,
    sasl: {
      mechanism: normalizedMechanism(),
      username,
      password
    }
  });
}

async function createProducer(clientId, username, password) {
  const kafka = buildKafka(clientId, username, password);
  const producer = kafka.producer({ allowAutoTopicCreation: false });
  await producer.connect();
  return producer;
}

async function createConsumer(clientId, username, password, groupId) {
  const kafka = buildKafka(clientId, username, password);
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}

module.exports = {
  createProducer,
  createConsumer
};
