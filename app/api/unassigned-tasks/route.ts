import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectIdsParam = searchParams.get('projectIds');
    
    let projectIds: number[] | undefined;
    if (projectIdsParam) {
      projectIds = projectIdsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    }
    
    const client = createOdooClient();
    const tasks = await client.getUnassignedTasks(projectIds);
    
    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch unassigned tasks',
        message: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
