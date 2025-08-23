import { topicManager } from '../src/gateway/topicManager';
import { logger } from '../src/utils/logger';

async function seedTopics(): Promise<void> {
  try {
    logger.info('Starting topic seeding...');

    // Create some sample topics
    const sampleTopics = [
      'document-edits',
      'user-presence',
      'chat-messages',
      'notifications',
      'system-events',
    ];

    for (const topicId of sampleTopics) {
      topicManager.createTopic(topicId);
      logger.info(`Created topic: ${topicId}`);
    }

    logger.info('Topic seeding completed successfully');
    logger.info('Available topics:', topicManager.getAllTopics());
  } catch (error) {
    logger.error('Error seeding topics:', error);
    process.exit(1);
  }
}

// Run the seed function
seedTopics(); 