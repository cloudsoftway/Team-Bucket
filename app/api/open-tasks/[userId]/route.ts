import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const userIdNum = parseInt(userId, 10);

    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Get date range from query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate query parameters are required' },
        { status: 400 }
      );
    }

    const odooClient = createOdooClient();
    const tasks = await odooClient.getOpenTasksForUser(userIdNum, startDate, endDate);

    // Sum allocated_hours
    const totalOpenTasksHours = tasks.reduce((sum, task) => {
      return sum + (task.allocated_hours || 0);
    }, 0);

    return NextResponse.json({
      userId: userIdNum,
      tasks,
      totalOpenTasksHours,
    });
  } catch (error: any) {
    console.error('Error fetching open tasks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch open tasks' },
      { status: 500 }
    );
  }
}
