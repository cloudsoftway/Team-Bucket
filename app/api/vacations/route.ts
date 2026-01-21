import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUserIdsParam = searchParams.get('userIds');
    const rawEmployeeIdsParam = searchParams.get('employeeIds');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Normalize empty strings to null so we don't treat `employeeIds=` as a real value
    const userIdsParam =
      rawUserIdsParam && rawUserIdsParam.trim().length > 0 ? rawUserIdsParam : null;
    const employeeIdsParam =
      rawEmployeeIdsParam && rawEmployeeIdsParam.trim().length > 0 ? rawEmployeeIdsParam : null;

    // Require dates, and at least one of userIds or employeeIds (non-empty)
    if (!startDate || !endDate || (!userIdsParam && !employeeIdsParam)) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'employeeIds or userIds, plus startDate and endDate are required',
        },
        { status: 400 }
      );
    }

    const client = createOdooClient();

    let employeeIds: number[] = [];

    if (employeeIdsParam) {
      employeeIds = employeeIdsParam
        .split(',')
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      // If there were no valid numeric IDs, just return an empty result
      if (employeeIds.length === 0) {
        return NextResponse.json({ vacations: [] }, { status: 200 });
      }
    } else if (userIdsParam) {
      const userIds = userIdsParam.split(',').map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));

      if (userIds.length === 0) {
        return NextResponse.json({ vacations: [] }, { status: 200 });
      }

      // Fallback: resolve employee IDs from user IDs (legacy path)
      const userIdToEmployeeIdMap = await client.getEmployeeIdsByUserIds(userIds);
      employeeIds = Array.from(userIdToEmployeeIdMap.values());

    } else {
      // Neither employeeIds nor userIds could be resolved into valid employee IDs
      return NextResponse.json({ vacations: [] }, { status: 200 });
    }

    // Get vacations for all employees
    const vacations = await client.getVacationsForEmployees(employeeIds, startDate, endDate);

    return NextResponse.json({ 
      vacations
    }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch vacations',
        message: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
