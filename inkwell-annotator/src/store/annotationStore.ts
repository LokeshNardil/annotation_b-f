import { createWithEqualityFn } from "zustand/traditional";
import { Annotation, Tool, Transform, HistoryEntry, Mode } from "@/types/annotation";

const isProfileAnnotation = (annotation: Annotation | undefined) => {
  if (!annotation?.label) return false;
  return PROFILE_LABEL_CONFIG.some((profileLabel) => profileLabel.name === annotation.label);
};

const isAnnotationInsideProfile = (annotation: Annotation, profile: Annotation) => {
  return (
    annotation.x >= profile.x &&
    annotation.y >= profile.y &&
    annotation.x + annotation.w <= profile.x + profile.w &&
    annotation.y + annotation.h <= profile.y + profile.h
  );
};

const partitionAnnotationsForLazyLoad = (annotations: Annotation[]) => {
  const profile: Annotation[] = [];
  const deferred: Annotation[] = [];

  annotations.forEach((ann) => {
    if (isProfileAnnotation(ann)) {
      profile.push(ann);
      return;
    }
    if (ann.category === "ocr" || ann.ocrLabel) {
      profile.push(ann);
      return;
    }
    if (ann.category === "model") {
      profile.push(ann);
      return;
    }
    if (ann.category === "profile") {
      profile.push(ann);
      return;
    }
    deferred.push(ann);
  });

  return { profile, deferred };
};

type RemoteAnnotationPayload = {
  id: string;
  viewport_id?: string;
  coordinates?: Record<string, unknown>;
  label?: string;
  label_id?: string;
  text?: string;
  annotation_type?: string;
  status?: string;
  created_by?: string;
  modified_by_user?: string;
  created_at?: string;
  updated_at?: string;
  color?: string;
};

const parseNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toTimestamp = (value?: string) => {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const resolveLabelColor = (labelName?: string, labelId?: string) => {
  if (!labelName && !labelId) return getNextColor();

  const labelCatalog = [...PROFILE_LABEL_CONFIG, ...LABEL_CONFIG, ...OCR_LABEL_CONFIG];
  const matched = labelCatalog.find((entry) => entry.id === labelId || entry.name === labelName);
  return matched?.color ?? getNextColor();
};

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const generateUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const ensureUuid = (value?: string | null): string => {
  if (value && UUID_REGEX.test(value)) {
    return value;
  }
  return generateUuid();
};

const inferCategoryFromLabel = (label?: string): Annotation["category"] => {
  if (!label) return undefined;
  if (PROFILE_LABEL_CONFIG.some((entry) => entry.name === label)) return "profile";
  if (LABEL_CONFIG.some((entry) => entry.name === label)) return "model";
  if (OCR_LABEL_CONFIG.some((entry) => entry.name === label)) return "ocr";
  return undefined;
};

const convertRemoteAnnotation = (
  viewportId: string,
  remote: RemoteAnnotationPayload
): Annotation | null => {
  const coords = remote.coordinates ?? {};
  const x =
    parseNumber((coords as any).x, undefined) ??
    parseNumber((coords as any).left, undefined) ??
    parseNumber((coords as any).x1, 0);
  const y =
    parseNumber((coords as any).y, undefined) ??
    parseNumber((coords as any).top, undefined) ??
    parseNumber((coords as any).y1, 0);

  const widthRaw =
    parseNumber((coords as any).w, undefined) ??
    parseNumber((coords as any).width, undefined) ??
    (typeof (coords as any).right === "number" && typeof (coords as any).left === "number"
      ? (coords as any).right - (coords as any).left
      : undefined) ??
    (typeof (coords as any).x2 === "number" && typeof (coords as any).x1 === "number"
      ? (coords as any).x2 - (coords as any).x1
      : undefined);

  const heightRaw =
    parseNumber((coords as any).h, undefined) ??
    parseNumber((coords as any).height, undefined) ??
    (typeof (coords as any).bottom === "number" && typeof (coords as any).top === "number"
      ? (coords as any).bottom - (coords as any).top
      : undefined) ??
    (typeof (coords as any).y2 === "number" && typeof (coords as any).y1 === "number"
      ? (coords as any).y2 - (coords as any).y1
      : undefined);

  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const safeW = Number.isFinite(widthRaw) ? widthRaw : 0;
  const safeH = Number.isFinite(heightRaw) ? heightRaw : 0;

  const labelName = remote.label ?? remote.annotation_type ?? undefined;

  const annotation: Annotation = {
    id: ensureUuid(remote.id),
    label: labelName,
    color: remote.color ?? resolveLabelColor(labelName, remote.label_id),
    x: safeX,
    y: safeY,
    w: safeW,
    h: safeH,
    createdAt: toTimestamp(remote.created_at),
    updatedAt: toTimestamp(remote.updated_at ?? remote.created_at),
    parentId: remote.viewport_id ?? viewportId,
    category: inferCategoryFromLabel(labelName),
  };

  return annotation;
};

interface AnnotationStore {
  // Image state
  image: HTMLImageElement | null;
  imageUrl: string | null;
  
  // Annotations
  annotations: Annotation[];
  pendingAnnotations: Annotation[];
  selectedIds: Set<string>;
  
  // Tool state
  currentTool: Tool;
  
  // Mode state
  mode: Mode;
  
  // Transform state
  transform: Transform;
  
  // Drawing state
  isDrawing: boolean;
  isPanning: boolean;
  isDragging: boolean;
  isResizing: boolean;
  
  // History
  history: HistoryEntry[];
  historyIndex: number;
  
  // UI state
  showLabels: boolean;
  mousePos: { x: number; y: number; imageX: number; imageY: number };
  
  // Label state
  activeLabel: string;
  labels: Array<{ id: string; name: string; color: string; shortcut: string }>;
  
  // Actions
  setImage: (image: HTMLImageElement, url: string) => void;
  setTool: (tool: Tool) => void;
  setMode: (mode: Mode) => void;
  setActiveLabel: (labelId: string) => void;
  getActiveLabelConfig: () => { id: string; name: string; color: string; shortcut: string } | undefined;
  getCurrentLabels: () => Array<{ id: string; name: string; color: string; shortcut: string }>;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  deleteSelected: () => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  setTransform: (transform: Partial<Transform>) => void;
  resetTransform: () => void;
  setDrawing: (isDrawing: boolean) => void;
  setPanning: (isPanning: boolean) => void;
  setDragging: (isDragging: boolean) => void;
  setResizing: (isResizing: boolean) => void;
  toggleLabels: () => void;
  setMousePos: (pos: { x: number; y: number; imageX: number; imageY: number }) => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  
  // Import/Export
  exportAnnotations: () => string;
  importAnnotations: (json: string, imageName?: string) => void;
  clearAll: () => void;
  loadAnnotationsForProfile: (profile: Annotation) => Annotation[];
  ingestAnnotationList: (viewportId: string, annotations: RemoteAnnotationPayload[]) => void;
  upsertRemoteAnnotation: (annotation: RemoteAnnotationPayload) => void;
  removeRemoteAnnotation: (id: string, viewportId?: string) => void;
  
  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: (imageUrl?: string) => any;
}

const DEFAULT_COLORS = [
  "rgb(59, 130, 246)", // blue
  "rgb(16, 185, 129)", // green
  "rgb(249, 115, 22)", // orange
  "rgb(239, 68, 68)", // red
  "rgb(168, 85, 247)", // purple
  "rgb(236, 72, 153)", // pink
];

// Model labels (T1, T2, S15, VerticalBars, etc.)
export const LABEL_CONFIG = [
  { id: "model0", name: "T1", color: "rgb(59, 130, 246)", shortcut: "0" }, // blue
  { id: "model1", name: "T2", color: "rgb(16, 185, 129)", shortcut: "1" }, // green
  { id: "model2", name: "S15", color: "rgb(249, 115, 22)", shortcut: "2" }, // orange
  { id: "model3", name: "VerticalBars", color: "rgb(239, 68, 68)", shortcut: "3" }, // red
  { id: "model4", name: "HorizontalBars", color: "rgb(168, 85, 247)", shortcut: "4" }, // purple
  { id: "model5", name: "T3", color: "rgb(236, 72, 153)", shortcut: "5" }, // pink
  { id: "model6", name: "T4", color: "rgb(34, 197, 94)", shortcut: "6" }, // green
  { id: "model7", name: "S20", color: "rgb(251, 146, 60)", shortcut: "7" }, // orange
  { id: "model8", name: "S25", color: "rgb(139, 92, 246)", shortcut: "8" }, // violet
];

// OCR labels (Sheetno, Detailno, Scale, etc.)
export const OCR_LABEL_CONFIG = [
  { id: "ocr0", name: "Sheetno", color: "rgb(59, 130, 246)", shortcut: "0" }, // blue
  { id: "ocr1", name: "Detailno", color: "rgb(16, 185, 129)", shortcut: "1" }, // green
  { id: "ocr2", name: "Scale", color: "rgb(249, 115, 22)", shortcut: "2" }, // orange
  { id: "ocr3", name: "Title", color: "rgb(239, 68, 68)", shortcut: "3" }, // red
  { id: "ocr4", name: "Date", color: "rgb(168, 85, 247)", shortcut: "4" }, // purple
  { id: "ocr5", name: "Revision", color: "rgb(236, 72, 153)", shortcut: "5" }, // pink
  { id: "ocr6", name: "Project", color: "rgb(34, 197, 94)", shortcut: "6" }, // green
  { id: "ocr7", name: "Drawing", color: "rgb(251, 146, 60)", shortcut: "7" }, // orange
  { id: "ocr8", name: "Note", color: "rgb(139, 92, 246)", shortcut: "8" }, // violet
];

// Profile labels (Column Schedule, Column Section, Wall Schedule, etc.)
export const PROFILE_LABEL_CONFIG = [
  { id: "profile0", name: "Column Schedule", color: "rgb(59, 130, 246)", shortcut: "0" }, // blue
  { id: "profile1", name: "Column Section", color: "rgb(16, 185, 129)", shortcut: "1" }, // green
  { id: "profile2", name: "Wall Schedule", color: "rgb(249, 115, 22)", shortcut: "2" }, // orange
  { id: "profile3", name: "Beam Schedule", color: "rgb(239, 68, 68)", shortcut: "3" }, // red
  { id: "profile4", name: "Slab Schedule", color: "rgb(168, 85, 247)", shortcut: "4" }, // purple
  { id: "profile5", name: "Foundation Schedule", color: "rgb(236, 72, 153)", shortcut: "5" }, // pink
  { id: "profile6", name: "Detail Section", color: "rgb(34, 197, 94)", shortcut: "6" }, // green
  { id: "profile7", name: "Elevation", color: "rgb(251, 146, 60)", shortcut: "7" }, // orange
  { id: "profile8", name: "Plan View", color: "rgb(139, 92, 246)", shortcut: "8" }, // violet
];

// Legacy DEFAULT_LABELS for backward compatibility
export const DEFAULT_LABELS = LABEL_CONFIG;

let colorIndex = 0;

export const getNextColor = () => {
  const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
  colorIndex++;
  return color;
};

export const useAnnotationStore = createWithEqualityFn<AnnotationStore>((set, get) => ({
  // Initial state
  image: null,
  imageUrl: null,
  annotations: [],
  pendingAnnotations: [],
  selectedIds: new Set(),
  currentTool: "select",
  mode: "viewport",
  transform: { scale: 1, translateX: 0, translateY: 0 },
  isDrawing: false,
  isPanning: false,
  isDragging: false,
  isResizing: false,
  history: [],
  historyIndex: -1,
  showLabels: true,
  mousePos: { x: 0, y: 0, imageX: 0, imageY: 0 },
  activeLabel: PROFILE_LABEL_CONFIG[0].id,
  labels: PROFILE_LABEL_CONFIG,

  // Actions
  setImage: (image, url) => {
    set({ image, imageUrl: url });
    // Auto-save to localStorage when image is set
    setTimeout(() => get().saveToLocalStorage(), 100);
  },

  setTool: (tool) => {
    set({ currentTool: tool, selectedIds: new Set() });
  },

  setMode: (mode) => {
    const state = get();
    let labels = LABEL_CONFIG;
    let activeLabel = state.activeLabel; // Preserve current activeLabel if possible
    
    if (mode === "model") {
      labels = LABEL_CONFIG;
      // Check if current activeLabel exists in new labels, otherwise use first
      if (!labels.find(l => l.id === activeLabel)) {
        activeLabel = LABEL_CONFIG[0].id;
      }
    } else if (mode === "ocr") {
      labels = OCR_LABEL_CONFIG;
      // Check if current activeLabel exists in new labels, otherwise use first
      if (!labels.find(l => l.id === activeLabel)) {
        activeLabel = OCR_LABEL_CONFIG[0].id;
      }
    } else if (mode === "viewport") {
      // In viewport (Profile) mode, use PROFILE_LABEL_CONFIG
      labels = PROFILE_LABEL_CONFIG;
      // Check if current activeLabel exists in new labels, otherwise use first
      if (!labels.find(l => l.id === activeLabel)) {
        activeLabel = PROFILE_LABEL_CONFIG[0].id;
      }
    }
    
    set({ 
      mode, 
      labels, 
      activeLabel,
      selectedIds: new Set()
    });
  },

  addAnnotation: (annotation) => {
    const category =
      annotation.category ??
      (get().mode === "viewport"
        ? "profile"
        : get().mode === "model"
        ? "model"
        : get().mode === "ocr"
        ? "ocr"
        : inferCategoryFromLabel(annotation.label));
    const nextAnnotation: Annotation = {
      ...annotation,
      id: ensureUuid(annotation.id),
      category,
    };
    set((state) => {
      const newAnnotations = [...state.annotations, nextAnnotation];
      return { annotations: newAnnotations };
    });
    get().saveHistory();
    // Auto-save to localStorage
    setTimeout(() => get().saveToLocalStorage(), 100);
  },

  updateAnnotation: (id, updates) => {
    set((state) => {
      const newAnnotations = state.annotations.map((ann) =>
        ann.id === id ? { ...ann, ...updates, updatedAt: Date.now() } : ann
      );
      return { annotations: newAnnotations };
    });
    get().saveHistory();
    // Auto-save to localStorage
    setTimeout(() => get().saveToLocalStorage(), 100);
  },

  deleteAnnotation: (id) => {
    set((state) => {
      const target = state.annotations.find((ann) => ann.id === id);
      const remainingAnnotations = state.annotations.filter((ann) => ann.id !== id);
      let remainingPending = state.pendingAnnotations;

      if (target && isProfileAnnotation(target)) {
        const filterChildren = (ann: Annotation) => {
          if (ann.parentId) {
            return ann.parentId !== target.id;
          }
          return !isAnnotationInsideProfile(ann, target);
        };
        const removedLoadedChildren = remainingAnnotations.filter((ann) => !filterChildren(ann));
        remainingPending = remainingPending.filter(filterChildren);
        // Also remove any already-loaded children
        const filteredLoaded = remainingAnnotations.filter(filterChildren);
        const newSelected = new Set(
          Array.from(state.selectedIds).filter(
            (selectedId) =>
              selectedId !== id &&
              !removedLoadedChildren.some((ann) => ann.id === selectedId)
          )
        );
        return {
          annotations: filteredLoaded,
          pendingAnnotations: remainingPending,
          selectedIds: newSelected,
        };
      }

      const newSelected = new Set(state.selectedIds);
      newSelected.delete(id);
      return {
        annotations: remainingAnnotations,
        pendingAnnotations: remainingPending,
        selectedIds: newSelected,
      };
    });
    get().saveHistory();
    // Auto-save to localStorage
    setTimeout(() => get().saveToLocalStorage(), 100);
  },

  deleteSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    
    set((state) => {
      const selectedProfiles = state.annotations.filter(
        (ann) => selectedIds.has(ann.id) && isProfileAnnotation(ann)
      );

      const filterChildrenOfProfiles = (ann: Annotation) => {
        return !selectedProfiles.some((profile) => {
          if (ann.parentId) {
            return ann.parentId === profile.id;
          }
          return isAnnotationInsideProfile(ann, profile);
        });
      };

      const remainingAnnotations = state.annotations.filter(
        (ann) => !selectedIds.has(ann.id)
      ).filter(filterChildrenOfProfiles);

      const remainingPending = state.pendingAnnotations.filter(filterChildrenOfProfiles);

      return {
        annotations: remainingAnnotations,
        pendingAnnotations: remainingPending,
        selectedIds: new Set(),
      };
    });
    get().saveHistory();
    // Auto-save to localStorage
    setTimeout(() => get().saveToLocalStorage(), 100);
  },

  setSelected: (ids) => {
    set({ selectedIds: new Set(ids) });
  },

  toggleSelected: (id) => {
    set((state) => {
      const newSelected = new Set(state.selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return { selectedIds: newSelected };
    });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  setTransform: (transform) => {
    set((state) => ({
      transform: { ...state.transform, ...transform },
    }));
  },

  resetTransform: () => {
    set({ transform: { scale: 1, translateX: 0, translateY: 0 } });
  },

  setDrawing: (isDrawing) => set({ isDrawing }),
  setPanning: (isPanning) => set({ isPanning }),
  setDragging: (isDragging) => set({ isDragging }),
  setResizing: (isResizing) => set({ isResizing }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  setMousePos: (pos) => set({ mousePos: pos }),

  // History
  saveHistory: () => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({
        annotations: JSON.parse(JSON.stringify(state.annotations)),
        timestamp: Date.now(),
      });
      // Keep last 50 history entries
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        annotations: JSON.parse(JSON.stringify(state.history[newIndex].annotations)),
        historyIndex: newIndex,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        annotations: JSON.parse(JSON.stringify(state.history[newIndex].annotations)),
        historyIndex: newIndex,
      };
    });
  },

  // Import/Export
  exportAnnotations: () => {
    const { annotations, pendingAnnotations, imageUrl } = get();
    const data = {
      image: imageUrl || "unknown",
      annotations: [...annotations, ...pendingAnnotations],
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  },

  importAnnotations: (json) => {
    try {
      const data = JSON.parse(json);
      if (data.annotations && Array.isArray(data.annotations)) {
        const { profile, deferred } = partitionAnnotationsForLazyLoad(data.annotations);
        set({
          annotations: profile,
          pendingAnnotations: deferred,
          selectedIds: new Set(),
        });
        get().saveHistory();
      }
    } catch (error) {
      console.error("Failed to import annotations:", error);
      throw error;
    }
  },

  clearAll: () => {
    set({
      annotations: [],
      pendingAnnotations: [],
      selectedIds: new Set(),
      history: [],
      historyIndex: -1,
    });
    // Don't save to localStorage here - let setImage handle it after new image is set
  },

  // Label actions
  setActiveLabel: (labelId) => {
    set({ activeLabel: labelId });
  },

  getActiveLabelConfig: () => {
    const { labels, activeLabel } = get();
    return labels.find((l) => l.id === activeLabel) || labels[0];
  },

  getCurrentLabels: () => {
    const { mode } = get();
    if (mode === "model") {
      return LABEL_CONFIG;
    } else if (mode === "ocr") {
      return OCR_LABEL_CONFIG;
    } else if (mode === "viewport") {
      return PROFILE_LABEL_CONFIG;
    }
    return LABEL_CONFIG; // Default fallback
  },

  // Persistence actions
  saveToLocalStorage: () => {
    try {
      const { imageUrl, annotations, pendingAnnotations, activeLabel, transform } = get();
      if (!imageUrl) return; // Don't save if no image
      
      // Save annotations per image URL
      const imageKey = imageUrl.substring(0, 100); // Use first 100 chars as key
      const data = {
        annotations: [...annotations, ...pendingAnnotations].map(ann => ({
          id: ann.id,
          label: ann.label,
          color: ann.color,
          x: ann.x,
          y: ann.y,
          w: ann.w,
          h: ann.h,
          createdAt: ann.createdAt,
          updatedAt: ann.updatedAt,
          parentId: ann.parentId,
          category: ann.category,
          ocrLabel: ann.ocrLabel,
        })),
        activeLabel,
        transform,
        timestamp: Date.now(),
      };
      localStorage.setItem(`imageAnnotator_${imageKey}`, JSON.stringify(data));
      
      // Also save a map of all image URLs for easy lookup
      const allImages = JSON.parse(localStorage.getItem("imageAnnotator_images") || "[]");
      if (!allImages.includes(imageKey)) {
        allImages.push(imageKey);
        localStorage.setItem("imageAnnotator_images", JSON.stringify(allImages));
      }
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
      // If localStorage is full, show a warning
      if (error instanceof DOMException && error.code === 22) {
        console.warn("LocalStorage is full. Some data may not be saved.");
      }
    }
  },

  loadFromLocalStorage: (imageUrl?: string) => {
    try {
      const urlToLoad = imageUrl || get().imageUrl;
      if (!urlToLoad) return null;

      const imageKey = urlToLoad.substring(0, 100);
      const stored = localStorage.getItem(`imageAnnotator_${imageKey}`);
      if (!stored) return null;

      const data = JSON.parse(stored);
      
      // Load annotations
      if (data.annotations && Array.isArray(data.annotations)) {
        // Ensure all loaded annotations have labels - assign default if missing
        const annotationsWithLabels = data.annotations.map((ann: any) => {
          let nextAnnotation = { ...ann };
          if (!nextAnnotation.label || nextAnnotation.label === '') {
            const defaultLabel = PROFILE_LABEL_CONFIG[0].name;
            console.warn(`Annotation ${ann.id} loaded without label, assigning default: ${defaultLabel}`);
            nextAnnotation = {
              ...nextAnnotation,
              label: defaultLabel,
              color: ann.color || PROFILE_LABEL_CONFIG[0].color,
            };
          }

          const inferredCategory =
            nextAnnotation.category ??
            (nextAnnotation.ocrLabel
              ? "ocr"
              : inferCategoryFromLabel(nextAnnotation.label));

          return {
            ...nextAnnotation,
            id: ensureUuid(nextAnnotation.id),
            category: inferredCategory,
          };
        });
        
        const { profile, deferred } = partitionAnnotationsForLazyLoad(annotationsWithLabels);

        console.log(
          `[ImageAnnotator] Loaded ${profile.length} profile annotation(s) and ${deferred.length} deferred child annotation(s) from storage.`
        );
        const categoryBreakdown = annotationsWithLabels.reduce<Record<string, number>>((acc, ann) => {
          const key = ann.category ?? "unclassified";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        console.log("[ImageAnnotator] Category breakdown from storage", categoryBreakdown);

        set((state) => ({
          annotations: profile,
          pendingAnnotations: deferred,
          selectedIds: new Set(),
          activeLabel: data.activeLabel || PROFILE_LABEL_CONFIG[0].id,
          transform: data.transform || state.transform,
        }));
        return data;
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
    }
    return null;
  },

  loadAnnotationsForProfile: (profile) => {
    const state = get();
    if (!profile) return [];

    const pending = state.pendingAnnotations;
    if (pending.length === 0) return [];

    const matches = pending.filter((ann) => {
      if (ann.parentId) {
        return ann.parentId === profile.id;
      }
      return isAnnotationInsideProfile(ann, profile);
    });

    if (matches.length === 0) {
      console.log(
        `[ImageAnnotator] No deferred annotations found for profile "${profile.label}" (${profile.id}).`
      );
      return [];
    }

    console.log(
      `[ImageAnnotator] Loading ${matches.length} deferred annotation(s) for profile "${profile.label}" (${profile.id}).`
    );

    const remainingPending = pending.filter((ann) => !matches.includes(ann));
    set({
      annotations: [...state.annotations, ...matches],
      pendingAnnotations: remainingPending,
    });

    get().saveHistory();
    setTimeout(() => get().saveToLocalStorage(), 100);

    return matches;
  },

  ingestAnnotationList: (viewportId, remoteAnnotations) => {
    if (!viewportId || !Array.isArray(remoteAnnotations) || remoteAnnotations.length === 0) {
      return;
    }

    set((state) => {
      const converted = remoteAnnotations
        .map((remote) => convertRemoteAnnotation(viewportId, remote))
        .filter((ann): ann is Annotation => Boolean(ann));

      if (converted.length === 0) {
        return state;
      }

      const preserved = state.annotations.filter((ann) => {
        if (isProfileAnnotation(ann)) return true;
        if (!ann.parentId) return true;
        return ann.parentId !== viewportId;
      });

      const mergedMap = new Map<string, Annotation>();
      preserved.forEach((ann) => mergedMap.set(ann.id, ann));
      converted.forEach((ann) => mergedMap.set(ann.id, ann));

      return {
        annotations: Array.from(mergedMap.values()),
        pendingAnnotations: state.pendingAnnotations.filter((ann) => ann.parentId !== viewportId),
      };
    });
  },

  upsertRemoteAnnotation: (remoteAnnotation) => {
    const viewportId = remoteAnnotation.viewport_id;
    if (!viewportId) return;

    const converted = convertRemoteAnnotation(viewportId, remoteAnnotation);
    if (!converted) return;

    set((state) => {
      const annotations = state.annotations.filter((ann) => ann.id !== converted.id);
      const pendingAnnotations = state.pendingAnnotations.filter((ann) => ann.id !== converted.id);
      return {
        annotations: [...annotations, converted],
        pendingAnnotations,
      };
    });
  },

  removeRemoteAnnotation: (annotationId, viewportId) => {
    if (!annotationId) return;

    set((state) => {
      const annotations = state.annotations.filter((ann) => ann.id !== annotationId);
      const pendingAnnotations = state.pendingAnnotations.filter((ann) => ann.id !== annotationId);

      return {
        annotations,
        pendingAnnotations: viewportId
          ? pendingAnnotations.filter((ann) => ann.parentId !== viewportId)
          : pendingAnnotations,
      };
    });
  },
}));
