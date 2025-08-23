import { RedisClientType } from 'redis';
import { config } from '../config';
import { redisConnection } from './connection';
import { logger } from '../utils/logger';

export class PresenceManager {
  private redis: RedisClientType;
  private readonly ttlSeconds = 30; // heartbeat TTL

  constructor() {
    this.redis = redisConnection.getClient()!;
  }

  private key(tenantId: string, topicId: string): string {
    return `${config.redis.keyPrefix}:presence:${tenantId}:${topicId}`;
  }

  async join(tenantId: string, topicId: string, userId: string): Promise<void> {
    try {
      const k = this.key(tenantId, topicId);
      await this.redis.hSet(k, userId, Date.now().toString());
      await this.redis.expire(k, this.ttlSeconds);
    } catch (e) {
      logger.error('Presence join failed:', e);
    }
  }

  async heartbeat(tenantId: string, topicId: string, userId: string): Promise<void> {
    try {
      const k = this.key(tenantId, topicId);
      await this.redis.hSet(k, userId, Date.now().toString());
      await this.redis.expire(k, this.ttlSeconds);
    } catch (e) {
      logger.error('Presence heartbeat failed:', e);
    }
  }

  async leave(tenantId: string, topicId: string, userId: string): Promise<void> {
    try {
      const k = this.key(tenantId, topicId);
      await this.redis.hDel(k, userId);
    } catch (e) {
      logger.error('Presence leave failed:', e);
    }
  }

  async list(tenantId: string, topicId: string): Promise<string[]> {
    try {
      const k = this.key(tenantId, topicId);
      const members = await this.redis.hKeys(k);
      return members;
    } catch (e) {
      logger.error('Presence list failed:', e);
      return [];
    }
  }
}

export const presenceManager = new PresenceManager();
