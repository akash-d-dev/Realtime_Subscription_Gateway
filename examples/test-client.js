const WebSocket = require('ws');

// Test WebSocket connection to the gateway
async function testWebSocketConnection() {
  console.log('Testing WebSocket connection...');
  
  const ws = new WebSocket('ws://localhost:4000/graphql');
  
  ws.on('open', () => {
    console.log('WebSocket connected successfully');
    
    // Send a connection initialization message
    const initMessage = {
      type: 'connection_init',
      payload: {
        authorization: 'Bearer test-token' // Replace with actual Firebase JWT
      }
    };
    
    ws.send(JSON.stringify(initMessage));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('Received message:', message);
    
    if (message.type === 'connection_ack') {
      console.log('Connection acknowledged');
      
      // Subscribe to a topic
      const subscribeMessage = {
        id: '1',
        type: 'subscribe',
        payload: {
          query: `
            subscription TopicEvents($topicId: String!) {
              topicEvents(topicId: $topicId) {
                id
                topicId
                type
                data
                seq
                ts
                tenantId
                senderId
              }
            }
          `,
          variables: {
            topicId: 'document-edits'
          }
        }
      };
      
      ws.send(JSON.stringify(subscribeMessage));
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  // Close connection after 10 seconds
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 10000);
}

// Test HTTP health endpoint
async function testHealthEndpoint() {
  console.log('Testing health endpoint...');
  
  try {
    const response = await fetch('http://localhost:4000/health');
    const data = await response.json();
    console.log('Health check response:', data);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

// Run tests
async function runTests() {
  console.log('Starting gateway tests...\n');
  
  await testHealthEndpoint();
  console.log('');
  
  await testWebSocketConnection();
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.log('Fetch not available, skipping HTTP tests');
  console.log('Use Node.js 18+ or install node-fetch for HTTP tests');
  testWebSocketConnection();
} else {
  runTests();
} 