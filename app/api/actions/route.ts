import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get all actions, optionally filtered by session_id, entity_id, or action_type
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    const entityId = searchParams.get('entity_id');
    const actionType = searchParams.get('action_type');

    const where: any = {};
    if (sessionId) where.session_id = sessionId;
    if (entityId) where.entity_id = parseInt(entityId, 10);
    if (actionType) where.action_type = actionType;

    const actions = await prisma.action.findMany({
      where,
      include: {
        session: true,
      },
      orderBy: {
        session: {
          created_at: 'desc',
        },
      },
    });

    return NextResponse.json({ actions });
  } catch (error: any) {
    console.error('Error fetching actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch actions', message: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new action
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      session_id,
      description,
      entity_type,
      entity_id,
      action_type,
      before_state,
      after_state,
      status,
    } = body;

    if (!session_id || !description || !entity_type || entity_id === undefined || !action_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const action = await prisma.action.create({
      data: {
        session_id,
        description,
        entity_type,
        entity_id: parseInt(entity_id, 10),
        action_type,
        before_state: before_state || {},
        after_state: after_state || {},
        status: status || 'pending',
      },
      include: {
        session: true,
      },
    });

    return NextResponse.json({ action });
  } catch (error: any) {
    console.error('Error creating action:', error);
    return NextResponse.json(
      { error: 'Failed to create action', message: error.message },
      { status: 500 }
    );
  }
}
