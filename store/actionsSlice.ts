import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Action } from '@/types/actions';

interface ActionsState {
  actions: Action[];
}

const initialState: ActionsState = {
  actions: [],
};

export const actionsSlice = createSlice({
  name: 'actions',
  initialState,
  reducers: {
    setActions: (state, action: PayloadAction<Action[]>) => {
      state.actions = action.payload;
    },
    addAction: (state, action: PayloadAction<Action>) => {
      state.actions.push(action.payload);
    },
    updateAction: (state, action: PayloadAction<{ id: string; updates: Partial<Action> }>) => {
      const index = state.actions.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.actions[index] = { ...state.actions[index], ...action.payload.updates };
      }
    },
    deleteAction: (state, action: PayloadAction<string>) => {
      state.actions = state.actions.filter(a => a.id !== action.payload);
    },
    clearActions: (state) => {
      state.actions = [];
    },
  },
});

export const { setActions, addAction, updateAction, deleteAction, clearActions } = actionsSlice.actions;
export default actionsSlice.reducer;

