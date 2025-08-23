# 🚀 Quick Setup Guide

This guide will help you get the Realtime Subscription Gateway up and running quickly.

## Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Docker** - [Download here](https://www.docker.com/products/docker-desktop/)
- **Firebase Project** - [Create here](https://console.firebase.google.com/)

## 🛠️ Step-by-Step Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your Firebase configuration
# You'll need to get these from your Firebase project settings
```

### 3. Start Redis
```bash
# Option A: Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Option B: Using Docker Compose
docker-compose up redis -d
```

### 4. Configure Firebase

1. Go to your [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Download the JSON file
6. Copy the values to your `.env` file:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
# ... other Firebase config
```

### 5. Start the Gateway
```bash
# Development mode with auto-restart
npm run dev

# Or use the development script (checks Redis and creates .env)
npm run start:dev
```

### 6. Verify Installation
```bash
# Test the health endpoint
curl http://localhost:4000/health

# Test WebSocket connection
npm run test:client
```

## 🎯 What You Should See

### Successful Startup
```
🚀 Realtime Subscription Gateway running on port 4000
📊 GraphQL endpoint: http://localhost:4000/graphql
🔌 WebSocket endpoint: ws://localhost:4000/graphql
🏥 Health check: http://localhost:4000/health
```

### Health Check Response
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "redis": true
}
```

## 🔧 Troubleshooting

### Redis Connection Issues
```bash
# Check if Redis is running
redis-cli ping

# Should return: PONG
```

### Firebase Configuration Issues
- Ensure your Firebase project has Authentication enabled
- Verify the service account has the necessary permissions
- Check that the private key is properly formatted in `.env`

### Port Already in Use
```bash
# Check what's using port 4000
lsof -i :4000

# Or change the port in .env
PORT=4001
```

## 📚 Next Steps

1. **Explore the GraphQL Playground**: Visit `http://localhost:4000/graphql`
2. **Test Subscriptions**: Use the test client or GraphQL Playground
3. **Publish Events**: Try the `publishEvent` mutation
4. **Monitor Logs**: Watch the console for real-time logs

## 🧪 Testing Examples

### Publish an Event
```graphql
mutation {
  publishEvent(input: {
    topicId: "document-edits"
    type: "cursor-move"
    data: {
      userId: "user123"
      position: { x: 100, y: 200 }
    }
  }) {
    success
    eventId
    message
  }
}
```

### Subscribe to Events
```graphql
subscription {
  topicEvents(topicId: "document-edits") {
    id
    type
    data
    timestamp
  }
}
```

## 🚀 Production Deployment

For production deployment, consider:

1. **Environment Variables**: Use proper secrets management
2. **Redis Cluster**: For high availability
3. **Load Balancing**: Multiple gateway instances
4. **Monitoring**: Add Prometheus metrics
5. **SSL/TLS**: Secure WebSocket connections

## 📞 Support

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the main README.md
- **Examples**: See the `/examples` folder 