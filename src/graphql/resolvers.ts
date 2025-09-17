import { EventEnvelope as Event, PublishEventInput } from '../types';
import { redisTopicManager } from '../redis/topicManager';
import { eventDistributor } from '../redis/eventDistributor';
import { rateLimiter } from '../redis/rateLimiter';
import { firebaseAuth } from '../gateway/auth';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { graphqlPubSub, channelForTopic } from './pubsub';
import { validatePublishInput } from '../utils/envelope';
import { metricsCollector } from '../monitoring/metrics';
import { presenceManager } from '../redis/presence';
import { config } from '../config';
import {
  validateAndSanitizePublishInput,
  validateTopicId,
  validateQueryParams,
  validateGraphQLContext,
  checkInputRateLimit
} from '../utils/inputSanitizer';

// PubSub is provided via singleton in ./pubsub

export const resolvers = {
  JSON: {
    __serialize: (value: unknown) => value as unknown,
    __parseValue: (value: unknown) => value as unknown,
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
    topics: async (_: unknown, __: unknown): Promise<any> => {
      try {
        const topicIds = await redisTopicManager.getAllTopics();
        const topics = await Promise.all(
          topicIds.map(async (id) => {
            // For demo, assume single-tenant 'default' when aggregating topics
            const stats = await redisTopicManager.getTopicStats('default', id);
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

    topicStats: async (_: unknown, { topicId }: { topicId: string }, context: any): Promise<any> => {
      try {
        // Validate topic ID
        const topicValidation = validateTopicId(topicId);
        if (!topicValidation.isValid) {
          throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
        }

        const sanitizedTopicId = topicValidation.sanitizedData!;
        const tenantId = context?.user?.tenantId || 'default';
        const stats = await redisTopicManager.getTopicStats(tenantId, sanitizedTopicId);
        if (!stats) {
          throw new Error('Topic not found');
        }
        return stats;
      } catch (error) {
        logger.error('Error fetching topic stats:', error);
        throw new Error('Failed to fetch topic stats');
      }
    },

    eventHistory: async (_: unknown, { topicId, count }: { topicId: string; count?: number }, context: any): Promise<Event[]> => {
      try {
        // Verify authentication
        if (!context.user) {
          throw new Error('Authentication required');
        }

        // Validate topic ID
        const topicValidation = validateTopicId(topicId);
        if (!topicValidation.isValid) {
          throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
        }

        // Validate query parameters
        const queryValidation = validateQueryParams({ count });
        if (!queryValidation.isValid) {
          throw new Error(`Invalid parameters: ${queryValidation.errors.join(', ')}`);
        }

        const sanitizedTopicId = topicValidation.sanitizedData!;
        const sanitizedCount = queryValidation.sanitizedData!.count || 100;

        // Check topic access
        const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, sanitizedTopicId);
        if (!hasAccess) {
          throw new Error('Access denied to topic');
        }

        const tenantId = context.user.tenantId || 'default';
        return await redisTopicManager.getEventHistory(tenantId, sanitizedTopicId, sanitizedCount);
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

        // Validate and sanitize context
        const contextValidation = validateGraphQLContext(context);
        if (!contextValidation.isValid) {
          logger.warn('Invalid GraphQL context:', contextValidation.errors);
          throw new Error('Invalid request context');
        }

        // Check input rate limiting (per user)
        const rateLimitKey = `input-${context.user.userId}`;
        if (!checkInputRateLimit(rateLimitKey, 60000, 50)) { // 50 requests per minute
          throw new Error('Input rate limit exceeded. Please slow down.');
        }

        // Validate and sanitize input
        const inputValidation = validateAndSanitizePublishInput(input);
        if (!inputValidation.isValid) {
          logger.warn('Invalid publish input:', inputValidation.errors);
          throw new Error(`Invalid input: ${inputValidation.errors.join(', ')}`);
        }

        const sanitizedInput = inputValidation.sanitizedData!;
        const { topicId, type, data, priority } = sanitizedInput;

        // Legacy validation for backward compatibility
        const vr = validatePublishInput(sanitizedInput);
        if (!vr.valid) {
          throw new Error(vr.reason || 'Invalid event');
        }

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
        metricsCollector.onPublish();

        // Also emit to PubSub for same-node delivery
        await graphqlPubSub.publish(channelForTopic(tenantId, topicId), { topicEvents: event });
        metricsCollector.onDeliver();

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
    joinTopic: async (_: any, { topicId }: { topicId: string }, context: any) => {
      if (!context.user) throw new Error('Authentication required');

      // Validate topic ID
      const topicValidation = validateTopicId(topicId);
      if (!topicValidation.isValid) {
        throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
      }

      const sanitizedTopicId = topicValidation.sanitizedData!;
      const tenantId = context.user.tenantId || 'default';
      await presenceManager.join(tenantId, sanitizedTopicId, context.user.userId);
      return { success: true, message: 'joined' };
    },
    leaveTopic: async (_: any, { topicId }: { topicId: string }, context: any) => {
      if (!context.user) throw new Error('Authentication required');

      // Validate topic ID
      const topicValidation = validateTopicId(topicId);
      if (!topicValidation.isValid) {
        throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
      }

      const sanitizedTopicId = topicValidation.sanitizedData!;
      const tenantId = context.user.tenantId || 'default';
      await presenceManager.leave(tenantId, sanitizedTopicId, context.user.userId);
      return { success: true, message: 'left' };
    },
    heartbeat: async (_: any, { topicId }: { topicId: string }, context: any) => {
      if (!context.user) throw new Error('Authentication required');

      // Validate topic ID
      const topicValidation = validateTopicId(topicId);
      if (!topicValidation.isValid) {
        throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
      }

      const sanitizedTopicId = topicValidation.sanitizedData!;
      const tenantId = context.user.tenantId || 'default';
      await presenceManager.heartbeat(tenantId, sanitizedTopicId, context.user.userId);
      return { success: true, message: 'ok' };
    },
  },

  Subscription: {
    topicEvents: {
      subscribe: async (_: unknown, { topicId, fromSeq }: { topicId: string; fromSeq?: number }, context: any): Promise<any> => {
        try {
          // Verify authentication
          if (!context.user) {
            throw new Error('Authentication required');
          }

          // Validate topic ID
          const topicValidation = validateTopicId(topicId);
          if (!topicValidation.isValid) {
            throw new Error(`Invalid topic ID: ${topicValidation.errors.join(', ')}`);
          }

          // Validate query parameters
          const queryValidation = validateQueryParams({ fromSeq });
          if (!queryValidation.isValid) {
            throw new Error(`Invalid parameters: ${queryValidation.errors.join(', ')}`);
          }

          const sanitizedTopicId = topicValidation.sanitizedData!;
          const sanitizedFromSeq = queryValidation.sanitizedData!.fromSeq;

          // Check topic access
          const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, sanitizedTopicId);
          if (!hasAccess) {
            throw new Error('Access denied to topic');
          }

          // Add subscriber to topic
          const subscriberId = context.connectionId || uuidv4();
          await redisTopicManager.addSubscriber(context.user.tenantId || 'default', sanitizedTopicId, subscriberId, context.user.userId);

          logger.info(`Subscriber ${subscriberId} subscribed to topic ${sanitizedTopicId}`);

          // If fromSeq provided, emit backlog first (server-side push)
          if (typeof sanitizedFromSeq === 'number' && sanitizedFromSeq > 0 && config.featureFlags.durabilityEnabled) {
            const backlog = await redisTopicManager.readFromSeq(context.user.tenantId || 'default', sanitizedTopicId, sanitizedFromSeq);
            for (const evt of backlog) {
              await graphqlPubSub.publish(channelForTopic(context.user.tenantId || 'default', sanitizedTopicId), { topicEvents: evt });
            }
          }

          // Return async iterator for topic-scoped events
          const tenantId = context.user.tenantId || 'default';
          return graphqlPubSub.asyncIterator([channelForTopic(tenantId, sanitizedTopicId)]);
        } catch (error) {
          logger.error('Error subscribing to topic:', error);
          throw new Error('Failed to subscribe to topic');
        }
      },
    },
  },
}; 