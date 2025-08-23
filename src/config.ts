import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  server: {
    port: number;
    nodeEnv: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password: string;
  };
  firebase: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  topic: {
    maxBufferSize: number;
    maxSubscriberQueueSize: number;
    slowClientThresholdMs: number;
  };
  logging: {
    level: string;
  };
}

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  topic: {
    maxBufferSize: parseInt(process.env.MAX_TOPIC_BUFFER_SIZE || '1000', 10),
    maxSubscriberQueueSize: parseInt(process.env.MAX_SUBSCRIBER_QUEUE_SIZE || '100', 10),
    slowClientThresholdMs: parseInt(process.env.SLOW_CLIENT_THRESHOLD_MS || '5000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
}; 