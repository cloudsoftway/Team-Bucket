import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - Save a session with all its actions to the database
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { session, actions } = body;

    if (!session || !actions) {
      return NextResponse.json(
        { error: 'Session and actions are required' },
        { status: 400 }
      );
    }

    // Map status from localStorage format to Prisma enum
    const mapStatusToEnum = (status: string): 'DRAFT' | 'CONFIRMED' | 'FAILED' => {
      const upperStatus = status.toUpperCase();
      if (upperStatus === 'CONFIRMED' || upperStatus === 'FAILED') {
        return upperStatus as 'CONFIRMED' | 'FAILED';
      }
      return 'DRAFT';
    };

    // Check if session already exists in database
    const existingSession = await prisma.actionSession.findUnique({
      where: { id },
    });

    const mappedStatus = mapStatusToEnum(session.status || 'draft');

    if (existingSession) {
      // Update existing session and actions
      await prisma.actionSession.update({
        where: { id },
        data: {
          created_by: session.created_by,
          status: mappedStatus,
          actions: {
            deleteMany: {}, // Delete all existing actions
            create: actions.map((action: any) => ({
              description: action.description,
              entity_type: 'PROJECT_TASK',
              entity_id: action.entity_id,
              action_type: action.action_type,
              before_state: action.before_state,
              after_state: action.after_state,
              applied_at: action.applied_at ? new Date(action.applied_at) : null,
              status: action.status || 'pending',
            })),
          },
        },
      });
    } else {
      // Create new session with actions
      await prisma.actionSession.create({
        data: {
          id: session.id,
          created_by: session.created_by,
          status: mappedStatus,
          created_at: new Date(session.created_at),
          actions: {
            create: actions.map((action: any) => ({
              description: action.description,
              entity_type: 'PROJECT_TASK',
              entity_id: action.entity_id,
              action_type: action.action_type,
              before_state: action.before_state,
              after_state: action.after_state,
              applied_at: action.applied_at ? new Date(action.applied_at) : null,
              status: action.status || 'pending',
            })),
          },
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Session saved to database' });
  } catch (error: any) {
    console.error('Error saving session to database:', error);
    return NextResponse.json(
      { error: 'Failed to save session', message: error.message },
      { status: 500 }
    );
  }
}
