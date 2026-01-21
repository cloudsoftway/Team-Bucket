import { ActionSession, Action } from '@/types/actions';

const SESSIONS_STORAGE_KEY = 'action_sessions';
const ACTIONS_STORAGE_KEY = 'action_items';

// Generate unique ID
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get current user identifier (from localStorage or default)
const getCurrentUser = (): string => {
  // You can customize this to get from auth system, localStorage, etc.
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentUser') || 'system';
  }
  return 'system';
};

// Action Session Management
export const createActionSession = (): ActionSession => {
  const session: ActionSession = {
    id: generateId(),
    created_by: getCurrentUser(),
    status: 'draft',
    created_at: new Date().toISOString(),
  };
  
  const sessions = getActionSessions();
  sessions.push(session);
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  
  return session;
};

export const getActionSessions = (): ActionSession[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const updateActionSession = (sessionId: string, updates: Partial<ActionSession>): void => {
  const sessions = getActionSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates };
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  }
};

export const deleteActionSession = (sessionId: string): void => {
  const sessions = getActionSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  
  // Also delete all actions in this session
  const actions = getActions().filter(a => a.session_id !== sessionId);
  localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions));
};

// Action Management
export const createAction = (
  sessionId: string,
  description: string,
  entityType: string,
  entityId: number,
  actionType: 'assign' | 'unassign' | 'change_stage',
  beforeState: Record<string, any>,
  afterState: Record<string, any>
): Action => {
  const action: Action = {
    id: generateId(),
    session_id: sessionId,
    description,
    entity_type: entityType,
    entity_id: entityId,
    action_type: actionType,
    before_state: beforeState,
    after_state: afterState,
    applied_at: null,
    status: 'pending',
  };
  
  const actions = getActions();
  actions.push(action);
  localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions));
  
  return action;
};

export const getActions = (sessionId?: string): Action[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(ACTIONS_STORAGE_KEY);
  const allActions: Action[] = stored ? JSON.parse(stored) : [];
  
  if (sessionId) {
    return allActions.filter(a => a.session_id === sessionId);
  }
  
  return allActions;
};

export const updateAction = (actionId: string, updates: Partial<Action>): void => {
  const actions = getActions();
  const index = actions.findIndex(a => a.id === actionId);
  if (index !== -1) {
    actions[index] = { ...actions[index], ...updates };
    localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions));
  }
};

export const deleteAction = (actionId: string): void => {
  const actions = getActions().filter(a => a.id !== actionId);
  localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions));
};

// Find actions by entity_id and action_type
export const findActionsByEntityAndType = (
  entityId: number,
  actionType: 'assign' | 'unassign' | 'change_stage'
): Action[] => {
  return getActions().filter(
    a => a.entity_id === entityId && a.action_type === actionType
  );
};

// Get all actions with their sessions
export const getActionsWithSessions = (): Array<Action & { session: ActionSession }> => {
  const actions = getActions();
  const sessions = getActionSessions();
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  
  return actions
    .map(action => ({
      ...action,
      session: sessionMap.get(action.session_id)!,
    }))
    .filter(item => item.session) // Filter out actions with missing sessions
    .sort((a, b) => {
      // Sort by created_at descending (newest first)
      return new Date(b.session.created_at).getTime() - new Date(a.session.created_at).getTime();
    });
};

// Save session with actions to database
export const saveSessionToDatabase = async (sessionId: string): Promise<void> => {
  try {
    const sessions = getActionSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const actions = getActions(sessionId);

    const response = await fetch(`/api/actions/sessions/${sessionId}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session,
        actions,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save session to database');
    }
  } catch (error: any) {
    console.error('Error saving session to database:', error);
    throw error;
  }
};
