import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get all action sessions
export async function GET() {
  try {
    const sessions = await prisma.actionSession.findMany({
      include: {
        actions: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error('Error fetching action sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch action sessions', message: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new action session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { created_by, status } = body;

    const session = await prisma.actionSession.create({
      data: {
        created_by: created_by || 'system',
        status: status || 'draft',
      },
    });

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('Error creating action session:', error);
    return NextResponse.json(
      { error: 'Failed to create action session', message: error.message },
      { status: 500 }
    );
  }
}
