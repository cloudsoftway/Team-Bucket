import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ProjectTeamMemberIdsState {
  memberIds: number[];
}

const initialState: ProjectTeamMemberIdsState = {
  memberIds: [],
};

export const projectTeamMemberIdsSlice = createSlice({
  name: 'projectTeamMemberIds',
  initialState,
  reducers: {
    setProjectTeamMemberIds: (state, action: PayloadAction<number[]>) => {
      state.memberIds = action.payload;
    },
    addProjectTeamMemberId: (state, action: PayloadAction<number>) => {
      if (!state.memberIds.includes(action.payload)) {
        state.memberIds.push(action.payload);
      }
    },
    removeProjectTeamMemberId: (state, action: PayloadAction<number>) => {
      state.memberIds = state.memberIds.filter(id => id !== action.payload);
    },
    clearProjectTeamMemberIds: (state) => {
      state.memberIds = [];
    },
  },
});

export const { setProjectTeamMemberIds, addProjectTeamMemberId, removeProjectTeamMemberId, clearProjectTeamMemberIds } = projectTeamMemberIdsSlice.actions;
export default projectTeamMemberIdsSlice.reducer;
