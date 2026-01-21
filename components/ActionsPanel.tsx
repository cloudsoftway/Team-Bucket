'use client';

import React, { useState, useEffect } from 'react';
import { ActionSession, Action } from '@/types/actions';
import { getActionsWithSessions, deleteActionSession, deleteAction, saveSessionToDatabase, updateActionSession, getActions } from '@/lib/actions';

export default function ActionsPanel() {
  const [actionsWithSessions, setActionsWithSessions] = useState<Array<Action & { session: ActionSession }>>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [savingSessions, setSavingSessions] = useState<Set<string>>(new Set());
  const [reviewTaskStatuses, setReviewTaskStatuses] = useState<Array<{original: any; upcoming: any; action: any; additional_info?: any}>>([]);
  const [reviewProjectStatuses, setReviewProjectStatuses] = useState<Array<{original: any; upcoming: any; action: any; additional_info?: any}>>([]);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [teamMembersExpanded, setTeamMembersExpanded] = useState(true);

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

  const handleReflexUpdate = async (sessionId: string) => {
    try {
      // Check current Odoo status via API route (server-side)
      // Get actions from Redux (client-side) and pass them to API
      const clientActions = getActions(sessionId);
      const response = await fetch('/api/actions/check-odoo-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sessionId,
          actions: clientActions // Pass client-side actions in case they're not in DB yet
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(`Odoo is not accessible: ${data.message || 'Unknown error'}. Please check the connection and try again.`);
        return;
      }

      if (!data.isOdooReady) {
        alert('Odoo is not accessible. Please check the connection and try again.');
        return;
      }

      // Store all task and project statuses for review
      const taskStatuses = Array.isArray(data.taskStatuses) ? data.taskStatuses : [];
      const projectStatuses = Array.isArray(data.projectStatuses) ? data.projectStatuses : [];

      // Show modal if there are any changes to review
      if (taskStatuses.length > 0 || projectStatuses.length > 0) {
        setReviewTaskStatuses(taskStatuses);
        setReviewProjectStatuses(projectStatuses);
      }
    } catch (error: any) {
      console.error('Error during reflex update:', error);
      alert(`Failed to perform reflex update: ${error.message}`);
    }
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

  const hasReviewData = reviewTaskStatuses.length > 0 || reviewProjectStatuses.length > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden relative">
      {hasReviewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-5xl w-full mx-4 border border-zinc-200 dark:border-zinc-800 my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Review Planned Changes
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  The following changes will be applied to Odoo once you confirm.
                </p>
              </div>
              <button
                onClick={() => {
                  setReviewTaskStatuses([]);
                  setReviewProjectStatuses([]);
                }}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Content - Two Cards */}
            <div className="px-6 py-4 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Tasks Card */}
              {reviewTaskStatuses.length > 0 && (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900/50">
                  <button
                    onClick={() => setTasksExpanded(!tasksExpanded)}
                    className="w-full flex items-center justify-between text-left mb-4 focus:outline-none"
                  >
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      📋 Tasks ({reviewTaskStatuses.length})
                    </h3>
                    <svg
                      className={`w-5 h-5 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
                        tasksExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {tasksExpanded && (
                    <div className="space-y-4">
                    {reviewTaskStatuses.map((status, idx) => (
                      <div key={idx} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                        {/* Task Header */}
                        <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            Task: {status.original?.name || status.action.description}
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            Project: {status.original?.project_id?.[1] || 'Unknown'} • Task ID: #{status.original?.id ?? status.action.entity_id}
                          </p>
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-xs font-medium mt-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                            <span>Status: {status.original?.stage_id?.[1] || 'Unknown'}</span>
                          </div>
                        </div>

                        {/* Before/After Comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Current (Before) */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                              👈 Current (Odoo)
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Assigned to: </span>
                                <span className={status.original?.user_ids?.length ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.original?.user_ids?.length ? 'Existing user(s)' : '—'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Stage: </span>
                                <span className={status.original?.stage_id ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.original?.stage_id?.[1] || 'Unknown'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Allocated hours: </span>
                                <span className={status.original?.allocated_hours ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.original?.allocated_hours ?? 0}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Deadline: </span>
                                <span className={status.original?.date_deadline && status.original.date_deadline !== false ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.original?.date_deadline && status.original.date_deadline !== false ? String(status.original.date_deadline) : 'Not set'}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Planned (After) */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                              👉 Planned (After)
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Assigned to: </span>
                                <span className={status.additional_info?.member?.name ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.additional_info?.member?.name || 'Unchanged'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Stage: </span>
                                <span className={status.upcoming?.stage ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.upcoming?.stage ?? 'Unchanged'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Allocated hours: </span>
                                <span className={status.upcoming?.allocated_hours !== undefined ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.upcoming?.allocated_hours !== undefined ? status.upcoming.allocated_hours : 'Unchanged'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Deadline: </span>
                                <span className={status.upcoming?.date_deadline ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.upcoming?.date_deadline ?? 'Unchanged'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              )}

              {/* Team Members Card */}
              {reviewProjectStatuses.length > 0 && (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900/50">
                  <button
                    onClick={() => setTeamMembersExpanded(!teamMembersExpanded)}
                    className="w-full flex items-center justify-between text-left mb-4 focus:outline-none"
                  >
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      👥 Add Team Member ({reviewProjectStatuses.length})
                    </h3>
                    <svg
                      className={`w-5 h-5 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
                        teamMembersExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {teamMembersExpanded && (
                    <div className="space-y-4">
                    {reviewProjectStatuses.map((status, idx) => (
                      <div key={idx} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                        {/* Project Header */}
                        <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            Project: {status.original?.name || 'Unknown Project'}
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            Project ID: #{status.original?.id ?? status.action.entity_id}
                          </p>
                        </div>

                        {/* Before/After Comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Current (Before) */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                              👈 Current (Odoo)
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Members: </span>
                                <span className={status.original?.user_id ? 'text-emerald-600' : 'text-zinc-400'}>
                                 {'—'}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Status: </span>
                                <span className={status.original?.active ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.original?.active ? 'Active' : 'Inactive'}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Planned (After) */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                              👉 Planned (After)
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Members: </span>
                                  <span className={status.additional_info?.member?.name || status.upcoming?.user_ids ? 'text-emerald-600' : 'text-zinc-400'}>
                                    {status.additional_info?.member?.name || 'Unchanged'}
                                  </span>
                              </p>
                              <p>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">Status: </span>
                                <span className={status.upcoming?.active !== undefined ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {status.upcoming?.active !== undefined ? (status.upcoming.active ? 'Active' : 'Inactive') : 'Unchanged'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 rounded-b-2xl">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                <p>
                  Total changes: {reviewTaskStatuses.length} task(s), {reviewProjectStatuses.length} project(s)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setReviewTaskStatuses([]);
                    setReviewProjectStatuses([]);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // TODO: call apply changes endpoint
                    alert('Apply Changes not implemented yet');
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg"
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
