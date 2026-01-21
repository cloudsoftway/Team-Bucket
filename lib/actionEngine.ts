import { ProjectTask, TeamMember } from '@/lib/odoo';

export interface ActionEnginePayload {
  update_json: Record<string, any>;
  condition_json?: Record<string, any>;
  additional_info_json?: Record<string, any>;
}

// Build payload for assigning a task to a member
export function buildTaskAssignPayload(
  task: ProjectTask,
  member: TeamMember
): ActionEnginePayload {
  const projectId =
    (task as any).project_id && Array.isArray((task as any).project_id)
      ? (task as any).project_id[0]
      : undefined;

  return {
    update_json: {
      // Odoo: assign user_ids to task
      user_ids: [member.id],
    },
    condition_json: {
      id: task.id,
      ...(projectId ? { project_id: projectId } : {}),
    },
    additional_info_json: {
      member: member,
    },
  };
}

// Build payload for adding a member to the current project team
export function buildAddMemberToTeamPayload(
  member: TeamMember,
  projectIds: number[]
): ActionEnginePayload {
  return {
    update_json: {
      user_ids: [[4, member.id]],
    },
    condition_json: {
      project_ids: projectIds,
    },
    additional_info_json: {
      member: member,
    },
  };
}

