import express from 'express';
import { createServer } from 'http';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { SubscriptionServer } from './gateway/subscriptionServer';
import { firebaseAuth } from './gateway/auth';
import { redisConnection } from './redis/connection';
import { redisTopicManager } from './redis/topicManager';
import { eventDistributor } from './redis/eventDistributor';
import { logger } from './utils/logger';
import { config } from './config';
import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { getPrometheusMetrics } from './monitoring/metrics';

async function startServer(): Promise<void> {
  try {
    // Initialize Redis connection
    await redisConnection.connect();
    logger.info('Redis connected successfully');

    // Start event distributor
    await eventDistributor.startListening();
    logger.info('Event distributor started');

    // Initialize Firebase Auth
    logger.info('Firebase Auth initialized');

    const app = express();
    const httpServer = createServer(app);

    // Middleware
    app.use(helmet());
    app.use(compression());
    app.use(cors({
      origin: true,
      credentials: true,
    }));
    app.use(express.json({ limit: '10mb' }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        redis: redisConnection.isClientConnected(),
      });
    });

    // Metrics endpoint (Prometheus format)
    app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(getPrometheusMetrics());
    });

    // Apollo Server setup
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: async ({ req }) => {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return { user: null };
        }

        const token = authHeader.replace('Bearer ', '');
        const user = await firebaseAuth.verifyToken(token);
        
        return { user };
      },
      formatError: (error:GraphQLError ):GraphQLFormattedError => {
        logger.error('GraphQL Error:', error);
        return {
          message: error.message,
          locations: error.locations || [],
          path: error.path || [],
          extensions: error.extensions || {},
        };
      },
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({ app: app as any, path: '/graphql' });

    // WebSocket subscription server
    const subscriptionServer = new SubscriptionServer(httpServer);

    // Cleanup interval for inactive subscribers
    setInterval(async () => {
      await redisTopicManager.cleanupInactiveSubscribers();
    }, 30000); // Every 30 seconds

    // Start server
    const port = config.server.port;
    httpServer.listen(port, () => {
      logger.info(`🚀 Realtime Subscription Gateway running on port ${port}`);
      logger.info(`📊 GraphQL endpoint: http://localhost:${port}/graphql`);
      logger.info(`🔌 WebSocket endpoint: ws://localhost:${port}/graphql`);
      logger.info(`🏥 Health check: http://localhost:${port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await eventDistributor.stopListening();
      await redisConnection.disconnect();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await eventDistributor.stopListening();
      await redisConnection.disconnect();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 