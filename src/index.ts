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

    // Secure CORS configuration
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [];

    // Default to secure origins in production
    if (config.server.nodeEnv === 'production' && allowedOrigins.length === 0) {
      logger.error('SECURITY ERROR: No ALLOWED_ORIGINS configured in production environment');
      throw new Error('ALLOWED_ORIGINS must be configured in production');
    }

    // Allow localhost in development/test environments
    const developmentOrigins = ['http://localhost:3000', 'http://localhost:4000', 'http://127.0.0.1:3000', 'http://127.0.0.1:4000'];
    const finalOrigins = config.server.nodeEnv === 'production'
      ? allowedOrigins
      : [...allowedOrigins, ...developmentOrigins];

    // Middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // GraphQL Playground needs these
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));
    app.use(compression());
    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin && config.server.nodeEnv !== 'production') {
          return callback(null, true);
        }

        // Check if origin is in allowed list
        if (origin && finalOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Log security violation
        logger.warn(`CORS blocked request from origin: ${origin || 'unknown'}`);
        callback(new Error(`CORS policy: Origin ${origin || 'unknown'} is not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
      maxAge: 86400, // 24 hours
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
      introspection: true,
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
      formatError: (error: GraphQLError): GraphQLFormattedError => {
        logger.error('GraphQL Error:', error);

        // In production, sanitize error messages to prevent information disclosure
        if (config.server.nodeEnv === 'production') {
          // Check if it's a user-facing error (starts with our known prefixes)
          const isUserError = error.message.startsWith('Authentication required') ||
                             error.message.startsWith('Access denied') ||
                             error.message.startsWith('Invalid input') ||
                             error.message.startsWith('Invalid topic ID') ||
                             error.message.startsWith('Invalid parameters') ||
                             error.message.startsWith('Rate limit exceeded') ||
                             error.message.includes('CORS policy');

          // Remove sensitive information in production
          const formattedError: GraphQLFormattedError = {
            message: isUserError ? error.message : 'An internal error occurred',
          };
          return formattedError;
        }

        // In development, return full error details
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
    new SubscriptionServer(httpServer);

    // Cleanup interval for inactive subscribers
    setInterval(() => {
      void redisTopicManager.cleanupInactiveSubscribers();
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
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      void (async () => {
        await eventDistributor.stopListening();
        await redisConnection.disconnect();
        httpServer.close(() => {
          logger.info('Server closed');
          process.exit(0);
        });
      })();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      void (async () => {
        await eventDistributor.stopListening();
        await redisConnection.disconnect();
        httpServer.close(() => {
          logger.info('Server closed');
          process.exit(0);
        });
      })();
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 