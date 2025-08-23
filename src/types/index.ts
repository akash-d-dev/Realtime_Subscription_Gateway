export interface EventEnvelope {
  id: string;
  topicId: string;
  type: string; // e.g., op | cursor | presence | metric | status | custom:*
  data: Record<string, any>;
  // Standardized envelope fields assigned/validated by gateway
  seq: number; // monotonic per {tenantId, topicId}
  ts: string; // ISO timestamp
  tenantId: string; // tenancy namespace
  senderId: string; // from auth
  priority?: number; // higher is sooner
}

export interface Subscriber {
  id: string;
  topicId: string;
  userId?: string;
  queue: EventEnvelope[];
  lastSeen: number;
  isActive: boolean;
}

export interface Topic {
  id: string;
  buffer: EventEnvelope[];
  subscribers: Map<string, Subscriber>;
  lastEventId: number;
  createdAt: number;
}

export interface AuthContext {
  userId: string;
  email?: string;
  permissions: string[];
  tenantId: string;
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
  priority?: number;
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
  seq: string;
  ts: string;
  userId: string;
} 

// Backwards compatibility alias for legacy imports
export type Event = EventEnvelope;