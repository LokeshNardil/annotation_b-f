import { create } from "zustand";

/**
 * Annotation type for rectangular annotations only
 */
export interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  meta?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Store snapshot for undo/redo
 */
export interface StoreSnapshot {
  annotations: Annotation[];
  timestamp: number;
}

/**
 * Image metadata for sidebar navigation
 */
export interface ImageItem {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
}

/**
 * Label configuration with color mapping
 */
export interface LabelConfig {
  id: string;
  name: string;
  color: string;
  shortcut?: string;
}

/**
 * Default labels with keyboard shortcuts (0-9)
 */
export const DEFAULT_LABELS: LabelConfig[] = [
  { id: "label0", name: "Ties / Links", color: "rgb(168, 85, 247)", shortcut: "0" }, // purple
  { id: "label1", name: "Column", color: "rgb(59, 130, 246)", shortcut: "1" }, // blue
  { id: "label2", name: "Beam", color: "rgb(16, 185, 129)", shortcut: "2" }, // green
  { id: "label3", name: "Slab", color: "rgb(249, 115, 22)", shortcut: "3" }, // orange
  { id: "label4", name: "Footing", color: "rgb(239, 68, 68)", shortcut: "4" }, // red
  { id: "label5", name: "Stirrup", color: "rgb(168, 85, 247)", shortcut: "5" }, // purple
  { id: "label6", name: "Rebar", color: "rgb(236, 72, 153)", shortcut: "6" }, // pink
  { id: "label7", name: "Dowel", color: "rgb(34, 197, 94)", shortcut: "7" }, // green
  { id: "label8", name: "Hook", color: "rgb(251, 146, 60)", shortcut: "8" }, // orange
  { id: "label9", name: "Lapping Zone", color: "rgb(139, 92, 246)", shortcut: "9" }, // violet
];

/**
 * Zustand store for annotation viewer
 */
interface AnnotationStore {
  // Image state
  currentImageId: string | null;
  images: ImageItem[];
  
  // Annotations per image: Record<imageId, Annotation[]>
  annotations: Record<string, Annotation[]>;
  
  // Selection state
  selectedIds: string[];
  
  // Active label
  activeLabel: string;
  labels: LabelConfig[];
  
  // Transform state (zoom/pan)
  scale: number;
  translateX: number;
  translateY: number;
  
  // History for undo/redo
  history: StoreSnapshot[];
  historyIndex: number;
  maxHistorySize: number;
  
  // Clipboard for copy/paste
  clipboard: Annotation[];
  
  // UI state
  isPanning: boolean;
  snapToGrid: boolean;
  gridSize: number;
  
  // Actions - Image
  setCurrentImage: (imageId: string) => void;
  addImage: (image: ImageItem) => void;
  setImages: (images: ImageItem[]) => void;
  nextImage: () => void;
  previousImage: () => void;
  
  // Actions - Annotations
  addAnnotation: (annotation: Omit<Annotation, "id" | "createdAt" | "updatedAt">) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  deleteSelected: () => void;
  getAnnotationsForImage: (imageId: string) => Annotation[];
  
  // Actions - Selection
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  
  // Actions - Labels
  setActiveLabel: (labelId: string) => void;
  getActiveLabelConfig: () => LabelConfig | undefined;
  addLabel: (label: LabelConfig) => void;
  
  // Actions - Transform
  setScale: (scale: number) => void;
  setTranslate: (x: number, y: number) => void;
  resetTransform: () => void;
  
  // Actions - History
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // Actions - Clipboard
  copySelected: () => void;
  paste: () => void;
  canPaste: () => boolean;
  
  // Actions - Export/Import
  exportAnnotations: (imageId?: string) => string;
  importAnnotations: (json: string, imageId: string) => void;
  clearAnnotations: (imageId?: string) => void;
  
  // Actions - UI
  setPanning: (isPanning: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
}

/**
 * Generate unique ID for annotations
 */
const generateId = (): string => {
  return `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create initial store state
 */
const createInitialState = (): Omit<AnnotationStore, keyof AnnotationStore> => ({
  currentImageId: null,
  images: [],
  annotations: {},
  selectedIds: [],
  activeLabel: DEFAULT_LABELS[0].id,
  labels: DEFAULT_LABELS,
  scale: 1,
  translateX: 0,
  translateY: 0,
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  clipboard: [],
  isPanning: false,
  snapToGrid: false,
  gridSize: 10,
});

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  ...createInitialState(),

  // Image actions
  setCurrentImage: (imageId) => {
    set({ currentImageId: imageId, selectedIds: [] });
    // Save current state before switching
    get().saveSnapshot();
  },

  addImage: (image) => {
    set((state) => ({
      images: [...state.images, image],
      annotations: {
        ...state.annotations,
        [image.id]: state.annotations[image.id] || [],
      },
    }));
  },

  setImages: (images) => {
    const annotations: Record<string, Annotation[]> = {};
    images.forEach((img) => {
      annotations[img.id] = get().annotations[img.id] || [];
    });
    set({ images, annotations });
  },

  nextImage: () => {
    const { images, currentImageId } = get();
    if (images.length === 0) return;
    const currentIndex = images.findIndex((img) => img.id === currentImageId);
    const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    get().setCurrentImage(images[nextIndex].id);
  },

  previousImage: () => {
    const { images, currentImageId } = get();
    if (images.length === 0) return;
    const currentIndex = images.findIndex((img) => img.id === currentImageId);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    get().setCurrentImage(images[prevIndex].id);
  },

  // Annotation actions
  addAnnotation: (annotationData) => {
    const { currentImageId, activeLabel, labels } = get();
    if (!currentImageId) return;

    const labelConfig = labels.find((l) => l.id === activeLabel) || labels[0];
    const now = Date.now();

    const annotation: Annotation = {
      id: generateId(),
      ...annotationData,
      label: annotationData.label || labelConfig.name,
      color: annotationData.color || labelConfig.color,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      const currentAnnotations = state.annotations[currentImageId] || [];
      return {
        annotations: {
          ...state.annotations,
          [currentImageId]: [...currentAnnotations, annotation],
        },
        selectedIds: [annotation.id],
      };
    });

    get().saveSnapshot();
  },

  updateAnnotation: (id, updates) => {
    const { currentImageId } = get();
    if (!currentImageId) return;

    set((state) => {
      const currentAnnotations = state.annotations[currentImageId] || [];
      const updatedAnnotations = currentAnnotations.map((ann) =>
        ann.id === id
          ? { ...ann, ...updates, updatedAt: Date.now() }
          : ann
      );

      return {
        annotations: {
          ...state.annotations,
          [currentImageId]: updatedAnnotations,
        },
      };
    });

    get().saveSnapshot();
  },

  deleteAnnotation: (id) => {
    const { currentImageId } = get();
    if (!currentImageId) return;

    set((state) => {
      const currentAnnotations = state.annotations[currentImageId] || [];
      const updatedAnnotations = currentAnnotations.filter((ann) => ann.id !== id);
      const newSelected = state.selectedIds.filter((selectedId) => selectedId !== id);

      return {
        annotations: {
          ...state.annotations,
          [currentImageId]: updatedAnnotations,
        },
        selectedIds: newSelected,
      };
    });

    get().saveSnapshot();
  },

  deleteSelected: () => {
    const { selectedIds, currentImageId } = get();
    if (selectedIds.length === 0 || !currentImageId) return;

    set((state) => {
      const currentAnnotations = state.annotations[currentImageId] || [];
      const updatedAnnotations = currentAnnotations.filter(
        (ann) => !selectedIds.includes(ann.id)
      );

      return {
        annotations: {
          ...state.annotations,
          [currentImageId]: updatedAnnotations,
        },
        selectedIds: [],
      };
    });

    get().saveSnapshot();
  },

  getAnnotationsForImage: (imageId) => {
    return get().annotations[imageId] || [];
  },

  // Selection actions
  setSelected: (ids) => {
    set({ selectedIds: ids });
  },

  toggleSelected: (id) => {
    set((state) => {
      const newSelected = state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id];
      return { selectedIds: newSelected };
    });
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  // Label actions
  setActiveLabel: (labelId) => {
    set({ activeLabel: labelId });
  },

  getActiveLabelConfig: () => {
    const { labels, activeLabel } = get();
    return labels.find((l) => l.id === activeLabel);
  },

  addLabel: (label) => {
    set((state) => ({
      labels: [...state.labels, label],
    }));
  },

  // Transform actions
  setScale: (scale) => {
    set({ scale: Math.max(0.1, Math.min(5, scale)) });
  },

  setTranslate: (x, y) => {
    set({ translateX: x, translateY: y });
  },

  resetTransform: () => {
    set({ scale: 1, translateX: 0, translateY: 0 });
  },

  // History actions
  saveSnapshot: () => {
    const { currentImageId, annotations, history, historyIndex, maxHistorySize } = get();
    if (!currentImageId) return;

    const currentAnnotations = annotations[currentImageId] || [];
    const snapshot: StoreSnapshot = {
      annotations: JSON.parse(JSON.stringify(currentAnnotations)),
      timestamp: Date.now(),
    };

    set((state) => {
      // Remove any history after current index (when undo was performed)
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(snapshot);

      // Limit history size
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  undo: () => {
    const { history, historyIndex, currentImageId } = get();
    if (historyIndex <= 0 || !currentImageId) return;

    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];

    set({
      annotations: {
        ...get().annotations,
        [currentImageId]: JSON.parse(JSON.stringify(snapshot.annotations)),
      },
      historyIndex: newIndex,
      selectedIds: [],
    });
  },

  redo: () => {
    const { history, historyIndex, currentImageId } = get();
    if (historyIndex >= history.length - 1 || !currentImageId) return;

    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];

    set({
      annotations: {
        ...get().annotations,
        [currentImageId]: JSON.parse(JSON.stringify(snapshot.annotations)),
      },
      historyIndex: newIndex,
      selectedIds: [],
    });
  },

  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  // Clipboard actions
  copySelected: () => {
    const { selectedIds, currentImageId, annotations } = get();
    if (selectedIds.length === 0 || !currentImageId) return;

    const currentAnnotations = annotations[currentImageId] || [];
    const copied = currentAnnotations
      .filter((ann) => selectedIds.includes(ann.id))
      .map((ann) => JSON.parse(JSON.stringify(ann)));

    set({ clipboard: copied });
  },

  paste: () => {
    const { clipboard, currentImageId } = get();
    if (clipboard.length === 0 || !currentImageId) return;

    // Calculate offset to paste slightly offset from original position
    const offsetX = 20;
    const offsetY = 20;

    const pastedAnnotations = clipboard.map((ann) => ({
      ...ann,
      id: generateId(),
      x: ann.x + offsetX,
      y: ann.y + offsetY,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    set((state) => {
      const currentAnnotations = state.annotations[currentImageId] || [];
      return {
        annotations: {
          ...state.annotations,
          [currentImageId]: [...currentAnnotations, ...pastedAnnotations],
        },
        selectedIds: pastedAnnotations.map((ann) => ann.id),
      };
    });

    get().saveSnapshot();
  },

  canPaste: () => {
    return get().clipboard.length > 0;
  },

  // Export/Import actions
  exportAnnotations: (imageId) => {
    const { annotations, images } = get();
    const targetId = imageId || get().currentImageId;
    if (!targetId) return "{}";

    const image = images.find((img) => img.id === targetId);
    const data = {
      imageId: targetId,
      imageName: image?.name || "unknown",
      annotations: annotations[targetId] || [],
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(data, null, 2);
  },

  importAnnotations: (json, imageId) => {
    try {
      const data = JSON.parse(json);
      if (data.annotations && Array.isArray(data.annotations)) {
        set((state) => ({
          annotations: {
            ...state.annotations,
            [imageId]: data.annotations,
          },
          selectedIds: [],
        }));
        get().saveSnapshot();
      }
    } catch (error) {
      console.error("Failed to import annotations:", error);
      throw error;
    }
  },

  clearAnnotations: (imageId) => {
    const targetId = imageId || get().currentImageId;
    if (!targetId) return;

    set((state) => ({
      annotations: {
        ...state.annotations,
        [targetId]: [],
      },
      selectedIds: [],
    }));

    get().saveSnapshot();
  },

  // UI actions
  setPanning: (isPanning) => {
    set({ isPanning });
  },

  setSnapToGrid: (snap) => {
    set({ snapToGrid: snap });
  },
}));

