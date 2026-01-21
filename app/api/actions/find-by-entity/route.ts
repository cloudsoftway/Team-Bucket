import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Find actions by entity_id and action_type
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const entityId = searchParams.get('entity_id');
    const actionType = searchParams.get('action_type');

    if (!entityId || !actionType) {
      return NextResponse.json(
        { error: 'entity_id and action_type are required' },
        { status: 400 }
      );
    }

    const actions = await prisma.action.findMany({
      where: {
        entity_id: parseInt(entityId, 10),
        action_type: actionType,
      },
      include: {
        session: true,
      },
    });

    return NextResponse.json({ actions });
  } catch (error: any) {
    console.error('Error finding actions:', error);
    return NextResponse.json(
      { error: 'Failed to find actions', message: error.message },
      { status: 500 }
    );
  }
}
