import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Upload, MousePointer2, Square, FileText, Download, RefreshCcw } from "lucide-react";
import { shallow } from "zustand/shallow";
import { useAnnotationStore, getNextColor, LABEL_CONFIG, OCR_LABEL_CONFIG, PROFILE_LABEL_CONFIG } from "@/store/annotationStore";
import { Annotation } from "@/types/annotation";
import { Toolbar } from "./Toolbar";
import { ZoomControls } from "./ZoomControls";
import { StatusBar } from "./StatusBar";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { LegendPanel } from "./LegendPanel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCollaborationStore, RemoteUserState } from "@/store/collaborationStore";

const UPLOADS_STORAGE_KEY = "inkwell-uploaded-images";
const CURRENT_IMAGE_STORAGE_KEY = "inkwell-current-image-id";
const AUTH_STORAGE_KEY = "inkwell-auth";
const AUTH_SESSION_KEY = "inkwell-auth-session";
const DEV_AUTO_TOKEN_FLAG = (import.meta.env.VITE_REALTIME_DEV_AUTO_TOKEN as string | undefined) === "true";

const resolveApiBaseUrl = () => {
  const envApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envApiBase) return envApiBase.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
};

console.log("[OCR] Initial API base", resolveApiBaseUrl());

type DefaultAssetConfig = {
  id: string;
  name: string;
  assetUrl: string;
  ocrCsvUrl?: string;
  ocrCsvPath?: string;
  modelCsvUrl?: string;
  modelCsvPath?: string;
  modelClassMap?: Record<string, string>;
  profileCsvUrl?: string;
  profileCsvPath?: string;
  profileClassMap?: Record<string, string>;
};

type UploadedImageEntry = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  ocrCsvPath?: string;
  modelCsvPath?: string;
  profileCsvPath?: string;
};

const DEFAULT_ASSET_UPLOADS: DefaultAssetConfig[] = [
  {
    id: "default-24m85-struct-ss57",
    name: "24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57.png",
    assetUrl: new URL(
      "../../19815_V1/input/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57.png",
      import.meta.url,
    ).href,
    ocrCsvUrl: new URL(
      "../../19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/bbox_details.csv",
      import.meta.url,
    ).href,
    ocrCsvPath: "19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/bbox_details.csv",
    modelCsvUrl: new URL(
      "../../19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/annotations/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57.csv",
      import.meta.url,
    ).href,
    modelCsvPath:
      "19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/annotations/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57.csv",
    profileCsvUrl: new URL(
      "../../19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/annotations/viewport.csv",
      import.meta.url,
    ).href,
    profileCsvPath:
      "19815_V1/output/Jamb/24M85 - 15202 RESIDENCES - STRUCT PDF-ss 57/annotations/viewport.csv",
  },
];

type ParsedCsvRow = Record<string, string>;

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.trim());
};

const parseCsv = (csv: string): ParsedCsvRow[] => {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 1 && values[0] === "") continue;

    const row: ParsedCsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
};

const normalizeLabel = (label?: string) => {
  if (!label) return undefined;
  const trimmed = label.trim();
  if (!trimmed || trimmed.toLowerCase() === "no label") return undefined;
  return trimmed;
};

const resolveOcrColor = (label?: string) => {
  const normalized = normalizeLabel(label);
  if (!normalized) return getNextColor();
  const matched = OCR_LABEL_CONFIG.find(
    (entry) => entry.name.toLowerCase() === normalized.toLowerCase(),
  );
  return matched?.color ?? getNextColor();
};

const createAnnotationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const resolveModelLabel = (classId: string, meta?: DefaultAssetConfig) => {
  if (meta?.modelClassMap?.[classId]) return meta.modelClassMap[classId];
  const numeric = Number.parseInt(classId, 10);
  if (Number.isFinite(numeric)) {
    const index = ((numeric % LABEL_CONFIG.length) + LABEL_CONFIG.length) % LABEL_CONFIG.length;
    return LABEL_CONFIG[index].name;
  }
  return LABEL_CONFIG[0].name;
};

const resolveProfileLabel = (classId: string, meta?: DefaultAssetConfig, sequence = 0) => {
  if (meta?.profileClassMap?.[classId]) return meta.profileClassMap[classId];
  const index = sequence % PROFILE_LABEL_CONFIG.length;
  return PROFILE_LABEL_CONFIG[index].name;
};

const isProfileLabelName = (label?: string) =>
  Boolean(label && PROFILE_LABEL_CONFIG.some((entry) => entry.name === label));

const isProfileAnnotationShape = (annotation: Annotation | undefined) => {
  if (!annotation) return false;
  if (annotation.category === "profile") return true;
  return isProfileLabelName(annotation.label);
};

const isRectInside = (
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number },
) => {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
};

const linkAnnotationsToProfiles = (annotations: Annotation[]): Annotation[] => {
  const profiles = annotations.filter((ann) => isProfileAnnotationShape(ann));
  if (profiles.length === 0) {
    return annotations;
  }

  let changed = false;
  const updated = annotations.map((ann) => {
    if (isProfileAnnotationShape(ann)) {
      return ann;
    }

    const containingProfile = profiles.find((profile) => isRectInside(ann, profile));
    const nextParentId = containingProfile?.id;

    if ((nextParentId ?? undefined) === (ann.parentId ?? undefined)) {
      return ann;
    }

    changed = true;
    return { ...ann, parentId: nextParentId };
  });

  return changed ? updated : annotations;
};

const resolveCategoryColor = (label: string, category: "model" | "profile") => {
  if (category === "profile") {
    return PROFILE_LABEL_CONFIG.find((entry) => entry.name === label)?.color ?? getNextColor();
  }
  return LABEL_CONFIG.find((entry) => entry.name === label)?.color ?? getNextColor();
};

export const convertBoundingBoxRowsToAnnotations = (
  rows: ParsedCsvRow[],
  category: "model" | "profile",
  imageId: string,
  meta?: DefaultAssetConfig,
): Annotation[] => {
  const parseNumber = (value?: string) => {
    if (value === undefined || value === null) return undefined;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const now = Date.now();
  let profileSequence = 0;

  const annotations: Annotation[] = [];

  rows.forEach((row, index) => {
    const classId = row.class_id ?? row.classId ?? row.label ?? String(index);

    const xMin =
      parseNumber(row.x_min) ??
      parseNumber(row.xMin) ??
      parseNumber(row.left) ??
      parseNumber(row.x1);
    const yMin =
      parseNumber(row.y_min) ??
      parseNumber(row.yMin) ??
      parseNumber(row.top) ??
      parseNumber(row.y1);
    const xMax =
      parseNumber(row.x_max) ??
      parseNumber(row.xMax) ??
      parseNumber(row.right) ??
      parseNumber(row.x2);
    const yMax =
      parseNumber(row.y_max) ??
      parseNumber(row.yMax) ??
      parseNumber(row.bottom) ??
      parseNumber(row.y2);

    if (
      xMin === undefined ||
      yMin === undefined ||
      xMax === undefined ||
      yMax === undefined
    ) {
      return;
    }

    const width = xMax - xMin;
    const height = yMax - yMin;

    if (width <= 0 || height <= 0) {
      return;
    }

    const label =
      category === "model"
        ? resolveModelLabel(String(classId), meta)
        : (() => {
            const resolved = resolveProfileLabel(String(classId), meta, profileSequence);
            profileSequence += 1;
            return resolved;
          })();

    const annotation: Annotation = {
      id: createAnnotationId(),
      label,
      color: resolveCategoryColor(label, category),
      x: xMin,
      y: yMin,
      w: width,
      h: height,
      createdAt: now + index,
      updatedAt: now + index,
      parentId: imageId,
      category,
    };

    annotations.push(annotation);
  });

  return annotations;
};

export const ImageAnnotator = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [dragOver, setDragOver] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragStartPositions, setDragStartPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [initialMouseOffset, setInitialMouseOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStartAnnotation, setResizeStartAnnotation] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [panStartTransform, setPanStartTransform] = useState<{ translateX: number; translateY: number } | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageEntry[]>([]);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const sidebarFileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingRect, setEditingRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const initialEditingValueRef = useRef<string | null>(null);
  const [activeProfileEditId, setActiveProfileEditId] = useState<string | null>(null);
  const [isUploadsHydrated, setIsUploadsHydrated] = useState(false);
  const autoLoadedDefaultsRef = useRef<Set<string>>(new Set());
  const defaultAssetMeta = useMemo(
    () => new Map(DEFAULT_ASSET_UPLOADS.map((entry) => [entry.id, entry])),
    [],
  );
  const previewUpdateTimeoutRef = useRef<number | null>(null);
  const renderRef = useRef<() => void>(() => {});

  const reconcileAnnotationParents = useCallback(() => {
    useAnnotationStore.setState((state) => {
      const linked = linkAnnotationsToProfiles(state.annotations);
      if (linked === state.annotations) {
        return {};
      }
      return { annotations: linked };
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUpdateTimeoutRef.current !== null) {
        window.clearTimeout(previewUpdateTimeoutRef.current);
        previewUpdateTimeoutRef.current = null;
      }
    };
  }, []);
  
  const selectedIdList = useAnnotationStore(
    (state) => Array.from(state.selectedIds),
    shallow
  );
  const selectedIdSet = useMemo(() => new Set(selectedIdList), [selectedIdList]);
  const remoteUsers = useCollaborationStore(
    (state) => Object.values(state.remoteUsers),
    shallow
  );
  const lastCursorSentRef = useRef(0);
  const lastSelectionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // console.info("[Realtime] Remote users snapshot", remoteUsers);
  }, [remoteUsers]);

  const [realtimeAuth, setRealtimeAuth] = useState<{
    projectId: string | null;
    token: string | null;
    source: "initial" | "storage" | "query" | "env" | "dev";
  }>({
    projectId: null,
    token: null,
    source: "initial",
  });

  const realtimeEnabled =
    (import.meta.env.VITE_REALTIME_ENABLED as string | undefined) === "true";

  useEffect(() => {
    if (typeof window === "undefined") return;

    let projectId: string | null = null;
    let token: string | null = null;
    let source: "initial" | "storage" | "query" | "env" | "dev" = "initial";

    const sessionAuthRaw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (sessionAuthRaw) {
      try {
        // console.info("[Realtime] Found session auth payload", sessionAuthRaw);
        const sessionAuth = JSON.parse(sessionAuthRaw) as {
          projectId?: string;
          project_id?: string;
          token?: string;
        };
        projectId = sessionAuth.projectId ?? sessionAuth.project_id ?? projectId;
        token = sessionAuth.token ?? token;
        if (projectId || token) {
          source = "storage";
        }
      } catch (error) {
        console.warn("[Realtime] Failed to parse session auth payload", error);
      }
    }

    const storedAuthRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedAuthRaw && source === "initial") {
      try {
        // console.info("[Realtime] Found persistent auth payload", storedAuthRaw);
        const storedAuth = JSON.parse(storedAuthRaw) as { projectId?: string; project_id?: string; token?: string };
        projectId = storedAuth.projectId ?? storedAuth.project_id ?? null;
        token = storedAuth.token ?? null;
        if (projectId || token) {
          source = "storage";
        }
      } catch (error) {
        console.warn("[Realtime] Failed to parse stored auth payload", error);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const queryProjectId = params.get("projectId");
    const queryToken = params.get("token");
    if (queryProjectId) {
      projectId = queryProjectId;
      source = "query";
    }
    if (queryToken && !DEV_AUTO_TOKEN_FLAG) {
      token = queryToken;
      source = "query";
    }

    if (!projectId) {
      const envProject = import.meta.env.VITE_REALTIME_PROJECT_ID as string | undefined;
      if (envProject) {
        projectId = envProject;
        if (source === "initial") {
          source = "env";
        }
      }
    }
    if (!token) {
      const envToken = import.meta.env.VITE_REALTIME_TOKEN as string | undefined;
      if (envToken) {
        token = envToken;
        if (source === "initial") {
          source = "env";
        }
      }
    }

    setRealtimeAuth({ projectId, token, source });
  }, []);

  useEffect(() => {
    if (!DEV_AUTO_TOKEN_FLAG) return;
    if (!realtimeEnabled) return;
    if (realtimeAuth.projectId && realtimeAuth.token) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const fetchDevToken = async () => {
      const apiBase = resolveApiBaseUrl();
      try {
        // console.info("[Realtime] Requesting dev token", {
        //   suffix: randomSuffix,
        //   projectId: realtimeAuth.projectId ?? (import.meta.env.VITE_REALTIME_PROJECT_ID as string | undefined) ?? "demo-project",
        // });
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        console.info("[Realtime] Requesting dev token", {
          suffix: randomSuffix,
          projectId: realtimeAuth.projectId ?? (import.meta.env.VITE_REALTIME_PROJECT_ID as string | undefined) ?? "demo-project",
        });
        const response = await fetch(`${apiBase}/auth/dev-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_id: realtimeAuth.projectId ?? (import.meta.env.VITE_REALTIME_PROJECT_ID as string | undefined) ?? "demo-project",
            username: `dev-${randomSuffix}`,
            name: `Dev ${randomSuffix}`,
          }),
        });

        if (!response.ok) {
          console.error("[Realtime] Failed to fetch dev token", response.status, await response.text());
          return;
        }

        const data = (await response.json()) as { token: string; project_id?: string; projectId?: string };
        if (cancelled) return;

        const nextProjectId =
          realtimeAuth.projectId ??
          data.project_id ??
          data.projectId ??
          (import.meta.env.VITE_REALTIME_PROJECT_ID as string | undefined) ??
          "demo-project";

        const nextAuth = {
          projectId: nextProjectId,
          token: data.token,
          source: "dev" as const,
        };

        const serialized = JSON.stringify({ projectId: nextAuth.projectId, token: nextAuth.token });
        window.sessionStorage.setItem(AUTH_SESSION_KEY, serialized);
        // console.info("[Realtime] Stored dev token in sessionStorage", {
        //   projectId: nextAuth.projectId,
        //   tokenPreview: `${nextAuth.token.slice(0, 10)}…`,
        // });
        console.info("[Realtime] Stored dev token in sessionStorage", {
          projectId: nextAuth.projectId,
          tokenPreview: `${nextAuth.token.slice(0, 10)}…`,
        });
        setRealtimeAuth(nextAuth);
      } catch (error) {
        console.error("[Realtime] Failed to fetch dev token", error);
      }
    };

    fetchDevToken();

    return () => {
      cancelled = true;
    };
  }, [realtimeAuth, realtimeEnabled]);

  useEffect(() => {
    if (!realtimeEnabled) {
      return;
    }
    // console.info("[Realtime] Auth state", {
    //   projectId: realtimeAuth.projectId,
    //   hasToken: Boolean(realtimeAuth.token),
    //   source: realtimeAuth.source,
    // });
    console.info("[Realtime] Auth state", realtimeAuth);
  }, [realtimeAuth, realtimeEnabled]);

  const { sendCursorUpdate, sendSelectionUpdate, localUserId } = useRealtimeSync(
    realtimeEnabled ? realtimeAuth.projectId : null,
    realtimeEnabled ? realtimeAuth.token : null,
  );

  const store = useAnnotationStore();
  const legendItems = store.getCurrentLabels();

  useEffect(() => {
    if (!realtimeEnabled) return;
    const nextSelection = selectedIdList[0] ?? null;
    if (lastSelectionIdRef.current === nextSelection) return;
    lastSelectionIdRef.current = nextSelection;
    sendSelectionUpdate(nextSelection);
  }, [selectedIdList, sendSelectionUpdate, realtimeEnabled]);
  const isProfileLabel = useCallback((label?: string) => {
    if (!label) return false;
    return PROFILE_LABEL_CONFIG.some((profileLabel) => profileLabel.name === label);
  }, []);
  const isProfileEditMode = activeProfileEditId !== null;
  
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;
  const HANDLE_SIZE = 8;

  // Transform functions
  const screenToImage = useCallback((screenX: number, screenY: number) => {
    const { transform } = store;
    // screenX/Y are relative to visible canvas, add scroll offset to get position in full canvas
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    const canvasX = screenX + scrollLeft;
    const canvasY = screenY + scrollTop;
    // Convert canvas coordinates to image coordinates
    const x = (canvasX - transform.translateX) / transform.scale;
    const y = (canvasY - transform.translateY) / transform.scale;
    return { x, y };
  }, [store.transform]);

  const imageToScreen = useCallback((imageX: number, imageY: number) => {
    const { transform } = store;
    // Convert image coordinates to canvas coordinates
    const canvasX = imageX * transform.scale + transform.translateX;
    const canvasY = imageY * transform.scale + transform.translateY;
    // Subtract scroll offset to get position in visible area
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    const x = canvasX - scrollLeft;
    const y = canvasY - scrollTop;
    return { x, y };
  }, [store.transform]);

  const computeRectForAnnotation = useCallback((annotation: Annotation) => {
    if (!canvasRef.current) return null;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const topLeft = imageToScreen(annotation.x, annotation.y);
    const bottomRight = imageToScreen(annotation.x + annotation.w, annotation.y + annotation.h);

    return {
      left: canvasRect.left + topLeft.x,
      top: canvasRect.top + topLeft.y,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
    };
  }, [imageToScreen]);

  const getAnnotationOptions = useCallback((annotation: Annotation | null) => {
    if (annotation) {
      if (PROFILE_LABEL_CONFIG.some((label) => label.name === annotation.label)) {
        return PROFILE_LABEL_CONFIG;
      }
      if (LABEL_CONFIG.some((label) => label.name === annotation.label)) {
        return LABEL_CONFIG;
      }
      if (OCR_LABEL_CONFIG.some((label) => label.name === annotation.label)) {
        return OCR_LABEL_CONFIG;
      }
    }

    if (store.mode === "model") {
      return LABEL_CONFIG;
    }
    if (store.mode === "ocr") {
      return OCR_LABEL_CONFIG;
    }
    return PROFILE_LABEL_CONFIG;
  }, [store.mode]);

  const editingAnnotation = editingId
    ? store.annotations.find((ann) => ann.id === editingId)
    : null;

  const editingOptions = useMemo(() => {
    if (!editingAnnotation) return [];
    return getAnnotationOptions(editingAnnotation);
  }, [editingAnnotation, getAnnotationOptions]);

  const computeScreenPoint = useCallback(
    (imageX: number, imageY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const point = imageToScreen(imageX, imageY);
      return {
        left: canvasRect.left + point.x,
        top: canvasRect.top + point.y,
      };
    },
    [imageToScreen]
  );

  const remoteSelectionOverlays = useMemo(() => {
    return remoteUsers
      .map((user) => {
        if (!user.selectionId) return null;
        if (localUserId && user.id === localUserId) return null;

        const annotation = store.annotations.find((ann) => ann.id === user.selectionId);
        if (!annotation) return null;

        const rect = computeRectForAnnotation(annotation);
        if (!rect) return null;

        return {
          ...rect,
          color: user.color,
          userId: user.id,
          userName: user.name,
          annotationId: annotation.id,
        };
      })
      .filter((overlay): overlay is NonNullable<typeof overlay> => Boolean(overlay));
  }, [remoteUsers, computeRectForAnnotation, store.annotations, localUserId]);

  const remoteCursorOverlays = useMemo(() => {
    return remoteUsers
      .map((user) => {
        if (!user.cursor) return null;
        if (localUserId && user.id === localUserId) return null;

        const point = computeScreenPoint(user.cursor.imageX, user.cursor.imageY);
        if (!point) return null;

        return {
          ...point,
          color: user.color,
          userId: user.id,
          userName: user.name,
        };
      })
      .filter((cursor): cursor is NonNullable<typeof cursor> => Boolean(cursor));
  }, [remoteUsers, computeScreenPoint, localUserId]);

  const debouncedPreviewUpdate = useCallback(
    (annotationId: string, value: string) => {
      if (!annotationId) return;
      if (previewUpdateTimeoutRef.current !== null) {
        window.clearTimeout(previewUpdateTimeoutRef.current);
      }
      previewUpdateTimeoutRef.current = window.setTimeout(() => {
        store.updateAnnotation(annotationId, { label: value });
        requestAnimationFrame(() => renderRef.current());
      }, 300);
    },
    [store],
  );

  const clearEditingState = useCallback(() => {
    if (previewUpdateTimeoutRef.current !== null) {
      window.clearTimeout(previewUpdateTimeoutRef.current);
      previewUpdateTimeoutRef.current = null;
    }
    setEditingId(null);
    setEditingValue("");
    setEditingRect(null);
    setIsDropdownOpen(false);
    initialEditingValueRef.current = null;
  }, []);

  const updateEditingRect = useCallback(() => {
    if (!editingId) return;
    const annotation = store.annotations.find((ann) => ann.id === editingId);
    if (!annotation) return;

    const rect = computeRectForAnnotation(annotation);
    if (rect) {
      setEditingRect(rect);
    }
  }, [editingId, store.annotations, computeRectForAnnotation]);

  const openLabelEditor = useCallback((annotation: Annotation) => {
    const rect = computeRectForAnnotation(annotation);
    if (!rect) return;

    const options = getAnnotationOptions(annotation);
    if (options.length === 0) return;

    const matchedOption = options.find((option) => option.name === annotation.label) ?? options[0];

    setEditingRect(rect);
    setEditingId(annotation.id);
    setEditingValue(matchedOption.id);
    initialEditingValueRef.current = matchedOption.id;
    setIsDropdownOpen(true);
  }, [computeRectForAnnotation, getAnnotationOptions]);

  const openTextEditor = useCallback(
    (annotation: Annotation | null) => {
      if (!annotation) return;

      const isOcrAnnotation =
        annotation.category === "ocr" ||
        Boolean(annotation.ocrLabel) ||
        (annotation.label ? OCR_LABEL_CONFIG.some((entry) => entry.name === annotation.label) : false);

      if (!isOcrAnnotation) return;

      const rect = computeRectForAnnotation(annotation);
      if (!rect) return;

      setIsDropdownOpen(false);
      setEditingRect(rect);
      setEditingId(annotation.id);
      setEditingValue(String(annotation.label ?? ""));
      initialEditingValueRef.current = String(annotation.label ?? "");
    },
    [computeRectForAnnotation],
  );

  const finalizeEditing = useCallback((value: string) => {
    if (!editingId) return;

    const annotation = store.annotations.find((ann) => ann.id === editingId);
    if (!annotation) {
      clearEditingState();
      return;
    }

    const options = getAnnotationOptions(annotation);
    if (options.length === 0) {
      clearEditingState();
      return;
    }

    const nextOption = options.find((option) => option.id === value) ?? options[0];
    const shouldUpdate =
      annotation.label !== nextOption.name || annotation.color !== nextOption.color;

    if (shouldUpdate) {
      store.updateAnnotation(annotation.id, {
        label: nextOption.name,
        color: nextOption.color,
      });
      store.saveToLocalStorage?.();
      toast.success(`Label updated to ${nextOption.name}`);
    }

    clearEditingState();
  }, [editingId, store.annotations, getAnnotationOptions, clearEditingState, store]);

  const finalizeOcrTextEditing = useCallback(async () => {
    if (!editingId) return;
    const newText = (editingValue || "").trim();

    console.log("[OCR] finalizeOcrTextEditing invoked", {
      editingId,
      newText,
    });

    store.updateAnnotation(editingId, { label: newText });
    if (typeof store.saveToLocalStorage === "function") {
      store.saveToLocalStorage();
    }

    const currentImage = uploadedImages.find((entry) => entry.id === currentImageId) ?? null;
    let apiError: string | null = null;

    if (currentImage?.ocrCsvPath) {
      const ocrAnnotations = store.annotations.filter((ann) => {
        const isOcrLike = ann.category === "ocr" || Boolean(ann.ocrLabel);
        if (!isOcrLike) return false;
        if (!currentImageId) return true;
        return ann.parentId === currentImageId || !ann.parentId;
      });

      const payload = {
        relative_csv_path: currentImage.ocrCsvPath,
        annotations: ocrAnnotations.map((ann) => ({
          id: ann.id,
          x: ann.x,
          y: ann.y,
          width: ann.w,
          height: ann.h,
          text: ann.label ?? "",
          label: ann.ocrLabel ?? ann.label ?? "",
          confidence: (ann as any).confidence ?? null,
        })),
      };

      if (currentImage?.ocrCsvPath) {
        const primaryBase = resolveApiBaseUrl();
        const fallbackBase = "http://127.0.0.1:8000";
        const basesToTry = primaryBase === fallbackBase ? [primaryBase] : [primaryBase, fallbackBase];

        console.log("[OCR] Persisting annotations to backend", {
          imageId: currentImageId,
          csvPath: currentImage.ocrCsvPath,
          annotationCount: payload.annotations.length,
          bases: basesToTry,
        });

        let persisted = false;
        let lastError: unknown = null;

        for (const apiBase of basesToTry) {
          try {
            console.log("[OCR] Using API base", apiBase);
            const response = await fetch(`${apiBase}/annotations/ocr/save`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              const message = await response.text();
              throw new Error(message || response.statusText);
            }
            const result = await response.json();
            console.log("[OCR] CSV persisted", {
              path: result.csv_path,
              rows: result.rows,
              annotations: payload.annotations.length,
              apiBase,
            });
            toast.success?.(
              `OCR text updated (saved ${result.rows ?? payload.annotations.length} rows to backend)`
            );
            persisted = true;
            break;
          } catch (err) {
            console.error(`[OCR] Persist attempt failed for ${apiBase}`, err);
            lastError = err;
          }
        }

        if (!persisted && lastError) {
          apiError = lastError instanceof Error ? lastError.message : "Unknown error";
        }
      } else {
        console.log("[OCR] Skipping backend persist – no CSV path for image", {
          imageId: currentImageId,
          imageName: currentImage?.name,
          defaultMeta: defaultAssetMeta.get(currentImageId),
          uploadedImage: currentImage,
        });
        toast.success?.("OCR text updated (local storage only)");
      }
    } else {
      console.log("[OCR] Skipping backend persist – no CSV path for image", {
        imageId: currentImageId,
        imageName: currentImage?.name,
        defaultMeta: defaultAssetMeta.get(currentImageId),
        uploadedImage: currentImage,
      });
      toast.success?.("OCR text updated (local storage only)");
    }

    requestAnimationFrame(() => {
      renderRef.current();
    });

    if (apiError) {
      toast.error?.(`OCR text saved locally, CSV update failed: ${apiError}`);
    }

    clearEditingState();
  }, [
    editingId,
    editingValue,
    store,
    clearEditingState,
    uploadedImages,
    currentImageId,
    defaultAssetMeta,
    setUploadedImages,
  ]);

  const cancelOcrTextEditing = useCallback(() => {
    if (!editingId) {
      clearEditingState();
      return;
    }
    const originalValue = initialEditingValueRef.current ?? "";
    store.updateAnnotation(editingId, { label: String(originalValue) });
    requestAnimationFrame(() => {
      renderRef.current();
    });
    clearEditingState();
  }, [editingId, clearEditingState, store]);

  const handleOverlayDismiss = useCallback(() => {
    setIsDropdownOpen(false);
    const targetValue = editingValue || initialEditingValueRef.current || "";
    finalizeEditing(targetValue);
  }, [editingValue, finalizeEditing]);

  const handleLabelSelect = useCallback((value: string) => {
    setEditingValue(value);
    finalizeEditing(value);
  }, [finalizeEditing]);

  const handleOverlayBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (isDropdownOpen) {
      return;
    }

    const relatedTarget = event.relatedTarget as Node | null;
    if (overlayRef.current && relatedTarget && overlayRef.current.contains(relatedTarget)) {
      return;
    }

    handleOverlayDismiss();
  }, [handleOverlayDismiss, isDropdownOpen]);

  useEffect(() => {
    if (!editingId) return;
    updateEditingRect();
  }, [editingId, updateEditingRect]);

  useEffect(() => {
    if (!editingId) return;
    const ann = store.annotations.find((a) => a.id === editingId) ?? null;
    if (ann && (ann.category === "ocr" || ann.ocrLabel)) {
      return;
    }
    if (overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [editingId, store.annotations]);

  useEffect(() => {
    if (store.mode !== "viewport") {
      setActiveProfileEditId(null);
    }
  }, [store.mode]);

  useEffect(() => {
    setActiveProfileEditId(null);
  }, [store.image]);

  const overlayPosition = useMemo(() => {
    if (!editingRect) return null;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : undefined;
    const maxLeft = viewportWidth ? viewportWidth - 260 : editingRect.left;
    const left = viewportWidth
      ? Math.max(16, Math.min(editingRect.left, maxLeft))
      : editingRect.left;
    const top = Math.max(16, editingRect.top - 56);
    return { left, top };
  }, [editingRect]);

  // Fit image to viewport
  const fitToScreen = useCallback(() => {
    if (!store.image) return;
    
    // Use scrollContainer for viewport dimensions - this is the actual visible area
    const scrollContainer = scrollContainerRef.current;
    
    if (!scrollContainer) {
      // Wait for next frame if container not ready
      requestAnimationFrame(() => fitToScreen());
      return;
    }
    
    // Get the actual viewport dimensions (clientWidth/clientHeight account for scrollbars)
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    
    if (viewportWidth === 0 || viewportHeight === 0) {
      // Wait for next frame if dimensions not ready
      requestAnimationFrame(() => fitToScreen());
      return;
    }
    
    // Use padding to ensure image doesn't touch edges
    const padding = 40;
    const availableWidth = Math.max(100, viewportWidth - padding * 2);
    const availableHeight = Math.max(100, viewportHeight - padding * 2);
    
    // Calculate scale to fit image within available space
    const scaleX = availableWidth / store.image.width;
    const scaleY = availableHeight / store.image.height;
    const scale = Math.min(scaleX, scaleY);
    
    // Ensure scale is valid
    if (!isFinite(scale) || scale <= 0) {
      return;
    }
    
    // Calculate scaled image dimensions
    const scaledWidth = store.image.width * scale;
    const scaledHeight = store.image.height * scale;
    
    // Center the image in the viewport
    // translateX/Y positions the image origin (0,0) in the wrapper coordinate space
    // To center: image center should align with viewport center
    // When scroll is at (0,0), the viewport shows the top-left of wrapper
    // So translateX should position image center at viewport center
    const translateX = (viewportWidth - scaledWidth) / 2;
    const translateY = (viewportHeight - scaledHeight) / 2;
    
    store.setTransform({ scale, translateX, translateY });
    
    // Reset scroll to top-left to show centered image
      requestAnimationFrame(() => {
        if (!scrollContainer || !store.image) return;
      scrollContainer.scrollLeft = 0;
      scrollContainer.scrollTop = 0;
    });
  }, [store]);

  // Zoom with cursor as anchor
  const zoomAt = useCallback((clientX: number, clientY: number, delta: number) => {
    if (!canvasRef.current || !scrollContainerRef.current || !store.image) return;
    
    const canvas = canvasRef.current;
    const scrollContainer = scrollContainerRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Get mouse position relative to visible canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Account for scroll position to get position in full canvas
    const scrollX = x + scrollContainer.scrollLeft;
    const scrollY = y + scrollContainer.scrollTop;
    
    const { transform } = store;
    // Convert scroll position to image coordinates
    const imagePoint = {
      x: (scrollX - transform.translateX) / transform.scale,
      y: (scrollY - transform.translateY) / transform.scale,
    };
    
    const factor = delta > 0 ? 1.1 : 0.9;
    let newScale = transform.scale * factor;
    newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    
    // Calculate new translate to keep the same image point under cursor
    const newTranslateX = scrollX - imagePoint.x * newScale;
    const newTranslateY = scrollY - imagePoint.y * newScale;
    
    store.setTransform({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
    });
    
    // Update scrollbars after zoom to maintain view
    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return;
      const viewportWidth = scrollContainer.clientWidth;
      const viewportHeight = scrollContainer.clientHeight;
      const scrollLeft = Math.max(0, newTranslateX - viewportWidth / 2);
      const scrollTop = Math.max(0, newTranslateY - viewportHeight / 2);
      scrollContainer.scrollLeft = scrollLeft;
      scrollContainer.scrollTop = scrollTop;
    });
  }, [store]);

  const loadDefaultOcrAnnotations = useCallback(
    async (imageId: string, csvUrl: string, csvPath: string | undefined) => {
      if (autoLoadedDefaultsRef.current.has(imageId)) {
        return;
      }
      autoLoadedDefaultsRef.current.add(imageId);

      try {
        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch OCR CSV: ${response.status}`);
        }

        const csvText = await response.text();
        const rows = parseCsv(csvText);
        if (rows.length === 0) {
          return;
        }

        const now = Date.now();
        const parseNumber = (value?: string) => {
          if (value === undefined) return undefined;
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const annotations: Annotation[] = [];
        rows.forEach((row, index) => {
          const x = parseNumber(row.x) ?? parseNumber(row.left) ?? parseNumber(row["x1"]);
          const y = parseNumber(row.y) ?? parseNumber(row.top) ?? parseNumber(row["y1"]);

          const explicitWidth = parseNumber(row.width) ?? parseNumber(row.w);
          const explicitHeight = parseNumber(row.height) ?? parseNumber(row.h);

          const x2 = parseNumber(row["x2"]) ?? parseNumber(row.right);
          const y2 = parseNumber(row["y2"]) ?? parseNumber(row.bottom);

          const width =
            explicitWidth ??
            (x !== undefined && x2 !== undefined ? x2 - x : undefined);
          const height =
            explicitHeight ??
            (y !== undefined && y2 !== undefined ? y2 - y : undefined);

          if (
            x === undefined ||
            y === undefined ||
            width === undefined ||
            height === undefined ||
            width <= 0 ||
            height <= 0
          ) {
            return;
          }

          const labelCategory = normalizeLabel(row.label);
          const textValue = row.text?.trim();
          const annotationLabel =
            (textValue && textValue.length > 0 ? textValue : labelCategory) ?? `OCR ${index + 1}`;

          const annotation: Annotation = {
            id: createAnnotationId(),
            label: annotationLabel,
            color: resolveOcrColor(labelCategory),
            x,
            y,
            w: width,
            h: height,
            createdAt: now + index,
            updatedAt: now + index,
            parentId: imageId,
            category: "ocr",
            ocrLabel: labelCategory,
          };

          annotations.push(annotation);
        });

        if (annotations.length === 0) {
          return;
        }

        useAnnotationStore.setState((state) => {
          const merged = [...state.annotations, ...annotations];
          return { annotations: linkAnnotationsToProfiles(merged) };
        });
        reconcileAnnotationParents();
 
        console.log(`[OCR] Loaded ${annotations.length} annotations from CSV`, {
          imageId,
          csvUrl,
        });

        const postUpdateCounts = useAnnotationStore.getState().annotations.reduce<Record<string, number>>(
          (acc, ann) => {
            const key = ann.category ?? "unclassified";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          },
          {},
        );
        console.log(`[OCR] Annotation counts after CSV import`, postUpdateCounts);
      } catch (error) {
        console.error(`[OCR] Failed to load annotations from CSV`, error);
        autoLoadedDefaultsRef.current.delete(imageId);
        toast.error("Failed to load OCR annotations for this image");
      }
    },
    [reconcileAnnotationParents],
  );

  // Load image to canvas (must be defined before handleImageUpload)
  const loadCsvAnnotationsForCategory = useCallback(
    async (
      imageId: string,
      csvUrl: string,
      category: "model" | "profile",
      meta?: DefaultAssetConfig,
    ) => {
      const key = `${category}:${imageId}:${csvUrl}`;
      if (autoLoadedDefaultsRef.current.has(key)) {
        console.log(`[${category.toUpperCase()}] CSV already loaded`, { imageId, csvUrl });
        return;
      }

      autoLoadedDefaultsRef.current.add(key);
      try {
        console.log(`[${category.toUpperCase()}] Loading annotations from CSV`, { imageId, csvUrl });
        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${category} CSV: ${response.status}`);
        }

        const csvText = await response.text();
        const rows = parseCsv(csvText);
        if (rows.length === 0) {
          console.log(`[${category.toUpperCase()}] CSV contains no rows`, { imageId, csvUrl });
          return;
        }

        const annotations = convertBoundingBoxRowsToAnnotations(rows, category, imageId, meta);
        if (annotations.length === 0) {
          console.log(`[${category.toUpperCase()}] No valid annotations parsed from CSV`, {
            imageId,
            csvUrl,
          });
          return;
        }

        useAnnotationStore.setState((state) => {
          const merged = [...state.annotations, ...annotations];
          return { annotations: linkAnnotationsToProfiles(merged) };
        });
        reconcileAnnotationParents();

        const postUpdateCounts = useAnnotationStore.getState().annotations.reduce<
          Record<string, number>
        >((acc, ann) => {
          const keyName = ann.category ?? "unclassified";
          acc[keyName] = (acc[keyName] ?? 0) + 1;
          return acc;
        }, {});

        console.log(`[${category.toUpperCase()}] Loaded ${annotations.length} annotations from CSV`, {
          imageId,
          csvUrl,
        });
        console.log(`[${category.toUpperCase()}] Annotation counts after CSV import`, postUpdateCounts);
      } catch (error) {
        autoLoadedDefaultsRef.current.delete(key);
        console.error(`[${category.toUpperCase()}] Failed to load annotations from CSV`, error);
      }
    },
    [reconcileAnnotationParents],
  );

  const loadImageToCanvas = useCallback((img: HTMLImageElement, url: string, fileName: string, imageId: string) => {
    // Clear current annotations
        store.clearAll();
    
    // Set the image first
    store.setImage(img, url);
    setImageFileName(fileName);
    setCurrentImageId(imageId);
        
        // Create offscreen canvas for HiDPI
        const offscreen = document.createElement("canvas");
        offscreen.width = img.width;
        offscreen.height = img.height;
        const ctx = offscreen.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          offscreenCanvasRef.current = offscreen;
        }
    
    // Load saved annotations for this image
    const loadedData = store.loadFromLocalStorage(url);
    reconcileAnnotationParents();
    const annotationCount = loadedData?.annotations?.length || 0;
    const defaultMeta = defaultAssetMeta.get(imageId);
    console.log("[CSV Debug] Default metadata lookup", {
      imageId,
      fileName,
      metaFound: Boolean(defaultMeta),
      meta: defaultMeta,
    });
    const hasOcr =
      loadedData?.annotations?.some((ann: any) => {
        if (ann.category === "ocr") return true;
        if (ann.ocrLabel) return true;
        const label = typeof ann.label === "string" ? ann.label : undefined;
        return label ? OCR_LABEL_CONFIG.some((entry) => entry.name === label) : false;
      }) ?? false;
    if (defaultMeta?.ocrCsvUrl && !hasOcr) {
      void loadDefaultOcrAnnotations(imageId, defaultMeta.ocrCsvUrl, defaultMeta.ocrCsvPath);
    }

    const annotationsAfterLoad = useAnnotationStore.getState().annotations;
    const hasModel = annotationsAfterLoad.some((ann) => ann.category === "model");
    const hasProfile = annotationsAfterLoad.some((ann) => ann.category === "profile");

    if (defaultMeta?.modelCsvUrl && !hasModel) {
      void loadCsvAnnotationsForCategory(imageId, defaultMeta.modelCsvUrl, "model", defaultMeta);
    } else {
      console.log("[CSV Debug] Model CSV skip or missing", {
        hasModel,
        csvUrl: defaultMeta?.modelCsvUrl,
      });
    }

    if (defaultMeta?.profileCsvUrl && !hasProfile) {
      void loadCsvAnnotationsForCategory(imageId, defaultMeta.profileCsvUrl, "profile", defaultMeta);
    } else {
      console.log("[CSV Debug] Profile CSV skip or missing", {
        hasProfile,
        csvUrl: defaultMeta?.profileCsvUrl,
      });
    }
        
        // Wait for canvas to be rendered and sized before fitting
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              fitToScreen();
          if (annotationCount > 0) {
            toast.success(`Image loaded: ${annotationCount} saved annotation${annotationCount !== 1 ? 's' : ''} restored`);
          } else {
              toast.success("Image loaded successfully");
          }
            }, 150);
          });
    });
  }, [defaultAssetMeta, fitToScreen, loadDefaultOcrAnnotations, loadCsvAnnotationsForCategory, reconcileAnnotationParents, store]);

  const registerUploadedImage = useCallback(
    (
      img: HTMLImageElement,
      imageUrl: string,
      fileName: string,
      imageId: string,
      options?: {
        switchToImage?: boolean;
        ocrCsvPath?: string;
        modelCsvPath?: string;
        profileCsvPath?: string;
      },
    ) => {
      const shouldSwitch = options?.switchToImage ?? true;
      let targetImage: UploadedImageEntry | null = null;

      setUploadedImages((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.id === imageId || entry.name === fileName);
        if (existingIndex >= 0) {
          const updated = [...prev];
          const existing = updated[existingIndex];
          if (options?.ocrCsvPath && existing.ocrCsvPath !== options.ocrCsvPath) {
            updated[existingIndex] = { ...existing, ocrCsvPath: options.ocrCsvPath };
          }
          if (options?.modelCsvPath && existing.modelCsvPath !== options.modelCsvPath) {
            updated[existingIndex] = { ...updated[existingIndex], modelCsvPath: options.modelCsvPath };
          }
          if (options?.profileCsvPath && existing.profileCsvPath !== options.profileCsvPath) {
            updated[existingIndex] = { ...updated[existingIndex], profileCsvPath: options.profileCsvPath };
          }
          if (shouldSwitch) {
            targetImage = updated[existingIndex];
          }
          return updated;
        }

        const nextEntry: UploadedImageEntry = {
          id: imageId,
          name: fileName,
          url: imageUrl,
          image: img,
          ocrCsvPath: options?.ocrCsvPath,
          modelCsvPath: options?.modelCsvPath,
          profileCsvPath: options?.profileCsvPath,
        };
        if (shouldSwitch) {
          targetImage = nextEntry;
        }
        return [...prev, nextEntry];
      });

      if (shouldSwitch && targetImage) {
        setCurrentImageId(targetImage.id);
        loadImageToCanvas(targetImage.image, targetImage.url, targetImage.name, targetImage.id);
      }
    },
    [loadImageToCanvas],
  );

  // Handle image upload
  const handleImageUpload = useCallback((file: File, switchToImage: boolean = true) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const imageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const imageUrl = e.target?.result as string;
        registerUploadedImage(img, imageUrl, file.name, imageId, { switchToImage });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [registerUploadedImage]);

  useEffect(() => {
    if (typeof window === "undefined" || isUploadsHydrated) {
      return;
    }

    let isMounted = true;

    const finishHydration = () => {
      if (isMounted) {
        setIsUploadsHydrated(true);
      }
    };

    const stored = window.localStorage.getItem(UPLOADS_STORAGE_KEY);
    if (!stored) {
      finishHydration();
      return () => {
        isMounted = false;
      };
    }

    let parsed: Array<{
      id: string;
      name: string;
      url: string;
      ocrCsvPath?: string;
      modelCsvPath?: string;
      profileCsvPath?: string;
    }>;
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      console.error("Failed to parse stored uploads:", error);
      finishHydration();
      return () => {
        isMounted = false;
      };
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      finishHydration();
      return () => {
        isMounted = false;
      };
    }

    Promise.all(
      parsed.map(
        (entry) =>
          new Promise<UploadedImageEntry | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ ...entry, image: img });
            img.onerror = () => resolve(null);
            img.src = entry.url;
          }),
      ),
    )
      .then((loadedImages) => {
        if (!isMounted) return;

        const validImages = loadedImages.filter(
          (img): img is UploadedImageEntry => img !== null,
        );

        if (validImages.length > 0) {
          const enriched = validImages.map((entry) => {
            const meta = defaultAssetMeta.get(entry.id);
            return {
              ...entry,
              ocrCsvPath: entry.ocrCsvPath ?? meta?.ocrCsvPath,
              modelCsvPath: entry.modelCsvPath ?? meta?.modelCsvPath,
              profileCsvPath: entry.profileCsvPath ?? meta?.profileCsvPath,
            };
          });
          setUploadedImages(enriched);
          const storedCurrentId = window.localStorage.getItem(CURRENT_IMAGE_STORAGE_KEY);
          const initialImage =
            enriched.find((img) => img.id === storedCurrentId) ?? enriched[0];
          setCurrentImageId(initialImage.id);
          loadImageToCanvas(initialImage.image, initialImage.url, initialImage.name, initialImage.id);
        }

        finishHydration();
      })
      .catch((error) => {
        console.error("Failed to rehydrate uploaded images:", error);
        finishHydration();
      });

    return () => {
      isMounted = false;
    };
  }, [isUploadsHydrated, loadImageToCanvas, defaultAssetMeta]);

  useEffect(() => {
    if (!isUploadsHydrated || typeof window === "undefined") {
      return;
    }

    DEFAULT_ASSET_UPLOADS.forEach((asset) => {
      const alreadyPresent = uploadedImages.some(
        (entry) => entry.id === asset.id || entry.name === asset.name,
      );
      if (alreadyPresent) {
        return;
      }

      const img = new Image();
      img.onload = () => {
        const shouldSwitch = uploadedImages.length === 0 && !currentImageId;
        registerUploadedImage(img, asset.assetUrl, asset.name, asset.id, {
          switchToImage: shouldSwitch,
          ocrCsvPath: asset.ocrCsvPath,
          modelCsvPath: asset.modelCsvPath,
          profileCsvPath: asset.profileCsvPath,
        });
        const meta = defaultAssetMeta.get(asset.id);
        if (meta?.ocrCsvUrl) {
          void loadDefaultOcrAnnotations(asset.id, meta.ocrCsvUrl, meta.ocrCsvPath);
        }
      };
      img.onerror = () => {
        console.warn("[ImageAnnotator] Failed to load default asset image:", asset.assetUrl);
      };
      img.src = asset.assetUrl;
    });
  }, [currentImageId, defaultAssetMeta, isUploadsHydrated, loadDefaultOcrAnnotations, registerUploadedImage, uploadedImages]);

  useEffect(() => {
    if (!isUploadsHydrated || typeof window === "undefined") {
      return;
    }

    if (uploadedImages.length === 0) {
      window.localStorage.removeItem(UPLOADS_STORAGE_KEY);
      return;
    }

    try {
      const serializable = uploadedImages.map(({ id, name, url, ocrCsvPath, modelCsvPath, profileCsvPath }) => ({
        id,
        name,
        url,
        ocrCsvPath,
        modelCsvPath,
        profileCsvPath,
      }));
      window.localStorage.setItem(UPLOADS_STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.error("Failed to persist uploaded images:", error);
    }
  }, [uploadedImages, isUploadsHydrated]);

  useEffect(() => {
    if (!isUploadsHydrated || typeof window === "undefined") {
      return;
    }

    if (currentImageId) {
      window.localStorage.setItem(CURRENT_IMAGE_STORAGE_KEY, currentImageId);
    } else {
      window.localStorage.removeItem(CURRENT_IMAGE_STORAGE_KEY);
    }
  }, [currentImageId, isUploadsHydrated]);

  // Hit testing
  const hitTestAnnotation = useCallback((imageX: number, imageY: number, annotation: Annotation) => {
    return (
      imageX >= annotation.x &&
      imageX <= annotation.x + annotation.w &&
      imageY >= annotation.y &&
      imageY <= annotation.y + annotation.h
    );
  }, []);

  const hitTestHandle = useCallback((imageX: number, imageY: number, annotation: Annotation) => {
    const handles = {
      nw: { x: annotation.x, y: annotation.y },
      n: { x: annotation.x + annotation.w / 2, y: annotation.y },
      ne: { x: annotation.x + annotation.w, y: annotation.y },
      e: { x: annotation.x + annotation.w, y: annotation.y + annotation.h / 2 },
      se: { x: annotation.x + annotation.w, y: annotation.y + annotation.h },
      s: { x: annotation.x + annotation.w / 2, y: annotation.y + annotation.h },
      sw: { x: annotation.x, y: annotation.y + annotation.h },
      w: { x: annotation.x, y: annotation.y + annotation.h / 2 },
    };

    const threshold = HANDLE_SIZE / store.transform.scale;

    for (const [name, pos] of Object.entries(handles)) {
      if (Math.abs(imageX - pos.x) < threshold && Math.abs(imageY - pos.y) < threshold) {
        return name;
      }
    }
    return null;
  }, [store.transform.scale]);

  // Render canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    
    // Canvas is always fixed to viewport size - ensure it never exceeds screen
    const scrollContainer = scrollContainerRef.current;
    const container = containerRef.current;
    
    // Get the actual visible bounding box of the scroll container
    // The canvas should match the scrollContainer's clientWidth/clientHeight exactly
    let viewportWidth = 0;
    let viewportHeight = 0;

    if (scrollContainer) {
      const scrollRect = scrollContainer.getBoundingClientRect();
      viewportWidth = Math.min(scrollContainer.clientWidth, scrollRect.width);
      viewportHeight = Math.min(scrollContainer.clientHeight, scrollRect.height);
    } else if (container) {
      const containerRect = container.getBoundingClientRect();
      viewportWidth = containerRect.width || container.clientWidth;
      viewportHeight = containerRect.height || container.clientHeight;
    }

    // Fallback if containers not ready - calculate from window size
    if (viewportWidth === 0 || viewportHeight === 0) {
      const sidebarWidth = 256;
      const toolbarHeight = 48;
      const statusBarHeight = store.image ? 40 : 0;

      viewportWidth = Math.max(100, window.innerWidth - sidebarWidth);
      viewportHeight = Math.max(100, window.innerHeight - toolbarHeight - statusBarHeight);
    }

    // Determine maximum allowed size based on surrounding layout
    let maxWidth = viewportWidth;
    let maxHeight = viewportHeight;

    if (scrollContainer) {
      const scrollRect = scrollContainer.getBoundingClientRect();
      maxWidth = Math.min(
        scrollContainer.clientWidth,
        scrollRect.width,
        window.innerWidth - Math.max(0, scrollRect.left),
      );
      maxHeight = Math.min(
        scrollContainer.clientHeight,
        scrollRect.height,
        window.innerHeight - Math.max(0, scrollRect.top),
      );

      if (container) {
        const containerRect = container.getBoundingClientRect();
        maxWidth = Math.min(maxWidth, containerRect.width);
        maxHeight = Math.min(maxHeight, containerRect.height);
      }
    }

    // Ensure the canvas covers the wrapper (scaled image area)
    let wrapperWidth = viewportWidth;
    let wrapperHeight = viewportHeight;

    if (wrapperRef.current && store.image) {
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      wrapperWidth = Math.max(viewportWidth, wrapperRect.width || viewportWidth);
      wrapperHeight = Math.max(viewportHeight, wrapperRect.height || viewportHeight);
    }

    viewportWidth = Math.floor(Math.min(Math.max(100, viewportWidth), maxWidth));
    viewportHeight = Math.floor(Math.min(Math.max(100, viewportHeight), maxHeight));

    const canvasWidth = Math.min(Math.max(viewportWidth, wrapperWidth), Math.max(maxWidth, 1) * 2);
    const canvasHeight = Math.min(Math.max(viewportHeight, wrapperHeight), Math.max(maxHeight, 1) * 2);

    // Canvas size - needs to cover wrapper area to prevent black gaps during panning
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.minWidth = `${canvasWidth}px`;
    canvas.style.minHeight = `${canvasHeight}px`;

    ctx.scale(dpr, dpr);
    // Clear and fill entire canvas area, not just viewport
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Background - fill entire canvas to prevent black gaps
    ctx.fillStyle = "hsl(var(--canvas-bg))";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Get fresh store state to ensure we have latest annotations
    const currentStore = useAnnotationStore.getState();
    const { transform, image, annotations, selectedIds, showLabels } = currentStore;

    if (!image) return;

    // Get scroll offset - the canvas is at (0,0) in the wrapper, and we scroll the wrapper
    const scrollLeft = scrollContainer?.scrollLeft || 0;
    const scrollTop = scrollContainer?.scrollTop || 0;
    
    // Transform calculations:
    // translateX/Y represents where image origin (0,0) is in the wrapper coordinate space
    // The canvas is positioned at (0,0) in the wrapper
    // When the scroll container scrolls, we see a different part of the wrapper
    // To draw on canvas (which is at viewport position): adjust for scroll offset
    // Canvas viewport = wrapper position - scroll position
    const adjustedTranslateX = transform.translateX - scrollLeft;
    const adjustedTranslateY = transform.translateY - scrollTop;

    // Clip to canvas area (which covers wrapper) to ensure we draw within bounds
    // This prevents drawing outside the canvas but allows covering the full wrapper
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip();

    // Set up transform for drawing the image
    // First translate to where the image should be (accounting for scroll)
    // Then scale the image
    ctx.save();
    ctx.translate(adjustedTranslateX, adjustedTranslateY);
    ctx.scale(transform.scale, transform.scale);

    // Draw image - this will be clipped to viewport by the clip region above
    try {
      // Verify image is valid before drawing
      if (!image || image.width === 0 || image.height === 0) {
        ctx.restore();
        ctx.restore();
        return;
      }
      
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    } else {
      ctx.drawImage(image, 0, 0);
      }
      
      // Debug: Log image drawing info occasionally
      //
    } catch (error) {
      console.error('Error drawing image:', error, {
        imageSize: { width: image?.width, height: image?.height },
        scale: transform.scale,
        translate: { x: transform.translateX, y: transform.translateY },
        adjustedTranslate: { x: adjustedTranslateX, y: adjustedTranslateY }
      });
      // Restore context states if error occurs
      ctx.restore();
      ctx.restore();
      return;
    }

    // Helper functions to check annotation types
    const isProfileAnnotation = (ann: Annotation) => isProfileAnnotationShape(ann);

    const isModelAnnotation = (ann: Annotation) => {
      if (ann.category === "model") return true;
      return LABEL_CONFIG.some(label => label.name === ann.label);
    };

    const isOCRAnnotation = (ann: Annotation) => {
      if (ann.category === "ocr") return true;
      if (ann.ocrLabel) return true;
      return OCR_LABEL_CONFIG.some(label => label.name === ann.label);
    };

    // Get selected Profile rectangles
    const storeSelectedProfileIds = Array.from(selectedIds).filter(id => {
      const ann = annotations.find(a => a.id === id);
      return ann && isProfileAnnotation(ann);
    });
    const selectedProfileIds = activeProfileEditId
      ? [activeProfileEditId]
      : storeSelectedProfileIds;

    // Filter annotations based on current mode
    const visibleAnnotations = annotations.filter((ann) => {
      const isProfile = isProfileAnnotation(ann);
      const isModel = isModelAnnotation(ann);
      const isOCR = isOCRAnnotation(ann);

      // OCR mode: Show only OCR annotations
      if (currentStore.mode === "ocr") {
        return isOCR;
      }

      // Model mode: Show only Model annotations
      if (currentStore.mode === "model") {
        return isModel;
      }

      // Profile mode: Show Profile rectangles always, Model/OCR only if inside selected Profile
      if (currentStore.mode === "viewport") {
        // Hide profile rectangles while editing child annotations
        if (isProfile) {
          return !isProfileEditMode;
        }
        
        // Model and OCR annotations are only visible if inside a selected Profile rectangle
        if (ann.parentId) {
          // If it has a parentId, check if that parent is selected
          return selectedProfileIds.includes(ann.parentId);
        }
        
        // If no parentId is set, check if it's inside any selected Profile rectangle
        if (selectedProfileIds.length > 0) {
          return selectedProfileIds.some(profileId => {
            const profileAnn = annotations.find(a => a.id === profileId);
            if (!profileAnn) return false;
            return isRectInside(ann, profileAnn);
          });
        }
        
        // If no Profile rectangle is selected, don't show Model/OCR annotations
        return false;
      }

      // Default: show all (shouldn't reach here)
      return true;
    });

    // Draw annotations
    visibleAnnotations.forEach((ann) => {
      const isSelected = selectedIds.has(ann.id);
      
      // In Profile mode: light color for unselected, dark color for selected
      let strokeColor = ann.color;
      if (currentStore.mode === "viewport") {
        if (isSelected) {
          // Selected: use full dark color
          strokeColor = ann.color;
        } else {
          // Unselected: use light/transparent version
          // Convert RGB to RGBA with low opacity for light appearance
          const rgbMatch = ann.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            strokeColor = `rgba(${r}, ${g}, ${b}, 0.3)`; // Light/transparent for unselected
          }
        }
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = (isSelected ? 3 : 2) / transform.scale;
      ctx.setLineDash(isSelected ? [8 / transform.scale, 4 / transform.scale] : []);
      ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);

      // Draw handles for selected
      if (isSelected) {
        const handles = [
          { x: ann.x, y: ann.y },
          { x: ann.x + ann.w / 2, y: ann.y },
          { x: ann.x + ann.w, y: ann.y },
          { x: ann.x + ann.w, y: ann.y + ann.h / 2 },
          { x: ann.x + ann.w, y: ann.y + ann.h },
          { x: ann.x + ann.w / 2, y: ann.y + ann.h },
          { x: ann.x, y: ann.y + ann.h },
          { x: ann.x, y: ann.y + ann.h / 2 },
        ];

        ctx.fillStyle = "hsl(var(--handle))";
        handles.forEach((h) => {
          const size = HANDLE_SIZE / transform.scale;
          ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
        });
      }

      // Draw label
      if (showLabels && ann.label) {
        ctx.save();
        ctx.setLineDash([]);
        const fontSize = Math.max(12 / transform.scale, 8);
        ctx.font = `${fontSize}px sans-serif`;
        const metrics = ctx.measureText(ann.label);
        const padding = 4 / transform.scale;
        
        // In Profile mode: use dark color for label background if selected, light if not
        let labelBgColor = ann.color;
        if (currentStore.mode === "viewport") {
          if (isSelected) {
            // Selected: use full dark color
            labelBgColor = ann.color;
          } else {
            // Unselected: use light/transparent version
            const rgbMatch = ann.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
              const r = parseInt(rgbMatch[1]);
              const g = parseInt(rgbMatch[2]);
              const b = parseInt(rgbMatch[3]);
              labelBgColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
            }
          }
        }
        
        ctx.fillStyle = labelBgColor;
        ctx.fillRect(
          ann.x,
          ann.y - fontSize - padding * 2,
          metrics.width + padding * 2,
          fontSize + padding * 2
        );
        
        // Text color: white for dark backgrounds, dark for light backgrounds
        const textColor = (currentStore.mode === "viewport" && !isSelected) ? ann.color : "#ffffff";
        ctx.fillStyle = textColor;
        ctx.fillText(ann.label, ann.x + padding, ann.y - padding);
        ctx.restore();
      }
    });

    // Draw current drawing rectangle
    if (drawStart && store.isDrawing) {
      const mousePos = store.mousePos;
      const start = screenToImage(drawStart.x, drawStart.y);
      const current = { x: mousePos.imageX, y: mousePos.imageY };
      
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);

      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.lineWidth = 2 / transform.scale;
      ctx.setLineDash([4 / transform.scale, 2 / transform.scale]);
      ctx.strokeRect(x, y, w, h);

      // Show size
      ctx.save();
      ctx.setLineDash([]);
      const text = `${Math.round(w)} × ${Math.round(h)}`;
      const fontSize = Math.max(12 / transform.scale, 8);
      ctx.font = `${fontSize}px sans-serif`;
      const metrics = ctx.measureText(text);
      const padding = 4 / transform.scale;
      
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(
        x + w / 2 - metrics.width / 2 - padding,
        y + h + padding,
        metrics.width + padding * 2,
        fontSize + padding * 2
      );
      
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x + w / 2 - metrics.width / 2, y + h + fontSize + padding);
      ctx.restore();
    }

    // Draw marquee selection
    if (marqueeStart) {
      const current = store.mousePos;
      const start = marqueeStart;
      
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);

      ctx.save();
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.fillStyle = "hsla(var(--primary), 0.1)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    ctx.restore(); // Restore transform
    ctx.restore(); // Restore clipping
  }, [
    canvasRef,
    store.transform,
    store.annotations,
    store.showLabels,
    store.isDragging,
    store.isResizing,
    store.isDrawing,
    drawStart,
    screenToImage,
    marqueeStart,
    store.mousePos,
  ]);

  useEffect(() => {
    renderRef.current = render;
  }, [render]);

  const sendCursorIfNeeded = useCallback(
    (imageX: number, imageY: number) => {
      if (!realtimeEnabled) return;

      const now = Date.now();
      if (now - lastCursorSentRef.current < 50) return;
      lastCursorSentRef.current = now;

      sendCursorUpdate({ imageX, imageY });
    },
    [realtimeEnabled, sendCursorUpdate]
  );

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !store.image) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imagePos = screenToImage(x, y);

    // Pan with space or middle mouse (Revu-style panning)
    if (e.button === 1 || (e.button === 0 && e.nativeEvent.getModifierState?.("Space"))) {
      store.setPanning(true);
      // Store initial mouse position and initial transform for smooth panning
      setDragOffset({ x, y });
      setPanStartTransform({ 
        translateX: store.transform.translateX, 
        translateY: store.transform.translateY 
      });
      return;
    }

    if (store.currentTool === "rectangle") {
      store.setDrawing(true);
      setDrawStart({ x, y });
      return;
    }

    if (store.currentTool === "select") {
      // Check handles first
      const selected = store.annotations.filter((a) => selectedIdSet.has(a.id));
      for (const ann of selected) {
        const handle = hitTestHandle(imagePos.x, imagePos.y, ann);
        if (handle) {
          // Store the annotation's initial state for smooth resizing
          setResizeStartAnnotation({ x: ann.x, y: ann.y, w: ann.w, h: ann.h });
          store.setResizing(true);
          setResizeHandle(handle);
          setDragOffset({ x: imagePos.x, y: imagePos.y });
          return;
        }
      }

      // Check annotation hit - prioritize Profile rectangles in Profile mode
      // First, check Profile rectangles, then check Model/OCR annotations
      let clickedAnnotation: Annotation | null = null;
      
      if (store.mode === "viewport") {
        if (!isProfileEditMode) {
          // First pass: Check Profile rectangles (they should be clickable first)
          for (let i = store.annotations.length - 1; i >= 0; i--) {
            const ann = store.annotations[i];
            const isProfile = PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
            if (isProfile && hitTestAnnotation(imagePos.x, imagePos.y, ann)) {
              clickedAnnotation = ann;
              break;
            }
          }
        }

        // Second pass: Check Model/OCR annotations if no Profile was clicked
        if (!clickedAnnotation) {
          const selectedProfileIds = activeProfileEditId
            ? [activeProfileEditId]
            : selectedIdList.filter(id => {
                const p = store.annotations.find(a => a.id === id);
                return p && PROFILE_LABEL_CONFIG.some(label => label.name === p.label);
              });
          
          for (let i = store.annotations.length - 1; i >= 0; i--) {
            const ann = store.annotations[i];
            const isProfile = PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
            if (isProfile) continue; // Skip Profile rectangles (already checked or hidden)
            
            // Only check Model/OCR if they're inside a selected Profile
            const isInsideSelectedProfile = selectedProfileIds.length > 0 && (
              (ann.parentId && selectedProfileIds.includes(ann.parentId)) ||
              selectedProfileIds.some(profileId => {
                const profileAnn = store.annotations.find(a => a.id === profileId);
                if (!profileAnn) return false;
                return isRectInside(ann, profileAnn);
              })
            );
            
            if (isInsideSelectedProfile && hitTestAnnotation(imagePos.x, imagePos.y, ann)) {
              clickedAnnotation = ann;
              break;
            }
          }
        }
      } else {
        // In Model/OCR mode, check all annotations normally
        for (let i = store.annotations.length - 1; i >= 0; i--) {
          const ann = store.annotations[i];
          if (hitTestAnnotation(imagePos.x, imagePos.y, ann)) {
            clickedAnnotation = ann;
            break;
          }
        }
      }

      if (clickedAnnotation) {
        const ann = clickedAnnotation;

        if (store.mode === "viewport" && isProfileLabel(ann.label)) {
          store.loadAnnotationsForProfile(ann);
        }

        if (store.mode === "viewport" && e.ctrlKey && isProfileLabel(ann.label)) {
          setActiveProfileEditId(ann.id);
          if (!selectedIdSet.has(ann.id)) {
            store.setSelected([ann.id]);
          }
          return;
        }

        if (e.detail >= 2) {
          e.preventDefault();
          e.stopPropagation();
          if (!selectedIdSet.has(ann.id)) {
            store.setSelected([ann.id]);
          }
          const isOcrAnnotation =
            ann.category === "ocr" ||
            Boolean(ann.ocrLabel) ||
            (ann.label ? OCR_LABEL_CONFIG.some((entry) => entry.name === ann.label) : false);
          if (isOcrAnnotation) {
            openTextEditor(ann);
          } else {
          openLabelEditor(ann);
          }
          return;
        }

        if (e.shiftKey) {
          if (store.mode === "viewport" && isProfileLabel(ann.label)) {
            store.setSelected([ann.id]);
          } else {
            store.toggleSelected(ann.id);
          }
        } else {
          // In Profile mode, clicking a Profile rectangle should activate it
          // Clear other Profile selections first if clicking a Profile rectangle
          if (store.mode === "viewport") {
            const isProfile = isProfileLabel(ann.label);
            if (isProfile) {
              // Clear all selections, then select only this Profile rectangle
              store.setSelected([ann.id]);
            } else {
              // For Model/OCR annotations, just select them normally
              if (!selectedIdSet.has(ann.id)) {
                store.setSelected([ann.id]);
              }
            }
          } else {
            if (!selectedIdSet.has(ann.id)) {
              store.setSelected([ann.id]);
            }
          }
        }
        
        // Force re-render after selection change to update visibility
        requestAnimationFrame(() => render());
        
        // Store initial positions of all selected annotations for smooth dragging
        const positions = new Map<string, { x: number; y: number }>();
        selectedIdList.forEach((id) => {
          const selectedAnn = store.annotations.find((a) => a.id === id);
          if (selectedAnn) {
            positions.set(id, { x: selectedAnn.x, y: selectedAnn.y });
          }
        });
        setDragStartPositions(positions);
        
        // Store initial mouse offset relative to the first annotation
        const firstId = selectedIdList[0];
        const firstAnn = store.annotations.find((a) => a.id === firstId);
        if (firstAnn) {
          setInitialMouseOffset({
            x: imagePos.x - firstAnn.x,
            y: imagePos.y - firstAnn.y
          });
        }
        
        // Store initial mouse position in image coordinates
        store.setDragging(true);
        setDragOffset({ x: imagePos.x, y: imagePos.y });
        return;
      }

      // Start marquee selection
      if (!e.shiftKey) {
        store.clearSelection();
      }
      setMarqueeStart({ x, y });
    }
  }, [store, screenToImage, hitTestAnnotation, hitTestHandle, openLabelEditor, openTextEditor, isProfileLabel, selectedIdList, sendCursorIfNeeded]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imagePos = screenToImage(x, y);
    
    store.setMousePos({ x, y, imageX: imagePos.x, imageY: imagePos.y });
    sendCursorIfNeeded(imagePos.x, imagePos.y);

    // Panning (Revu-style: smooth, direct image movement)
    if (store.isPanning && dragOffset && panStartTransform) {
      // Calculate mouse movement in screen coordinates
      const dx = x - dragOffset.x;
      const dy = y - dragOffset.y;
      
      // For Revu-style panning:
      // - Mouse moves right → image moves right (translateX increases)
      // - Mouse moves down → image moves down (translateY increases)
      // Directly add mouse movement to initial transform for smooth, predictable panning
      const newTranslateX = panStartTransform.translateX + dx;
      const newTranslateY = panStartTransform.translateY + dy;
      
      store.setTransform({
        scale: store.transform.scale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      });
      
      // render() will be called automatically by the render loop when transform changes
      return;
    }

    // Dragging annotations (handled by global mouse move, but keep for when mouse is over canvas)
    if (store.isDragging && initialMouseOffset && dragStartPositions.size > 0 && store.image) {
      // Calculate new position based on current mouse position and initial offset
      const firstId = Array.from(dragStartPositions.keys())[0];
      const firstStartPos = dragStartPositions.get(firstId);
      
      if (firstStartPos) {
        // Calculate where the annotation should be based on current mouse position
        const newFirstX = imagePos.x - initialMouseOffset.x;
        const newFirstY = imagePos.y - initialMouseOffset.y;
        
        // Calculate delta from start position
        const dx = newFirstX - firstStartPos.x;
        const dy = newFirstY - firstStartPos.y;
        
        let hasUpdate = false;
        selectedIdList.forEach((id) => {
          const startPos = dragStartPositions.get(id);
          if (startPos) {
            const selectedAnn = store.annotations.find((a) => a.id === id);
            if (selectedAnn) {
              const newX = Math.max(0, Math.min(store.image!.width - selectedAnn.w, startPos.x + dx));
              const newY = Math.max(0, Math.min(store.image!.height - selectedAnn.h, startPos.y + dy));
              
              if (Math.abs(newX - selectedAnn.x) > 0.1 || Math.abs(newY - selectedAnn.y) > 0.1) {
                store.updateAnnotation(id, { x: newX, y: newY });
                hasUpdate = true;
              }
            }
          }
        });
        
        if (hasUpdate) {
          render();
        }
      }
      
      return;
    }

    // Resizing
    if (store.isResizing && resizeHandle && resizeStartAnnotation && selectedIdList.length === 1) {
      const id = selectedIdList[0];
      const ann = store.annotations.find((a) => a.id === id);
      if (store.image && ann) {
        let { x, y, w, h } = { ...resizeStartAnnotation };
        const minSize = 10;

        switch (resizeHandle) {
          case "nw":
            w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
            h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
            x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
            y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
            break;
          case "n":
            h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
            y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
            break;
          case "ne":
            w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
            h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
            y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
            break;
          case "e":
            w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
            break;
          case "se":
            w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
            h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
            break;
          case "s":
            h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
            break;
          case "sw":
            w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
            h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
            x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
            break;
          case "w":
            w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
            x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
            break;
        }

        // Constrain to image bounds
        x = Math.max(0, Math.min(store.image.width - w, x));
        y = Math.max(0, Math.min(store.image.height - h, y));
        w = Math.min(w, store.image.width - x);
        h = Math.min(h, store.image.height - y);
        
        // Only update if dimensions actually changed
        if (Math.abs(x - ann.x) > 0.1 || Math.abs(y - ann.y) > 0.1 || 
            Math.abs(w - ann.w) > 0.1 || Math.abs(h - ann.h) > 0.1) {
          store.updateAnnotation(id, { x, y, w, h });
          render();
        }
      }
      return;
    }

    // Marquee selection
    if (marqueeStart && store.currentTool === "select") {
      render();
      return;
    }

    // Update cursor
    if (store.isPanning) {
      // Keep default cursor during panning (no hand symbol)
      if (canvas) canvas.style.cursor = "default";
    } else if (store.currentTool === "select") {
      let cursor = "default";
      const selected = store.annotations.filter((a) => selectedIdSet.has(a.id));
      
      for (const ann of selected) {
        const handle = hitTestHandle(imagePos.x, imagePos.y, ann);
        if (handle) {
          const cursors: Record<string, string> = {
            nw: "nwse-resize",
            n: "ns-resize",
            ne: "nesw-resize",
            e: "ew-resize",
            se: "nwse-resize",
            s: "ns-resize",
            sw: "nesw-resize",
            w: "ew-resize",
          };
          cursor = cursors[handle];
          break;
        }
      }
      
      if (cursor === "default") {
        for (const ann of store.annotations) {
          if (hitTestAnnotation(imagePos.x, imagePos.y, ann)) {
            cursor = "move";
            break;
          }
        }
      }
      
      if (canvas) canvas.style.cursor = cursor;
    } else if (store.currentTool === "rectangle") {
      if (canvas) canvas.style.cursor = "crosshair";
    }
  }, [store, screenToImage, dragOffset, resizeHandle, marqueeStart, hitTestAnnotation, hitTestHandle, render, selectedIdList]);

  // Global mouse move handler for dragging and panning (when mouse leaves canvas)
  useEffect(() => {
    if (!store.isDragging && !store.isResizing && !store.isPanning) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const imagePos = screenToImage(x, y);
      
      store.setMousePos({ x, y, imageX: imagePos.x, imageY: imagePos.y });

      // Panning (Revu-style)
      if (store.isPanning && dragOffset && panStartTransform) {
        const dx = x - dragOffset.x;
        const dy = y - dragOffset.y;
        
        const newTranslateX = panStartTransform.translateX + dx;
        const newTranslateY = panStartTransform.translateY + dy;
        
        store.setTransform({
          scale: store.transform.scale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        });
        return;
      }

      // Dragging annotations
      if (store.isDragging && initialMouseOffset && dragStartPositions.size > 0 && store.image) {
        const firstId = Array.from(dragStartPositions.keys())[0];
        const firstStartPos = dragStartPositions.get(firstId);
        
        if (firstStartPos) {
          // Calculate new position based on current mouse position and initial offset
          const newFirstX = imagePos.x - initialMouseOffset.x;
          const newFirstY = imagePos.y - initialMouseOffset.y;
          
          // Calculate delta from start position
          const dx = newFirstX - firstStartPos.x;
          const dy = newFirstY - firstStartPos.y;
          
          let hasUpdate = false;
          selectedIdList.forEach((id) => {
            const startPos = dragStartPositions.get(id);
            if (startPos) {
              const selectedAnn = store.annotations.find((a) => a.id === id);
              if (selectedAnn) {
                const newX = Math.max(0, Math.min(store.image!.width - selectedAnn.w, startPos.x + dx));
                const newY = Math.max(0, Math.min(store.image!.height - selectedAnn.h, startPos.y + dy));
                
                if (Math.abs(newX - selectedAnn.x) > 0.1 || Math.abs(newY - selectedAnn.y) > 0.1) {
                  store.updateAnnotation(id, { x: newX, y: newY });
                  hasUpdate = true;
                }
              }
            }
          });
          
          if (hasUpdate) {
            render();
          }
        }
      }

      // Resizing
      if (store.isResizing && resizeHandle && resizeStartAnnotation && selectedIdList.length === 1) {
        const id = selectedIdList[0];
        const ann = store.annotations.find((a) => a.id === id);
        if (store.image && ann) {
          let { x, y, w, h } = { ...resizeStartAnnotation };
          const minSize = 10;

          switch (resizeHandle) {
            case "nw":
              w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
              h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
              x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
              y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
              break;
            case "n":
              h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
              y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
              break;
            case "ne":
              w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
              h = Math.max(minSize, resizeStartAnnotation.y + resizeStartAnnotation.h - imagePos.y);
              y = resizeStartAnnotation.y + resizeStartAnnotation.h - h;
              break;
            case "e":
              w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
              break;
            case "se":
              w = Math.max(minSize, imagePos.x - resizeStartAnnotation.x);
              h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
              break;
            case "s":
              h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
              break;
            case "sw":
              w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
              h = Math.max(minSize, imagePos.y - resizeStartAnnotation.y);
              x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
              break;
            case "w":
              w = Math.max(minSize, resizeStartAnnotation.x + resizeStartAnnotation.w - imagePos.x);
              x = resizeStartAnnotation.x + resizeStartAnnotation.w - w;
              break;
          }

          x = Math.max(0, Math.min(store.image.width - w, x));
          y = Math.max(0, Math.min(store.image.height - h, y));
          w = Math.min(w, store.image.width - x);
          h = Math.min(h, store.image.height - y);
          
          if (Math.abs(x - ann.x) > 0.1 || Math.abs(y - ann.y) > 0.1 || 
              Math.abs(w - ann.w) > 0.1 || Math.abs(h - ann.h) > 0.1) {
            store.updateAnnotation(id, { x, y, w, h });
            render();
          }
        }
      }
    };

    const handleGlobalMouseUp = () => {
      store.setDragging(false);
      store.setResizing(false);
      store.setPanning(false);
      setDragOffset(null);
      setDragStartPositions(new Map());
      setInitialMouseOffset(null);
      setResizeHandle(null);
      setResizeStartAnnotation(null);
      setPanStartTransform(null);
    };

    if (store.isDragging || store.isResizing || store.isPanning) {
      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [store.isDragging, store.isResizing, store.isPanning, dragStartPositions, initialMouseOffset, resizeHandle, resizeStartAnnotation, dragOffset, panStartTransform, store, screenToImage, render]);

  const handleMouseUp = useCallback(() => {
    if (store.isDrawing && drawStart && store.image) {
      const start = screenToImage(drawStart.x, drawStart.y);
      const end = { x: store.mousePos.imageX, y: store.mousePos.imageY };
      
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      if (w > 4 && h > 4) {
        const labelConfig = store.getActiveLabelConfig();
        
        // Check if this is a Model or OCR annotation, and if so, find which Profile rectangle contains it
        let parentId: string | undefined = undefined;
        const isModelOrOCR = store.mode === "model" || store.mode === "ocr";
        
        if (isModelOrOCR) {
          // Find Profile rectangles that contain this annotation
          const annotationRect = {
            x: Math.max(0, x),
            y: Math.max(0, y),
            w: Math.min(w, store.image.width - x),
            h: Math.min(h, store.image.height - y),
          };
          
          // Find the first Profile rectangle that contains this annotation
          const containingProfile = store.annotations.find(ann => {
            const isProfile = PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
            if (!isProfile) return false;
            
            // Check if annotation is completely inside this Profile rectangle
            return (
              annotationRect.x >= ann.x &&
              annotationRect.y >= ann.y &&
              annotationRect.x + annotationRect.w <= ann.x + ann.w &&
              annotationRect.y + annotationRect.h <= ann.y + ann.h
            );
          });
          
          if (containingProfile) {
            parentId = containingProfile.id;
          }
        }
        
        const annotation: Annotation = {
          id: `ann-${Date.now()}`,
          x: Math.max(0, x),
          y: Math.max(0, y),
          w: Math.min(w, store.image.width - x),
          h: Math.min(h, store.image.height - y),
          label: labelConfig?.name || "Column",
          color: labelConfig?.color || getNextColor(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          parentId: parentId,
        };
        
        store.addAnnotation(annotation);
        store.setSelected([annotation.id]);
      }
    }

    // Marquee selection
    if (marqueeStart && store.currentTool === "select") {
      const start = marqueeStart;
      const end = store.mousePos;
      
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);

      const selected: string[] = [];
      store.annotations.forEach((ann) => {
        const annScreen = {
          x1: imageToScreen(ann.x, ann.y).x,
          y1: imageToScreen(ann.x, ann.y).y,
          x2: imageToScreen(ann.x + ann.w, ann.y + ann.h).x,
          y2: imageToScreen(ann.x + ann.w, ann.y + ann.h).y,
        };

        if (
          annScreen.x1 >= x1 && annScreen.x2 <= x2 &&
          annScreen.y1 >= y1 && annScreen.y2 <= y2
        ) {
          selected.push(ann.id);
        }
      });

      if (selected.length > 0) {
        if (store.mode === "viewport") {
          const hasProfileSelection = selected.some((id) => {
            const ann = store.annotations.find((annotation) => annotation.id === id);
            return ann ? isProfileLabel(ann.label) : false;
          });

          if (hasProfileSelection) {
            const lastProfileId = [...selected]
              .reverse()
              .find((id) => {
                const ann = store.annotations.find((annotation) => annotation.id === id);
                return ann ? isProfileLabel(ann.label) : false;
              });

            if (lastProfileId) {
              store.setSelected([lastProfileId]);
            } else {
              store.setSelected(selected);
            }
          } else {
            store.setSelected(selected);
          }
        } else {
          store.setSelected(selected);
        }
      }
    }

    store.setDrawing(false);
    store.setPanning(false);
    store.setDragging(false);
    store.setResizing(false);
    setDrawStart(null);
    setDragOffset(null);
    setDragStartPositions(new Map());
    setInitialMouseOffset(null);
    setResizeHandle(null);
    setResizeStartAnnotation(null);
    setMarqueeStart(null);
    setPanStartTransform(null);
  }, [store, drawStart, screenToImage, imageToScreen, marqueeStart, isProfileLabel, selectedIdList]);

  const handleWheel = useCallback((e: WheelEvent) => {
    // Only zoom when Shift is pressed, otherwise allow normal scrolling
    if (!e.shiftKey) {
      return; // Allow normal scrolling when Shift is not pressed
    }
    
    // Prevent default and zoom when Shift is pressed
    e.preventDefault();
    e.stopPropagation();
    
    // Use deltaY for vertical scroll, or deltaX for horizontal scroll (when Shift is pressed)
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    zoomAt(e.clientX, e.clientY, -delta);
  }, [zoomAt]);

  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use non-passive listener to allow preventDefault
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (editingId) {
        if (e.key === "Escape") {
          e.preventDefault();
          handleOverlayDismiss();
        }
        return;
      }

      // Mode switching
      const key = e.key;
      const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

      if (normalizedKey === "v") {
        e.preventDefault();
        store.setMode("viewport");
        toast.success("Profile Mode", { duration: 1000 });
      } else if (normalizedKey === "m") {
        e.preventDefault();
        store.setMode("model");
        toast.success("Model Mode", { duration: 1000 });
      } else if (normalizedKey === "o") {
        e.preventDefault();
        store.setMode("ocr");
        toast.success("OCR Mode", { duration: 1000 });
      }
      
      // Tools
      else if (normalizedKey === "r") {
        store.setTool("rectangle");
      }
      
      // Label selection (0-9) - only in Model/OCR modes
      else if (normalizedKey >= "0" && normalizedKey <= "9") {
        if (store.mode !== "viewport") {
        const labelIndex = parseInt(normalizedKey, 10);
        if (labelIndex < store.labels.length) {
          store.setActiveLabel(store.labels[labelIndex].id);
          toast.success(`Selected label: ${store.labels[labelIndex].name}`, { duration: 1000 });
          }
        }
      }

      // Zoom
      else if (normalizedKey === "+" || normalizedKey === "=") {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          zoomAt(rect.width / 2, rect.height / 2, 1);
        }
      } else if (normalizedKey === "-" || normalizedKey === "_") {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          zoomAt(rect.width / 2, rect.height / 2, -1);
        }
      } else if (normalizedKey === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        store.setTransform({ scale: 1 });
      } else if (normalizedKey === "f") {
        fitToScreen();
      }

      // Delete
      else if (normalizedKey === "Delete" || normalizedKey === "Backspace") {
        if (selectedIdList.length > 0) {
           e.preventDefault();
           store.deleteSelected();
         }
      }

      // Undo/Redo
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && normalizedKey === "z") {
        e.preventDefault();
        store.redo();
      } else if ((e.ctrlKey || e.metaKey) && normalizedKey === "y") {
        e.preventDefault();
        store.redo();
      } else if ((e.ctrlKey || e.metaKey) && normalizedKey === "z") {
        e.preventDefault();
        store.undo();
      }

      // Cancel
      else if (normalizedKey === "Escape") {
        if (store.mode === "viewport" && activeProfileEditId) {
          e.preventDefault();
          setActiveProfileEditId(null);
          store.clearSelection();
        } else {
          store.clearSelection();
          store.setDrawing(false);
          setDrawStart(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, zoomAt, fitToScreen, editingId, handleOverlayDismiss, activeProfileEditId]);

  // Note: Annotations are now automatically saved when they're created/modified/deleted
  // They're loaded when an image is loaded via loadImageToCanvas

  // Handle scroll events - just track that user is scrolling
  // Don't update transform during scroll to avoid conflicts
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || !store.image) return;
    
    // Mark that user is actively scrolling
    isScrollingRef.current = true;
    
    // Reset flag after scrolling stops
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      scrollTimeoutRef.current = null;
    }, 150);

    if (editingId) {
      requestAnimationFrame(() => updateEditingRect());
    }
  }, [store, editingId, updateEditingRect]);

  // Sync scrollbars with transform (for panning and after operations)
  // Only update scroll when transform changes, not during user scrolling or panning
  useEffect(() => {
    if (!scrollContainerRef.current || !store.image || isScrollingRef.current || store.isPanning) return;
    
    const scrollContainer = scrollContainerRef.current;
    const { transform } = store;
    
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    
    // Calculate the scaled image dimensions
    const scaledImageWidth = store.image.width * transform.scale;
    const scaledImageHeight = store.image.height * transform.scale;
    
    // Calculate scroll position to show the image at translateX/Y
    // translateX/Y is the position of image origin (0,0) in canvas coordinates
    const scrollLeft = Math.max(0, Math.min(transform.translateX - viewportWidth / 2, scaledImageWidth - viewportWidth));
    const scrollTop = Math.max(0, Math.min(transform.translateY - viewportHeight / 2, scaledImageHeight - viewportHeight));
    
    // Only update if there's a significant change to avoid jitter
    const currentScrollLeft = scrollContainer.scrollLeft;
    const currentScrollTop = scrollContainer.scrollTop;
    if (Math.abs(scrollLeft - currentScrollLeft) > 2 || Math.abs(scrollTop - currentScrollTop) > 2) {
      scrollContainer.scrollLeft = scrollLeft;
      scrollContainer.scrollTop = scrollTop;
    }
  }, [store.transform.translateX, store.transform.translateY, store.transform.scale, store.image]);

  // Handle window resize and container resize to ensure canvas fits screen
  useEffect(() => {
    const handleResize = () => {
      // Force re-render when window resizes to adjust canvas size
      requestAnimationFrame(() => {
        render();
        if (editingId) {
          updateEditingRect();
        }
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        render();
        if (editingId) {
          updateEditingRect();
        }
      });
    });
    
    if (scrollContainerRef.current) {
      resizeObserver.observe(scrollContainerRef.current);
    }
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [render, editingId, updateEditingRect]);


  // Render loop
  useEffect(() => {
    let frameId: number;
    const animate = () => {
      render();
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [render]);

  // Export/Import handlers
  const handleExport = useCallback(() => {
    try {
      const json = store.exportAnnotations();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotations-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Annotations exported");
    } catch (error) {
      toast.error("Failed to export annotations");
    }
  }, [store]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            store.importAnnotations(e.target?.result as string);
            toast.success("Annotations imported");
          } catch (error) {
            toast.error("Failed to import annotations");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [store]);

  const handleResetRealtimeAuth = useCallback(() => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm("Reset realtime token and reload?");
    if (!confirmed) return;

    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      window.localStorage.removeItem("inkwell-auth");
    } catch (error) {
      console.warn("[Realtime] Failed to clear stored auth", error);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("token")) {
        params.delete("token");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", nextUrl);
      }
    } catch (error) {
      console.warn("[Realtime] Failed to clean URL parameters", error);
    }

    window.location.reload();
  }, []);

  const handleClear = useCallback(() => {
    if (confirm("Clear all annotations?")) {
      store.clearAll();
      toast.success("Annotations cleared");
    }
  }, [store]);

  // Drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  useEffect(() => {
    if (!editingId || !editingAnnotation) {
      return;
    }
    if (editingAnnotation.category === "ocr" || editingAnnotation.ocrLabel) {
      console.log("[OCR] Editing OCR annotation", {
        editingId,
        editingValue,
        annotation: editingAnnotation,
      });
    }
  }, [editingId, editingAnnotation, editingValue]);

  const resolveDefaultMetaForImage = useCallback(
    (imageId: string | null, fileName: string | null) => {
      if (imageId && defaultAssetMeta.has(imageId)) {
        return defaultAssetMeta.get(imageId);
      }
      if (fileName) {
        return DEFAULT_ASSET_UPLOADS.find((entry) => entry.name === fileName);
      }
      return undefined;
    },
    [defaultAssetMeta],
  );

  useEffect(() => {
    console.log("[CSV Debug] Default asset CSVs", DEFAULT_ASSET_UPLOADS.map((asset) => ({
      id: asset.id,
      name: asset.name,
      ocrCsvPath: asset.ocrCsvPath,
      modelCsvPath: asset.modelCsvPath,
      profileCsvPath: asset.profileCsvPath,
    })));
  }, []);

  return (
    <div 
      className="flex flex-col bg-background overflow-hidden"
      style={{
        maxWidth: '100vw',
        maxHeight: '100vh',
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        position: 'relative',
      }}
    >
      {/* Top Toolbar Bar */}
      <div className="h-12 bg-[hsl(var(--toolbar-bg))] border-b border-border/80 flex items-center gap-2 px-3 shrink-0 shadow-sm" style={{ maxWidth: '100%', width: '100%', boxSizing: 'border-box', margin: 0, padding: '0 12px' }}>
        {/* Mode Selection Dropdown */}
        <Select
          value={store.mode}
          onValueChange={(value: "viewport" | "model" | "ocr") => {
            store.setMode(value);
            toast.success(
              value === "viewport" ? "Profile Mode" :
              value === "model" ? "Model Mode" : "OCR Mode",
              { duration: 1000 }
            );
          }}
        >
          <SelectTrigger className="h-9 w-[160px] bg-muted/30 border-border/60">
            <SelectValue>
              {store.mode === "viewport" && "🖼️ Profile"}
              {store.mode === "model" && "🧩 Model"}
              {store.mode === "ocr" && "🔤 OCR"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewport">
              <div className="flex items-center gap-2">
                <span>🖼️</span>
                <span>Profile</span>
              </div>
            </SelectItem>
            <SelectItem value="model">
              <div className="flex items-center gap-2">
                <span>🧩</span>
                <span>Model</span>
              </div>
            </SelectItem>
            <SelectItem value="ocr">
              <div className="flex items-center gap-2">
                <span>🔤</span>
                <span>OCR</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        
        <div className="h-6 w-px bg-border/60 mx-1" />
        <TooltipProvider>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 transition-all duration-200",
                    store.currentTool === "select"
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                      : "text-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground"
                  )}
                  onClick={() => store.setTool("select")}
                >
                  <MousePointer2 className="h-4.5 w-4.5 stroke-[1.5]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-medium">Select Tool</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 transition-all duration-200",
                    store.currentTool === "rectangle"
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                      : "text-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground"
                  )}
                  onClick={() => store.setTool("rectangle")}
                >
                  <Square className="h-4.5 w-4.5 stroke-[1.5]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-medium">Rectangle (R)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        
        <div className="h-6 w-px bg-border/60 mx-1" />
        
        {/* Mode-specific dropdowns */}
        {store.mode === "viewport" && (
          <>
            <Select
              value={store.activeLabel}
              onValueChange={(value) => store.setActiveLabel(value)}
            >
              <SelectTrigger className="h-9 min-w-[180px] bg-muted/30 border-border/60">
                <SelectValue>
                  {store.labels.find(l => l.id === store.activeLabel)?.name || "Select Label"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {store.labels.map((label) => (
                  <SelectItem key={label.id} value={label.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: label.color }}
                      />
                      <span>{label.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select
              value={store.showLabels ? "activate" : "deactivate"}
              onValueChange={(value) => {
                const shouldShow = value === "activate";
                if (store.showLabels !== shouldShow) {
                  store.toggleLabels();
                }
              }}
            >
              <SelectTrigger className="h-9 w-[140px] bg-muted/30 border-border/60">
                <SelectValue placeholder="Options" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activate">Activate</SelectItem>
                <SelectItem value="deactivate">Deactivate</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        
        {store.mode === "model" && (
          <Select
            value={store.activeLabel}
            onValueChange={(value) => store.setActiveLabel(value)}
          >
            <SelectTrigger className="h-9 min-w-[160px] bg-muted/30 border-border/60">
              <SelectValue>
                {store.labels.find(l => l.id === store.activeLabel)?.name || "Select Label"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {store.labels.map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {store.mode === "ocr" && (
          <Select
            value={store.activeLabel}
            onValueChange={(value) => store.setActiveLabel(value)}
          >
            <SelectTrigger className="h-9 min-w-[160px] bg-muted/30 border-border/60">
              <SelectValue>
                {store.labels.find(l => l.id === store.activeLabel)?.name || "Select OCR Text"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {store.labels.map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 transition-all duration-200 text-foreground bg-muted/30 hover:bg-destructive/15 hover:text-destructive" 
                  onClick={handleResetRealtimeAuth}
                >
                  <RefreshCcw className="h-4.5 w-4.5 stroke-[1.5]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-medium">Reset Realtime Session</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 transition-all duration-200 text-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground" 
                  onClick={handleExport}
                >
                  <Download className="h-4.5 w-4.5 stroke-[1.5]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-medium">Export Annotations</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 transition-all duration-200 text-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground" 
                  onClick={handleImport}
                >
                  <Upload className="h-4.5 w-4.5 stroke-[1.5]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-medium">Import Annotations</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main Layout */}
      <div 
        className="flex flex-1 overflow-hidden min-h-0 min-w-0"
        style={{
          maxWidth: '100%',
          width: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: 0,
        }}
      >
        {/* Left Sidebar - File Navigation */}
        <div className="bg-card border-r border-border/80 flex flex-col shrink-0 shadow-sm" style={{ width: '256px', maxWidth: '256px', minWidth: '256px', boxSizing: 'border-box', margin: 0, padding: 0 }}>
          <div className="p-4 border-b border-border/80 bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase">File Access</h3>
          </div>
          
          {/* Upload Button */}
          <div className="p-3 border-b border-border/80">
            <input
              ref={sidebarFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file, true);
              }}
              multiple
            />
            <Button
              onClick={() => sidebarFileInputRef.current?.click()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Image
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-3 px-2 uppercase tracking-wider">Uploaded Images</div>
              
              {uploadedImages.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No images uploaded yet
              </div>
              ) : (
                uploadedImages.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => loadImageToCanvas(img.image, img.url, img.name, img.id)}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-all duration-150 group",
                      currentImageId === img.id
                        ? "bg-primary/10 border border-primary/20 hover:bg-primary/15"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <FileText className={cn(
                      "h-4 w-4 transition-colors duration-150 flex-shrink-0",
                      currentImageId === img.id
                        ? "text-primary"
                        : "text-foreground/80 group-hover:text-primary"
                    )} />
                    <span className={cn(
                      "text-sm truncate",
                      currentImageId === img.id
                        ? "font-medium text-foreground"
                        : "text-foreground/90 group-hover:text-foreground"
                    )}>
                      {img.name}
                    </span>
                </div>
                ))
              )}
            </div>
          </div>
      </div>

      {/* Canvas area */}
        <div 
          className="flex-1 flex flex-col bg-[hsl(var(--canvas-bg))] min-w-0 min-h-0 overflow-hidden"
          style={{
            maxWidth: '100%',
            width: '100%',
            flex: '1 1 0%',
            boxSizing: 'border-box',
            margin: 0,
            padding: 0,
          }}
        >
        <div
          ref={containerRef}
          className="flex-1 relative bg-[hsl(var(--canvas-bg))] min-w-0 min-h-0 overflow-hidden"
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            margin: 0,
            padding: 0,
          }}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          {!store.image ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-10 border-2 border-dashed border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-lg max-w-md">
                <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">Upload an image to start</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Drag and drop an image here, or click the button below to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="shadow-md hover:shadow-lg transition-shadow duration-200"
                >
                  Choose Image
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={scrollContainerRef}
                className="w-full h-full scrollable-canvas"
                style={{ 
                  overflowX: 'auto',
                  overflowY: 'auto',
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  boxSizing: 'border-box',
                  margin: 0,
                  padding: 0,
                  backgroundColor: 'hsl(var(--canvas-bg))', // Match canvas background to prevent gaps
                }}
                onScroll={handleScroll}
              >
                <div
                  ref={wrapperRef}
                  style={{
                    width: store.image ? `${Math.max(store.image.width * store.transform.scale, scrollContainerRef.current?.clientWidth || 800)}px` : '100%',
                    height: store.image ? `${Math.max(store.image.height * store.transform.scale, scrollContainerRef.current?.clientHeight || 600)}px` : '100%',
                    position: 'relative',
                    pointerEvents: 'none',
                    minWidth: '100%',
                    minHeight: '100%',
                    margin: 0,
                    padding: 0,
                    boxSizing: 'border-box',
                    backgroundColor: 'hsl(var(--canvas-bg))', // Match canvas background
                  }}
                >
              <canvas
                ref={canvasRef}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      display: 'block',
                      pointerEvents: 'auto',
                      boxSizing: 'border-box',
                      margin: 0,
                      padding: 0,
                      border: 'none',
                      outline: 'none',
                    }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
              />
                </div>
              </div>

              {remoteSelectionOverlays.map((overlay) => (
                <div
                  key={`remote-selection-${overlay.userId}-${overlay.annotationId}`}
                  className="pointer-events-none fixed z-[900] rounded-md"
                  style={{
                    left: overlay.left,
                    top: overlay.top,
                    width: overlay.width,
                    height: overlay.height,
                    border: `2px dashed ${overlay.color}`,
                    backgroundColor: `${overlay.color}22`,
                  }}
                >
                  <div
                    className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: overlay.color,
                      color: "#fff",
                    }}
                  >
                    {overlay.userName ?? overlay.userId}
                  </div>
                </div>
              ))}

              {remoteCursorOverlays.map((cursor) => (
                <div
                  key={`remote-cursor-${cursor.userId}`}
                  className="pointer-events-none fixed z-[950] flex flex-col items-center"
                  style={{
                    left: cursor.left,
                    top: cursor.top,
                  }}
                >
                  <div
                    className="h-3 w-3 rounded-full border-2"
                    style={{
                      backgroundColor: cursor.color,
                      borderColor: "#ffffff",
                    }}
                  />
                  <span
                    className="mt-1 px-2 py-0.5 text-xs font-semibold rounded-full shadow"
                    style={{
                      backgroundColor: cursor.color,
                      color: "#ffffff",
                    }}
                  >
                    {cursor.userName ?? cursor.userId}
                  </span>
                </div>
              ))}
              
              <ZoomControls
                zoom={store.transform.scale}
                onZoomIn={() => {
                  const scrollContainer = scrollContainerRef.current;
                  if (scrollContainer) {
                    const rect = scrollContainer.getBoundingClientRect();
                    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
                  }
                }}
                onZoomOut={() => {
                  const scrollContainer = scrollContainerRef.current;
                  if (scrollContainer) {
                    const rect = scrollContainer.getBoundingClientRect();
                    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, -1);
                  }
                }}
                onFit={fitToScreen}
                onReset={() => store.setTransform({ scale: 1 })}
              />
              {editingRect && editingId && editingAnnotation && (editingAnnotation.category === "ocr" || editingAnnotation.ocrLabel) && (
                (() => {
                  console.log("[OCR] Rendering OCR editor overlay", {
                    editingId,
                    editingValue,
                    annotation: editingAnnotation,
                  });
                  return (
                <div
                  ref={overlayRef}
                  tabIndex={-1}
                  className="fixed z-[2000]"
                  style={{
                    left: Math.round(editingRect.left),
                    top: Math.round(editingRect.top + editingRect.height + 6),
                    width: Math.max(180, Math.round(editingRect.width)),
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.12)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                    padding: 12,
                    borderRadius: 8,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">
                    OCR Text
                  </label>
                  <textarea
                    autoFocus
                    value={editingValue}
                    onChange={(e) => {
                      setEditingValue(e.target.value);
                      if (editingId) {
                        debouncedPreviewUpdate(editingId, e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void finalizeOcrTextEditing();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelOcrTextEditing();
                      }
                    }}
                    className="w-full min-h-[64px] resize-vertical rounded-md border border-border/70 bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Edit OCR text…"
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="secondary" size="sm" onClick={cancelOcrTextEditing}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void finalizeOcrTextEditing()}>
                      Save
                    </Button>
                  </div>
                </div>
                  );
                })()
              )}

              {editingId &&
                overlayPosition &&
                editingAnnotation &&
                !(editingAnnotation.category === "ocr" || editingAnnotation.ocrLabel) &&
                editingOptions.length > 0 && (
                <div
                  className="fixed z-[1000]"
                  style={{
                    top: overlayPosition.top,
                    left: overlayPosition.left,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    ref={overlayRef}
                    tabIndex={-1}
                    className="bg-card border border-border/70 shadow-lg rounded-md p-3 flex flex-col gap-2"
                    style={{
                      minWidth: 220,
                      pointerEvents: "auto",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onMouseUp={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                    onBlur={handleOverlayBlur}
                  >
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Edit Label
                    </span>
                    <Select
                      open={isDropdownOpen}
                      onOpenChange={(open) => {
                        if (!open) {
                          handleOverlayDismiss();
                        }
                      }}
                      value={editingValue || editingOptions[0]?.id}
                      onValueChange={handleLabelSelect}
                    >
                      <SelectTrigger className="h-9 bg-background border-border/70 focus:ring-0 focus-visible:ring-0">
                        <SelectValue placeholder="Select label" />
                      </SelectTrigger>
                      <SelectContent>
                        {editingOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: option.color }}
                              />
                              <span>{option.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}

          {dragOver && (
            <div className="absolute inset-0 bg-primary/15 backdrop-blur-sm border-4 border-primary/60 border-dashed flex items-center justify-center pointer-events-none z-50">
              <div className="bg-card/95 backdrop-blur-md p-8 rounded-xl shadow-2xl border border-primary/20">
                <Upload className="mx-auto h-12 w-12 text-primary mb-4" />
                <p className="text-xl font-semibold text-foreground">Drop image here</p>
                <p className="text-sm text-muted-foreground mt-2">Release to upload</p>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        {store.image && (
          <StatusBar
            mousePos={store.mousePos}
            currentTool={store.currentTool}
            currentMode={store.mode}
            annotationCount={store.annotations.length}
            selectedCount={selectedIdList.length}
            imageWidth={store.image.width}
            imageHeight={store.image.height}
            scale={store.transform.scale}
          />
        )}
      </div>

        <LegendPanel
          items={legendItems}
          mode={store.mode}
          activeItemId={store.activeLabel}
          onSelect={(id) => store.setActiveLabel(id)}
        />
      </div>
    </div>
  );
};
