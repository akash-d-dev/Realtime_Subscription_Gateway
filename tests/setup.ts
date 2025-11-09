// Test setup file
import { config } from '../src/config';

// Mock environment for tests
process.env.NODE_ENV = 'test';
process.env.FIREBASE_AUTH_DISABLED = 'true';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock Redis client for tests that don't need real Redis
jest.mock('../src/redis/connection', () => ({
  redisConnection: {
    getClient: () => null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    isClientConnected: () => false,
  }
}));

// Global test timeout
jest.setTimeout(10000);