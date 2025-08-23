import { PubSub } from 'graphql-subscriptions';

// Singleton PubSub instance to bridge Redis events to GraphQL subscriptions
export const graphqlPubSub = new PubSub();

export function channelForTopic(tenantId: string, topicId: string): string {
  return `TOPIC_EVENTS:${tenantId}:${topicId}`;
}


