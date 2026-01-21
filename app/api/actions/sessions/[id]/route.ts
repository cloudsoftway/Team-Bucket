import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get a specific action session with its actions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await prisma.actionSession.findUnique({
      where: { id },
      include: {
        actions: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('Error fetching action session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch action session', message: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update an action session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, created_by } = body;

    const session = await prisma.actionSession.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(created_by && { created_by }),
      },
    });

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('Error updating action session:', error);
    return NextResponse.json(
      { error: 'Failed to update action session', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete an action session (cascades to actions)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.actionSession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting action session:', error);
    return NextResponse.json(
      { error: 'Failed to delete action session', message: error.message },
      { status: 500 }
    );
  }
}
