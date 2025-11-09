import { firebaseAuth } from '../src/gateway/auth';

describe('Firebase Auth Security Tests', () => {
  describe('Production Environment Safety', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAuthDisabled = process.env.FIREBASE_AUTH_DISABLED;

    beforeEach(() => {
      // Reset modules to test fresh imports
      jest.resetModules();
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.FIREBASE_AUTH_DISABLED = originalAuthDisabled;
    });

    test('should throw error when auth disabled in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIREBASE_AUTH_DISABLED = 'true';

      // Expect constructor to throw error
      expect(() => {
        const { firebaseAuth: prodAuth } = require('../src/gateway/auth');
      }).toThrow('SECURITY ERROR: Firebase Auth cannot be disabled in production environment');
    });

    test('should allow auth disabled in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.FIREBASE_AUTH_DISABLED = 'true';

      expect(() => {
        const { firebaseAuth: devAuth } = require('../src/gateway/auth');
      }).not.toThrow();
    });

    test('should allow auth disabled in test', () => {
      process.env.NODE_ENV = 'test';
      process.env.FIREBASE_AUTH_DISABLED = 'true';

      expect(() => {
        const { firebaseAuth: testAuth } = require('../src/gateway/auth');
      }).not.toThrow();
    });
  });

  describe('Development Mode Authentication', () => {
    test('should return development user context when auth is disabled', async () => {
      const result = await firebaseAuth.verifyToken('any-token');

      expect(result).toBeDefined();
      expect(result?.email).toContain('development@localhost.dev');
      expect(result?.userId).toMatch(/^dev-user-test-\d{6}$/);
      expect(result?.tenantId).toBe('test-tenant');
      expect(result?.permissions).toEqual(['read', 'write']);
    });

    test('should allow all topic access in development mode', async () => {
      const hasAccess = await firebaseAuth.checkTopicAccess('any-user', 'any-topic');
      expect(hasAccess).toBe(true);
    });

    test('should return development context for session cookies', async () => {
      const result = await firebaseAuth.verifySessionCookie('any-session-cookie');

      expect(result).toBeDefined();
      expect(result?.email).toContain('development@localhost.dev');
      expect(result?.userId).toMatch(/^dev-user-test-\d{6}$/);
    });
  });
});