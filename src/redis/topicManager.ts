import { RedisClientType } from 'redis';
import { Event, Topic, Subscriber } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { redisConnection } from './connection';

export class RedisTopicManager {
  private redis: RedisClientType;

  constructor() {
    this.redis = redisConnection.getClient()!;
  }

  async createTopic(topicId: string): Promise<Topic> {
    const topic: Topic = {
      id: topicId,
      buffer: [],
      subscribers: new Map(),
      lastEventId: 0,
      createdAt: Date.now(),
    };

    // Store topic metadata in Redis
    await this.redis.hSet(`topic:${topicId}:meta`, {
      id: topicId,
      createdAt: topic.createdAt.toString(),
      lastEventId: '0',
    });

    // Set expiration for topic metadata (24 hours)
    await this.redis.expire(`topic:${topicId}:meta`, 86400);

    logger.info(`Created topic: ${topicId}`);
    return topic;
  }

  async getTopic(topicId: string): Promise<Topic | null> {
    const exists = await this.redis.exists(`topic:${topicId}:meta`);
    if (!exists) return null;

    const meta = await this.redis.hGetAll(`topic:${topicId}:meta`);
    const topic: Topic = {
      id: topicId,
      buffer: [],
      subscribers: new Map(),
      lastEventId: parseInt(meta.lastEventId || '0'),
      createdAt: parseInt(meta.createdAt || '0'),
    };

    return topic;
  }

  async getOrCreateTopic(topicId: string): Promise<Topic> {
    let topic = await this.getTopic(topicId);
    if (!topic) {
      topic = await this.createTopic(topicId);
    }
    return topic;
  }

  async addEvent(topicId: string, event: Event): Promise<void> {
    // Add event to Redis Stream for persistence and replay
    const streamKey = `topic:${topicId}:stream`;
    const eventData = {
      id: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
      timestamp: event.timestamp.toString(),
      userId: event.userId || '',
    };

    const streamId = await this.redis.xAdd(streamKey, '*', eventData);
    
    // Update last event ID in topic metadata
    await this.redis.hSet(`topic:${topicId}:meta`, 'lastEventId', event.timestamp.toString());

    // Publish event to Redis Pub/Sub for real-time distribution
    await this.redis.publish(`topic:${topicId}:events`, JSON.stringify(event));

    // Maintain stream size (keep last 1000 events)
    await this.redis.xTrim(streamKey, 'MAXLEN', '~', 1000);

    logger.debug(`Added event ${event.id} to topic ${topicId} with stream ID ${streamId}`);
  }

  async getSubscriberEvents(topicId: string, subscriberId: string): Promise<Event[]> {
    const queueKey = `subscriber:${subscriberId}:topic:${topicId}:queue`;
    
    // Get all events from subscriber's queue
    const events = await this.redis.lRange(queueKey, 0, -1);
    
    // Clear the queue after reading
    await this.redis.del(queueKey);
    
    // Update last seen timestamp
    await this.redis.hSet(`subscriber:${subscriberId}:meta`, 'lastSeen', Date.now().toString());
    
    return events.map((eventStr: string) => JSON.parse(eventStr));
  }

  async addSubscriber(topicId: string, subscriberId: string, userId?: string): Promise<Subscriber> {
    const subscriber: Subscriber = {
      id: subscriberId,
      topicId,
      userId: userId || '',
      queue: [],
      lastSeen: Date.now(),
      isActive: true,
    };

    // Store subscriber metadata
    await this.redis.hSet(`subscriber:${subscriberId}:meta`, {
      id: subscriberId,
      topicId,
      userId: userId || '',
      lastSeen: subscriber.lastSeen.toString(),
      isActive: 'true',
    });

    // Add subscriber to topic's subscriber set
    await this.redis.sAdd(`topic:${topicId}:subscribers`, subscriberId);

    // Set expiration for subscriber metadata (1 hour)
    await this.redis.expire(`subscriber:${subscriberId}:meta`, 3600);

    logger.info(`Added subscriber ${subscriberId} to topic ${topicId}`);
    return subscriber;
  }

  async removeSubscriber(topicId: string, subscriberId: string): Promise<boolean> {
    // Remove from topic's subscriber set
    const removed = await this.redis.sRem(`topic:${topicId}:subscribers`, subscriberId);
    
    if (removed) {
      // Clean up subscriber data
      await this.redis.del(`subscriber:${subscriberId}:topic:${topicId}:queue`);
      await this.redis.del(`subscriber:${subscriberId}:meta`);
      logger.info(`Removed subscriber ${subscriberId} from topic ${topicId}`);
    }
    
    return removed > 0;
  }

  async getSubscriber(topicId: string, subscriberId: string): Promise<Subscriber | null> {
    const exists = await this.redis.exists(`subscriber:${subscriberId}:meta`);
    if (!exists) return null;

    const meta = await this.redis.hGetAll(`subscriber:${subscriberId}:meta`);
    
    return {
      id: subscriberId,
      topicId,
      userId: meta.userId || '',
      queue: [],
      lastSeen: parseInt(meta.lastSeen || '0'),
      isActive: meta.isActive === 'true',
    };
  }

  async markSubscriberInactive(topicId: string, subscriberId: string): Promise<void> {
    await this.redis.hSet(`subscriber:${subscriberId}:meta`, 'isActive', 'false');
    logger.debug(`Marked subscriber ${subscriberId} as inactive`);
  }

  async cleanupInactiveSubscribers(): Promise<void> {
    const now = Date.now();
    const threshold = config.topic.slowClientThresholdMs;

    // Get all topics
    const topicKeys = await this.redis.keys('topic:*:meta');
    
    for (const topicKey of topicKeys) {
      const topicId = topicKey.replace('topic:', '').replace(':meta', '');
      const subscriberIds = await this.redis.sMembers(`topic:${topicId}:subscribers`);
      
      for (const subscriberId of subscriberIds) {
        const subscriber = await this.getSubscriber(topicId, subscriberId);
        if (subscriber && (!subscriber.isActive || (now - subscriber.lastSeen) > threshold)) {
          await this.removeSubscriber(topicId, subscriberId);
          logger.info(`Cleaned up inactive subscriber ${subscriberId} from topic ${topicId}`);
        }
      }
    }
  }

  async getTopicStats(topicId: string): Promise<{ subscriberCount: number; bufferSize: number } | null> {
    const exists = await this.redis.exists(`topic:${topicId}:meta`);
    if (!exists) return null;

    const subscriberCount = await this.redis.sCard(`topic:${topicId}:subscribers`);
    const bufferSize = await this.redis.xLen(`topic:${topicId}:stream`);

    return {
      subscriberCount,
      bufferSize,
    };
  }

  async getAllTopics(): Promise<string[]> {
    const topicKeys = await this.redis.keys('topic:*:meta');
    return topicKeys.map(key => key.replace('topic:', '').replace(':meta', ''));
  }

  async addEventToSubscriberQueue(topicId: string, subscriberId: string, event: Event): Promise<void> {
    const queueKey = `subscriber:${subscriberId}:topic:${topicId}:queue`;
    const maxSize = config.topic.maxSubscriberQueueSize;

    // Add event to queue
    await this.redis.rPush(queueKey, JSON.stringify(event));

    // Maintain queue size limit
    const queueLength = await this.redis.lLen(queueKey);
    if (queueLength > maxSize) {
      // Remove oldest events to maintain size limit
      await this.redis.lTrim(queueKey, queueLength - maxSize, -1);
      logger.warn(`Subscriber ${subscriberId} queue full, dropped oldest events`);
    }

    // Set expiration for queue (1 hour)
    await this.redis.expire(queueKey, 3600);
  }

  async getEventHistory(topicId: string, count: number = 100): Promise<Event[]> {
    const streamKey = `topic:${topicId}:stream`;
    const events = await this.redis.xRevRange(streamKey, '+', '-', { COUNT: count });
    
    return events.map((event) => {
      const eventData: any = {};
      for (let i = 0; i < event.message.length; i += 2) {
        eventData[event.message[i]] = event.message[i + 1];
      }
      
      return {
        id: eventData.id,
        topicId,
        type: eventData.type,
        data: JSON.parse(eventData.data),
        timestamp: parseInt(eventData.timestamp),
        userId: eventData.userId || undefined,
      };
    }).reverse();
  }
}

export const redisTopicManager = new RedisTopicManager();