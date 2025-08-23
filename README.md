# Realtime Subscription Gateway

A scalable realtime subscription gateway that handles live event updates with Redis, GraphQL, and Firebase Auth.

## 🚀 Features

- **Real-time Event Publishing**: Publish events to topics via GraphQL mutations
- **WebSocket Subscriptions**: Subscribe to topic events in real-time (supports `fromSeq` replay when durability is enabled)
- **Firebase Authentication**: Secure connections with JWT token validation (tenant from JWT custom claim `tenantId`)
- **Redis Integration**: Low-latency Pub/Sub fan-out + Redis Streams for optional durability
- **Backpressure Handling**: Per-subscriber queues with coalescing for cursor/presence
- **Rate Limiting**: Token-bucket per `{tenantId, topicId}`
- **Health & Metrics**: Health endpoint and Prometheus-style metrics

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Producers     │    │   Gateway       │    │   Subscribers   │
│                 │    │                 │    │                 │
│ • REST/GraphQL  │───▶│ • GraphQL       │───▶│ • WebSocket     │
│ • Events        │    │ • Topic Manager │    │ • Events        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                             │
                             ▼
                      ┌─────────────────┐
                      │   Redis         │
                      │                 │
                      │ • Pub/Sub       │
                      │ • Streams       │
                      │ • Rate Limiting │
                      └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- Redis 7+
- Firebase project with Authentication enabled

## 🛠️ Quick Start

See `RUN_INSTRUCTIONS.md` for full, step-by-step instructions.

## 📡 API Usage

### GraphQL Endpoint
- **URL**: `http://localhost:4000/graphql`
- **WebSocket**: `ws://localhost:4000/graphql`

### Authentication
All requests require a Firebase JWT token in the Authorization header:
```
Authorization: Bearer <firebase-jwt-token>
```
`tenantId` is taken from the JWT custom claims.

### Publishing Events

```graphql
mutation PublishEvent($input: PublishEventInput!) {
  publishEvent(input: $input) {
    success
    eventId
    message
  }
}
```

### Subscribing to Events (with optional replay)

```graphql
subscription TopicEvents($topicId: ID!, $fromSeq: Int) {
  topicEvents(topicId: $topicId, fromSeq: $fromSeq) {
    id
    topicId
    type
    data
    seq
    ts
    tenantId
    senderId
    priority
  }
}
```

### Presence Controls
Mutations:
- `joinTopic(topicId: ID!)`
- `leaveTopic(topicId: ID!)`
- `heartbeat(topicId: ID!)`

## 🔧 Configuration

Key environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_KEY_PREFIX` | Key namespace prefix | `rt` |
| `DURABILITY_ENABLED` | Enable fromSeq replay via Streams | `false` |
| `MAX_PAYLOAD_BYTES` | Max JSON payload size | `65536` |
| `MAX_TOPIC_BUFFER_SIZE` | Max events per topic buffer | `1000` |
| `MAX_SUBSCRIBER_QUEUE_SIZE` | Max events per subscriber queue | `100` |
| `SLOW_CLIENT_THRESHOLD_MS` | Slow client threshold | `5000` |

## 🧭 Tenancy & Keys
All Redis structures are tenant-scoped:
- Streams: `${prefix}:stream:${tenantId}:${topicId}`
- Pub/Sub: `${prefix}:pub:${tenantId}:${topicId}`
- Topic meta: `${prefix}:topic:${tenantId}:${topicId}:meta`
- Subscribers set: `${prefix}:topic:${tenantId}:${topicId}:subscribers`
- Subscriber queue: `${prefix}:sub:${tenantId}:${subscriberId}:topic:${topicId}:queue`
- Subscriber meta: `${prefix}:subscriber:${tenantId}:${subscriberId}:meta`
- Seq counter: `${prefix}:seq:${tenantId}:${topicId}`
- Rate limit: `${prefix}:rl:${tenantId}:${topicId}`
- Presence: `${prefix}:presence:${tenantId}:${topicId}`

## 🧪 CLI Demos
- Publisher: `npm run demo:pub -- --topic doc:123 --rate 100 --type metric --duration 10 --token "<JWT>"`
- Subscriber: `npm run demo:sub -- --topic doc:123 --from 0 --token "<JWT>"`

## 📊 Monitoring
- Health: `GET /health`
- Metrics: `GET /metrics`

## 🗺️ Project Structure
```
src/
├── index.ts
├── config.ts
├── types/
├── gateway/
├── graphql/
├── redis/
└── utils/
```

## 🔮 Roadmap (Optional)
- Priority-scheduling lane and batching small events
- Richer metrics/tracing and dashboards
- Snapshot pointers in Firestore for materialized durability 