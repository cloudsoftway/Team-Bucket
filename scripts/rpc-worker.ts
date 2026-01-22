#!/usr/bin/env node


import path from 'path';
import dotenv from 'dotenv';

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });

import { processRpcQueue } from '../lib/rpcWorker';
import { closeRedisClient } from '../lib/redis';

// Handle graceful shutdown
let shouldStop = false;

const stopSignal = () => shouldStop;

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  shouldStop = true;
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  shouldStop = true;
});

// Start the worker
processRpcQueue(
  (result) => {
    console.log(`[${new Date().toISOString()}] Processed:`, result);
  },
  stopSignal
)
  .then(() => {
    console.log('Worker stopped');
    return closeRedisClient();
  })
  .then(() => {
    console.log('Redis connection closed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Worker error:', error);
    closeRedisClient().finally(() => {
      process.exit(1);
    });
  });
