## Run Instructions

### 1) Prerequisites
- Node.js 18+
- Redis 7+
- Firebase project and a Service Account (for Admin SDK)

### 2) Configure Environment
Copy env template and fill values:
```bash
cp env.example .env
```
Required keys:
- FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
- REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
- REDIS_KEY_PREFIX (default: rt)
- DURABILITY_ENABLED (true to enable fromSeq replay)
- MAX_PAYLOAD_BYTES (default: 65536)

### 3) Install and Build
```bash
npm install
npm run build
```

### 4) Start Redis (if needed)
```bash
docker run -d -p 6379:6379 redis:7-alpine
# or
docker-compose up -d
```

### 5) Start the Gateway
```bash
npm run dev
# GraphQL:  http://localhost:4000/graphql
# WS:       ws://localhost:4000/graphql
# Health:   http://localhost:4000/health
# Metrics:  http://localhost:4000/metrics
```

### 6) Authentication
Use a Firebase ID token (JWT). Pass via HTTP `Authorization: Bearer <token>` and WS `connection_init.payload.authorization: 'Bearer <token>'`.
Tenant is taken from the JWT custom claim `tenantId` (defaults to `default`).

### 7) Quick Tests

Health check:
```bash
curl http://localhost:4000/health
```

GraphQL publish and subscribe (with a JWT):
- Subscription query:
```graphql
subscription TopicEvents($topicId: ID!, $fromSeq: Int) {
  topicEvents(topicId: $topicId, fromSeq: $fromSeq) {
    id
    topicId
    type
    seq
    ts
    tenantId
    senderId
    priority
    data
  }
}
```
- Publish mutation:
```graphql
mutation Publish($input: PublishEventInput!) {
  publishEvent(input: $input) {
    success
    eventId
    message
  }
}
```

### 8) CLI Demos

Subscriber (with optional replay):
```bash
npm run demo:sub -- --topic doc:123 --from 0 --token "<JWT>"
```
Publisher (rate-limited event stream):
```bash
npm run demo:pub -- --topic doc:123 --rate 100 --type metric --duration 10 --token "<JWT>"
```

### 9) Presence Controls
Mutations (require auth):
- `joinTopic(topicId)`
- `leaveTopic(topicId)`
- `heartbeat(topicId)`
Presence is stored as TTL keys in Redis and can be listed via the internal presence manager (or add a query if needed).

### 10) Tenancy & Keys
Keys are tenant-scoped:
- Streams: `${prefix}:stream:${tenantId}:${topicId}`
- Pub/Sub: `${prefix}:pub:${tenantId}:${topicId}`
- Topic meta: `${prefix}:topic:${tenantId}:${topicId}:meta`
- Subscribers set: `${prefix}:topic:${tenantId}:${topicId}:subscribers`
- Subscriber queue: `${prefix}:sub:${tenantId}:${subscriberId}:topic:${topicId}:queue`
- Subscriber meta: `${prefix}:subscriber:${tenantId}:${subscriberId}:meta`
- Seq counter: `${prefix}:seq:${tenantId}:${topicId}`
- Rate limit: `${prefix}:rl:${tenantId}:${topicId}`
- Presence: `${prefix}:presence:${tenantId}:${topicId}`

### 11) Durability (fromSeq)
If `DURABILITY_ENABLED=true`, subscription with `fromSeq` replays from Redis Streams up to the current head, then live-tails via Pub/Sub.

### 12) Troubleshooting
- Ensure Redis is reachable and `.env` is loaded.
- Verify JWT is valid and contains `tenantId` if using multi-tenant tests.
- Check `/health` and `/metrics` for connectivity and counters.


