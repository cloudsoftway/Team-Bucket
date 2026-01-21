import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SelectedProjectsState {
  projectIds: number[];
}

const initialState: SelectedProjectsState = {
  projectIds: [],
};

export const selectedProjectsSlice = createSlice({
  name: 'selectedProjects',
  initialState,
  reducers: {
    setSelectedProjects: (state, action: PayloadAction<number[]>) => {
      state.projectIds = action.payload;
    },
    addSelectedProject: (state, action: PayloadAction<number>) => {
      if (!state.projectIds.includes(action.payload)) {
        state.projectIds.push(action.payload);
      }
    },
    removeSelectedProject: (state, action: PayloadAction<number>) => {
      state.projectIds = state.projectIds.filter(id => id !== action.payload);
    },
    clearSelectedProjects: (state) => {
      state.projectIds = [];
    },
  },
});

export const { setSelectedProjects, addSelectedProject, removeSelectedProject, clearSelectedProjects } = selectedProjectsSlice.actions;
export default selectedProjectsSlice.reducer;
