import { createWithEqualityFn } from "zustand/traditional";

type RemoteCursor = {
  imageX: number;
  imageY: number;
  tool?: string;
};

export type RemoteUserState = {
  id: string;
  name?: string;
  color: string;
  cursor?: RemoteCursor;
  selectionId?: string | null;
  lastSeen: number;
};

type CollaborationStore = {
  remoteUsers: Record<string, RemoteUserState>;
  localUserId: string | null;
  setLocalUserId: (userId: string | null) => void;
  upsertUser: (userId: string, info: Partial<Omit<RemoteUserState, "id" | "color">> & { name?: string }) => void;
  removeUser: (userId: string) => void;
  updateCursor: (userId: string, cursor: RemoteCursor) => void;
  updateSelection: (userId: string, selectionId: string | null) => void;
  reset: () => void;
};

const COLORS = [
  "#f97316",
  "#6366f1",
  "#10b981",
  "#ef4444",
  "#a855f7",
  "#0ea5e9",
  "#fbbf24",
  "#14b8a6",
  "#d946ef",
  "#22c55e",
];

let colorCursor = 0;
const nextColor = () => {
  const color = COLORS[colorCursor % COLORS.length];
  colorCursor += 1;
  return color;
};

export const useCollaborationStore = createWithEqualityFn<CollaborationStore>((set) => ({
  remoteUsers: {},
  localUserId: null,
  setLocalUserId: (userId) =>
    set((state) => {
      if (state.localUserId === userId) {
        return state;
      }
      return { localUserId: userId };
    }),
  upsertUser: (userId, info) =>
    set((state) => {
      if (state.localUserId && state.localUserId === userId) {
        return state;
      }

      const existing = state.remoteUsers[userId];
      const color = existing?.color ?? nextColor();
      return {
        remoteUsers: {
          ...state.remoteUsers,
          [userId]: {
            id: userId,
            color,
            name: info.name ?? existing?.name,
            cursor: info.cursor ?? existing?.cursor,
            selectionId:
              info.selectionId !== undefined ? info.selectionId : existing?.selectionId,
            lastSeen: Date.now(),
          },
        },
      };
    }),
  removeUser: (userId) =>
    set((state) => {
      if (state.localUserId && state.localUserId === userId) {
        return state;
      }
      const { [userId]: _, ...rest } = state.remoteUsers;
      return { remoteUsers: rest };
    }),
  updateCursor: (userId, cursor) =>
    set((state) => {
      if (state.localUserId && state.localUserId === userId) {
        return state;
      }
      const existing = state.remoteUsers[userId];
      if (!existing) {
        return {
          remoteUsers: {
            ...state.remoteUsers,
            [userId]: {
              id: userId,
              color: nextColor(),
              cursor,
              lastSeen: Date.now(),
            },
          },
        };
      }
      return {
        remoteUsers: {
          ...state.remoteUsers,
          [userId]: {
            ...existing,
            cursor,
            lastSeen: Date.now(),
          },
        },
      };
    }),
  updateSelection: (userId, selectionId) =>
    set((state) => {
      if (state.localUserId && state.localUserId === userId) {
        return state;
      }
      const existing = state.remoteUsers[userId];
      if (!existing) {
        return {
          remoteUsers: {
            ...state.remoteUsers,
            [userId]: {
              id: userId,
              color: nextColor(),
              selectionId,
              lastSeen: Date.now(),
            },
          },
        };
      }
      return {
        remoteUsers: {
          ...state.remoteUsers,
          [userId]: {
            ...existing,
            selectionId,
            lastSeen: Date.now(),
          },
        },
      };
    }),
  reset: () => set({ remoteUsers: {} }),
}));

