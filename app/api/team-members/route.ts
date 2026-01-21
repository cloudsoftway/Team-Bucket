import { NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function GET() {
  try {
    const client = createOdooClient();
    const teamMembers = await client.getTeamMembers();
    
    return NextResponse.json({ teamMembers }, { status: 200 });
  } catch (error: any) {
    console.error('API Error:', error);
    
    // Return a more user-friendly error message
    const errorMessage = error.message || 'Unknown error occurred';
    const statusCode = errorMessage.includes('configuration') ? 500 : 500;
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch team members',
        message: errorMessage
      },
      { status: statusCode }
    );
  }
}
