import { Event, PublishEventInput } from '../types';
import { topicManager } from '../gateway/topicManager';
import { firebaseAuth } from '../gateway/auth';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

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
  
  Query: {
    topics: async (_: any, __: any, context: any): Promise<any> => {
      try {
        const topicIds = topicManager.getAllTopics();
        return topicIds.map(id => {
          const stats = topicManager.getTopicStats(id);
          return {
            id,
            subscriberCount: stats?.subscriberCount || 0,
            bufferSize: stats?.bufferSize || 0,
            createdAt: Date.now(), // TODO: Store actual creation time
          };
        });
      } catch (error) {
        logger.error('Error fetching topics:', error);
        throw new Error('Failed to fetch topics');
      }
    },

    topicStats: async (_: any, { topicId }: { topicId: string }, context: any): Promise<any> => {
      try {
        const stats = topicManager.getTopicStats(topicId);
        if (!stats) {
          throw new Error('Topic not found');
        }
        return stats;
      } catch (error) {
        logger.error('Error fetching topic stats:', error);
        throw new Error('Failed to fetch topic stats');
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

        const { topicId, type, data } = input;

        // Check topic access
        const hasAccess = await firebaseAuth.checkTopicAccess(context.user.userId, topicId);
        if (!hasAccess) {
          throw new Error('Access denied to topic');
        }

        // Create event
        const event: Event = {
          id: uuidv4(),
          topicId,
          type,
          data,
          timestamp: Date.now(),
          userId: context.user.userId,
        };

        // Add event to topic
        topicManager.addEvent(topicId, event);

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
          topicManager.addSubscriber(topicId, subscriberId, context.user.userId);

          logger.info(`Subscriber ${subscriberId} subscribed to topic ${topicId}`);

          // Return async iterator for events
          return topicManager.getSubscriberEvents(topicId, subscriberId);
        } catch (error) {
          logger.error('Error subscribing to topic:', error);
          throw new Error('Failed to subscribe to topic');
        }
      },
    },
  },
}; 