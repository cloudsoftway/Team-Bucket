// Action Session - groups related actions together
export interface ActionSession {
  id: string;
  created_by: string; // User identifier (could be email, username, etc.)
  status: 'draft' | 'confirmed' | 'applied' | 'failed';
  created_at: string; // ISO timestamp
}

// Individual Action - represents a single operation
export interface Action {
  id: string;
  session_id: string;
  description: string; // e.g., "assign task 14 to katia"
  entity_type: string; // e.g., "project.task"
  entity_id: number; // Odoo task ID
  action_type: 'assign' | 'unassign' | 'change_stage';
  before_state: Record<string, any>; // JSON object
  after_state: Record<string, any>; // JSON object
  applied_at: string | null; // ISO timestamp or null
  status: 'pending' | 'applied' | 'failed';
}
