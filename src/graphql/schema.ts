import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type EventEnvelope {
    id: ID!
    topicId: ID!
    type: String!
    data: JSON!
    seq: Int!
    ts: String!
    tenantId: String!
    senderId: String!
    priority: Int
  }

  type Topic {
    id: ID!
    subscriberCount: Int!
    bufferSize: Int!
    createdAt: Float!
  }

  type TopicStats {
    subscriberCount: Int!
    bufferSize: Int!
  }

  type PublishEventResponse {
    success: Boolean!
    eventId: ID!
    message: String
  }

  type SubscriptionResponse {
    success: Boolean!
    message: String
  }

  input PublishEventInput {
    topicId: ID!
    type: String!
    data: JSON!
    priority: Int
  }

  type Query {
    topics: [Topic!]!
    topicStats(topicId: ID!): TopicStats
    eventHistory(topicId: ID!, count: Int): [EventEnvelope!]!
  }

  type Mutation {
    publishEvent(input: PublishEventInput!): PublishEventResponse!
  }

  type Subscription {
    topicEvents(topicId: ID!): EventEnvelope!
  }

  scalar JSON
`; 