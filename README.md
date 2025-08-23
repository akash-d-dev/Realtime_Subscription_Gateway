# Realtime Subscription Gateway

A scalable realtime subscription gateway that handles live event updates with Redis, GraphQL, and Firebase Auth.

## 🚀 Features

- **Real-time Event Publishing**: Publish events to topics via GraphQL mutations
- **WebSocket Subscriptions**: Subscribe to topic events in real-time
- **Firebase Authentication**: Secure connections with JWT token validation
- **Redis Integration**: High-performance message broker for event distribution
- **Backpressure Handling**: Manage slow clients and queue overflow
- **Rate Limiting**: Protect against abuse with configurable limits
- **Health Monitoring**: Built-in health checks and metrics

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Producers     │    │   Gateway       │    │   Subscribers   │
│                 │    │                 │    │                 │
│ • REST API      │───▶│ • GraphQL       │───▶│ • WebSocket     │
│ • GraphQL       │    │ • Topic Manager │    │ • Real-time     │
│ • Events        │    │ • Auth          │    │ • Events        │
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

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Realtime_Subscription_Gateway
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   PORT=4000
   NODE_ENV=development

   # Redis Configuration
   REDIS_URL=redis://localhost:6379
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Firebase Configuration
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   # ... other Firebase config
   ```

4. **Start Redis**
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:7-alpine
   
   # Or using Docker Compose
   docker-compose up redis -d
   ```

5. **Start the gateway**
   ```bash
   npm run dev
   ```

## 🐳 Docker Setup

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f gateway

# Stop services
docker-compose down
```

## 📡 API Usage

### GraphQL Endpoint
- **URL**: `http://localhost:4000/graphql`
- **WebSocket**: `ws://localhost:4000/graphql`

### Authentication
All requests require a Firebase JWT token in the Authorization header:
```
Authorization: Bearer <firebase-jwt-token>
```

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

Variables:
```json
{
  "input": {
    "topicId": "document-edits",
    "type": "cursor-move",
    "data": {
      "userId": "user123",
      "position": { "x": 100, "y": 200 },
      "documentId": "doc456"
    }
  }
}
```

### Subscribing to Events

```graphql
subscription TopicEvents($topicId: String!) {
  topicEvents(topicId: $topicId) {
    id
    topicId
    type
    data
    timestamp
    userId
  }
}
```

Variables:
```json
{
  "topicId": "document-edits"
}
```

### Querying Topics

```graphql
query GetTopics {
  topics {
    id
    subscriberCount
    bufferSize
    createdAt
  }
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `MAX_TOPIC_BUFFER_SIZE` | Max events per topic buffer | `1000` |
| `MAX_SUBSCRIBER_QUEUE_SIZE` | Max events per subscriber queue | `100` |
| `SLOW_CLIENT_THRESHOLD_MS` | Threshold for slow client detection | `5000` |

### Rate Limiting

Configure rate limits in your `.env`:
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint

# Format code
npm run format
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "redis": true
}
```

### Metrics (Coming Soon)
- Topic buffer fill percentage
- Subscriber lag
- Event drop rates
- Connection counts

## 🚀 Development

### Project Structure
```
src/
├── index.ts                 # Entry point
├── config.ts               # Configuration
├── types/                  # TypeScript types
├── gateway/                # Core gateway logic
│   ├── topicManager.ts     # Topic and subscriber management
│   ├── subscriptionServer.ts # WebSocket subscription handling
│   └── auth.ts             # Firebase authentication
├── graphql/                # GraphQL schema and resolvers
├── redis/                  # Redis connection and utilities
└── utils/                  # Utilities (logging, etc.)
```

### Adding New Features

1. **New Event Types**: Add to the GraphQL schema in `src/graphql/schema.ts`
2. **Custom Resolvers**: Extend resolvers in `src/graphql/resolvers.ts`
3. **Authentication Rules**: Modify `src/gateway/auth.ts`
4. **Rate Limiting**: Update Redis Lua scripts in `src/redis/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the `/docs` folder
- **Examples**: See `/examples` for usage examples

## 🔮 Roadmap

- [ ] Redis Streams for durable event storage
- [ ] Event replay capabilities
- [ ] Advanced rate limiting with Redis Lua
- [ ] Prometheus metrics
- [ ] Horizontal scaling with Redis Cluster
- [ ] Event filtering and transformation
- [ ] Webhook integrations 