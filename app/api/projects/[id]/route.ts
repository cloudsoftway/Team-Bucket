import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both Promise and direct params (Next.js 13+ compatibility)
    const resolvedParams = params instanceof Promise ? await params : params;
    const projectId = parseInt(resolvedParams.id, 10);
    
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID' },
        { status: 400 }
      );
    }

    console.log(`Fetching project with ID: ${projectId}`);
    
    const client = createOdooClient();
    const project = await client.getProjectById(projectId);
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ project }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch project',
        message: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
