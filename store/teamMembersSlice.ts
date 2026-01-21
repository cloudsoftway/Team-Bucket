import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TeamMember } from '@/lib/odoo';

export interface TeamMemberWithCapacity extends TeamMember {
  assignedCapacityPercentage: number;
  assignedCapacityHours: number;
  assignedCapacityUsedPercentage: number;
  assignedTasksCount?: number;
  weeklyVacationHours?: number;
  totalOpenTasksHours?: number;
}

interface TeamMembersState {
  members: TeamMemberWithCapacity[];
}

const initialState: TeamMembersState = {
  members: [],
};

export const teamMembersSlice = createSlice({
  name: 'teamMembers',
  initialState,
  reducers: {
    setTeamMembers: (state, action: PayloadAction<TeamMemberWithCapacity[]>) => {
      state.members = action.payload;
    },
    updateTeamMember: (state, action: PayloadAction<{ id: number; updates: Partial<TeamMemberWithCapacity> }>) => {
      const index = state.members.findIndex(m => m.id === action.payload.id);
      if (index !== -1) {
        state.members[index] = { ...state.members[index], ...action.payload.updates };
      }
    },
    clearTeamMembers: (state) => {
      state.members = [];
    },
  },
});

export const { setTeamMembers, updateTeamMember, clearTeamMembers } = teamMembersSlice.actions;
export default teamMembersSlice.reducer;
