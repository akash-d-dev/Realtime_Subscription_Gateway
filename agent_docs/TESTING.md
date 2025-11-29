# 🧪 Testing Your Realtime Gateway

Now that your server is running, here is what this project actually **does** and how to see it in action.

## 🧐 What is this?

This is a **Realtime Subscription Gateway**. Think of it as a "Post Office" for your apps.

1.  **Publishers** (like a backend service) send messages ("Events") to a specific **Topic**.
2.  **Subscribers** (like a frontend app) listen to that **Topic**.
3.  The Gateway instantly pushes the message to all Subscribers.

It uses **Redis** so you can run 100 copies of this gateway and they all talk to each other.

## 🎮 Method 1: The Visual Way (GraphQL Playground)

1.  Make sure your server is running (`npm run dev`).
2.  Open [http://localhost:4000/graphql](http://localhost:4000/graphql) in your browser.

### Step A: Start Listening (Subscribe)

Paste this in the left panel and click the **Play** button:

```graphql
subscription {
  topicEvents(topicId: "my-test-topic") {
    topicId
    type
    data
  }
}
```

_You will see a "Listening..." spinner. It's waiting for events._

### Step B: Send a Message (Publish)

Open a **New Tab** in the Playground (click the `+` next to the tab name).
Paste this and click **Play**:

```graphql
mutation {
  publishEvent(
    input: {
      topicId: "my-test-topic"
      type: "greeting"
      data: { message: "Hello World!" }
    }
  ) {
    success
    eventId
  }
}
```

### Step C: See the Result

Go back to the **first tab**. You should see the message appear instantly!

```json
{
  "data": {
    "topicEvents": {
      "topicId": "my-test-topic",
      "type": "greeting",
      "data": { "message": "Hello World!" }
    }
  }
}
```

## 💻 Method 2: The Hacker Way (CLI Scripts)

We have built-in scripts to simulate heavy traffic.

**1. Start a Subscriber (Listener)**
Open a new terminal and run:

```bash
npm run demo:sub -- --topic test-topic
```

**2. Start a Publisher (Sender)**
Open another terminal and run:

```bash
npm run demo:pub -- --topic test-topic --rate 5 --duration 10
```

_This sends 5 messages per second for 10 seconds._

You will see the subscriber terminal lighting up with messages!
