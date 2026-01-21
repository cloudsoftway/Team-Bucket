'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Project, ProjectTask, TeamMember } from '@/lib/odoo';

// Helper function to build full Odoo URL
const getOdooTaskUrl = (accessUrl: string): string => {
  // If access_url already contains a full URL, use it as-is
  if (accessUrl.startsWith('http://') || accessUrl.startsWith('https://')) {
    return accessUrl;
  }
  
  // Get base URL from environment variable
  const baseUrl = process.env.NEXT_PUBLIC_ODOO_URL || '';
  
  // Remove trailing slash from base URL if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // Ensure access_url starts with /
  const cleanAccessUrl = accessUrl.startsWith('/') ? accessUrl : `/${accessUrl}`;
  
  return cleanBaseUrl ? `${cleanBaseUrl}${cleanAccessUrl}` : accessUrl;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [projectMembers, setProjectMembers] = useState<TeamMember[]>([]);
  const [projectLoading, setProjectLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [isTasksSectionExpanded, setIsTasksSectionExpanded] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTasks();
      fetchProjectMembers();
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setProjectLoading(true);
      setError(null);
      const response = await fetch(`/api/projects/${projectId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch project');
      }

      setProject(data.project);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching project');
      console.error('Error:', err);
    } finally {
      setProjectLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      setTasksLoading(true);
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch tasks');
      }

      setTasks(data.tasks || []);
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      // Don't set error state for tasks, just log it
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchProjectMembers = async () => {
    try {
      setMembersLoading(true);
      const response = await fetch(`/api/projects/${projectId}/members`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch project members');
      }

      setProjectMembers(data.members || []);
    } catch (err: any) {
      console.error('Error fetching project members:', err);
      // Don't set error state for members, just log it
    } finally {
      setMembersLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatPriority = (priority?: string) => {
    if (!priority) return '-';
    const priorities: Record<string, { label: string; color: string }> = {
      '0': { label: 'Low', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      '1': { label: 'Normal', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
      '2': { label: 'High', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
      '3': { label: 'Urgent', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    };
    const priorityInfo = priorities[priority] || { label: priority, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${priorityInfo.color}`}>
        {priorityInfo.label}
      </span>
    );
  };

  const toggleTask = (taskId: number) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const isTaskExpanded = (taskId: number) => expandedTasks.has(taskId);

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-lg text-red-600 dark:text-red-400">{error}</div>
        <button
          onClick={fetchProject}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">Project not found</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-zinc-50 dark:bg-black min-h-full">
      <div className="mb-8">
        <a
          href="/"
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 mb-4 inline-block"
        >
          ← Back to Dashboard
        </a>
        <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-2">
          {project.name}
        </h1>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-500 block mb-1">
              Project ID
            </label>
            <div className="text-lg text-zinc-900 dark:text-zinc-50">
              {project.id}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-500 block mb-1">
              Status
            </label>
            <div>
              {project.active !== false ? (
                <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                  Active
                </span>
              ) : (
                <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded">
                  Inactive
                </span>
              )}
            </div>
          </div>

          {project.user_id && (
            <div>
              <label className="text-sm font-medium text-zinc-500 dark:text-zinc-500 block mb-1">
                Assigned User
              </label>
              <div className="text-lg text-zinc-900 dark:text-zinc-50">
                {Array.isArray(project.user_id) ? project.user_id[1] : project.user_id}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-500 block mb-1">
              Project Name
            </label>
            <div className="text-lg text-zinc-900 dark:text-zinc-50">
              {project.name}
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="mt-8">
        <button
          onClick={() => setIsTasksSectionExpanded(!isTasksSectionExpanded)}
          className="flex items-center gap-3 w-full text-left mb-4 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <svg
            className={`w-5 h-5 text-zinc-600 dark:text-zinc-400 transition-transform ${
              isTasksSectionExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <h2 className="text-2xl font-bold text-black dark:text-zinc-50">
            Tasks
            {tasks.length > 0 && (
              <span className="ml-2 text-lg font-normal text-zinc-500 dark:text-zinc-400">
                ({tasks.length})
              </span>
            )}
          </h2>
        </button>
        
        {isTasksSectionExpanded && (
          <>
            {tasksLoading ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                Loading tasks...
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                No tasks found for this project
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-12">
                      
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
                      Name
                    </th>
                    {expandedTasks.size > 0 && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Stage
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Deadline
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          End Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Status
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-700">
                  {tasks.map((task) => {
                    const isExpanded = isTaskExpanded(task.id);
                    return (
                      <>
                        <tr
                          key={task.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          onClick={() => toggleTask(task.id)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTask(task.id);
                              }}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                            >
                              <svg
                                className={`w-4 h-4 text-zinc-600 dark:text-zinc-400 transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-50">
                            {task.id}
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-50">
                            <div className="font-medium">{task.name}</div>
                          </td>
                          {isExpanded && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 dark:text-zinc-300">
                                {task.stage_id && Array.isArray(task.stage_id) ? task.stage_id[1] : '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {formatPriority(task.priority)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 dark:text-zinc-300">
                                {formatDate(task.date_deadline)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 dark:text-zinc-300">
                                {formatDate(task.date_end)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {task.activity_state ? (
                                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                                    {task.activity_state}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded">
                                    -
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr key={`${task.id}-details`} className="bg-zinc-50 dark:bg-zinc-900">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                {task.description && (
                                  <div>
                                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
                                      Description
                                    </label>
                                    <div className="text-zinc-700 dark:text-zinc-300 prose prose-sm max-w-none">
                                      <div
                                        dangerouslySetInnerHTML={{
                                          __html: task.description || '',
                                        }}
                                        className="text-xs"
                                      />
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
                                    Additional Details
                                  </label>
                                  <div className="space-y-2 text-xs">
                                    {task.display_name && (
                                      <div>
                                        <span className="text-zinc-500 dark:text-zinc-400">Display Name: </span>
                                        <span className="text-zinc-700 dark:text-zinc-300">{task.display_name}</span>
                                      </div>
                                    )}
                                    {task.date_assign && (
                                      <div>
                                        <span className="text-zinc-500 dark:text-zinc-400">Assign Date: </span>
                                        <span className="text-zinc-700 dark:text-zinc-300">{formatDate(task.date_assign)}</span>
                                      </div>
                                    )}
                                  
                                    {task.access_url && (
                                      <div>
                                        <span className="text-zinc-500 dark:text-zinc-400">Access URL: </span>
                                        <a
                                          href={getOdooTaskUrl(task.access_url)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                          {task.access_url}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
            )}
          </>
        )}

        {/* Project Members Section */}
        

<div className="mt-6">
            <h3 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
              Project Members ({projectMembers.length})
            </h3>
            
            {membersLoading ? (
              <div className="text-center py-4 text-zinc-600 dark:text-zinc-400">
                Loading members...
              </div>
            ) : projectMembers.length === 0 ? (
              <div className="text-center py-4 text-zinc-600 dark:text-zinc-400">
                No members found for this project
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projectMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-black dark:text-zinc-50">
                          {member.name}
                        </div>
                        {member.email && (
                          <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            {member.email}
                          </div>
                        )}
                      </div>
                      {member.active !== false && (
                        <span className="ml-2 flex-shrink-0">
                          <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
