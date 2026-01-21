import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get a specific action
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const action = await prisma.action.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    return NextResponse.json({ action });
  } catch (error: any) {
    console.error('Error fetching action:', error);
    return NextResponse.json(
      { error: 'Failed to fetch action', message: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update an action
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, applied_at, description, before_state, after_state } = body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (applied_at) updateData.applied_at = new Date(applied_at);
    if (description) updateData.description = description;
    if (before_state) updateData.before_state = before_state;
    if (after_state) updateData.after_state = after_state;

    const action = await prisma.action.update({
      where: { id },
      data: updateData,
      include: {
        session: true,
      },
    });

    return NextResponse.json({ action });
  } catch (error: any) {
    console.error('Error updating action:', error);
    return NextResponse.json(
      { error: 'Failed to update action', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete an action
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.action.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting action:', error);
    return NextResponse.json(
      { error: 'Failed to delete action', message: error.message },
      { status: 500 }
    );
  }
}
