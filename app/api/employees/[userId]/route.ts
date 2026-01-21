import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: userIdParam } = await params;
    const userId = parseInt(userIdParam, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          error: 'Invalid user ID',
          message: 'User ID must be a valid number',
        },
        { status: 400 }
      );
    }

    const client = createOdooClient();
    const employeeId = await client.getEmployeeIdByUserId(userId);

    return NextResponse.json({ employeeId }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch employee ID',
        message: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
