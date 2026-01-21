'use client';

import React, { useEffect, useState } from 'react';
import { ProjectTask, Project, TeamMember } from '@/lib/odoo';
import { createActionSession, createAction, updateActionSession, deleteAction, findActionsByEntityAndType } from '@/lib/actions';
import ActionsPanel from './ActionsPanel';

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

export default function Dashboard() {
  const [unassignedTasks, setUnassignedTasks] = useState<ProjectTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [displayedMembers, setDisplayedMembers] = useState<TeamMember[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [pendingProjectIds, setPendingProjectIds] = useState<number[]>([]);
  const [draggedTask, setDraggedTask] = useState<ProjectTask | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<Map<number, number>>(new Map()); // taskId -> userId
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isUnassignedSectionExpanded, setIsUnassignedSectionExpanded] = useState(true);

  // Persist selected project filters so other components (e.g. Sidebar) can react
  useEffect(() => {
    try {
      localStorage.setItem('selectedProjectIds', JSON.stringify(selectedProjectIds));
      window.dispatchEvent(new Event('projectFilterChanged'));
    } catch (err) {
      console.error('Failed to persist selectedProjectIds:', err);
    }
  }, [selectedProjectIds]);

  // Calculate member capacity based on weekly hours minus weekly vacation hours
  const getMemberCapacity = (member: TeamMember): { hours: number; percentage: number } => {
    const averageWeeklyHours = parseInt(localStorage.getItem('averageWeeklyHours') || '40', 10);
    const weeklyVacationHours = (member as any).weeklyVacationHours || 0;
    
    // Capacity = weekly hours - weekly vacation hours - allocated hours of the new assigned project
    const availableHours = Math.max(0, averageWeeklyHours - weeklyVacationHours);
    
    // Convert to percentage (based on average weekly hours)
    const percentage = averageWeeklyHours > 0 
      ? (availableHours / averageWeeklyHours) * 100 
      : 0;
    
    return {
      hours: availableHours,
      percentage: Math.min(100, Math.max(0, percentage))
    };
  };

  // Calculate task effort in hours (default: 8 hours, can be adjusted based on task properties)
  const calculateTaskEffort = (task: ProjectTask): number => {
    // Base effort: 8 hours
    if (task.allocated_hours !== undefined && task.allocated_hours !== null && task.allocated_hours !== 0) {
      return task.allocated_hours;
    } 
    let effort = 8;
    
    // Adjust based on priority
    if (task.priority === '1') { 
      effort = 16;
    } else if (task.priority === '2') {
      effort = 12;
    } else if (task.priority === '3') {
      effort = 8;
    } else if (task.priority === '4') {
      effort = 4;
    }
    
    return effort;
  };

  // Calculate assigned capacity for a member (base capacity + assigned task efforts + open tasks)
  const getAssignedCapacity = (member: TeamMember): { hours: number; percentage: number; usedPercentage: number } => {
    // Get base capacity (weekly hours - vacation hours)
    const baseCapacity = getMemberCapacity(member);
    
    // Calculate assigned task effort in hours (from drag-and-drop)
    let totalEffort = 0;
    taskAssignments.forEach((assignedUserId, taskId) => {
      if (assignedUserId === member.id) {
        const task = unassignedTasks.find(t => t.id === taskId);
        if (task) {
          totalEffort += calculateTaskEffort(task);
        }
      }
    });
    
    // Get open tasks hours (from Odoo)
    const openTasksHours = (member as any).totalOpenTasksHours || 0;
    
    // Total used hours = assigned task hours + open tasks hours
    const totalUsedHours = totalEffort + openTasksHours;
    
    // Total available hours = base capacity hours - total used hours
    const availableHours = Math.max(0, baseCapacity.hours - totalUsedHours);
    
    // Convert to percentage (based on average weekly hours)
    const averageWeeklyHours = parseInt(localStorage.getItem('averageWeeklyHours') || '40', 10);
    const percentage = averageWeeklyHours > 0 
      ? (availableHours / averageWeeklyHours) * 100 
      : 0;
    
    // Used capacity percentage (inverted - for bar display)
    const usedPercentage = 100 - percentage;
    
    return {
      hours: availableHours,
      percentage: Math.min(100, Math.max(0, percentage)),
      usedPercentage: Math.min(100, Math.max(0, usedPercentage))
    };
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, task: ProjectTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id.toString());
  };

  // Handle dropping a member dragged from the Sidebar into the Project Team Members grid
  const handleSidebarMemberDrop = (memberId: number) => {
    if (!memberId) return;

    try {
      let member: TeamMember | undefined = teamMembers.find((m) => m.id === memberId);

      if (!member) {
        const cached = localStorage.getItem('teamMembersCached');
        if (cached) {
          const cachedMembers: TeamMember[] = JSON.parse(cached);
          member = cachedMembers.find((m) => m.id === memberId);
        }
      }

      if (!member) return;

      setDisplayedMembers((prev) => {
        // If already displayed, no need to add again
        if (prev.some((m) => m.id === memberId)) {
          return prev;
        }
        return [...prev, member as TeamMember];
      });

      // Mark this member as part of the Project Team (hidden from sidebar)
      try {
        const raw = localStorage.getItem('projectTeamMemberIds');
        let ids: number[] = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            ids = parsed.filter((id) => typeof id === 'number');
          }
        }
        if (!ids.includes(memberId)) {
          ids.push(memberId);
          localStorage.setItem('projectTeamMemberIds', JSON.stringify(ids));
          window.dispatchEvent(new Event('sidebarMembersChanged'));
        }
      } catch (e) {
        console.error('Failed to update projectTeamMemberIds in localStorage:', e);
      }

      // After the card is rendered, scroll it into view and highlight
      setTimeout(() => {
        const el = document.getElementById(`member-card-${memberId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-indigo-500');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-indigo-500');
          }, 1500);
        }
      }, 150);
    } catch (err) {
      console.error('Failed to handle sidebar member drop:', err);
    }
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop on user
  const handleDropOnUser = (e: React.DragEvent, memberId: number) => {
    e.preventDefault();
    
    if (draggedTask && currentSessionId) {
      const previousUserId = taskAssignments.get(draggedTask.id);
      const member = teamMembers.find(m => m.id === memberId);
      const memberName = member?.name || `User ${memberId}`;
      
      // Create before state
      const beforeState = {
        assigned_to: previousUserId || null,
        task_id: draggedTask.id,
        task_name: draggedTask.name,
      };
      
      // Create after state
      const afterState = {
        assigned_to: memberId,
        task_id: draggedTask.id,
        task_name: draggedTask.name,
      };
      
      // Create action using the current session
      createAction(
        currentSessionId,
        `Assign task "${draggedTask.name}" (ID: ${draggedTask.id}) to ${memberName}`,
        'project.task',
        draggedTask.id,
        'assign',
        beforeState,
        afterState
      );
      
      // Dispatch event to notify ActionsPanel
      window.dispatchEvent(new Event('actionsUpdated'));
      
      const newAssignments = new Map(taskAssignments);
      newAssignments.set(draggedTask.id, memberId);
      setTaskAssignments(newAssignments);
      
      // Save to localStorage
      const assignmentsObj = Object.fromEntries(newAssignments);
      localStorage.setItem('taskAssignments', JSON.stringify(assignmentsObj));
      
      setDraggedTask(null);
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  // Remove task assignment
  const handleUnassignTask = (taskId: number) => {
    const previousUserId = taskAssignments.get(taskId);
    const task = unassignedTasks.find(t => t.id === taskId);
    const previousMember = teamMembers.find(m => m.id === previousUserId);
    
    // Find and delete the assign action associated with this task
    const assignActions = findActionsByEntityAndType(taskId, 'assign');
    assignActions.forEach(assignAction => {
      deleteAction(assignAction.id);
    });

    // Dispatch event to notify ActionsPanel
    window.dispatchEvent(new Event('actionsUpdated'));
    
    const newAssignments = new Map(taskAssignments);
    newAssignments.delete(taskId);
    setTaskAssignments(newAssignments);
    
    // Save to localStorage
    const assignmentsObj = Object.fromEntries(newAssignments);
    localStorage.setItem('taskAssignments', JSON.stringify(assignmentsObj));
  };

  // Consolidated fetch function that fetches everything needed
  const fetchAllData = async () => {
    try {
      setLoading(true);
      await fetchProjects();
      const startDate = localStorage.getItem('vacationStartDate');
      const endDate = localStorage.getItem('vacationEndDate');

      // Ensure we have a base list of all team members when no project filter is applied
      let baseTeamMembers: TeamMember[] = teamMembers;
      if (selectedProjectIds.length === 0 && baseTeamMembers.length === 0) {
        try {
          const res = await fetch('/api/team-members');
          const data = await res.json();
          if (res.ok) {
            baseTeamMembers = data.teamMembers || [];
            setTeamMembers(baseTeamMembers);
          }
        } catch (err) {
          console.error('Error fetching team members:', err);
        }
      }

      // 1. Fetch unassigned tasks (with project filter and date range)
      try {
        setTasksLoading(true);
        setError(null);
        
        let url = '/api/unassigned-tasks';
        if (selectedProjectIds.length > 0) {
          const projectIdsParam = selectedProjectIds.join(',');
          url = `/api/unassigned-tasks?projectIds=${projectIdsParam}`;
        }
        
        const tasksResponse = await fetch(url);
        const tasksData = await tasksResponse.json();

        if (!tasksResponse.ok) {
          throw new Error(tasksData.message || 'Failed to fetch unassigned tasks');
        }

        setUnassignedTasks(tasksData.tasks || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching tasks');
        console.error('Error fetching tasks:', err);
      } finally {
        setTasksLoading(false);
      }

      // 2. Fetch team members based on project filter
      let membersToProcess: TeamMember[] = [];
      
      if (selectedProjectIds.length > 0) {
        // Fetch project-specific members
        try {
          setMembersLoading(true);
          const memberPromises = selectedProjectIds.map(projectId =>
            fetch(`/api/projects/${projectId}/members`).then(res => res.json())
          );

          const results = await Promise.all(memberPromises);
          console.log('results:', results);
          // Combine all members and remove duplicates by ID
          const allMembers: TeamMember[] = [];
          const memberIds = new Set<number>();
          console.log('allMembers:', allMembers);

          results.forEach(result => {
            if (result.members && Array.isArray(result.members)) {
              result.members.forEach((member: TeamMember) => {
                if (!memberIds.has(member.id)) {
                  memberIds.add(member.id);
                  allMembers.push(member);
                }
              });
            }
          });

          membersToProcess = allMembers;
          setDisplayedMembers(allMembers);
        } catch (err: any) {
          console.error('Error fetching project members:', err);
          // Fall back to all team members
          membersToProcess = baseTeamMembers;
          setDisplayedMembers(baseTeamMembers);
        } finally {
          setMembersLoading(false);
        }
      } else {
        // No project filter - use all team members
        membersToProcess = baseTeamMembers;
        setDisplayedMembers(baseTeamMembers);
      }

      // 3. Build employee ID map directly from team members (no extra employees API call)
      const userIdToEmployeeId = new Map<number, number>();
      if (membersToProcess.length > 0) {
        membersToProcess.forEach((member: any) => {
          // Prefer explicit employee_id on the member; fall back to first employee_ids entry
          const employeeId =
            member.employee_id ??
            (Array.isArray(member.employee_ids) && member.employee_ids.length > 0
              ? member.employee_ids[0]
              : undefined);

          if (employeeId) {
            userIdToEmployeeId.set(member.id, employeeId);
          }
        });
      }

      // 4. Fetch vacations and open tasks in parallel (only if dates are set)
      if (startDate && endDate && membersToProcess.length > 0) {
        try {
          // Use employee IDs directly (derived from team members)
          const employeeIdValues = Array.from(userIdToEmployeeId.values());
          const employeeIds = employeeIdValues.join(',');

          // If we somehow don't have any employee IDs yet, skip vacations call gracefully
          if (!employeeIds) {
            // Still fetch open tasks so capacity uses allocated hours
            const allUserIds = membersToProcess.map((member) => member.id).join(',');
            const openTasksResponse = await fetch(
              `/api/open-tasks?userIds=${allUserIds}&startDate=${startDate}&endDate=${endDate}`
            );
            const openTasksData = await openTasksResponse.json();
            const userIdToOpenTasksHours = new Map<number, number>();
            if (openTasksData && openTasksData.totalsByUserId) {
              Object.entries(openTasksData.totalsByUserId).forEach(
                ([userIdStr, hours]) => {
                  const userIdNum = parseInt(userIdStr, 10);
                  if (!isNaN(userIdNum)) {
                    userIdToOpenTasksHours.set(
                      userIdNum,
                      typeof hours === 'number' ? hours : 0
                    );
                  }
                }
              );
            }
            // Update members with open tasks only, no vacations
            const dailyWorkingHours = parseInt(localStorage.getItem('dailyWorkingHours') || '8', 10);
            const workingDaysPerWeek = parseInt(localStorage.getItem('workingDaysPerWeek') || '5', 10);
            setDisplayedMembers(
              membersToProcess.map((member) => {
                const employeeId = userIdToEmployeeId.get(member.id);
                const totalOpenTasksHours = userIdToOpenTasksHours.get(member.id) || 0;
                return {
                  ...member,
                  employee_id: employeeId,
                  weeklyVacationHours: 0,
                  totalOpenTasksHours,
                  vacations: [],
                };
              })
            );
            // Skip the rest of the vacations logic
            return;
          }

          // Collect all user IDs to fetch open tasks in a single API call
          const allUserIds = membersToProcess.map((member) => member.id).join(',');

          const [vacationsResponse, openTasksResponse] = await Promise.all([
            fetch(
              `/api/vacations?employeeIds=${employeeIds}&startDate=${startDate}&endDate=${endDate}`
            ),
            fetch(
              `/api/open-tasks?userIds=${allUserIds}&startDate=${startDate}&endDate=${endDate}`
            ),
          ]);

          const vacationsData = await vacationsResponse.json();
          const openTasksData = await openTasksResponse.json();

          if (!vacationsResponse.ok) {
            throw new Error(vacationsData.message || 'Failed to fetch vacations');
          }

          // Map vacations to team members by employee_id
          const vacationsByEmployeeId = new Map<number, any[]>();
          vacationsData.vacations?.forEach((vacation: any) => {
            const employeeId = Array.isArray(vacation.employee_id) ? vacation.employee_id[0] : vacation.employee_id;
            if (!vacationsByEmployeeId.has(employeeId)) {
              vacationsByEmployeeId.set(employeeId, []);
            }
            vacationsByEmployeeId.get(employeeId)!.push(vacation);
          });

          // Map open tasks hours by user ID
          const userIdToOpenTasksHours = new Map<number, number>();
          if (openTasksData && openTasksData.totalsByUserId) {
            Object.entries(openTasksData.totalsByUserId).forEach(
              ([userIdStr, hours]) => {
                const userIdNum = parseInt(userIdStr, 10);
                if (!isNaN(userIdNum)) {
                  userIdToOpenTasksHours.set(
                    userIdNum,
                    typeof hours === 'number' ? hours : 0
                  );
                }
              }
            );
          }

          const dailyWorkingHours = parseInt(localStorage.getItem('dailyWorkingHours') || '8', 10);
          const workingDaysPerWeek = parseInt(localStorage.getItem('workingDaysPerWeek') || '5', 10);

          // 5. Update members with vacations, open tasks, and calculate capacity
          setDisplayedMembers(
            membersToProcess.map((member) => {
              const employeeId = userIdToEmployeeId.get(member.id);
              const totalOpenTasksHours = userIdToOpenTasksHours.get(member.id) || 0;
              
              if (employeeId && vacationsByEmployeeId.has(employeeId)) {
                const vacations = vacationsByEmployeeId.get(employeeId) || [];
                const weeklyVacationHours = calculateVacationHoursPerWeek(
                  vacations,
                  startDate,
                  dailyWorkingHours,
                  workingDaysPerWeek
                );
                
                return {
                  ...member,
                  employee_id: employeeId,
                  vacations: vacations,
                  weeklyVacationHours: weeklyVacationHours,
                  totalOpenTasksHours: totalOpenTasksHours,
                };
              }
              return {
                ...member,
                weeklyVacationHours: 0,
                totalOpenTasksHours: totalOpenTasksHours,
              };
            })
          );
        } catch (err: any) {
          console.error('Error fetching vacations/open tasks:', err);
          // Still update members even if vacations/open tasks fail
          setDisplayedMembers(
            membersToProcess.map((member) => {
              const employeeId = userIdToEmployeeId.get(member.id);
              return {
                ...member,
                employee_id: employeeId,
                weeklyVacationHours: 0,
                totalOpenTasksHours: 0,
                vacations: [],
              };
            })
          );
        }
      } else {
        // No dates or members, but still update displayed members with employee IDs
        setDisplayedMembers(
          membersToProcess.map((member) => {
            const employeeId = userIdToEmployeeId.get(member.id);
            return {
              ...member,
              employee_id: employeeId,
              weeklyVacationHours: 0,
              totalOpenTasksHours: 0,
              vacations: [],
            };
          })
        );
      }
    } catch (err: any) {
      console.error('Error in fetchAllData:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load - fetch projects first, then fetch all data
  useEffect(() => {
    // Create a single session when the page loads
    const session = createActionSession();
    updateActionSession(session.id, { status: 'confirmed' });
    setCurrentSessionId(session.id);
    
    const initialize = async () => {
      // await fetchProjects();
      // Fetch all team members first
      try {
        // const response = await fetch('/api/team-members');
        // const data = await response.json();
        // if (response.ok) {
        //   //setTeamMembers(data.teamMembers || []);
        // }
      } catch (err) {
        console.error('Error fetching team members:', err);
      }
      // Then fetch all data
      await fetchAllData();
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch all data when project filter or dates change
  useEffect(() => {
    const startDate = localStorage.getItem('vacationStartDate');
    const endDate = localStorage.getItem('vacationEndDate');
    
    // Only fetch if we have team members loaded and dates are set (or not required for tasks)
    if (teamMembers.length > 0) {
      fetchAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectIds]);

  // Set up event listener for vacation date changes (from navbar)
  useEffect(() => {
    const handleDatesChanged = () => {
      if (teamMembers.length > 0) {
        fetchAllData();
      }
    };

    window.addEventListener('vacationDatesChanged', handleDatesChanged);
    
    // Also listen for storage changes (when dates are updated in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'vacationStartDate' || e.key === 'vacationEndDate') {
        handleDatesChanged();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('vacationDatesChanged', handleDatesChanged);
      window.removeEventListener('storage', handleStorageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers.length]); // Re-setup when team members are loaded

  // Broadcast all team members with their assigned capacity so Sidebar can reuse the exact same values,
  // including for members returned by the non-members API when project filters are applied.
  useEffect(() => {
    if (teamMembers.length > 0) {
      try {
        const membersWithCapacity = teamMembers.map((member) => {
          const assignedCapacity = getAssignedCapacity(member);
          const assignedTasks = unassignedTasks.filter(
            (task) => taskAssignments.get(task.id) === member.id
          );
          return {
            ...member,
            // Store what Sidebar needs to display the same design
            assignedCapacityPercentage: assignedCapacity.percentage,
            assignedCapacityHours: assignedCapacity.hours,
            assignedCapacityUsedPercentage: assignedCapacity.usedPercentage,
            assignedTasksCount: assignedTasks.length,
          };
        });

        localStorage.setItem('teamMembersCached', JSON.stringify(membersWithCapacity));
        window.dispatchEvent(new Event('teamMembersUpdated'));
      } catch (err) {
        console.error('Failed to cache team members:', err);
      }
    }
  }, [teamMembers, unassignedTasks, taskAssignments]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch projects');
      }

      setProjects(data.projects || []);
    } catch (err: any) {
      console.error('Error fetching projects:', err);
    }
  };


  // Helper function to get week boundaries (Monday to Sunday)
  const getWeekBoundaries = (date: Date): { weekStart: Date; weekEnd: Date } => {
    const dateCopy = new Date(date);
    const day = dateCopy.getDay();
    const diff = dateCopy.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const weekStart = new Date(dateCopy);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  };

  // Helper function to count working days between two dates (excluding weekends)
  const countWorkingDays = (start: Date, end: Date, workingDaysPerWeek: number): number => {
    let count = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    
    // If workingDaysPerWeek is 5, exclude weekends (Saturday=6, Sunday=0)
    // If workingDaysPerWeek is 6, exclude only Sunday
    // If workingDaysPerWeek is 7, include all days
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (workingDaysPerWeek === 5) {
        // Monday-Friday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count++;
        }
      } else if (workingDaysPerWeek === 6) {
        // Monday-Saturday
        if (dayOfWeek !== 0) {
          count++;
        }
      } else {
        // All days
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  // Helper function to calculate difference in hours between two dates
  const diffInHours = (start: Date, end: Date): number => {
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60); // Convert milliseconds to hours
  };

  // Calculate vacation hours per week for a given date
  const calculateVacationHoursPerWeek = (
    vacations: any[],
    referenceDate: string,
    dailyWorkingHours: number,
    workingDaysPerWeek: number
  ): number => {
    if (!referenceDate || vacations.length === 0) return 0;

    const refDate = new Date(referenceDate);
    const { weekStart, weekEnd } = getWeekBoundaries(refDate);

    let weeklyLeaveHours = 0;

    vacations.forEach((leave) => {
      const leaveStart = new Date(leave.date_from);
      const leaveEnd = new Date(leave.date_to);

      // Clip leave to week boundaries
      const effectiveStart = new Date(Math.max(leaveStart.getTime(), weekStart.getTime()));
      const effectiveEnd = new Date(Math.min(leaveEnd.getTime(), weekEnd.getTime()));

      // If effectiveStart > effectiveEnd, ignore this leave
      if (effectiveStart > effectiveEnd) {
        return;
      }

      let hours = 0;

      // Case A: Hour-based leave
      if (leave.request_unit_hours === true) {
        hours = diffInHours(effectiveStart, effectiveEnd);
      }
      // Case B: Half-day leave
      else if (leave.request_unit_half === true) {
        hours = dailyWorkingHours / 2;
      }
      // Case C: Full-day leave
      else {
        const workingDays = countWorkingDays(effectiveStart, effectiveEnd, workingDaysPerWeek);
        hours = workingDays * dailyWorkingHours;
      }

      weeklyLeaveHours += hours;
    });

    return weeklyLeaveHours;
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-900">
        <div className="relative">
          {/* Spinning circle */}
          <div className="w-16 h-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          {/* Inner pulsing circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
          </div>
        </div>
        <div className="mt-6 text-center">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
            Loading Capacity Data
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fetching tasks, team members, and capacity information...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </span>
              Unassigned Tasks
            </h1>
            <p className="text-blue-100 text-lg">
              Tasks waiting to be assigned to team members
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-6 py-3">
              <div className="text-sm text-blue-100">Total Tasks</div>
              <div className="text-3xl font-bold">{unassignedTasks.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Project Filter Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Filter by Projects
          </label>
        </div>
        <div className="relative">
          {/* Dropdown Button */}
          <button
            type="button"
            onClick={() => {
              // Start with the currently applied filter as the pending selection
              setPendingProjectIds(selectedProjectIds);
              setIsProjectDropdownOpen(!isProjectDropdownOpen);
            }}
            className="w-full px-4 py-3 text-left border-2 border-zinc-200 dark:border-zinc-700 rounded-xl bg-gradient-to-r from-zinc-50 to-white dark:from-zinc-800 dark:to-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 flex items-center justify-between hover:border-indigo-400 dark:hover:border-indigo-600 transition-all shadow-sm"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {selectedProjectIds.length === 0 ? (
                <span className="text-zinc-500 dark:text-zinc-400">Select projects...</span>
              ) : (
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedProjectIds.slice(0, 2).map((projectId) => {
                    const project = projects.find((p) => p.id === projectId);
                    return project ? (
                      <span
                        key={projectId}
                        className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-xs font-medium whitespace-nowrap shadow-sm"
                      >
                        {project.name}
                      </span>
                    ) : null;
                  })}
                  {selectedProjectIds.length > 2 && (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      +{selectedProjectIds.length - 2} more
                    </span>
                  )}
                </div>
              )}
            </div>
            <svg
              className={`w-5 h-5 text-zinc-500 dark:text-zinc-400 transition-transform ${
                isProjectDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isProjectDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsProjectDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-20 max-h-[300px] overflow-y-auto backdrop-blur-sm">
                <div className="p-2">
                  {pendingProjectIds.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingProjectIds([]);
                        }}
                        className="px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all hover:scale-105"
                      >
                        Clear selection
                      </button>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {pendingProjectIds.length} selected
                      </span>
                    </div>
                  )}
                  {projects.map((project) => {
                    const isSelected = pendingProjectIds.includes(project.id);
                    
                    // Helper function to format user information from tuple [id, name]
                    const formatUser = (user: [number, string] | undefined): string => {
                      if (!user || !Array.isArray(user)) return '-';
                      return user[1]; // Return the name (second element)
                    };
                    
                    // Get Project Owner (tuple: [id, name])
                    const projectOwner = formatUser(project.x_project_owner);
                    
                    // Get Project Reviewer (tuple: [id, name])
                    const projectReviewer = formatUser(project.x_project_reviewer);
                    
                    // Get Project Manager (from user_id tuple)
                    const projectManager = project.user_id ? formatUser(project.user_id) : '-';
                    
                    return (
                      <label
                        key={project.id}
                        className="flex flex-col gap-1 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setPendingProjectIds((prev) => {
                                if (prev.includes(project.id)) {
                                  return prev.filter((id) => id !== project.id);
                                } else {
                                  return [...prev, project.id];
                                }
                              });
                            }}
                            className="w-4 h-4 text-blue-600 bg-zinc-100 border-zinc-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-zinc-900 focus:ring-2 dark:bg-zinc-800 dark:border-zinc-600 flex-shrink-0"
                          />
                          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1">
                            {project.name}
                          </span>
                          {isSelected && (
                            <svg
                              className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 ml-7">
                          {projectOwner !== '-' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              <span className="font-semibold">Owner:</span>
                              <span>{projectOwner}</span>
                            </span>
                          )}
                          {projectReviewer !== '-' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-sm">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                              </svg>
                              <span className="font-semibold">Reviewer:</span>
                              <span>{projectReviewer}</span>
                            </span>
                          )}
                          {projectManager !== '-' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                              </svg>
                              <span className="font-semibold">Manager:</span>
                              <span>{projectManager}</span>
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="px-3 pb-2 pt-1 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-end gap-2 bg-zinc-50/80 dark:bg-zinc-900/80 sticky bottom-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsProjectDropdownOpen(false);
                      // Reset pending selection back to applied selection
                      setPendingProjectIds(selectedProjectIds);
                    }}
                    className="px-6 py-2.5 text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProjectIds(pendingProjectIds);
                      setIsProjectDropdownOpen(false);
                      // fetchAllData will be triggered by the effect on selectedProjectIds
                    }}
                    className="px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Selected Projects Chips */}
          {selectedProjectIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedProjectIds.map((projectId) => {
                const project = projects.find((p) => p.id === projectId);
                return project ? (
                  <span
                    key={projectId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs"
                  >
                    {project.name}
                    <button
                      onClick={() => {
                        setSelectedProjectIds(selectedProjectIds.filter((id) => id !== projectId));
                      }}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* More Filters (UI only, not wired yet) */}
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            More Filters
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Active filter */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Active
              </span>
              <select
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                defaultValue=""
              >
                <option value="">All</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>

            {/* Project Owner */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Project Owner
              </span>
              <select
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                defaultValue=""
              >
                <option value="">Any</option>
                <option value="owner-1">Owner 1</option>
                <option value="owner-2">Owner 2</option>
              </select>
            </div>

            {/* Project Manager */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Project Manager
              </span>
              <select
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                defaultValue=""
              >
                <option value="">Any</option>
                <option value="manager-1">Manager 1</option>
                <option value="manager-2">Manager 2</option>
              </select>
            </div>

            {/* Project Reviewer */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Project Reviewer
              </span>
              <select
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                defaultValue=""
              >
                <option value="">Any</option>
                <option value="reviewer-1">Reviewer 1</option>
                <option value="reviewer-2">Reviewer 2</option>
              </select>
            </div>

            <button
              className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300"
              // onClick={handleApplyFilters} // Add your handler later
              type="button"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-red-700 dark:text-red-400 font-medium">{error}</div>
          </div>
        </div>
      )}

      {/* Tasks Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {tasksLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400 font-medium">Loading unassigned tasks...</p>
          </div>
        ) : unassignedTasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 mb-4">
              <svg className="w-10 h-10 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
              {selectedProjectIds.length > 0 
                ? 'No unassigned tasks found for the selected projects'
                : 'No unassigned tasks found'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-900/30 dark:via-purple-900/30 dark:to-pink-900/30 border-b-2 border-indigo-200 dark:border-indigo-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-12"></th>
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
                        Estimated Allocated Hours
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Deadline
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Project
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-700">
                {unassignedTasks.map((task) => {
                  const isExpanded = isTaskExpanded(task.id);
                  const assignedUserId = taskAssignments.get(task.id);
                  const isAssigned = assignedUserId !== undefined;
                  return (
                    <React.Fragment key={task.id}>
                      <tr
                        className={`hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 dark:hover:from-indigo-900/20 dark:hover:to-purple-900/20 transition-all cursor-move ${
                          isAssigned ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30' : ''
                        } ${draggedTask?.id === task.id ? 'opacity-50 scale-95' : ''}`}
                        onClick={() => toggleTask(task.id)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={handleDragEnd}
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
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 dark:text-zinc-600 cursor-move select-none">⋮⋮</span>
                            <div className="font-medium">{task.name}</div>
                            {isAssigned && (
                              <span className="px-2.5 py-1 text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg shadow-sm">
                                ✓ Assigned
                              </span>
                            )}
                            {assignedUserId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnassignTask(task.id);
                                }}
                                className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                                title="Unassign task"
                              >
                                ×
                              </button>
                            )}
                          </div>
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
                              {task.allocated_hours !== undefined && task.allocated_hours !== null
                                ? `${task.allocated_hours}h`
                                : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 dark:text-zinc-300">
                              {formatDate(task.date_deadline)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 dark:text-zinc-300">
                              {task.project_id && Array.isArray(task.project_id) ? task.project_id[1] : '-'}
                            </td>
                          </>
                        )}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-50 dark:bg-zinc-900">
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
                                  {task.activity_date_deadline && (
                                    <div>
                                      <span className="text-zinc-500 dark:text-zinc-400">Activity Deadline: </span>
                                      <span className="text-zinc-700 dark:text-zinc-300">{formatDate(task.activity_date_deadline)}</span>
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-4 bg-gradient-to-r from-zinc-50 to-indigo-50 dark:from-zinc-800 dark:to-indigo-900/20 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {unassignedTasks.length} unassigned task{unassignedTasks.length !== 1 ? 's' : ''}
              {selectedProjectIds.length > 0 && ` • ${selectedProjectIds.length} project${selectedProjectIds.length !== 1 ? 's' : ''} selected`}
            </span>
          </div>
          <button
            onClick={fetchAllData}
            className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Team Members Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {selectedProjectIds.length > 0
                  ? `Project Team Members`
                  : `All Team Members`
                }
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {displayedMembers.length} member{displayedMembers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
        
        {membersLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600"></div>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400 font-medium">Loading team members...</p>
          </div>
        ) : displayedMembers.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 mb-4">
              <svg className="w-10 h-10 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
              {selectedProjectIds.length > 0
                ? 'No team members found for the selected projects'
                : 'No team members found'}
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            onDragOver={(e) => {
              // Always allow drop; we'll decide what to do based on the payload
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              const memberIdStr = e.dataTransfer.getData('memberId');
              if (memberIdStr) {
                // Sidebar member dropped
                e.preventDefault();
                const memberId = parseInt(memberIdStr, 10);
                if (!isNaN(memberId)) {
                  handleSidebarMemberDrop(memberId);
                }
                return;
              }
              // Otherwise ignore here (task drops are handled by individual member cards)
            }}
          >
            {displayedMembers.map((member) => {
              const assignedCapacity = getAssignedCapacity(member);
              const assignedTasks = unassignedTasks.filter(task => taskAssignments.get(task.id) === member.id);
              
              return (
              <div
                key={member.id}
                id={`member-card-${member.id}`}
                className={`p-5 bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 border-2 rounded-2xl hover:shadow-xl transition-all transform hover:scale-105 ${
                  draggedTask ? 'border-indigo-400 dark:border-indigo-600 shadow-2xl' : 'border-zinc-200 dark:border-zinc-700 shadow-md'
                }`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnUser(e, member.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-black dark:text-zinc-50 truncate">
                      {member.name}
                    </h3>
                    {member.job_title && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                        {member.job_title}
                      </p>
                    )}
                  </div>
                  {member.active !== false && (
                    <div className="ml-2 flex-shrink-0 flex flex-col items-end gap-1">
                      <span className="w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full inline-block shadow-lg shadow-green-500/50 animate-pulse"></span>
                      {/* Return to sidebar button */}
                      <button
                        type="button"
                        onClick={() => {
                          // Remove from displayed members
                          setDisplayedMembers((prev) => prev.filter((m) => m.id !== member.id));
                          // Remove from projectTeamMemberIds so it reappears in sidebar
                          try {
                            const raw = localStorage.getItem('projectTeamMemberIds');
                            let ids: number[] = [];
                            if (raw) {
                              const parsed = JSON.parse(raw);
                              if (Array.isArray(parsed)) {
                                ids = parsed.filter((id) => typeof id === 'number');
                              }
                            }
                            const nextIds = ids.filter((id) => id !== member.id);
                            localStorage.setItem('projectTeamMemberIds', JSON.stringify(nextIds));
                            window.dispatchEvent(new Event('sidebarMembersChanged'));
                          } catch (e) {
                            console.error('Failed to update projectTeamMemberIds when returning member:', e);
                          }
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                        title="Return member to sidebar"
                      >
                        Return
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Capacity Display */}
                <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Capacity {assignedTasks.length > 0 && `(${assignedTasks.length} tasks)`}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-semibold text-black dark:text-zinc-50">
                        {assignedCapacity.percentage.toFixed(1)}%
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {assignedCapacity.hours.toFixed(1)}h
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-3 mb-1 shadow-inner">
                    <div
                      className={`h-3 rounded-full transition-all shadow-lg ${
                        assignedCapacity.usedPercentage >= 100
                          ? 'bg-gradient-to-r from-red-500 to-rose-600'
                          : assignedCapacity.usedPercentage >= 80
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                          : assignedCapacity.usedPercentage >= 60
                          ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                          : 'bg-gradient-to-r from-blue-400 to-indigo-500'
                      }`}
                      style={{
                        width: `${Math.min(100, assignedCapacity.usedPercentage)}%`,
                      }}
                    />
                  </div>
                  {(assignedTasks.length > 0 || (member as any).totalOpenTasksHours > 0) && (
                    <div className="mt-2 space-y-1">
                      {(member as any).totalOpenTasksHours > 0 && (
                        <div className="text-xs bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 p-2 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm">
                          <div className="font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            Open Tasks (Odoo)
                          </div>
                          <div className="text-purple-700 dark:text-purple-400 mt-0.5 font-medium">
                            {(member as any).totalOpenTasksHours.toFixed(1)}h ({((((member as any).totalOpenTasksHours || 0) / 40) * 100).toFixed(1)}%)
                          </div>
                        </div>
                      )}
                      {assignedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="text-xs bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-2 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm"
                        >
                          <div className="font-semibold text-blue-800 dark:text-blue-300 truncate flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                            </svg>
                            {task.name}
                          </div>
                          <div className="text-blue-700 dark:text-blue-400 mt-0.5 font-medium">
                            +{calculateTaskEffort(task)}h ({((calculateTaskEffort(task) / 40) * 100).toFixed(1)}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {draggedTask && assignedTasks.length === 0 && (
                    <div className="mt-2 text-xs text-center text-indigo-600 dark:text-indigo-400 py-3 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 font-medium animate-pulse">
                      ✨ Drop task here to assign
                    </div>
                  )}
                </div>
                
                {member.vacations && member.vacations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
                        Vacations ({member.vacations.length})
                      </div>
                      {(member as any).weeklyVacationHours !== undefined && (
                        <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                          {(member as any).weeklyVacationHours.toFixed(1)}h/week
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {member.vacations.map((vacation) => (
                        <div
                          key={vacation.id}
                          className="text-xs bg-orange-50 dark:bg-orange-900/20 p-2 rounded border border-orange-200 dark:border-orange-800"
                        >
                          <div className="text-orange-800 dark:text-orange-300">
                            <div className="font-medium">
                              {new Date(vacation.date_from).toLocaleDateString()} -{' '}
                              {new Date(vacation.date_to).toLocaleDateString()}
                            </div>
                            {vacation.number_of_days !== undefined && (
                              <div className="text-orange-600 dark:text-orange-400 mt-0.5">
                                {vacation.number_of_days} day{vacation.number_of_days !== 1 ? 's' : ''}
                                {vacation.request_unit_half && ' (Half Day)'}
                                {vacation.request_unit_hours && ' (Hours)'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-1">
                  {member.email && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate" title={member.email}>
                      {member.email}
                    </div>
                  )}
                  {member.department && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">
                      {member.department}
                    </div>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Actions Panel */}
      <ActionsPanel />
    </div>
  );
}
