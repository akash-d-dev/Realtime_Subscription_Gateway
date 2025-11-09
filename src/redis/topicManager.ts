import { RedisClientType } from 'redis';
import { EventEnvelope as Event, Topic, Subscriber, StoredEventData } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { redisConnection } from './connection';

export class RedisTopicManager {
  private redis: RedisClientType | null = null;

  constructor() {
    // Redis client will be initialized when needed
  }

  private getRedis(): RedisClientType {
    if (!this.redis) {
      this.redis = redisConnection.getClient();
      if (!this.redis) {
        throw new Error('Redis client not available');
      }
    }
    return this.redis;
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
    await this.getRedis().hSet(`topic:${topicId}:meta`, {
      id: topicId,
      createdAt: topic.createdAt.toString(),
      lastEventId: '0',
    });

    // Set expiration for topic metadata (24 hours)
    await this.getRedis().expire(`topic:${topicId}:meta`, 86400);

    logger.info(`Created topic: ${topicId}`);
    return topic;
  }

  async getTopic(topicId: string): Promise<Topic | null> {
    const exists = await this.getRedis().exists(`topic:${topicId}:meta`);
    if (!exists) return null;

    const meta = await this.getRedis().hGetAll(`topic:${topicId}:meta`);
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
    const seqKey = `${config.redis.keyPrefix}:seq:${event.tenantId}:${topicId}`;
    const newSeq = await this.getRedis().incr(seqKey);
    event.seq = newSeq;
    if (!event.ts) {
      event.ts = new Date().toISOString();
    }

    // Add event to Redis Stream for persistence and replay
    const streamKey = `${config.redis.keyPrefix}:stream:${event.tenantId}:${topicId}`;
    const eventData = {
      id: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
      seq: event.seq.toString(),
      ts: event.ts,
      userId: event.senderId || '',
    };

    const streamId = await this.getRedis().xAdd(streamKey, '*', eventData);
    
    // Update last event ID in topic metadata
    await this.getRedis().hSet(`${config.redis.keyPrefix}:topic:${event.tenantId}:${topicId}:meta`, 'lastEventId', event.seq.toString());

    // Publish event to Redis Pub/Sub for real-time distribution
    await this.getRedis().publish(`${config.redis.keyPrefix}:pub:${event.tenantId}:${topicId}`, JSON.stringify(event));

    // Maintain stream size (keep last 1000 events)
    await this.getRedis().xTrim(streamKey, 'MAXLEN', 1000);
    // await this.getRedis().xTrim(streamKey, 'MAXLEN', '~', 1000);
    
    logger.debug(`Added event ${event.id} to topic ${topicId} with stream ID ${streamId}`);
  }

  async getSubscriberEvents(tenantId: string, topicId: string, subscriberId: string): Promise<Event[]> {
    const queueKey = `${config.redis.keyPrefix}:sub:${tenantId}:${subscriberId}:topic:${topicId}:queue`;
    
    // Get all events from subscriber's queue
    const events = await this.getRedis().lRange(queueKey, 0, -1);
    
    // Clear the queue after reading
    await this.getRedis().del(queueKey);
    
    // Update last seen timestamp
    await this.getRedis().hSet(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`, 'lastSeen', Date.now().toString());
    
    return events.map((eventStr: string) => JSON.parse(eventStr));
  }

  async addSubscriber(tenantId: string, topicId: string, subscriberId: string, userId?: string): Promise<Subscriber> {
    const subscriber: Subscriber = {
      id: subscriberId,
      topicId,
      userId: userId || '',
      queue: [],
      lastSeen: Date.now(),
      isActive: true,
    };

    // Store subscriber metadata
    await this.getRedis().hSet(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`, {
      id: subscriberId,
      topicId,
      userId: userId || '',
      lastSeen: subscriber.lastSeen.toString(),
      isActive: 'true',
    });

    // Add subscriber to topic's subscriber set
    await this.getRedis().sAdd(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:subscribers`, subscriberId);

    // Set expiration for subscriber metadata (1 hour)
    await this.getRedis().expire(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`, 3600);

    logger.info(`Added subscriber ${subscriberId} to topic ${topicId}`);
    return subscriber;
  }

  async removeSubscriber(tenantId: string, topicId: string, subscriberId: string): Promise<boolean> {
    // Remove from topic's subscriber set
    const removed = await this.getRedis().sRem(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:subscribers`, subscriberId);
    
    if (removed) {
      // Clean up subscriber data
      await this.getRedis().del(`${config.redis.keyPrefix}:sub:${tenantId}:${subscriberId}:topic:${topicId}:queue`);
      await this.getRedis().del(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`);
      logger.info(`Removed subscriber ${subscriberId} from topic ${topicId}`);
    }
    
    return removed > 0;
  }

  async getSubscriber(tenantId: string, topicId: string, subscriberId: string): Promise<Subscriber | null> {
    const exists = await this.getRedis().exists(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`);
    if (!exists) return null;

    const meta = await this.getRedis().hGetAll(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`);
    
    return {
      id: subscriberId,
      topicId,
      userId: meta.userId || '',
      queue: [],
      lastSeen: parseInt(meta.lastSeen || '0'),
      isActive: meta.isActive === 'true',
    };
  }

  async markSubscriberInactive(tenantId: string, topicId: string, subscriberId: string): Promise<void> {
    await this.getRedis().hSet(`${config.redis.keyPrefix}:subscriber:${tenantId}:${subscriberId}:meta`, 'isActive', 'false');
    logger.debug(`Marked subscriber ${subscriberId} as inactive`);
  }

  async cleanupInactiveSubscribers(): Promise<void> {
    try {
      const now = Date.now();
      const threshold = config.topic.slowClientThresholdMs;

      // Get all topics
      const topicKeys = await this.getRedis().keys(`${config.redis.keyPrefix}:topic:*:*:meta`);
    
    for (const topicKey of topicKeys) {
      const tail = topicKey.replace(`${config.redis.keyPrefix}:topic:`, '').replace(':meta', '');
      const parts = tail.split(':');
      if (parts.length < 2) {
        continue;
      }
      const tenantId = parts[0];
      const topicId = parts.slice(1).join(':');
      if (!tenantId || !topicId) {
        continue;
      }
      const subscriberIds = await this.getRedis().sMembers(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:subscribers`);
      
      for (const subscriberId of subscriberIds) {
        const subscriber = await this.getSubscriber(tenantId, topicId, subscriberId);
        if (subscriber && (!subscriber.isActive || (now - subscriber.lastSeen) > threshold)) {
          await this.removeSubscriber(tenantId, topicId, subscriberId);
          logger.info(`Cleaned up inactive subscriber ${subscriberId} from topic ${topicId}`);
        }
      }
    }
    } catch (error) {
      logger.error('Error during cleanup of inactive subscribers:', error);
    }
  }

  async getTopicStats(tenantId: string, topicId: string): Promise<{ subscriberCount: number; bufferSize: number } | null> {
    const exists = await this.getRedis().exists(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:meta`);
    if (!exists) return null;

    const subscriberCount = await this.getRedis().sCard(`${config.redis.keyPrefix}:topic:${tenantId}:${topicId}:subscribers`);
    const bufferSize = await this.getRedis().xLen(`${config.redis.keyPrefix}:stream:${tenantId}:${topicId}`);

    return {
      subscriberCount,
      bufferSize,
    };
  }

  async getAllTopics(): Promise<string[]> {
    const topicKeys = await this.getRedis().keys(`${config.redis.keyPrefix}:topic:*:*:meta`);
    return topicKeys.map(key => key.replace(`${config.redis.keyPrefix}:topic:`, '').replace(':meta', ''));
  }

  async addEventToSubscriberQueue(tenantId: string, topicId: string, subscriberId: string, event: Event): Promise<void> {
    const queueKey = `${config.redis.keyPrefix}:sub:${tenantId}:${subscriberId}:topic:${topicId}:queue`;
    const maxSize = config.topic.maxSubscriberQueueSize;

    // Coalescing for cursor/presence when queue is near limit
    const isCoalescable = event.type === 'cursor' || event.type === 'presence';
    const queueLength = await this.getRedis().lLen(queueKey);
    if (isCoalescable && queueLength >= Math.floor(maxSize * 0.75)) {
      // Remove any older coalescable events and keep latest only
      const items = await this.getRedis().lRange(queueKey, 0, -1);
      const filtered = items.filter((it) => {
        try {
          const parsed = JSON.parse(it);
          return !(parsed.type === event.type && parsed.senderId === event.senderId);
        } catch {
          return true;
        }
      });
      if (filtered.length !== items.length) {
        await this.getRedis().del(queueKey);
        if (filtered.length > 0) {
          await this.getRedis().rPush(queueKey, filtered);
        }
      }
    }

    // Add event to queue
    await this.getRedis().rPush(queueKey, JSON.stringify(event));

    // Maintain queue size limit
    const newLength = await this.getRedis().lLen(queueKey);
    if (newLength > maxSize) {
      // Remove oldest events to maintain size limit
      await this.getRedis().lTrim(queueKey, newLength - maxSize, -1);
      logger.warn(`Subscriber ${subscriberId} queue full, dropped oldest events`);
    }

    // Set expiration for queue (1 hour)
    await this.getRedis().expire(queueKey, 3600);
  }

  async getEventHistory(tenantId: string, topicId: string, count: number = 100): Promise<Event[]> {
    const streamKey = `${config.redis.keyPrefix}:stream:${tenantId}:${topicId}`;
    const events = await this.getRedis().xRevRange(streamKey, '+', '-', { COUNT: count });
    
    return events.map((event) => {
      const eventData = event.message as unknown as StoredEventData;
      
      return {
        id: eventData.id,
        topicId,
        type: eventData.type,
        data: JSON.parse(eventData.data),
        seq: parseInt(eventData.seq),
        ts: eventData.ts,
        tenantId,
        senderId: eventData.userId,
      };
    }).reverse();
  }

  async readFromSeq(tenantId: string, topicId: string, fromSeq: number, max = 1000): Promise<Event[]> {
    const streamKey = `${config.redis.keyPrefix}:stream:${tenantId}:${topicId}`;
    // XREAD RANGE from (seq) to '+' by converting seq to an id with *heuristic*
    // We stored fields with seq, so we scan and filter by seq >= fromSeq
    const entries = await this.getRedis().xRange(streamKey, '-', '+', { COUNT: max });
    const result: Event[] = [];
    for (const entry of entries) {
      const data = entry.message as unknown as StoredEventData;
      const seq = parseInt(data.seq);
      if (Number.isFinite(seq) && seq >= fromSeq) {
        result.push({
          id: data.id,
          topicId,
          type: data.type,
          data: JSON.parse(data.data),
          seq,
          ts: data.ts,
          tenantId,
          senderId: data.userId,
        });
      }
    }
    return result;
  }
}

export const redisTopicManager = new RedisTopicManager();