import { RedisClientType } from 'redis';
import { EventEnvelope as Event, Topic, Subscriber, StoredEventData } from '../types';
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
    // Assign sequence (monotonic per topic)
    const seqKey = `${config.redis.keyPrefix}:seq:${topicId}`;
    const newSeq = await this.redis.incr(seqKey);
    event.seq = newSeq;
    if (!event.ts) {
      event.ts = new Date().toISOString();
    }

    // Add event to Redis Stream for persistence and replay
    const streamKey = `${config.redis.keyPrefix}:stream:${topicId}`;
    const eventData = {
      id: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
      seq: event.seq.toString(),
      ts: event.ts,
      userId: event.senderId || '',
    };

    const streamId = await this.redis.xAdd(streamKey, '*', eventData);
    
    // Update last event ID in topic metadata
    await this.redis.hSet(`${config.redis.keyPrefix}:topic:${topicId}:meta`, 'lastEventId', event.seq.toString());

    // Publish event to Redis Pub/Sub for real-time distribution
    await this.redis.publish(`${config.redis.keyPrefix}:pub:${topicId}`, JSON.stringify(event));

    // Maintain stream size (keep last 1000 events)
    await this.redis.xTrim(streamKey, 'MAXLEN', 1000);
    // await this.redis.xTrim(streamKey, 'MAXLEN', '~', 1000);
    
    logger.debug(`Added event ${event.id} to topic ${topicId} with stream ID ${streamId}`);
  }

  async getSubscriberEvents(topicId: string, subscriberId: string): Promise<Event[]> {
    const queueKey = `${config.redis.keyPrefix}:sub:${subscriberId}:topic:${topicId}:queue`;
    
    // Get all events from subscriber's queue
    const events = await this.redis.lRange(queueKey, 0, -1);
    
    // Clear the queue after reading
    await this.redis.del(queueKey);
    
    // Update last seen timestamp
    await this.redis.hSet(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`, 'lastSeen', Date.now().toString());
    
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
    await this.redis.hSet(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`, {
      id: subscriberId,
      topicId,
      userId: userId || '',
      lastSeen: subscriber.lastSeen.toString(),
      isActive: 'true',
    });

    // Add subscriber to topic's subscriber set
    await this.redis.sAdd(`${config.redis.keyPrefix}:topic:${topicId}:subscribers`, subscriberId);

    // Set expiration for subscriber metadata (1 hour)
    await this.redis.expire(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`, 3600);

    logger.info(`Added subscriber ${subscriberId} to topic ${topicId}`);
    return subscriber;
  }

  async removeSubscriber(topicId: string, subscriberId: string): Promise<boolean> {
    // Remove from topic's subscriber set
    const removed = await this.redis.sRem(`${config.redis.keyPrefix}:topic:${topicId}:subscribers`, subscriberId);
    
    if (removed) {
      // Clean up subscriber data
      await this.redis.del(`${config.redis.keyPrefix}:sub:${subscriberId}:topic:${topicId}:queue`);
      await this.redis.del(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`);
      logger.info(`Removed subscriber ${subscriberId} from topic ${topicId}`);
    }
    
    return removed > 0;
  }

  async getSubscriber(topicId: string, subscriberId: string): Promise<Subscriber | null> {
    const exists = await this.redis.exists(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`);
    if (!exists) return null;

    const meta = await this.redis.hGetAll(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`);
    
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
    await this.redis.hSet(`${config.redis.keyPrefix}:subscriber:${subscriberId}:meta`, 'isActive', 'false');
    logger.debug(`Marked subscriber ${subscriberId} as inactive`);
  }

  async cleanupInactiveSubscribers(): Promise<void> {
    const now = Date.now();
    const threshold = config.topic.slowClientThresholdMs;

    // Get all topics
    const topicKeys = await this.redis.keys(`${config.redis.keyPrefix}:topic:*:meta`);
    
    for (const topicKey of topicKeys) {
      const topicId = topicKey.replace(`${config.redis.keyPrefix}:topic:`, '').replace(':meta', '');
      const subscriberIds = await this.redis.sMembers(`${config.redis.keyPrefix}:topic:${topicId}:subscribers`);
      
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
    const exists = await this.redis.exists(`${config.redis.keyPrefix}:topic:${topicId}:meta`);
    if (!exists) return null;

    const subscriberCount = await this.redis.sCard(`${config.redis.keyPrefix}:topic:${topicId}:subscribers`);
    const bufferSize = await this.redis.xLen(`${config.redis.keyPrefix}:stream:${topicId}`);

    return {
      subscriberCount,
      bufferSize,
    };
  }

  async getAllTopics(): Promise<string[]> {
    const topicKeys = await this.redis.keys(`${config.redis.keyPrefix}:topic:*:meta`);
    return topicKeys.map(key => key.replace(`${config.redis.keyPrefix}:topic:`, '').replace(':meta', ''));
  }

  async addEventToSubscriberQueue(topicId: string, subscriberId: string, event: Event): Promise<void> {
    const queueKey = `${config.redis.keyPrefix}:sub:${subscriberId}:topic:${topicId}:queue`;
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
    const streamKey = `${config.redis.keyPrefix}:stream:${topicId}`;
    const events = await this.redis.xRevRange(streamKey, '+', '-', { COUNT: count });
    
    return events.map((event) => {
      const eventData = event.message as unknown as StoredEventData;
      
      return {
        id: eventData.id,
        topicId,
        type: eventData.type,
        data: JSON.parse(eventData.data),
        seq: parseInt(eventData.seq),
        ts: eventData.ts,
        tenantId: 'default',
        senderId: eventData.userId,
      };
    }).reverse();
  }
}

export const redisTopicManager = new RedisTopicManager();