import { NextRequest, NextResponse } from 'next/server';
import { processAllRpcCalls } from '@/lib/rpcWorker';

/**
 * POST - Process all RPC calls in the Redis queue
 * This endpoint processes all pending RPC calls asynchronously
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Processing RPC queue...');
    
    const results = await processAllRpcCalls();
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: failed === 0,
      total: results.length,
      successful,
      failed,
      results,
    });
  } catch (error: any) {
    console.error('Error processing RPC queue:', error);
    return NextResponse.json(
      {
        error: 'Failed to process RPC queue',
        message: error.message,
        success: false,
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Get queue status
 */
export async function GET(request: NextRequest) {
  try {
    const { getQueueLength } = await import('@/lib/redis');
    const queueLength = await getQueueLength();
    
    return NextResponse.json({
      queueLength,
      message: `${queueLength} RPC calls pending in queue`,
    });
  } catch (error: any) {
    console.error('Error getting queue status:', error);
    return NextResponse.json(
      {
        error: 'Failed to get queue status',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
