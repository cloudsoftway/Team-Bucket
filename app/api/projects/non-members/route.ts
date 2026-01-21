import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

// GET /api/projects/non-members?projectIds=1,2,3
// Returns team members (res.users) that are NOT involved in the given projects.
export async function GET(request: NextRequest) {
  try{
    const searchParams = request.nextUrl.searchParams;
    const projectIdsParam = searchParams.get('projectIds');

    if (!projectIdsParam) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'projectIds query parameter is required',
        },
        { status: 400 }
      );
    }

    const projectIds = projectIdsParam
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    if (projectIds.length === 0) {
      return NextResponse.json({ members: [] }, { status: 200 });
    }

    const client = createOdooClient();
    console.log ('projectIds:', projectIds);
    const members = await client.getMembersNotInvolvedInProjects(projectIds);

    return NextResponse.json({ members }, { status: 200 });
  } catch (error: any) {
    console.error('API Error (non-members):', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch members not involved in projects',
        message: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

