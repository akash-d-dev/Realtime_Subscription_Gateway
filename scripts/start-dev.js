#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting Realtime Subscription Gateway in development mode...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('No .env file found. Creating from template...');
  
  const envExamplePath = path.join(__dirname, '..', 'env.example');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('Created .env file from template');
    console.log('Please edit .env with your configuration before starting');
  } else {
    console.log('env.example not found');
    process.exit(1);
  }
}

// Check if Redis is running
async function checkRedis() {
  return new Promise((resolve) => {
    const redis = spawn('redis-cli', ['ping']);
    
    redis.stdout.on('data', (data) => {
      if (data.toString().includes('PONG')) {
        console.log('Redis is running');
        resolve(true);
      }
    });
    
    redis.stderr.on('data', () => {
      console.log('Redis is not running');
      console.log('Start Redis with: docker run -d -p 6379:6379 redis:7-alpine');
      resolve(false);
    });
    
    redis.on('close', () => {
      resolve(false);
    });
  });
}

// Start the gateway
async function startGateway() {
  console.log('Starting gateway...\n');
  
  const gateway = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  
  gateway.on('error', (error) => {
    console.error('Failed to start gateway:', error);
    process.exit(1);
  });
  
  gateway.on('close', (code) => {
    console.log(`\nGateway stopped with code ${code}`);
    process.exit(code);
  });
}

// Main execution
async function main() {
  const redisRunning = await checkRedis();
  
  if (!redisRunning) {
    console.log('\nTo start Redis with Docker:');
    console.log('   docker run -d -p 6379:6379 redis:7-alpine');
    console.log('\nOr use Docker Compose:');
    console.log('   docker-compose up redis -d');
    console.log('\nWaiting 5 seconds before starting gateway anyway...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  await startGateway();
}

main().catch(console.error); 