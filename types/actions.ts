export interface ActionSession {
  id: string;
  created_by: string; // User identifier (could be email, username, etc.)
  status: 'draft' | 'confirmed' | 'applied' | 'failed';
  created_at: string; // ISO timestamp
}

export interface Action {
  id: string;
  session_id: string;
  description: string;
  entity_type: string;
  entity_id: number;
  action_type: 'assign' | 'unassign' | 'change_stage' | 'add_to_team';
  // Legacy before/after snapshots
  before_state: Record<string, any>; 
  after_state: Record<string, any>; 
  // Engine-based payloads
  update_json: Record<string, any>;
  condition_json: Record<string, any> | null;
  additional_info_json?: Record<string, any> | null;
  applied_at: string | null; 
  status: 'pending' | 'applied' | 'failed';
}
