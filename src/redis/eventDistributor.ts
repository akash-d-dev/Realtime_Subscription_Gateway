import { RedisClientType } from 'redis';
import { EventEnvelope as Event } from '../types';
import { logger } from '../utils/logger';
import { redisConnection } from './connection';
import { redisTopicManager } from './topicManager';
import { config } from '../config';
import { graphqlPubSub, channelForTopic } from '../graphql/pubsub';

export class EventDistributor {
  private redis: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private isListening = false;
  private roundRobinIndexByTopic: Map<string, number> = new Map();

  constructor() {
    // Redis client will be initialized in startListening()
  }

  async startListening(): Promise<void> {
    if (this.isListening) return;

    try {
      // Initialize Redis clients
      this.redis = redisConnection.getClient()!;
      this.subscriber = this.redis.duplicate();
      
      await this.subscriber.connect();
      
      // Subscribe to all topic events
      await this.subscriber.pSubscribe(`${config.redis.keyPrefix}:pub:*:*`, async (message, channel) => {
        try {
          const event: Event = JSON.parse(message);
          const remainder = channel.replace(`${config.redis.keyPrefix}:pub:`, '');
          const sepIdx = remainder.indexOf(':');
          const tenantId = sepIdx >= 0 ? remainder.substring(0, sepIdx) : 'default';
          const topicId = sepIdx >= 0 ? remainder.substring(sepIdx + 1) : remainder;
          await this.distributeEventToSubscribers(tenantId, topicId, event);
        } catch (error) {
          logger.error('Error processing event from Redis Pub/Sub:', error);
        }
      });

      this.isListening = true;
      logger.info('Event distributor started listening for Redis Pub/Sub events');
    } catch (error) {
      logger.error('Failed to start event distributor:', error);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening || !this.subscriber) return;

    try {
      await this.subscriber.pUnsubscribe(`${config.redis.keyPrefix}:pub:*:*`);
      await this.subscriber.disconnect();
      this.isListening = false;
      logger.info('Event distributor stopped listening');
    } catch (error) {
      logger.error('Error stopping event distributor:', error);
    }
  }

  private async distributeEventToSubscribers(tenantId: string, topicId: string, event: Event): Promise<void> {
    if (!this.redis) {
      logger.error('Redis client not initialized');
      return;
    }

    try {
      // Get all subscribers for this topic
      const subscriberIds = await this.redis.sMembers(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:subscribers`);
      
      if (subscriberIds.length === 0) {
        logger.debug(`No subscribers for topic ${topicId}`);
        return;
      }

      // Fairness: rotate start index per topic (coarse DRR approximation)
      const rrKey = `${tenantId}:${topicId}`;
      const start = this.roundRobinIndexByTopic.get(rrKey) ?? 0;
      const rotated = subscriberIds.slice(start).concat(subscriberIds.slice(0, start));
      const next = (start + 1) % subscriberIds.length;
      this.roundRobinIndexByTopic.set(rrKey, next);

      // Distribute event to all subscribers asynchronously in rotated order
      const distributionPromises = rotated.map(async (subscriberId: string) => {
        try {
          await redisTopicManager.addEventToSubscriberQueue(tenantId, topicId, subscriberId, event);
        } catch (error) {
          logger.error(`Failed to distribute event to subscriber ${subscriberId}:`, error);
          // Mark subscriber as inactive if there's an error
          await redisTopicManager.markSubscriberInactive(tenantId, topicId, subscriberId);
        }
      });

      await Promise.allSettled(distributionPromises);
      // Emit to GraphQL PubSub channel scoped by tenant and topic
      try {
        await graphqlPubSub.publish(channelForTopic(event.tenantId, topicId), {
          topicEvents: event,
        });
      } catch (err) {
        logger.error('GraphQL PubSub publish failed:', err);
      }
      logger.debug(`Distributed event ${event.id} to ${subscriberIds.length} subscribers in topic ${topicId}`);
    } catch (error) {
      logger.error(`Error distributing event to subscribers for topic ${topicId}:`, error);
    }
  }

  async publishEvent(topicId: string, event: Event): Promise<void> {
    try {
      // Add event to Redis Stream for persistence
      await redisTopicManager.addEvent(topicId, event);
      
      // The event will be automatically distributed via Redis Pub/Sub
      logger.info(`Published event ${event.id} to topic ${topicId}`);
    } catch (error) {
      logger.error(`Error publishing event to topic ${topicId}:`, error);
      throw error;
    }
  }
}

export const eventDistributor = new EventDistributor();