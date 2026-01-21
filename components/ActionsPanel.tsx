'use client';

import React, { useState, useEffect } from 'react';
import { ActionSession, Action } from '@/types/actions';
import { getActionsWithSessions, deleteActionSession, deleteAction, saveSessionToDatabase, updateActionSession } from '@/lib/actions';

export default function ActionsPanel() {
  const [actionsWithSessions, setActionsWithSessions] = useState<Array<Action & { session: ActionSession }>>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [savingSessions, setSavingSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadActions();
    
    // Listen for action updates
    const handleStorageChange = () => {
      loadActions();
    };
    
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom event for same-tab updates
    window.addEventListener('actionsUpdated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('actionsUpdated', handleStorageChange);
    };
  }, []);

  const loadActions = () => {
    const actions = getActionsWithSessions();
    setActionsWithSessions(actions);
  };

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const handleDeleteSession = (sessionId: string) => {
    if (confirm('Are you sure you want to delete this action session and all its actions?')) {
      deleteActionSession(sessionId);
      loadActions();
      // Dispatch event to notify other components
      window.dispatchEvent(new Event('actionsUpdated'));
    }
  };

  const handleDeleteAction = (actionId: string) => {
    if (confirm('Are you sure you want to delete this action?')) {
      deleteAction(actionId);
      loadActions();
      // Dispatch event to notify other components
      window.dispatchEvent(new Event('actionsUpdated'));
    }
  };

  const handleSaveAsDraft = async (sessionId: string) => {
    try {
      setSavingSessions(prev => new Set(prev).add(sessionId));
      await saveSessionToDatabase(sessionId);
      // Update session status to draft in localStorage
      updateActionSession(sessionId, { status: 'draft' });
      alert('Session saved as draft successfully!');
      loadActions();
    } catch (error: any) {
      console.error('Error saving session:', error);
      alert(`Failed to save session: ${error.message}`);
    } finally {
      setSavingSessions(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });
    }
  };

  const handleReflexUpdate = (sessionId: string) => {
    // TODO: Implement reflex update functionality
    alert('Reflex Update functionality will be implemented soon');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'applied':
      case 'confirmed':
        return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
      case 'draft':
      default:
        return 'bg-zinc-500/20 text-zinc-700 dark:text-zinc-400 border-zinc-500/30';
    }
  };

  const getActionTypeIcon = (actionType: string) => {
    switch (actionType) {
      case 'assign':
        return '➕';
      case 'unassign':
        return '➖';
      case 'change_stage':
        return '🔄';
      default:
        return '📝';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Group actions by session
  const sessionsMap = new Map<string, Array<Action & { session: ActionSession }>>();
  actionsWithSessions.forEach(item => {
    if (!sessionsMap.has(item.session_id)) {
      sessionsMap.set(item.session_id, []);
    }
    sessionsMap.get(item.session_id)!.push(item);
  });

  const sessions = Array.from(sessionsMap.entries()).map(([sessionId, actions]) => ({
    session: actions[0].session,
    actions,
  }));

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div
        className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl font-bold shadow-lg">
              📋
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Action History</h3>
              <p className="text-white/80 text-sm">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} • {actionsWithSessions.length} action{actionsWithSessions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="text-white text-2xl">
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 max-h-[600px] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
              <div className="text-4xl mb-2">📭</div>
              <p>No actions recorded yet</p>
              <p className="text-sm mt-1">Actions will appear here when you assign or unassign tasks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(({ session, actions }) => (
                <div
                  key={session.id}
                  className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800/50"
                >
                  {/* Session Header */}
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => toggleSession(session.id)}
                          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                        >
                          {expandedSessions.has(session.id) ? '▼' : '▶'}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${getStatusColor(session.status)}`}>
                              {session.status.toUpperCase()}
                            </span>
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">
                              {formatDate(session.created_at)}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                            Created by: {session.created_by} • {actions.length} action{actions.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveAsDraft(session.id)}
                          disabled={savingSessions.has(session.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            savingSessions.has(session.id)
                              ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg'
                          }`}
                        >
                          {savingSessions.has(session.id) ? 'Saving...' : 'Save as Draft'}
                        </button>
                        <button
                          onClick={() => handleReflexUpdate(session.id)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-500 hover:bg-purple-600 text-white shadow-md hover:shadow-lg transition-all"
                        >
                          Reflex Update
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          className="ml-2 px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors text-sm"
                          title="Delete session"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions List */}
                  {expandedSessions.has(session.id) && (
                    <div className="p-2 space-y-2">
                      {actions.map((action) => (
                        <div
                          key={action.id}
                          className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{getActionTypeIcon(action.action_type)}</span>
                                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${getStatusColor(action.status)}`}>
                                  {action.status.toUpperCase()}
                                </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {action.action_type}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                                {action.description}
                              </p>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                                <div>
                                  <span className="font-medium">Entity:</span> {action.entity_type} #{action.entity_id}
                                </div>
                                {action.applied_at && (
                                  <div>
                                    <span className="font-medium">Applied at:</span> {formatDate(action.applied_at)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
