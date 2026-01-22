import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  return redisClient;
}

/**
 * Close Redis connection
 */
export function closeRedisClient(): Promise<void> {
  if (redisClient) {
    return redisClient.quit().then(() => {});
  }
  return Promise.resolve();
}

/**
 * Queue name for RPC calls
 */
export const RPC_QUEUE_NAME = process.env.REDIS_QUEUE_NAME || 'odoo:rpc:calls';

/** Queued job: exact JSON-RPC payload + actionId for worker to POST to Odoo */
export interface RpcQueueItem {
  payload: {
    jsonrpc: '2.0';
    method: 'call';
    params: { service: string; method: string; args: any[] };
    id: number;
  };
  actionId: string;
  timestamp: number;
}

/**
 * Push RPC call (exact JSON-RPC payload) to Redis queue
 */
export async function enqueueRpcCall(item: { payload: RpcQueueItem['payload']; actionId: string }): Promise<void> {
  const client = getRedisClient();
  const job: RpcQueueItem = { ...item, timestamp: Date.now() };
  await client.lpush(RPC_QUEUE_NAME, JSON.stringify(job));
}

/**
 * Push multiple RPC calls to Redis queue
 */
export async function enqueueRpcCalls(items: Array<{ payload: RpcQueueItem['payload']; actionId: string }>): Promise<void> {
  if (items.length === 0) return;
  const client = getRedisClient();
  const pipeline = client.pipeline();
  for (const item of items) {
    const job: RpcQueueItem = { ...item, timestamp: Date.now() };
    pipeline.lpush(RPC_QUEUE_NAME, JSON.stringify(job));
  }
  await pipeline.exec();
}

/**
 * Pop RPC call from Redis queue (blocking)
 */
export async function dequeueRpcCall(timeout: number = 5): Promise<RpcQueueItem | null> {
  const client = getRedisClient();
  const result = await client.brpop(RPC_QUEUE_NAME, timeout);
  if (!result || result.length < 2) return null;
  return JSON.parse(result[1]) as RpcQueueItem;
}

/**
 * Get queue length
 */
export async function getQueueLength(): Promise<number> {
  const client = getRedisClient();
  return await client.llen(RPC_QUEUE_NAME);
}
