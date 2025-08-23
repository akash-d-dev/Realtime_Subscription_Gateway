import { EventEnvelope as Event, PublishEventInput } from '../types';
import { redisTopicManager } from '../redis/topicManager';
import { eventDistributor } from '../redis/eventDistributor';
import { rateLimiter } from '../redis/rateLimiter';
import { firebaseAuth } from '../gateway/auth';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { graphqlPubSub, channelForTopic } from './pubsub';
import { config } from '../config';

// PubSub is provided via singleton in ./pubsub

export const resolvers = {
  JSON: {
    __serialize: (value: any) => value,
    __parseValue: (value: any) => value,
    __parseLiteral: (ast: any) => {
      // Handle GraphQL AST literal parsing
      if (ast.kind === 'ObjectValue') {
        const obj: any = {};
        ast.fields.forEach((field: any) => {
          obj[field.name.value] = field.value.value;
        });
        return obj;
      }
      return ast.value;
    },
  },
  EventEnvelope: {
    // pass-through resolvers if needed later
  },
  
  Query: {
    topics: async (_: any, __: any, context: any): Promise<any> => {
      try {
        const topicIds = await redisTopicManager.getAllTopics();
        const topics = await Promise.all(
          topicIds.map(async (id) => {
            const stats = await redisTopicManager.getTopicStats(id);
            return {
              id,
              subscriberCount: stats?.subscriberCount || 0,
              bufferSize: stats?.bufferSize || 0,
              createdAt: Date.now(),
            };
          })
        );
        return topics;
      } catch (error) {
        logger.error('Error fetching topics:', error);
        throw new Error('Failed to fetch topics');
      }
    },

    topicStats: async (_: any, { topicId }: { topicId: string }, context: any): Promise<any> => {
      try {
        const stats = await redisTopicManager.getTopicStats(topicId);
        if (!stats) {
          throw new Error('Topic not found');
        }
        return stats;
      } catch (error) {
        logger.error('Error fetching topic stats:', error);
        throw new Error('Failed to fetch topic stats');
      }
    },

    eventHistory: async (_: any, { topicId, count }: { topicId: string; count?: number }, context: any): Promise<Event[]> => {
      try {
        // Verify authentication
        if (!context.user) {
          throw new Error('Authentication required');
        }

        // Check topic access
        const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, topicId);
        if (!hasAccess) {
          throw new Error('Access denied to topic');
        }

        return await redisTopicManager.getEventHistory(topicId, count || 100);
      } catch (error) {
        logger.error('Error fetching event history:', error);
        throw new Error('Failed to fetch event history');
      }
    },
  },

  Mutation: {
    publishEvent: async (_: any, { input }: { input: PublishEventInput }, context: any): Promise<any> => {
      try {
        // Verify authentication
        if (!context.user) {
          throw new Error('Authentication required');
        }

        const { topicId, type, data, priority } = input;

        // Check rate limits
        const userRateLimit = await rateLimiter.checkUserRateLimit(context.user.userId, 'publish');
        if (!userRateLimit.allowed) {
          throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((userRateLimit.resetTime - Date.now()) / 1000)} seconds`);
        }

        const tenantForRl = context.user.tenantId || 'default';
        const topicRateLimit = await rateLimiter.checkTopicRateLimit(tenantForRl, topicId);
        if (!topicRateLimit.allowed) {
          throw new Error(`Topic rate limit exceeded. Try again in ${Math.ceil((topicRateLimit.resetTime - Date.now()) / 1000)} seconds`);
        }

        // Check topic access
        const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, topicId);
        if (!hasAccess) {
          throw new Error('Access denied to topic');
        }

        // Create event
        const now = new Date();
        const tenantId = context.user.tenantId || 'default';
        // Seq is assigned inside Redis manager for durability; for transient path we can use timestamp as fallback
        const event: Event = {
          id: uuidv4(),
          topicId,
          type,
          data,
          seq: Date.now(),
          ts: now.toISOString(),
          tenantId,
          senderId: context.user.userId,
          ...(typeof priority === 'number' ? { priority } : {}),
        };

        // Publish event using the event distributor
        await eventDistributor.publishEvent(topicId, event);

        // Also emit to PubSub for same-node delivery
        await graphqlPubSub.publish(channelForTopic(tenantId, topicId), { topicEvents: event });

        logger.info(`Published event ${event.id} to topic ${topicId}`);

        return {
          success: true,
          eventId: event.id,
          message: 'Event published successfully',
        };
      } catch (error) {
        logger.error('Error publishing event:', error);
        return {
          success: false,
          eventId: '',
          message: error instanceof Error ? error.message : 'Failed to publish event',
        };
      }
    },
  },

  Subscription: {
    topicEvents: {
      subscribe: async (_: any, { topicId }: { topicId: string }, context: any): Promise<any> => {
        try {
          // Verify authentication
          if (!context.user) {
            throw new Error('Authentication required');
          }

          // Check topic access
          const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, topicId);
          if (!hasAccess) {
            throw new Error('Access denied to topic');
          }

          // Add subscriber to topic
          const subscriberId = context.connectionId || uuidv4();
          await redisTopicManager.addSubscriber(topicId, subscriberId, context.user.userId);

          logger.info(`Subscriber ${subscriberId} subscribed to topic ${topicId}`);

          // Return async iterator for topic-scoped events
          const tenantId = context.user.tenantId || 'default';
          return graphqlPubSub.asyncIterator([channelForTopic(tenantId, topicId)]);
        } catch (error) {
          logger.error('Error subscribing to topic:', error);
          throw new Error('Failed to subscribe to topic');
        }
      },
    },
  },
}; 