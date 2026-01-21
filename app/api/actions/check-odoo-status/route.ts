import { NextRequest, NextResponse } from 'next/server';
import { checkOdooStatus } from '@/lib/odoo';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, actions: clientActions } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (!clientActions || !Array.isArray(clientActions) || clientActions.length === 0) {
      return NextResponse.json(
        { error: 'actions array is required and must not be empty' },
        { status: 400 }
      );
    }
    
    console.log('Checking Odoo status for session:', sessionId, 'with', clientActions.length, 'actions');
    
    // Use actions passed from client
    const formattedActions = clientActions.map((action: any) => ({
      id: action.id,
      session_id: action.session_id,
      description: action.description,
      entity_type: action.entity_type,
      entity_id: action.entity_id,
      action_type: action.action_type,
      before_state: action.before_state || {},
      after_state: action.after_state || {},
      update_json: action.update_json || {},
      condition_json: action.condition_json || null,
      additional_info_json: action.additional_info_json || null,
      applied_at: action.applied_at || null,
      status: action.status || 'pending',
    }));
    
    const statusResult = await checkOdooStatus(formattedActions);

    return NextResponse.json({ 
      success: true,
      isOdooReady: statusResult.isReady,
      taskStatuses: statusResult.taskStatuses,
      projectStatuses: statusResult.projectStatuses,
    });
  } catch (error: any) {
    console.error('Error checking Odoo status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check Odoo status', 
        message: error.message,
        success: false
      },
      { status: 500 }
    );
  }
}
