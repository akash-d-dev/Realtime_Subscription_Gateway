export interface Event {
  id: string;
  topicId: string;
  type: string;
  data: Record<string, any>;
  timestamp: number;
  userId?: string;
}

export interface Subscriber {
  id: string;
  topicId: string;
  userId?: string;
  queue: Event[];
  lastSeen: number;
  isActive: boolean;
}

export interface Topic {
  id: string;
  buffer: Event[];
  subscribers: Map<string, Subscriber>;
  lastEventId: number;
  createdAt: number;
}

export interface AuthContext {
  userId: string;
  email?: string;
  permissions: string[];
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

export interface PublishEventInput {
  topicId: string;
  type: string;
  data: Record<string, any>;
}

export interface SubscriptionContext {
  topicId: string;
  userId?: string;
  connectionId: string;
}

export interface StoredEventData {
  id: string;
  type: string;
  data: string;
  timestamp: string;
  userId: string;
} 