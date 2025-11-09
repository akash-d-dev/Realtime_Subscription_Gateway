// Mock Redis connection first
const mockRedis = {
  eval: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  zRemRangeByScore: jest.fn(),
  zCard: jest.fn(),
};

jest.mock('../src/redis/connection', () => ({
  redisConnection: {
    getClient: () => mockRedis,
  }
}));

import { RateLimiter } from '../src/redis/rateLimiter';

describe('Rate Limiter Security Tests', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
    jest.clearAllMocks();
  });

  describe('Redis Success Scenarios', () => {
    test('should allow requests under limit', async () => {
      mockRedis.eval.mockResolvedValue(['1', '9', '1234567890', '10']);

      const result = await rateLimiter.checkRateLimit('test-key', 10, 60000);

      expect(result).toEqual({
        allowed: true,
        remaining: 9,
        resetTime: 1234567890,
        limit: 10,
      });
    });

    test('should block requests over limit', async () => {
      mockRedis.eval.mockResolvedValue(['0', '0', '1234567890', '10']);

      const result = await rateLimiter.checkRateLimit('test-key', 10, 60000);

      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        resetTime: 1234567890,
        limit: 10,
      });
    });
  });

  describe('Redis Failure Scenarios (Fail-Closed Security)', () => {
    test('should use fallback limiter when Redis fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      const result = await rateLimiter.checkRateLimit('test-key', 10, 60000);

      // Should use fallback with 10% of original limit (1 request)
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1); // 10% of 10
    });

    test('should be more restrictive in fallback mode', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis unavailable'));

      // Fill up fallback limit (10% of 100 = 10 requests)
      const results = [];
      for (let i = 0; i < 15; i++) {
        const result = await rateLimiter.checkRateLimit('test-key', 100, 60000);
        results.push(result);
      }

      // First 10 should be allowed (10% of 100)
      expect(results.slice(0, 10).every(r => r.allowed)).toBe(true);

      // Remaining should be blocked
      expect(results.slice(10).every(r => !r.allowed)).toBe(true);
    });

    test('should clean up fallback entries over time', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis unavailable'));

      // Create multiple entries
      await rateLimiter.checkRateLimit('key1', 10, 60000);
      await rateLimiter.checkRateLimit('key2', 10, 60000);
      await rateLimiter.checkRateLimit('key3', 10, 60000);

      // Access the private fallbackLimits map for testing
      const fallbackLimits = (rateLimiter as any).fallbackLimits;
      expect(fallbackLimits.size).toBe(3);

      // Simulate time passing by setting old reset times
      for (const entry of fallbackLimits.values()) {
        entry.resetTime = Date.now() - 400000; // 400 seconds ago
      }

      // Trigger cleanup by making another request
      await rateLimiter.checkRateLimit('new-key', 10, 60000);

      // Old entries should be cleaned up
      expect(fallbackLimits.has('new-key')).toBe(true);
      expect(fallbackLimits.size).toBe(1);
    });

    test('should enforce different rates for different limit types', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis unavailable'));

      // User rate limit (fallback: 10% of 100 = 10)
      const userResult = await rateLimiter.checkUserRateLimit('user123', 'publish');
      expect(userResult.limit).toBe(10);

      // Topic rate limit (fallback: 10% of 1000 = 100)
      const topicResult = await rateLimiter.checkTopicRateLimit('default', 'topic1');
      expect(topicResult.limit).toBe(100);

      // Global rate limit (fallback: 10% of 10000 = 1000)
      const globalResult = await rateLimiter.checkGlobalRateLimit();
      expect(globalResult.limit).toBe(1000);
    });
  });

  describe('Rate Limit Key Security', () => {
    test('should use proper key prefixes', async () => {
      mockRedis.eval.mockResolvedValue(['1', '9', '1234567890', '10']);

      await rateLimiter.checkUserRateLimit('user123', 'publish');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ['rate_limit:user:user123:publish']
        })
      );

      await rateLimiter.checkTopicRateLimit('tenant1', 'topic123');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ['rt:rl:tenant1:topic123']
        })
      );

      await rateLimiter.checkGlobalRateLimit();
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ['rate_limit:global']
        })
      );
    });

    test('should handle malformed keys safely in fallback', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      // Test with potentially problematic characters
      const maliciousKey = 'user\x00<script>alert()</script>';
      const result = await rateLimiter.checkUserRateLimit(maliciousKey, 'publish');

      expect(result.allowed).toBeDefined();
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('Lua Script Security', () => {
    test('should use Lua script for atomic operations', async () => {
      mockRedis.eval.mockResolvedValue(['1', '9', '1234567890', '10']);

      await rateLimiter.checkRateLimit('test-key', 10, 60000);

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('ZREMRANGEBYSCORE'), // Should use Redis sorted sets
        expect.objectContaining({
          keys: ['test-key'],
          arguments: ['10', '60', expect.any(String)]
        })
      );
    });
  });
});