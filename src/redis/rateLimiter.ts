import { RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { redisConnection } from './connection';
import { config } from '../config';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

export class RateLimiter {
  private redis: RedisClientType;
  private readonly rateLimitScript: string;

  // In-memory fallback for when Redis is unavailable
  private fallbackLimits: Map<string, { requests: number[]; resetTime: number }> = new Map();

  constructor() {
    this.redis = redisConnection.getClient()!;
    
    // Lua script for token bucket rate limiting
    this.rateLimitScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = tonumber(ARGV[3])
      
      local current_time = redis.call('TIME')[1]
      local window_start = current_time - window
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count current requests in window
      local request_count = redis.call('ZCARD', key)
      
      if request_count >= limit then
        -- Rate limit exceeded
        local oldest_request = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
        local reset_time = oldest_request + window
        
        return {
          '0', -- allowed
          '0', -- remaining
          tostring(reset_time), -- reset time
          tostring(limit) -- limit
        }
      else
        -- Add current request
        redis.call('ZADD', key, current_time, current)
        redis.call('EXPIRE', key, window)
        
        return {
          '1', -- allowed
          tostring(limit - request_count - 1), -- remaining
          tostring(current_time + window), -- reset time
          tostring(limit) -- limit
        }
      end
    `;
  }

  async checkRateLimit(
    key: string, 
    limit: number, 
    windowMs: number
  ): Promise<RateLimitResult> {
    try {
      const current = Date.now();
      const window = Math.floor(windowMs / 1000); // Convert to seconds
      
      const result = await this.redis.eval(
        this.rateLimitScript,
        {
          keys: [key],
          arguments: [limit.toString(), window.toString(), current.toString()]
        }
      ) as string[];

      return {
        allowed: result[0] === '1',
        remaining: parseInt(result[1] || '0'),
        resetTime: parseInt(result[2] || '0'),
        limit: parseInt(result[3] || '0'),
      };
    } catch (error) {
      logger.error(`Rate limit check failed for key ${key}, falling back to in-memory limiter:`, error);

      // Fail-closed: Use in-memory rate limiter as fallback
      return this.fallbackRateLimit(key, limit, windowMs);
    }
  }

  /**
   * In-memory fallback rate limiter for when Redis is unavailable
   * More restrictive than Redis version for security
   */
  private fallbackRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create rate limit entry
    let entry = this.fallbackLimits.get(key);
    if (!entry) {
      entry = { requests: [], resetTime: now + windowMs };
      this.fallbackLimits.set(key, entry);
    }

    // Clean up old requests outside the window
    entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

    // Apply more restrictive limits in fallback mode for security
    const fallbackLimit = Math.floor(limit * 0.1); // 10% of normal limit
    const isAllowed = entry.requests.length < fallbackLimit;

    if (isAllowed) {
      entry.requests.push(now);
    }

    // Update reset time
    if (entry.requests.length > 0) {
      entry.resetTime = Math.max(entry.resetTime, now + windowMs);
    }

    // Clean up old entries periodically
    this.cleanupFallbackLimits();

    logger.warn(`Using fallback rate limiter for key ${key}: ${entry.requests.length}/${fallbackLimit} requests`);

    return {
      allowed: isAllowed,
      remaining: Math.max(0, fallbackLimit - entry.requests.length),
      resetTime: entry.resetTime,
      limit: fallbackLimit,
    };
  }

  /**
   * Clean up expired fallback rate limit entries
   */
  private cleanupFallbackLimits(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.fallbackLimits.entries()) {
      // Remove entries older than 5 minutes
      if (entry.resetTime < now - 300000) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.fallbackLimits.delete(key);
    }
  }

  async checkUserRateLimit(userId: string, action: string): Promise<RateLimitResult> {
    const key = `rate_limit:user:${userId}:${action}`;
    return this.checkRateLimit(key, 100, 60000); // 100 requests per minute per user per action
  }

  async checkTopicRateLimit(tenantId: string, topicId: string): Promise<RateLimitResult> {
    const key = `${config.redis.keyPrefix}:rl:${tenantId}:${topicId}`;
    return this.checkRateLimit(key, 1000, 60000); // 1000 events per minute per topic
  }

  async checkGlobalRateLimit(): Promise<RateLimitResult> {
    const key = 'rate_limit:global';
    return this.checkRateLimit(key, 10000, 60000); // 10000 requests per minute globally
  }

  async resetRateLimit(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.debug(`Reset rate limit for key: ${key}`);
    } catch (error) {
      logger.error(`Failed to reset rate limit for key ${key}:`, error);
    }
  }

  async getRateLimitInfo(key: string): Promise<RateLimitResult | null> {
    try {
      const exists = await this.redis.exists(key);
      if (!exists) return null;

      const current = Date.now();
      const window = 60; // 60 seconds window
      const windowStart = Math.floor(current / 1000) - window;
      
      // Remove expired entries
      await this.redis.zRemRangeByScore(key, 0, windowStart);
      
      // Count current requests
      const requestCount = await this.redis.zCard(key);
      const limit = 100; // Default limit
      
      return {
        allowed: requestCount < limit,
        remaining: Math.max(0, limit - requestCount),
        resetTime: current + (window * 1000),
        limit,
      };
    } catch (error) {
      logger.error(`Failed to get rate limit info for key ${key}:`, error);
      return null;
    }
  }
}

export const rateLimiter = new RateLimiter();