## Multi-Tenant Audit Log System (Kafka + ACL + Quotas + MinIO)

This project implements a production-style, multi-tenant audit logging system with strict tenant isolation using Kafka ACLs and fair usage via Kafka client quotas.

### Services
- zookeeper
- kafka (SASL/SCRAM enabled, ACL authorizer enabled)
- minio (S3-compatible archive store)
- app (HTTP gateway + archival worker)

### Quick Start
1. Start all services:
```bash
docker compose up --build -d
```
2. Provision tenants, ACLs, quotas, and topics:
```bash
./provision.sh
```
3. Restart app after initial provisioning (creates principals before app login):
```bash
docker compose up -d app
```

### API
Endpoint: `POST /events`

Required header: `X-Tenant-ID` (`tenant-acme`, `tenant-globex`, `tenant-initech`)

Body:
```json
{
  "actor_id": "string",
  "action": "string",
  "timestamp": "ISO8601 string",
  "details": {}
}
```

Behavior:
- Valid tenant -> `202 Accepted`, event is produced to `audit.{tenant}.events`
- Missing/invalid tenant -> `401 Unauthorized`, violation is produced to `audit.violations`

### Validation Scripts
- ACL denial test (expected non-zero exit):
```bash
./test_acl_violation.sh
```
- Quota throttling test:
```bash
./test_quota_violation.sh
```

### Archival
- Archiver consumes tenant topics and uploads eligible events to MinIO bucket `kafka-archive`.
- Object key format:
`kafka-archive/{topic_name}/partition={partition_number}/{start_offset}.json`

### Environment
Copy values from `.env.example` if you want to override defaults.
"# Multi-Tenant-SaaS-Audit-Log-System" 
