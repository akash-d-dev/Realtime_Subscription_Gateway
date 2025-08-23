/*
  Usage:
  node scripts/subscriber.js --topic doc:123 --from 0 --token <jwt>
*/
const WebSocket = require('ws');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, '');
    out[k] = args[i + 1];
  }
  return out;
}

function main() {
  const { topic = 'doc:123', from = '0', token = '' } = parseArgs();
  const ws = new WebSocket('ws://localhost:4000/graphql');

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'connection_init', payload: { authorization: token ? `Bearer ${token}` : '' } }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'connection_ack') {
      const query = `subscription($topicId: ID!, $fromSeq: Int){ topicEvents(topicId:$topicId, fromSeq:$fromSeq){ id topicId type seq ts senderId } }`;
      ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query, variables: { topicId: topic, fromSeq: parseInt(from, 10) } } }));
    } else if (msg.type === 'next') {
      console.log('Event', msg.payload.data.topicEvents);
    } else if (msg.type === 'error') {
      console.error('Error', msg.payload);
    }
  });

  ws.on('error', (e) => console.error('WS error', e.message));
}

main();


