import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET() {
  try {
    const client = createOdooClient();
    const projects = await client.getProjects();
    
    return NextResponse.json({ projects }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch projects',
        message: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
