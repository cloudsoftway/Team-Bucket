import { dequeueRpcCall, getQueueLength, RpcQueueItem } from './redis';

interface RpcCallResult {
  actionId: string;
  success: boolean;
  error?: string;
}

function getOdooJsonRpcUrl(): string {
  const base = (process.env.ODOO_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('ODOO_URL is required for RPC worker.');
  return `${base}/jsonrpc`;
}

/**
 * Execute exact JSON-RPC payload by POSTing to Odoo. No Odoo client; worker only needs ODOO_URL.
 */
async function executeRpcPayload(item: RpcQueueItem): Promise<RpcCallResult> {
  const url = getOdooJsonRpcUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(item.payload),
  });
  const text = await res.text();
  let data: { result?: unknown; error?: { message?: string; code?: number; data?: unknown } };
  try {
    data = JSON.parse(text);
  } catch {
    return {
      actionId: item.actionId,
      success: false,
      error: `Invalid JSON response: ${text.slice(0, 200)}`,
    };
  }
  if (!res.ok) {
    return {
      actionId: item.actionId,
      success: false,
      error: data?.error?.message || `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }
  if (data?.error) {
    return {
      actionId: item.actionId,
      success: false,
      error: data.error.message || JSON.stringify(data.error),
    };
  }
  return {
    actionId: item.actionId,
    success: data?.result === true,
    ...(data?.result === true ? {} : { error: `Unexpected result: ${JSON.stringify(data?.result)}` }),
  };
}

/**
 * Process a single RPC call from Redis queue (exact JSON-RPC payload).
 */
export async function processRpcCall(): Promise<RpcCallResult | null> {
  let item: RpcQueueItem | null = null;
  try {
    item = await dequeueRpcCall(5);
    if (!item) return null;

    console.log(`Processing RPC for action ${item.actionId}:`, {
      model: item.payload?.params?.args?.[3],
      method: item.payload?.params?.method,
      ids: item.payload?.params?.args?.[5]?.[0],
    });

    return await executeRpcPayload(item);
  } catch (error: any) {
    console.error('Error processing RPC call:', error);
    return {
      actionId: item?.actionId ?? (error as any).actionId ?? 'unknown',
      success: false,
      error: error?.message || 'Unknown error',
    };
  }
}

/**
 * Process RPC calls continuously (worker loop).
 */
export async function processRpcQueue(
  onResult?: (result: RpcCallResult) => void,
  stopSignal?: () => boolean
): Promise<void> {
  console.log('RPC Worker started');
  while (!stopSignal?.()) {
    try {
      const result = await processRpcCall();
      if (result) {
        console.log('RPC call processed:', result);
        onResult?.(result);
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e: any) {
      console.error('RPC worker loop error:', e);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('RPC Worker stopped');
}

/**
 * Process all RPC calls in queue until empty.
 */
export async function processAllRpcCalls(): Promise<RpcCallResult[]> {
  const results: RpcCallResult[] = [];
  const n = await getQueueLength();
  console.log(`Processing ${n} RPC calls from queue`);
  for (let i = 0; i < n; i++) {
    const r = await processRpcCall();
    if (r) results.push(r);
  }
  return results;
}
