import { Event, Topic, Subscriber } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TopicManager {
  private topics = new Map<string, Topic>();

  createTopic(topicId: string): Topic {
    const topic: Topic = {
      id: topicId,
      buffer: [],
      subscribers: new Map(),
      lastEventId: 0,
      createdAt: Date.now(),
    };

    this.topics.set(topicId, topic);
    logger.info(`Created topic: ${topicId}`);
    return topic;
  }

  getTopic(topicId: string): Topic | undefined {
    return this.topics.get(topicId);
  }

  getOrCreateTopic(topicId: string): Topic {
    let topic = this.getTopic(topicId);
    if (!topic) {
      topic = this.createTopic(topicId);
    }
    return topic;
  }

  addEvent(topicId: string, event: Event): void {
    const topic = this.getOrCreateTopic(topicId);
    
    // Add event to buffer
    topic.buffer.push(event);
    
    // Maintain buffer size limit
    if (topic.buffer.length > config.topic.maxBufferSize) {
      topic.buffer.shift();
    }

    // Distribute to all subscribers
    this.distributeEvent(topic, event);
    
    logger.debug(`Added event ${event.id} to topic ${topicId}`);
  }

  private distributeEvent(topic: Topic, event: Event): void {
    for (const subscriber of topic.subscribers.values()) {
      if (subscriber.isActive && subscriber.queue.length < config.topic.maxSubscriberQueueSize) {
        subscriber.queue.push(event);
        subscriber.lastSeen = Date.now();
      } else if (subscriber.queue.length >= config.topic.maxSubscriberQueueSize) {
        // Handle slow client - drop oldest event and add new one
        subscriber.queue.shift();
        subscriber.queue.push(event);
        subscriber.lastSeen = Date.now();
        logger.warn(`Slow client detected for subscriber ${subscriber.id}, dropped oldest event`);
      }
    }
  }

  addSubscriber(topicId: string, subscriberId: string, userId?: string): Subscriber {
    const topic = this.getOrCreateTopic(topicId);
    
    const subscriber: Subscriber = {
      id: subscriberId,
      topicId,
      userId: userId || '',
      queue: [],
      lastSeen: Date.now(),
      isActive: true,
    };

    topic.subscribers.set(subscriberId, subscriber);
    logger.info(`Added subscriber ${subscriberId} to topic ${topicId}`);
    return subscriber;
  }

  removeSubscriber(topicId: string, subscriberId: string): boolean {
    const topic = this.getTopic(topicId);
    if (!topic) return false;

    const removed = topic.subscribers.delete(subscriberId);
    if (removed) {
      logger.info(`Removed subscriber ${subscriberId} from topic ${topicId}`);
    }
    return removed;
  }

  getSubscriber(topicId: string, subscriberId: string): Subscriber | undefined {
    const topic = this.getTopic(topicId);
    return topic?.subscribers.get(subscriberId);
  }

  getSubscriberEvents(topicId: string, subscriberId: string): Event[] {
    const subscriber = this.getSubscriber(topicId, subscriberId);
    if (!subscriber) return [];

    const events = [...subscriber.queue];
    subscriber.queue = [];
    subscriber.lastSeen = Date.now();
    
    return events;
  }

  markSubscriberInactive(topicId: string, subscriberId: string): void {
    const subscriber = this.getSubscriber(topicId, subscriberId);
    if (subscriber) {
      subscriber.isActive = false;
      logger.debug(`Marked subscriber ${subscriberId} as inactive`);
    }
  }

  cleanupInactiveSubscribers(): void {
    const now = Date.now();
    const threshold = config.topic.slowClientThresholdMs;

    for (const [topicId, topic] of this.topics.entries()) {
      for (const [subscriberId, subscriber] of topic.subscribers.entries()) {
        if (!subscriber.isActive || (now - subscriber.lastSeen) > threshold) {
          topic.subscribers.delete(subscriberId);
          logger.info(`Cleaned up inactive subscriber ${subscriberId} from topic ${topicId}`);
        }
      }
    }
  }

  getTopicStats(topicId: string): { subscriberCount: number; bufferSize: number } | null {
    const topic = this.getTopic(topicId);
    if (!topic) return null;

    return {
      subscriberCount: topic.subscribers.size,
      bufferSize: topic.buffer.length,
    };
  }

  getAllTopics(): string[] {
    return Array.from(this.topics.keys());
  }
}

export const topicManager = new TopicManager(); 