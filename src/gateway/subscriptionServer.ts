import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from '../graphql/schema';
import { resolvers } from '../graphql/resolvers';
import { firebaseAuth } from './auth';
import { topicManager } from './topicManager';
import { logger } from '../utils/logger';
import { AuthContext } from '../types';

export class SubscriptionServer {
  private wss: WebSocketServer;
  private connectionMap = new Map<string, string>(); // connectionId -> userId

  constructor(server: any) {
    this.wss = new WebSocketServer({
      server,
      path: '/graphql',
    });

    this.setupGraphQLWS();
    this.setupConnectionHandling();
  }

  private setupGraphQLWS(): void {
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    useServer(
      {
        schema,
        context: async (ctx) => {
          // Extract token from connection parameters
          const authHeader = ctx.connectionParams?.authorization;
          const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : null;
          
          if (!token) {
            throw new Error('No authorization token provided');
          }

          // Verify Firebase token
          const authContext = await firebaseAuth.verifyToken(token);
          if (!authContext) {
            throw new Error('Invalid authorization token');
          }

          return {
            user: authContext,
          };
        },
        onConnect: async () => {
          logger.info('WebSocket connection established');
        },
        onDisconnect: async () => {
          logger.info('WebSocket connection closed');
        },
      },
      this.wss
    );
  }

  private setupConnectionHandling(): void {
    this.wss.on('connection', (ws, req) => {
      logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  private cleanupConnection(connectionId: string): void {
    // Remove subscriber from all topics
    const topics = topicManager.getAllTopics();
    for (const topicId of topics) {
      topicManager.removeSubscriber(topicId, connectionId);
    }
  }

  getWSS(): WebSocketServer {
    return this.wss;
  }
} 