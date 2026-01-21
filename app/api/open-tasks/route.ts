import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

// Fetch open tasks for multiple users in a single Odoo call.
// Query params:
//   userIds: comma-separated user IDs (e.g. "31,37")
//   startDate: "YYYY-MM-DD"
//   endDate: "YYYY-MM-DD"
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userIdsParam = searchParams.get('userIds');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userIdsParam || !startDate || !endDate) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'userIds, startDate, and endDate are required',
        },
        { status: 400 }
      );
    }

    const userIds = userIdsParam
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    if (userIds.length === 0) {
      return NextResponse.json(
        { tasks: [], totalsByUserId: {} },
        { status: 200 }
      );
    }

    const odooClient = createOdooClient();
    const tasks = await odooClient.getOpenTasksForUsers(
      userIds,
      startDate,
      endDate
    );

    // Build total allocated_hours per userId.
    const totalsByUserId: Record<number, number> = {};
    userIds.forEach((id) => {
      totalsByUserId[id] = 0;
    });

    tasks.forEach((task) => {
      const hours = task.allocated_hours || 0;
      const taskUserIds = Array.isArray(task.user_ids)
        ? (task.user_ids as number[])
        : [];

      taskUserIds.forEach((uid) => {
        if (totalsByUserId[uid] !== undefined) {
          totalsByUserId[uid] += hours;
        }
      });
    });

    return NextResponse.json(
      {
        userIds,
        tasks,
        totalsByUserId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching open tasks for multiple users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch open tasks' },
      { status: 500 }
    );
  }
}

