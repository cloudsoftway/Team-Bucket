import { configureStore } from '@reduxjs/toolkit';
import teamMembersReducer from './teamMembersSlice';
import selectedProjectsReducer from './selectedProjectsSlice';
import projectTeamMemberIdsReducer from './projectTeamMemberIdsSlice';
import actionsReducer from './actionsSlice';

export const store = configureStore({
  reducer: {
    teamMembers: teamMembersReducer,
    selectedProjects: selectedProjectsReducer,
    projectTeamMemberIds: projectTeamMemberIdsReducer,
    actions: actionsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
