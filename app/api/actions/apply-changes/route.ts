import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sessionId, 
      statusResult 
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (!statusResult) {
      return NextResponse.json(
        { error: 'statusResult is required (from check-odoo-status API)' },
        { status: 400 }
      );
    }

    if (!statusResult.taskStatuses && !statusResult.projectStatuses) {
      return NextResponse.json(
        { error: 'statusResult must contain taskStatuses or projectStatuses' },
        { status: 400 }
      );
    }

    console.log('Applying actions for session:', sessionId);
    console.log('Task statuses:', statusResult.taskStatuses?.length || 0);
    console.log('Project statuses:', statusResult.projectStatuses?.length || 0);

    let client;
    try {
      client = createOdooClient();
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('Odoo configuration is incomplete') || msg.includes('environment variables')) {
        return NextResponse.json(
          {
            error: 'Odoo configuration is incomplete',
            message: 'Set ODOO_URL, ODOO_DATABASE, ODOO_USERNAME, and ODOO_API_KEY in .env. RPC generation runs here; the Redis worker only needs ODOO_URL to POST payloads.',
          },
          { status: 503 }
        );
      }
      throw e;
    }

    // Build exact JSON-RPC payloads, enqueue to Redis; worker executes them via POST
    const result = await client.applyActions(statusResult);

    return NextResponse.json({
      success: result.success,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      results: result.results,
    });
  } catch (error: any) {
    console.error('Error applying changes:', error);
    return NextResponse.json(
      {
        error: 'Failed to apply changes',
        message: error.message,
        success: false,
      },
      { status: 500 }
    );
  }
}
