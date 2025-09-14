## Learning Resources for Realtime Subscription Gateway

This document curates high‑quality articles, official docs, and YouTube videos to learn every component used in this project. Given you know Node.js and TypeScript, the focus is on realtime, GraphQL, Redis, and the surrounding platform tooling.

### Foundations (Node.js, TypeScript, Express)
- Official TypeScript Handbook – Core types, functions, generics: [TypeScript Docs](https://www.typescriptlang.org/docs/)
- Node.js Docs – Guides and APIs (v18+): [Node.js Docs](https://nodejs.org/docs)
- Express Framework – Basics and best practices: [Express Guide](https://expressjs.com/)
- CORS middleware for Express: [expressjs/cors](https://github.com/expressjs/cors)
- Helmet security headers for Express: [helmetjs/helmet](https://helmetjs.github.io/)
- Compression middleware for Express: [expressjs/compression](https://github.com/expressjs/compression)
- YouTube: Node.js Crash Course (Traversy Media): [Video](https://www.youtube.com/watch?v=fBNz5xF-Kx4)

### GraphQL (API, Schema, Subscriptions)
- GraphQL Fundamentals (queries, mutations, schema): [GraphQL Learn](https://graphql.org/learn/)
- Apollo Server v3 (docs for the version used here): [Apollo Server v3 Docs](https://www.apollographql.com/docs/apollo-server/v3/)
- Apollo Server v3 Subscriptions overview: [Subscriptions Guide](https://www.apollographql.com/docs/apollo-server/v3/data/subscriptions/)
- GraphQL Tools: `@graphql-tools/schema` reference: [GraphQL-Tools Docs](https://www.the-guild.dev/graphql/tools/docs/schema)
- `graphql-ws` (GraphQL over WebSocket protocol) docs: [The Guild – graphql-ws](https://the-guild.dev/graphql/ws)
- GraphQL Subscriptions concepts: [GraphQL Subscriptions](https://graphql.org/blog/subscriptions-in-graphql-and-relay/)
- YouTube: Real‑time GraphQL Subscriptions with WebSockets (The Guild / community talks): [Video](https://www.youtube.com/watch?v=qN9ZqzK3o8g)

### WebSockets (Transport Layer)
- `ws` (WebSocket for Node.js) – API reference: [websockets/ws](https://github.com/websockets/ws)
- MDN – WebSocket protocol & API overview: [MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- YouTube: WebSockets Crash Course (Traversy Media): [Video](https://www.youtube.com/watch?v=2Nt-ZrNP22A)

### Redis (Messaging, Persistence, Keys)
- Node Redis v4 – Official client, `createClient`, `duplicate`, Pub/Sub, Streams: [redis/node-redis](https://github.com/redis/node-redis)
- Redis Pub/Sub – Concepts & commands: [Redis Pub/Sub Docs](https://redis.io/docs/latest/develop/interact/pubsub/)
- Redis Streams – XADD/XRANGE basics for durability/replay: [Redis Streams Docs](https://redis.io/docs/latest/develop/data-types/streams/)
- Redis Lists – For per-subscriber queues and backpressure: [Redis Lists Docs](https://redis.io/docs/latest/develop/data-types/lists/)
- EXPIRE/TTL – Presence and time-based keys: [Key Expiration](https://redis.io/docs/latest/develop/interact/transactions/bgsave-expire/)
- Redis Cluster – Horizontal scaling: [Redis Cluster Overview](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)
- YouTube: Redis Streams in 10 Minutes (Official Redis channel): [Video](https://www.youtube.com/watch?v=9qiZl8s1J9A)

### Rate Limiting (Token Bucket with Redis)
- Concept: Token Bucket algorithm (overview): [Wikipedia – Token Bucket](https://en.wikipedia.org/wiki/Token_bucket)
- Redis pattern – Rate limiting (official guide): [Redis Rate Limiting](https://redis.io/solutions/use-cases/rate-limiter/)
- Example with Lua scripts (explainer/blog): [Rate Limiting with Redis & Lua](https://engineering.classdojo.com/blog/2015/02/06/rolling-rate-limiter/)
- YouTube (concept): Rate Limiting Algorithms Explained (Hussein Nasser): [Video](https://www.youtube.com/watch?v=FJx0mO1VYpQ)

### Authentication & Authorization (Firebase Admin)
- Verify ID tokens with Admin SDK (Node.js): [Firebase Admin – Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- Custom claims for authorization (multi‑tenancy, roles): [Firebase Admin – Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- Initializing Firebase Admin SDK (Node.js): [Firebase Admin Node Setup](https://firebase.google.com/docs/admin/setup)
- YouTube: Firebase Auth Custom Claims (Fireship): [Video](https://www.youtube.com/watch?v=3f5Q9wDePzY)

### Logging & Error Handling
- Winston logger – transports, formats, levels: [winstonjs/winston](https://github.com/winstonjs/winston)
- Node error handling patterns (docs & guidance): [Node Best Practices – Error Handling](https://github.com/goldbergyoni/nodebestpractices#3-error-handling-practices)

### Monitoring, Health, and Metrics
- Prometheus text exposition format (how `/metrics` should look): [Prometheus Exposition Format](https://prometheus.io/docs/instrumenting/exposition_formats/)
- prom-client (Node.js Prometheus client) – counters, gauges, histograms: [siimon/prom-client](https://github.com/siimon/prom-client)
- Grafana – Building dashboards: [Grafana Docs](https://grafana.com/docs/)
- YouTube: Monitor Node.js with Prometheus & Grafana: [Video](https://www.youtube.com/watch?v=5_Sw-9N5s9s)

### Load & Scale Testing
- Artillery – HTTP and WebSocket load testing: [Artillery Docs](https://www.artillery.io/docs)
- wrk – Modern HTTP benchmarking tool: [wrk GitHub](https://github.com/wg/wrk)
- ApacheBench (ab) – HTTP benchmarking: [ab Manual](https://httpd.apache.org/docs/2.4/programs/ab.html)
- YouTube: Load Testing with Artillery: [Video](https://www.youtube.com/watch?v=1L1-f2ZbWn0)

### Deployment, Containers, and Orchestration
- Docker – Official docs: [Docker Docs](https://docs.docker.com/)
- Dockerfile best practices: [Dockerfile Best Practices](https://docs.docker.com/build/building/best-practices/)
- Node official Docker images: [Docker Hub – node](https://hub.docker.com/_/node)
- NGINX – Upstream load balancing: [NGINX Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- Kubernetes – Deployments: [K8s Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- Kubernetes – Services & ingress basics: [K8s Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- YouTube: Docker Crash Course (Traversy Media): [Video](https://www.youtube.com/watch?v=9zUHg7xjIqQ)
- YouTube: Kubernetes for Beginners (TechWorld with Nana): [Video](https://www.youtube.com/watch?v=X48VuDVv0do)

### Useful Utilities in This Project
- `dotenv` – Load environment variables: [motdotla/dotenv](https://github.com/motdotla/dotenv)
- `uuid` – RFC4122 UUIDs: [uuid NPM](https://www.npmjs.com/package/uuid)
- `graphql-subscriptions` – PubSub helpers for GraphQL: [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions)

### Suggested Learning Path
1) GraphQL basics → Apollo Server v3 → graphql-ws subscriptions
2) WebSockets in Node (`ws`) and connection lifecycle
3) Redis foundations → Pub/Sub → Streams → Lists, EXPIRE/TTL
4) Implement rate limiting with Redis (token bucket)
5) Firebase Admin auth & custom claims for multi‑tenant access
6) Logging (winston) and robust error handling patterns
7) Monitoring with Prometheus format + Grafana dashboards
8) Load testing with Artillery; benchmark with wrk/ab
9) Containerize (Docker), scale out (NGINX + Kubernetes), Redis Cluster

This list stays intentionally focused on official docs and widely adopted resources to prepare you for interviews and production readiness.

