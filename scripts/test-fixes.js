const WebSocket = require('ws');
const fetch = require('node-fetch');

class GatewayTester {
  constructor(baseUrl = 'http://localhost:4000') {
    this.baseUrl = baseUrl;
    this.wsUrl = baseUrl.replace('http', 'ws');
    this.testResults = [];
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async testHealthEndpoint() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      
      if (response.ok && data.status === 'ok') {
        await this.log('Health endpoint working correctly', 'success');
        this.testResults.push({ test: 'Health Endpoint', status: 'PASS' });
        return true;
      } else {
        await this.log('Health endpoint failed', 'error');
        this.testResults.push({ test: 'Health Endpoint', status: 'FAIL' });
        return false;
      }
    } catch (error) {
      await this.log(`Health endpoint error: ${error.message}`, 'error');
      this.testResults.push({ test: 'Health Endpoint', status: 'FAIL' });
      return false;
    }
  }

  async testMetricsEndpoint() {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`);
      const data = await response.text();
      
      if (response.ok && data.includes('gateway_topics_total')) {
        await this.log('Metrics endpoint working correctly', 'success');
        this.testResults.push({ test: 'Metrics Endpoint', status: 'PASS' });
        return true;
      } else {
        await this.log('Metrics endpoint failed', 'error');
        this.testResults.push({ test: 'Metrics Endpoint', status: 'FAIL' });
        return false;
      }
    } catch (error) {
      await this.log(`Metrics endpoint error: ${error.message}`, 'error');
      this.testResults.push({ test: 'Metrics Endpoint', status: 'FAIL' });
      return false;
    }
  }

  async testGraphQLEndpoint() {
    try {
      const query = `
        query {
          topics {
            id
            subscriberCount
            bufferSize
            createdAt
          }
        }
      `;

      const response = await fetch(`${this.baseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      
      if (response.ok && data.data) {
        await this.log('GraphQL endpoint working correctly', 'success');
        this.testResults.push({ test: 'GraphQL Endpoint', status: 'PASS' });
        return true;
      } else {
        await this.log(`GraphQL endpoint failed: ${JSON.stringify(data.errors)}`, 'error');
        this.testResults.push({ test: 'GraphQL Endpoint', status: 'FAIL' });
        return false;
      }
    } catch (error) {
      await this.log(`GraphQL endpoint error: ${error.message}`, 'error');
      this.testResults.push({ test: 'GraphQL Endpoint', status: 'FAIL' });
      return false;
    }
  }

  async testWebSocketConnection() {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${this.wsUrl}/graphql`);
      let connected = false;
      let authenticated = false;

      ws.on('open', () => {
        connected = true;
        this.log('WebSocket connection established', 'success');
        
        // Send connection initialization
        const initMessage = {
          type: 'connection_init',
          payload: {
            authorization: 'Bearer test-token'
          }
        };
        ws.send(JSON.stringify(initMessage));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'connection_ack') {
          authenticated = true;
          this.log('WebSocket authentication successful', 'success');
          
          // Test subscription
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
                    timestamp
                    userId
                  }
                }
              `,
              variables: {
                topicId: 'test-topic'
              }
            }
          };
          
          ws.send(JSON.stringify(subscribeMessage));
          
          // Close connection after successful test
          setTimeout(() => {
            ws.close();
            this.testResults.push({ test: 'WebSocket Connection', status: 'PASS' });
            resolve(true);
          }, 1000);
        } else if (message.type === 'error') {
          this.log(`WebSocket error: ${message.payload}`, 'error');
          ws.close();
          this.testResults.push({ test: 'WebSocket Connection', status: 'FAIL' });
          resolve(false);
        }
      });

      ws.on('error', (error) => {
        this.log(`WebSocket error: ${error.message}`, 'error');
        this.testResults.push({ test: 'WebSocket Connection', status: 'FAIL' });
        resolve(false);
      });

      ws.on('close', () => {
        if (!connected) {
          this.log('WebSocket connection failed', 'error');
          this.testResults.push({ test: 'WebSocket Connection', status: 'FAIL' });
          resolve(false);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!authenticated) {
          this.log('WebSocket authentication timeout', 'error');
          ws.close();
          this.testResults.push({ test: 'WebSocket Connection', status: 'FAIL' });
          resolve(false);
        }
      }, 5000);
    });
  }

  async testEventPublishing() {
    try {
      const mutation = `
        mutation PublishEvent($input: PublishEventInput!) {
          publishEvent(input: $input) {
            success
            eventId
            message
          }
        }
      `;

      const variables = {
        input: {
          topicId: 'test-topic',
          type: 'test-event',
          data: {
            message: 'Hello from test',
            timestamp: Date.now()
          }
        }
      };

      const response = await fetch(`${this.baseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ 
          query: mutation,
          variables 
        })
      });

      const data = await response.json();
      
      if (response.ok && data.data?.publishEvent?.success) {
        await this.log('Event publishing working correctly', 'success');
        this.testResults.push({ test: 'Event Publishing', status: 'PASS' });
        return true;
      } else {
        await this.log(`Event publishing failed: ${JSON.stringify(data.errors)}`, 'error');
        this.testResults.push({ test: 'Event Publishing', status: 'FAIL' });
        return false;
      }
    } catch (error) {
      await this.log(`Event publishing error: ${error.message}`, 'error');
      this.testResults.push({ test: 'Event Publishing', status: 'FAIL' });
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 Starting comprehensive gateway tests...\n');
    
    await this.log('Testing Health Endpoint...');
    await this.testHealthEndpoint();
    
    await this.log('Testing Metrics Endpoint...');
    await this.testMetricsEndpoint();
    
    await this.log('Testing GraphQL Endpoint...');
    await this.testGraphQLEndpoint();
    
    await this.log('Testing WebSocket Connection...');
    await this.testWebSocketConnection();
    
    await this.log('Testing Event Publishing...');
    await this.testEventPublishing();
    
    this.printResults();
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
    });
    
    console.log('\n📈 Summary:');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed! The gateway is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please check the implementation.');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new GatewayTester();
  tester.runAllTests().catch(console.error);
}

module.exports = GatewayTester;