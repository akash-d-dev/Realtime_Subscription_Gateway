# 🚀 Realtime Subscription Gateway - Learning Resources

This document contains a curated list of articles and videos to help you understand the technologies and concepts used in this project.

## 1. Core Concepts & System Design

Understanding the foundational patterns is crucial for building scalable real-time systems.

### Articles
*   **The Power of the Publisher/Subscriber Model** - A deep dive into the Pub/Sub pattern that powers most real-time applications.
    *   [Link](https://ably.com/blog/pub-sub-pattern)
*   **System Design: Real-time Messaging (e.g., WhatsApp, Slack)** - High-level architecture overview.
    *   [Grokking the System Design Interview: Designing a Chat Application](https://www.educative.io/courses/grokking-the-system-design-interview/gx2e2y22p74)
    *   [System Design: Architecture of a Chat Application like WhatsApp](https://medium.com/@prateek.goyal1996/system-design-architecture-of-a-chat-application-like-whatsapp-f536e1f4ea3b)

### Videos
*   **WebSockets - How Do They Work?** - A clear, visual explanation of the WebSocket protocol.
    *   [Fireship: WebSockets in 100 Seconds](https://www.youtube.com/watch?v=1BfCnjr_Vjg)
*   **System Design: WhatsApp** - A detailed walkthrough of designing a chat application, covering many concepts in this project.
    *   [Gaurav Sen: WhatsApp System Design](https://www.youtube.com/watch?v=vvhC64hQZMk)

## 2. GraphQL

GraphQL is the core of our API, handling both publishing events (mutations) and subscribing to them.

### Articles
*   **Official Apollo Server Documentation for Subscriptions** - The primary source for understanding how Apollo handles real-time data.
    *   [Apollo Docs: Subscriptions](https://www.apollographql.com/docs/apollo-server/data/subscriptions/)
*   **GraphQL Subscriptions with Redis** - A guide on how to scale GraphQL subscriptions using a Redis backplane, just like in this project.
    *   [LogRocket: Scaling GraphQL Subscriptions with Redis](https://blog.logrocket.com/scaling-graphql-subscriptions-redis/)

### Videos
*   **GraphQL Subscriptions Explained** - A practical tutorial on setting up and using GraphQL subscriptions.
    *   [Ben Awad: GraphQL Subscriptions Tutorial](https://www.youtube.com/watch?v=S_b9a7-5t2M)
*   **Fullstack GraphQL with Apollo Server** - A comprehensive course that covers mutations, queries, and subscriptions.
    *   [FreeCodeCamp: Full-stack GraphQL Course](https://www.youtube.com/watch?v=A1-l_49C4W4)

## 3. Redis

Redis is the high-performance engine for messaging, rate limiting, and presence management.

### Articles
*   **Redis Pub/Sub vs. Redis Streams** - An essential read to understand the two different messaging paradigms in Redis.
    *   [Redis Official Blog: The-Battle-of-the-Streams](https://redis.com/blog/the-battle-of-the-streams/)
*   **Rate Limiting using the Token Bucket Algorithm with Redis** - A detailed explanation of the rate-limiting strategy used in this gateway.
    *   [LogRocket: Implement Rate Limiting in Node.js with Redis](https://blog.logrocket.com/rate-limiting-node-js-redis/)
*   **Building a Presence System with Redis** - Learn how to track online users efficiently.
    *   [Redis Developer: How to Build a Real-Time Online User Tracker with Redis](https://redis.com/developer/how-to/build-real-time-online-user-tracker-redis/)

### Videos
*   **Redis Explained in 100 Seconds** - A quick overview of what Redis is and its core data structures.
    *   [Fireship: Redis Explained](https://www.youtube.com/watch?v=G1rOthIU-uo)
*   **Redis Pub/Sub Crash Course** - A practical guide to using Redis for real-time messaging.
    *   [Traversy Media: Redis Crash Course](https://www.youtube.com/watch?v=jgpVdSy0m_s) (Covers Pub/Sub)

## 4. Firebase Authentication

Firebase provides a robust, secure, and easy-to-use authentication system.

### Articles
*   **Using Custom Claims for Authorization** - The core concept for implementing multi-tenancy and permissions.
    *   [Firebase Docs: Control Access with Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
*   **Validating Firebase ID Tokens in a Node.js Backend** - The exact process used by the gateway to verify user identity.
    *   [Firebase Docs: Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

### Videos
*   **Firebase Authentication in 100 Seconds**
    *   [Fireship: Firebase Auth Explained](https://www.youtube.com/watch?v=9kRgVxULbag)
*   **Firebase Security Rules with Custom Claims** - A practical tutorial on role-based authorization.
    *   [Fireship: Firebase Security Rules & Custom JWT Claims](https://www.youtube.com/watch?v=e_pCgGjA_Lw)

## 5. DevOps & Production Readiness

Tools and techniques for deploying, scaling, and monitoring the gateway.

### Articles
*   **Dockerizing a Node.js Application** - A complete guide to creating an optimized Docker image.
    *   [Node.js Official Docs: Dockerizing a Node.js Web App](https://nodejs.org/en/docs/guides/nodejs-docker-webapp)
*   **Introduction to Kubernetes for Node.js Developers** - Understanding how to orchestrate your containers.
    *   [LogRocket: A Guide to Kubernetes for Node.js Developers](https://blog.logrocket.com/guide-kubernetes-nodejs-developers/)
*   **Monitoring Node.js with Prometheus & Grafana** - The stack used for observing metrics from the gateway.
    *   [Snyk: Monitoring a Node.js App with Prometheus and Grafana](https://snyk.io/blog/monitoring-a-node-js-app-with-prometheus-and-grafana/)

### Videos
*   **Docker in 100 Seconds**
    *   [Fireship: Docker Explained](https://www.youtube.com/watch?v=Gjnup-puquQ)
*   **Kubernetes Explained in 100 Seconds**
    *   [Fireship: Kubernetes Explained](https://www.youtube.com/watch?v=PziYfl8q_wE)
*   **Load Testing with Artillery.io** - A practical guide to stress-testing your application.
    *   [Artillery.io: Load Testing a GraphQL API](https://www.youtube.com/watch?v=imp-4L_g-fA)
