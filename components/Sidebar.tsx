'use client';

import { useEffect, useState, useMemo } from 'react';
import { TeamMember } from '@/lib/odoo';
import { useAppSelector } from '@/store/hooks';
import { TeamMemberWithCapacity } from '@/store/teamMembersSlice';

export default function Sidebar() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberWithCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Read from Redux store
  const teamMembersRedux = useAppSelector((state) => state.teamMembers.members);
  const selectedProjectIds = useAppSelector((state) => state.selectedProjects.projectIds);
  const projectTeamMemberIds = useAppSelector((state) => state.projectTeamMemberIds.memberIds);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        setError(null);
        setLoading(true);

        const baseMembers = teamMembersRedux;

        // If no base data yet, just show empty list
        if (!baseMembers || baseMembers.length === 0) {
          setTeamMembers([]);
          return;
        }

        // If no project filters, show all members from Redux (with capacity) minus those already in the project grid
        if (!selectedProjectIds || selectedProjectIds.length === 0) {
          let membersToShow = baseMembers;
          if (projectTeamMemberIds && projectTeamMemberIds.length > 0) {
            membersToShow = membersToShow.filter(
              (m) => typeof m?.id === 'number' && !projectTeamMemberIds.includes(m.id)
            );
          }
          setTeamMembers(membersToShow);
          return;
        }

        // When project filters are applied, fetch non-members for those projects
        try {
          const query = encodeURIComponent(selectedProjectIds.join(','));
          const res = await fetch(`/api/projects/non-members?projectIds=${query}`);

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error('Failed to fetch non-member team members:', data);
            // Fall back to base members in case of error
            setTeamMembers(baseMembers);
            return;
          }

          const data = await res.json();
          const apiMembers: Array<{ id?: number }> = Array.isArray(data.members)
            ? data.members
            : [];

          // Map API members to Redux members so we reuse capacity values
          const baseById = new Map<number, TeamMemberWithCapacity>();
          baseMembers.forEach((m) => {
            if (m && typeof m.id === 'number') {
              baseById.set(m.id, m);
            }
          });

          const nonMembersWithCapacity = apiMembers
            .map((m) =>
              typeof m?.id === 'number' ? baseById.get(m.id) : undefined
            )
            .filter((m): m is TeamMemberWithCapacity => m !== undefined);

          let membersToShow = nonMembersWithCapacity;

          // Hide members already placed into the project grid
          if (projectTeamMemberIds && projectTeamMemberIds.length > 0) {
            membersToShow = membersToShow.filter(
              (m) => typeof m?.id === 'number' && !projectTeamMemberIds.includes(m.id)
            );
          }

          setTeamMembers(membersToShow);
        } catch (err) {
          console.error('Error fetching non-member team members:', err);
          // Fall back to base members if fetch fails
          let membersToShow = baseMembers;
          if (projectTeamMemberIds && projectTeamMemberIds.length > 0) {
            membersToShow = membersToShow.filter(
              (m) => typeof m?.id === 'number' && !projectTeamMemberIds.includes(m.id)
            );
          }
          setTeamMembers(membersToShow);
        }
      } catch (err: any) {
        console.error('Error loading team members for sidebar:', err);
        setError(err.message || 'Failed to load team members');
      } finally {
        setLoading(false);
      }
    };

    void loadMembers();
  }, [teamMembersRedux, selectedProjectIds, projectTeamMemberIds]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-700 border-t-blue-500 mb-3"></div>
          <span className="text-xs font-medium tracking-wide uppercase text-zinc-500">
            Loading team members...
          </span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-900/20 border border-red-700 text-xs text-red-200 rounded-xl p-3">
          {error}
        </div>
      );
    }

    if (teamMembers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 mb-3">
            <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-zinc-400">
            No team members found
          </span>
        </div>
      );
    }

    return (
      <ul className="space-y-3">
        {teamMembers.map((member: any) => {
          // Read capacity values directly from Redux store (set by Dashboard)
          const percentage = typeof member.assignedCapacityPercentage === 'number' ? member.assignedCapacityPercentage : 0;
          const hours = typeof member.assignedCapacityHours === 'number' ? member.assignedCapacityHours : 0;
          const usedPercentage = typeof member.assignedCapacityUsedPercentage === 'number' ? member.assignedCapacityUsedPercentage : 0;

          const capacityColor =
            usedPercentage >= 100
              ? 'from-red-500 to-rose-600'
              : usedPercentage >= 80
              ? 'from-yellow-400 to-orange-500'
              : usedPercentage >= 60
              ? 'from-green-400 to-emerald-500'
              : 'from-blue-400 to-indigo-500';

          return (
            <li
              key={member.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('memberId', String(member.id));
                e.dataTransfer.effectAllowed = 'move';

                try {
                  const helper = document.createElement('div');
                  helper.style.width = '1px';
                  helper.style.height = '1px';
                  helper.style.opacity = '0';
                  helper.style.position = 'absolute';
                  helper.style.top = '-9999px';
                  helper.style.left = '-9999px';
                  helper.style.pointerEvents = 'none';
                  helper.style.visibility = 'hidden';
                  helper.setAttribute('aria-hidden', 'true');
                  helper.setAttribute('hidden', 'true');
                  document.body.appendChild(helper);
                  e.dataTransfer.setDragImage(helper, 0, 0);
                  // Clean up immediately after drag image is set
                  requestAnimationFrame(() => {
                    if (helper.parentNode) {
                      helper.parentNode.removeChild(helper);
                    }
                  });
                } catch (err) {
                  console.error('Failed to set custom drag image for member:', err);
                }
              }}
              className="p-3.5 rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 border border-zinc-800 hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/20 transition-all cursor-move"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-xs font-semibold shadow-md">
                    {member.name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs text-zinc-50 truncate">
                      {member.name}
                    </div>
                    {member.job_title && (
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {member.job_title}
                      </div>
                    )}
                    {member.email && (
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {member.email}
                      </div>
                    )}
                  </div>
                </div>
                {member.active !== false && (
                  <span className="ml-1 flex-shrink-0">
                    <span className="w-2.5 h-2.5 bg-gradient-to-r from-emerald-400 to-lime-400 rounded-full inline-block shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse"></span>
                  </span>
                )}
              </div>

              {/* Capacity Display */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
                    Capacity
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-100">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 shadow-inner">
                  <div
                    className={`h-2 rounded-full bg-gradient-to-r ${capacityColor} transition-all`}
                    style={{ width: `${Math.min(100, usedPercentage)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-zinc-500">
                    Available: {hours.toFixed(1)}h
                  </span>
                </div>
              </div>

              {member.department && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                  </svg>
                  <span className="truncate">{member.department}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-72'} bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-r border-zinc-800 h-full overflow-y-auto shadow-2xl pb-12 transition-all duration-300 relative`}>
      <div className="p-5 space-y-5">
        {/* Sidebar header */}
        <div className="relative mb-1">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
                  Team Capacity
                </h2>
                <p className="text-xs text-zinc-400">
                  {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} tracked
                </p>
              </div>
            )}
          </div>
          {/* Collapse button - positioned absolutely to not affect layout */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute top-0 right-0 flex-shrink-0 p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-100 transition-colors backdrop-blur-sm"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {!isCollapsed && renderContent()}
      </div>
    </aside>
  );
}
