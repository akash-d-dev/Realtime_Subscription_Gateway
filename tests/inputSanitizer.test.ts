import {
  sanitizeString,
  sanitizeObject,
  validateTopicId,
  validateUserId,
  validateAndSanitizePublishInput,
  checkInputRateLimit
} from '../src/utils/inputSanitizer';

describe('Input Sanitization Security Tests', () => {
  describe('String Sanitization', () => {
    test('should remove null bytes and control characters', () => {
      const maliciousInput = 'hello\x00world\x01test\x7f';
      const result = sanitizeString(maliciousInput);
      expect(result).toBe('helloworldtest');
    });

    test('should remove script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello';
      const result = sanitizeString(maliciousInput);
      expect(result).toBe('Hello');
    });

    test('should remove javascript: urls', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const result = sanitizeString(maliciousInput);
      expect(result).toBe('');
    });

    test('should handle non-string input safely', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
      expect(sanitizeString(123 as any)).toBe('');
    });
  });

  describe('Object Sanitization', () => {
    test('should sanitize nested object properties', () => {
      const maliciousObj = {
        'normal<script>': 'value',
        nested: {
          'key\x00': 'clean\x01value',
          array: ['item1\x00', '<script>alert()</script>']
        }
      };

      const result = sanitizeObject(maliciousObj);
      expect(result).toEqual({
        normal: 'value',
        nested: {
          key: 'cleanvalue',
          array: ['item1', '']
        }
      });
    });

    test('should handle circular references safely', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      // Should not throw error
      const result = sanitizeObject(obj);
      expect(result.name).toBe('test');
    });
  });

  describe('Topic ID Validation', () => {
    test('should accept valid topic IDs', () => {
      const validIds = ['doc:123', 'chat-room-1', 'project_updates', 'user.notifications'];

      for (const id of validIds) {
        const result = validateTopicId(id);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedData).toBe(id);
      }
    });

    test('should reject invalid characters', () => {
      const invalidIds = ['topic with spaces', 'topic<script>', 'topic&amp;', 'topic\x00'];

      for (const id of invalidIds) {
        const result = validateTopicId(id);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    test('should reject overly long topic IDs', () => {
      const longId = 'a'.repeat(201);
      const result = validateTopicId(longId);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('200 characters');
    });
  });

  describe('Publish Input Validation', () => {
    test('should validate and sanitize valid publish input', () => {
      const input = {
        topicId: 'chat:room1',
        type: 'message',
        data: { message: 'Hello world', userId: 'user123' },
        priority: 5
      };

      const result = validateAndSanitizePublishInput(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedData).toEqual(input);
    });

    test('should sanitize malicious data payload', () => {
      const input = {
        topicId: 'chat:room1',
        type: 'message',
        data: {
          message: '<script>alert("xss")</script>Clean message',
          'malicious<key>': 'value\x00',
          nested: {
            'clean': 'value',
            'script<tag>': 'javascript:alert()'
          }
        }
      };

      const result = validateAndSanitizePublishInput(input);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedData?.data.message).toBe('Clean message');
      expect(result.sanitizedData?.data['malicious']).toBe('value');
      expect(result.sanitizedData?.data.nested.script).toBe('');
    });

    test('should reject oversized payloads', () => {
      const largeData = { message: 'x'.repeat(70000) }; // > 64KB
      const input = {
        topicId: 'chat:room1',
        type: 'message',
        data: largeData
      };

      const result = validateAndSanitizePublishInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('64KB');
    });

    test('should enforce maximum object properties limit', () => {
      const data: any = {};
      for (let i = 0; i < 51; i++) {
        data[`key${i}`] = `value${i}`;
      }

      const input = {
        topicId: 'chat:room1',
        type: 'message',
        data
      };

      const result = validateAndSanitizePublishInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('50');
    });
  });

  describe('Input Rate Limiting', () => {
    beforeEach(() => {
      // Clear rate limit state
      const rateLimiter = require('../src/utils/inputSanitizer');
      rateLimiter.recentInputs?.clear?.();
    });

    test('should allow requests under rate limit', () => {
      const identifier = 'test-user';

      for (let i = 0; i < 5; i++) {
        const allowed = checkInputRateLimit(identifier, 60000, 10);
        expect(allowed).toBe(true);
      }
    });

    test('should block requests over rate limit', () => {
      const identifier = 'test-user-2';

      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        checkInputRateLimit(identifier, 60000, 10);
      }

      // Next request should be blocked
      const blocked = checkInputRateLimit(identifier, 60000, 10);
      expect(blocked).toBe(false);
    });

    test('should reset after time window', () => {
      const identifier = 'test-user-3';

      // Fill up the rate limit
      for (let i = 0; i < 5; i++) {
        checkInputRateLimit(identifier, 100, 5); // 100ms window
      }

      // Wait for window to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const allowed = checkInputRateLimit(identifier, 100, 5);
          expect(allowed).toBe(true);
          resolve();
        }, 150);
      });
    });
  });
});