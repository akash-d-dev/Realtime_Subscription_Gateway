/*
  Usage:
  node scripts/publisher.js --topic doc:123 --rate 100 --type metric --duration 10 --token <jwt>
*/
const fetch = require('node-fetch');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, '');
    out[k] = args[i + 1];
  }
  return out;
}

async function main() {
  const { topic = 'doc:123', rate = '50', type = 'metric', duration = '10', token = '' } = parseArgs();
  const rateNum = parseInt(rate, 10);
  const durationSec = parseInt(duration, 10);
  const url = 'http://localhost:4000/graphql';

  const body = (payload) => ({
    query: `mutation($input: PublishEventInput!){ publishEvent(input:$input){ success eventId message } }`,
    variables: { input: payload },
  });

  const headers = {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  let sent = 0;
  const intervalMs = Math.max(1, Math.floor(1000 / Math.max(1, rateNum)));
  const endAt = Date.now() + durationSec * 1000;

  const timer = setInterval(async () => {
    if (Date.now() >= endAt) {
      clearInterval(timer);
      console.log(`Done. Sent ${sent} events`);
      process.exit(0);
      return;
    }
    const payload = {
      topicId: topic,
      type,
      data: { key: 'value', n: sent },
    };
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body(payload)) });
      const json = await res.json();
      if (!json.data?.publishEvent?.success) {
        console.error('Publish failed:', json);
      }
      sent++;
    } catch (e) {
      console.error('Publish error:', e.message);
    }
  }, intervalMs);
}

main();


