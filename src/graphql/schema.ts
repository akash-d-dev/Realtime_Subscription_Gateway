import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type Event {
    id: ID!
    topicId: ID!
    type: String!
    data: JSON!
    timestamp: Float!
    userId: String
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
  }

  type Query {
    topics: [Topic!]!
    topicStats(topicId: ID!): TopicStats
  }

  type Mutation {
    publishEvent(input: PublishEventInput!): PublishEventResponse!
  }

  type Subscription {
    topicEvents(topicId: ID!): Event!
  }

  scalar JSON
`; 