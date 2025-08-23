import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { redisConnection } from '../redis/connection';
import { config } from '../config';

export interface TopicAccess {
  topicId: string;
  allowedUsers: string[];
  allowedRoles: string[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export class TopicAccessControl {
  private firestore: Firestore;
  private cacheTtlSeconds = 30;
  private cachePrefix = `${config.redis.keyPrefix}:acl:`;

  constructor() {
    this.firestore = getFirestore();
  }

  async checkTopicAccess(userId: string, topicId: string): Promise<boolean> {
    try {
      const redis = redisConnection.getClient();
      if (redis) {
        const cached = await redis.get(`${this.cachePrefix}${topicId}:${userId}`);
        if (cached !== null) {
          return cached === '1';
        }
      }

      const topicDoc = await this.firestore.collection('topics').doc(topicId).get();
      
      if (!topicDoc.exists) {
        // Topic doesn't exist, create it with default access (public)
        await this.createTopic(topicId, {
          topicId,
          allowedUsers: [],
          allowedRoles: [],
          isPublic: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (redis) {
          await redis.setEx(`${this.cachePrefix}${topicId}:${userId}`, this.cacheTtlSeconds, '1');
        }
        return true;
      }

      const topicAccess = topicDoc.data() as TopicAccess;
      
      // If topic is public, allow access
      if (topicAccess.isPublic) {
        if (redis) {
          await redis.setEx(`${this.cachePrefix}${topicId}:${userId}`, this.cacheTtlSeconds, '1');
        }
        return true;
      }

      // Check if user is explicitly allowed
      if (topicAccess.allowedUsers.includes(userId)) {
        if (redis) {
          await redis.setEx(`${this.cachePrefix}${topicId}:${userId}`, this.cacheTtlSeconds, '1');
        }
        return true;
      }

      // TODO: Check user roles against allowedRoles
      // This would require fetching user roles from Firebase Auth or a separate collection

      if (redis) {
        await redis.setEx(`${this.cachePrefix}${topicId}:${userId}`, this.cacheTtlSeconds, '0');
      }
      return false;
    } catch (error) {
      logger.error(`Error checking topic access for user ${userId} on topic ${topicId}:`, error);
      // Default to allowing access if there's an error (fail open for development)
      return true;
    }
  }

  async createTopic(topicId: string, access: TopicAccess): Promise<void> {
    try {
      await this.firestore.collection('topics').doc(topicId).set(access);
      logger.info(`Created topic access control for ${topicId}`);
    } catch (error) {
      logger.error(`Error creating topic access control for ${topicId}:`, error);
      throw error;
    }
  }

  async updateTopicAccess(topicId: string, access: Partial<TopicAccess>): Promise<void> {
    try {
      await this.firestore.collection('topics').doc(topicId).update({
        ...access,
        updatedAt: Date.now(),
      });
      logger.info(`Updated topic access control for ${topicId}`);
    } catch (error) {
      logger.error(`Error updating topic access control for ${topicId}:`, error);
      throw error;
    }
  }

  async deleteTopic(topicId: string): Promise<void> {
    try {
      await this.firestore.collection('topics').doc(topicId).delete();
      logger.info(`Deleted topic access control for ${topicId}`);
    } catch (error) {
      logger.error(`Error deleting topic access control for ${topicId}:`, error);
      throw error;
    }
  }

  async getTopicAccess(topicId: string): Promise<TopicAccess | null> {
    try {
      const doc = await this.firestore.collection('topics').doc(topicId).get();
      if (!doc.exists) return null;
      return doc.data() as TopicAccess;
    } catch (error) {
      logger.error(`Error getting topic access for ${topicId}:`, error);
      return null;
    }
  }

  async addUserToTopic(topicId: string, userId: string): Promise<void> {
    try {
      await this.firestore.collection('topics').doc(topicId).update({
        allowedUsers: FieldValue.arrayUnion(userId),
        updatedAt: Date.now(),
      });
      logger.info(`Added user ${userId} to topic ${topicId}`);
    } catch (error) {
      logger.error(`Error adding user ${userId} to topic ${topicId}:`, error);
      throw error;
    }
  }

  async removeUserFromTopic(topicId: string, userId: string): Promise<void> {
    try {
      await this.firestore.collection('topics').doc(topicId).update({
        allowedUsers: FieldValue.arrayRemove(userId),
        updatedAt: Date.now(),
      });
      logger.info(`Removed user ${userId} from topic ${topicId}`);
    } catch (error) {
      logger.error(`Error removing user ${userId} from topic ${topicId}:`, error);
      throw error;
    }
  }
}

export const topicAccessControl = new TopicAccessControl();