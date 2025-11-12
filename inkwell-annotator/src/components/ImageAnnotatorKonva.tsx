import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Group, Text, Transformer } from "react-konva";
import { Upload, MousePointer2, Square, FileText, Download } from "lucide-react";
import { useAnnotationStore, getNextColor, LABEL_CONFIG, OCR_LABEL_CONFIG, PROFILE_LABEL_CONFIG } from "@/store/annotationStore";
import { Annotation } from "@/types/annotation";
import { ZoomControls } from "./ZoomControls";
import { StatusBar } from "./StatusBar";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Konva from "konva";

interface KonvaAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color: string;
  parentId?: string;
}

export const ImageAnnotatorKonva = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarFileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number } | null>(null);
  const [panStartTransform, setPanStartTransform] = useState<{ translateX: number; translateY: number } | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; name: string; url: string; image: HTMLImageElement }>>([]);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingRect, setEditingRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const initialEditingValueRef = useRef<string | null>(null);
  const [activeProfileEditId, setActiveProfileEditId] = useState<string | null>(null);

  const store = useAnnotationStore();

  // Debug: Log labels when mode or labels change
  useEffect(() => {
    console.log('Labels updated:', {
      mode: store.mode,
      labelsCount: store.labels.length,
      labels: store.labels.map(l => ({ id: l.id, name: l.name })),
      activeLabel: store.activeLabel,
      activeLabelName: store.labels.find(l => l.id === store.activeLabel)?.name
    });
  }, [store.mode, store.labels, store.activeLabel]);

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;
  const HANDLE_SIZE = 8;

  // Helper functions to check annotation types
  const isProfileAnnotation = useCallback((ann: Annotation) => {
    return PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
  }, []);

  const isProfileLabel = useCallback((label?: string) => {
    if (!label) return false;
    return PROFILE_LABEL_CONFIG.some(profileLabel => profileLabel.name === label);
  }, []);

  const isModelAnnotation = useCallback((ann: Annotation) => {
    return LABEL_CONFIG.some(label => label.name === ann.label);
  }, []);

  const isOCRAnnotation = useCallback((ann: Annotation) => {
    return OCR_LABEL_CONFIG.some(label => label.name === ann.label);
  }, []);

  const isProfileEditMode = activeProfileEditId !== null;

  // Helper function to check if a rectangle is completely inside another rectangle
  const isInside = useCallback((inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }) => {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h
    );
  }, []);

  // Convert store annotations to Konva format with visibility filtering
  const konvaAnnotations = useMemo(() => {
    // First, filter annotations based on mode
    const storeSelectedProfileIds = Array.from(store.selectedIds).filter(id => {
      const ann = store.annotations.find(a => a.id === id);
      return ann && isProfileAnnotation(ann);
    });

    const selectedProfileIds = activeProfileEditId
      ? [activeProfileEditId]
      : storeSelectedProfileIds;

    const visibleAnnotations = store.annotations.filter((ann) => {
      const isProfile = isProfileAnnotation(ann);
      const isModel = isModelAnnotation(ann);
      const isOCR = isOCRAnnotation(ann);

      // OCR mode: Show only OCR annotations
      if (store.mode === "ocr") {
        return isOCR;
      }

      // Model mode: Show only Model annotations
      if (store.mode === "model") {
        return isModel;
      }

      // Profile mode: Show Profile rectangles always, Model/OCR only if inside selected Profile
      if (store.mode === "viewport") {
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
            const profileAnn = store.annotations.find(a => a.id === profileId);
            if (!profileAnn) return false;
            return isInside(ann, profileAnn);
          });
        }
        
        // If no Profile rectangle is selected, don't show Model/OCR annotations
        return false;
      }

      // Default: show all (shouldn't reach here)
      return true;
    });

    // Convert to Konva format
    const converted = visibleAnnotations.map((ann): KonvaAnnotation => ({
      id: ann.id,
      x: ann.x,
      y: ann.y,
      width: ann.w,
      height: ann.h,
      label: ann.label || undefined,
      color: ann.color,
      parentId: ann.parentId,
    }));
    
    return converted;
  }, [store.annotations, store.mode, store.selectedIds, isProfileAnnotation, isModelAnnotation, isOCRAnnotation, isInside, activeProfileEditId, isProfileEditMode]);

  const computeRectForAnnotation = useCallback((annotation: Annotation) => {
    const stage = stageRef.current;
    if (!stage) return null;

    const containerRect = stage.container().getBoundingClientRect();
    const scale = store.transform.scale;
    const left = containerRect.left + store.transform.translateX + annotation.x * scale;
    const top = containerRect.top + store.transform.translateY + annotation.y * scale;
    const width = Math.max(0, annotation.w * scale);
    const height = Math.max(0, annotation.h * scale);

    return { left, top, width, height };
  }, [store.transform]);

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

  const clearEditingState = useCallback(() => {
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
    if (editingId && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;

    const handleResize = () => updateEditingRect();
    window.addEventListener("resize", handleResize);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleResize);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (container) {
        container.removeEventListener("scroll", handleResize);
      }
    };
  }, [editingId, updateEditingRect]);

  useEffect(() => {
    if (!editingId) return;
    updateEditingRect();
  }, [store.transform.scale, store.transform.translateX, store.transform.translateY, editingId, updateEditingRect]);

  useEffect(() => {
    if (store.mode !== "viewport") {
      setActiveProfileEditId(null);
    }
  }, [store.mode]);

  useEffect(() => {
    if (!imageElement) {
      setActiveProfileEditId(null);
    }
  }, [imageElement]);

  useEffect(() => {
    if (activeProfileEditId && !store.annotations.some((ann) => ann.id === activeProfileEditId)) {
      setActiveProfileEditId(null);
    }
  }, [activeProfileEditId, store.annotations]);


  // Update stage size when container resizes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Fit image to screen
  const fitToScreen = useCallback(() => {
    if (!imageElement || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const padding = 40;
    const availableWidth = Math.max(100, containerWidth - padding * 2);
    const availableHeight = Math.max(100, containerHeight - padding * 2);

    const scaleX = availableWidth / imageElement.width;
    const scaleY = availableHeight / imageElement.height;
    const scale = Math.min(scaleX, scaleY);

    if (!isFinite(scale) || scale <= 0) return;

    const scaledWidth = imageElement.width * scale;
    const scaledHeight = imageElement.height * scale;

    const translateX = (containerWidth - scaledWidth) / 2;
    const translateY = (containerHeight - scaledHeight) / 2;

    store.setTransform({ scale, translateX, translateY });
  }, [imageElement, store]);

  // Zoom at point
  const zoomAt = useCallback((clientX: number, clientY: number, delta: number) => {
    if (!stageRef.current || !imageElement || !containerRef.current) return;

    const stage = stageRef.current;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Adjust pointer with scroll offset
    const adjustedPointer = {
      x: pointer.x + scrollLeft,
      y: pointer.y + scrollTop,
    };

    const oldScale = store.transform.scale;
    const factor = delta > 0 ? 1.1 : 0.9;
    let newScale = oldScale * factor;
    newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

    const mousePointTo = {
      x: (adjustedPointer.x - store.transform.translateX) / oldScale,
      y: (adjustedPointer.y - store.transform.translateY) / oldScale,
    };

    const newTranslateX = adjustedPointer.x - mousePointTo.x * newScale;
    const newTranslateY = adjustedPointer.y - mousePointTo.y * newScale;

    store.setTransform({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
    });
  }, [imageElement, store]);

  // Load image
  const loadImageToCanvas = useCallback((img: HTMLImageElement, url: string, fileName: string, imageId: string) => {
    store.clearAll();
    store.setImage(img, url);
    setCurrentImageId(imageId);
    setImageElement(img);
    setImageSize({ width: img.width, height: img.height });

    const loadedData = store.loadFromLocalStorage(url);
    const annotationCount = loadedData?.annotations?.length || 0;

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
  }, [store, fitToScreen]);

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

        setUploadedImages(prev => {
          const existing = prev.find(img => img.name === file.name);
          if (existing) {
            if (switchToImage) {
              setCurrentImageId(existing.id);
              loadImageToCanvas(existing.image, existing.url, existing.name, existing.id);
            }
            return prev;
          }

          const newImage = { id: imageId, name: file.name, url: imageUrl, image: img };
          if (switchToImage) {
            setCurrentImageId(imageId);
            loadImageToCanvas(img, imageUrl, file.name, imageId);
          }
          return [...prev, newImage];
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [loadImageToCanvas]);

  // Handle stage events
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage || !imageElement) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Get scroll offset from container
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;

    // Adjust pointer position with scroll offset
    const adjustedPointer = {
      x: pointer.x + scrollLeft,
      y: pointer.y + scrollTop,
    };

    // Pan with space or middle mouse (Revu-style panning)
    if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.getModifierState?.("Space"))) {
      setIsPanning(true);
      // Store initial mouse position in screen coordinates (pointer position)
      setPanStartPos({ x: pointer.x, y: pointer.y });
      // Store initial transform for smooth, predictable panning
      setPanStartTransform({
        translateX: store.transform.translateX,
        translateY: store.transform.translateY,
      });
      // Keep default cursor during panning (no hand symbol)
      stage.container().style.cursor = "default";
      return;
    }

    // Convert stage coordinates to image coordinates (accounting for scroll)
    const imagePos = {
      x: (adjustedPointer.x - store.transform.translateX) / store.transform.scale,
      y: (adjustedPointer.y - store.transform.translateY) / store.transform.scale,
    };

    if (store.currentTool === "rectangle") {
      setIsDrawing(true);
      setDrawStart({ x: imagePos.x, y: imagePos.y });
      store.setDrawing(true);
      return;
    }

    if (store.currentTool === "select") {
      const stageNode = stageRef.current;
      if (stageNode && e.target === stageNode) {
        if (!e.evt.shiftKey) {
          if (!isProfileEditMode) {
            store.clearSelection();
          }
        }
      }
      return;
    }
  }, [imageElement, store, isProfileEditMode]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage || !imageElement) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Get scroll offset from container
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;

    // Adjust pointer position with scroll offset
    const adjustedPointer = {
      x: pointer.x + scrollLeft,
      y: pointer.y + scrollTop,
    };

    // Update mouse position
    const imagePos = {
      x: (adjustedPointer.x - store.transform.translateX) / store.transform.scale,
      y: (adjustedPointer.y - store.transform.translateY) / store.transform.scale,
    };
    store.setMousePos({ x: pointer.x, y: pointer.y, imageX: imagePos.x, imageY: imagePos.y });

    // Panning (Revu-style: smooth, direct image movement)
    if (isPanning && panStartPos && panStartTransform) {
      // Calculate mouse movement in screen coordinates (pointer position)
      const dx = pointer.x - panStartPos.x;
      const dy = pointer.y - panStartPos.y;
      
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

      return;
    }

    // Update cursor
    if (isPanning) {
      // Keep default cursor during panning (no hand symbol)
      stage.container().style.cursor = "default";
    } else if (store.currentTool === "select") {
      const clickedAnnotation = konvaAnnotations.find(ann => {
        return (
          imagePos.x >= ann.x &&
          imagePos.x <= ann.x + ann.width &&
          imagePos.y >= ann.y &&
          imagePos.y <= ann.y + ann.height
        );
      });
      stage.container().style.cursor = clickedAnnotation ? "move" : "default";
    } else if (store.currentTool === "rectangle") {
      stage.container().style.cursor = "crosshair";
    }
  }, [imageElement, store, isPanning, panStartPos, panStartTransform, konvaAnnotations]);

  const handleStageMouseUp = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (isDrawing && drawStart) {
      const pointer = stage.getPointerPosition();
      if (pointer) {
        // Get scroll offset
        const scrollLeft = containerRef.current?.scrollLeft || 0;
        const scrollTop = containerRef.current?.scrollTop || 0;
        const adjustedPointer = {
          x: pointer.x + scrollLeft,
          y: pointer.y + scrollTop,
        };

        const start = drawStart;
        const end = {
          x: (adjustedPointer.x - store.transform.translateX) / store.transform.scale,
          y: (adjustedPointer.y - store.transform.translateY) / store.transform.scale,
        };

        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        if (w > 4 && h > 4 && imageElement) {
          const labelConfig = store.getActiveLabelConfig();
          // Debug: Log label assignment
          console.log('Creating annotation with label:', {
            activeLabel: store.activeLabel,
            labelConfig: labelConfig ? {
              id: labelConfig.id,
              name: labelConfig.name,
              color: labelConfig.color
            } : null,
            labels: store.labels.map(l => ({ id: l.id, name: l.name })),
            mode: store.mode,
            showLabels: store.showLabels
          });
          
          const labelName = labelConfig?.name || "Column";
          const labelColor = labelConfig?.color || getNextColor();
          
          console.log('Label assignment result:', {
            labelName,
            labelColor,
            labelConfigExists: !!labelConfig
          });
          
          // Check if this is a Model or OCR annotation, and if so, find which Profile rectangle contains it
          let parentId: string | undefined = undefined;
          const isModelOrOCR = store.mode === "model" || store.mode === "ocr";
          
          if (isModelOrOCR) {
            // Find Profile rectangles that contain this annotation
            const annotationRect = {
              x: Math.max(0, x),
              y: Math.max(0, y),
              w: Math.min(w, imageElement.width - x),
              h: Math.min(h, imageElement.height - y),
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
            w: Math.min(w, imageElement.width - x),
            h: Math.min(h, imageElement.height - y),
            label: labelName,
            color: labelColor,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            parentId: parentId,
          };
          
          console.log('Created annotation:', {
            id: annotation.id,
            label: annotation.label,
            color: annotation.color,
            x: annotation.x,
            y: annotation.y,
            w: annotation.w,
            h: annotation.h
          });
          store.addAnnotation(annotation);
          store.setSelected([annotation.id]);
        }
      }
    }

    setIsDrawing(false);
    setIsPanning(false);
    setDrawStart(null);
    setPanStartPos(null);
    setPanStartTransform(null);
    store.setDrawing(false);
    store.setPanning(false);
  }, [isDrawing, drawStart, store, imageElement]);

  // Handle wheel zoom
  const handleStageWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    if (!e.evt.shiftKey) {
      // Allow normal scrolling when Shift is not pressed
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const delta = e.evt.deltaY;
    zoomAt(pointer.x, pointer.y, -delta);
  }, [zoomAt]);

  // Update transformer when selection changes
  useEffect(() => {
    const transformer = transformerRef.current;
    const layer = layerRef.current;
    if (!transformer || !layer) return;

    const selectedIds = Array.from(store.selectedIds);
    if (selectedIds.length === 1) {
      const selectedNode = layer.findOne(`#${selectedIds[0]}`);
      if (selectedNode) {
        transformer.nodes([selectedNode]);
        transformer.getLayer()?.batchDraw();
      } else {
        transformer.nodes([]);
      }
    } else {
      transformer.nodes([]);
    }
  }, [store.selectedIds, konvaAnnotations]);

  // Handle annotation drag
  const handleAnnotationDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>, ann: KonvaAnnotation) => {
    const node = e.target as Konva.Rect;
    const newX = Math.max(0, Math.min(imageSize.width - node.width(), node.x()));
    const newY = Math.max(0, Math.min(imageSize.height - node.height(), node.y()));

    store.updateAnnotation(ann.id, {
      x: newX,
      y: newY,
    });
    if (editingId === ann.id) {
      requestAnimationFrame(() => updateEditingRect());
    }
  }, [store, imageSize, editingId, updateEditingRect]);

  // Handle annotation transform end
  const handleAnnotationTransformEnd = useCallback((e: Konva.KonvaEventObject<Event>, ann: KonvaAnnotation) => {
    const node = e.target as Konva.Rect;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth = Math.max(10, node.width() * scaleX);
    const newHeight = Math.max(10, node.height() * scaleY);

    const newX = Math.max(0, Math.min(imageSize.width - newWidth, node.x()));
    const newY = Math.max(0, Math.min(imageSize.height - newHeight, node.y()));

    node.scaleX(1);
    node.scaleY(1);

    store.updateAnnotation(ann.id, {
      x: newX,
      y: newY,
      w: newWidth,
      h: newHeight,
    });
    if (editingId === ann.id) {
      requestAnimationFrame(() => updateEditingRect());
    }
  }, [store, imageSize, editingId, updateEditingRect]);

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
      } else if (normalizedKey === "r") {
        store.setTool("rectangle");
      } else if (normalizedKey >= "0" && normalizedKey <= "9") {
        if (store.mode !== "viewport") {
          const labelIndex = parseInt(normalizedKey, 10);
          if (labelIndex < store.labels.length) {
            store.setActiveLabel(store.labels[labelIndex].id);
            toast.success(`Selected label: ${store.labels[labelIndex].name}`, { duration: 1000 });
          }
        }
      } else if (normalizedKey === "+" || normalizedKey === "=") {
        e.preventDefault();
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          zoomAt(rect.width / 2, rect.height / 2, 1);
        }
      } else if (normalizedKey === "-" || normalizedKey === "_") {
        e.preventDefault();
        const stage = stageRef.current;
        if (stage) {
          const rect = stage.container().getBoundingClientRect();
          zoomAt(rect.width / 2, rect.height / 2, -1);
        }
      } else if (normalizedKey === "f") {
        fitToScreen();
      } else if (normalizedKey === "Delete" || normalizedKey === "Backspace") {
        if (store.selectedIds.size > 0) {
          e.preventDefault();
          store.deleteSelected();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && normalizedKey === "z") {
        e.preventDefault();
        store.redo();
      } else if ((e.ctrlKey || e.metaKey) && normalizedKey === "y") {
        e.preventDefault();
        store.redo();
      } else if ((e.ctrlKey || e.metaKey) && normalizedKey === "z") {
        e.preventDefault();
        store.undo();
      } else if (normalizedKey === "Escape") {
        if (store.mode === "viewport" && activeProfileEditId) {
          e.preventDefault();
          setActiveProfileEditId(null);
          store.clearSelection();
        } else {
          store.clearSelection();
          setIsDrawing(false);
          setDrawStart(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, zoomAt, fitToScreen, editingId, handleOverlayDismiss, activeProfileEditId]);

  // Export/Import
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  // Get current drawing rectangle
  const currentDrawingRect = useMemo(() => {
    if (!isDrawing || !drawStart || !stageRef.current) return null;

    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return null;

    // Get scroll offset
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;
    const adjustedPointer = {
      x: pointer.x + scrollLeft,
      y: pointer.y + scrollTop,
    };

    const start = drawStart;
    const end = {
      x: (adjustedPointer.x - store.transform.translateX) / store.transform.scale,
      y: (adjustedPointer.y - store.transform.translateY) / store.transform.scale,
    };

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    return { x, y, w, h };
  }, [isDrawing, drawStart, store.transform]);

  const editingAnnotation = editingId
    ? store.annotations.find((ann) => ann.id === editingId)
    : null;

  const editingOptions = useMemo(() => {
    if (!editingAnnotation) return [];
    return getAnnotationOptions(editingAnnotation);
  }, [editingAnnotation, getAnnotationOptions]);

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
      {/* Top Toolbar */}
      <div className="h-12 bg-[hsl(var(--toolbar-bg))] border-b border-border/80 flex items-center gap-2 px-3 shrink-0 shadow-sm">
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
        )}

        {store.mode === "model" && (
          <Select
            value={store.activeLabel}
            onValueChange={(value) => {
              console.log('Label selected:', value, 'Available labels:', store.labels.map(l => l.name));
              store.setActiveLabel(value);
            }}
          >
            <SelectTrigger className="h-9 min-w-[160px] bg-muted/30 border-border/60">
              <SelectValue>
                {store.labels.find(l => l.id === store.activeLabel)?.name || "Select Label"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {store.labels.length === 0 && (
                <SelectItem value="" disabled>No labels available</SelectItem>
              )}
              {store.labels.map((label) => {
                console.log('Rendering label in dropdown:', label);
                return (
                  <SelectItem key={label.id} value={label.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: label.color }}
                      />
                      <span>{label.name}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {store.mode === "ocr" && (
          <Select
            value={store.activeLabel}
            onValueChange={(value) => {
              console.log('OCR Label selected:', value, 'Available labels:', store.labels.map(l => l.name));
              store.setActiveLabel(value);
            }}
          >
            <SelectTrigger className="h-9 min-w-[160px] bg-muted/30 border-border/60">
              <SelectValue>
                {store.labels.find(l => l.id === store.activeLabel)?.name || "Select OCR Text"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {store.labels.length === 0 && (
                <SelectItem value="" disabled>No labels available</SelectItem>
              )}
              {store.labels.map((label) => {
                console.log('Rendering OCR label in dropdown:', label);
                return (
                  <SelectItem key={label.id} value={label.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: label.color }}
                      />
                      <span>{label.name}</span>
                    </div>
                  </SelectItem>
                );
              })}
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
      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar */}
        <div className="bg-card border-r border-border/80 flex flex-col shrink-0 shadow-sm" style={{ width: '256px', maxWidth: '256px', minWidth: '256px' }}>
          <div className="p-4 border-b border-border/80 bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase">File Access</h3>
          </div>

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

        {/* Canvas area with scrollbars */}
        <div
          className="flex-1 flex flex-col bg-[hsl(var(--canvas-bg))] min-w-0 min-h-0 overflow-hidden"
          style={{ position: 'relative' }}
        >
          <div
            ref={containerRef}
            className="flex-1 relative bg-[hsl(var(--canvas-bg))] min-w-0 min-h-0 overflow-auto"
            style={{
              position: 'relative',
            }}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
          >
            {!imageElement ? (
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
              <div
                ref={scrollContainerRef}
                style={{
                  width: Math.max(stageSize.width, imageSize.width * store.transform.scale + Math.abs(store.transform.translateX) * 2),
                  height: Math.max(stageSize.height, imageSize.height * store.transform.scale + Math.abs(store.transform.translateY) * 2),
                  position: 'relative',
                  minWidth: stageSize.width,
                  minHeight: stageSize.height,
                }}
              >
                <Stage
                  ref={stageRef}
                  width={stageSize.width}
                  height={stageSize.height}
                  onMouseDown={handleStageMouseDown}
                  onMouseMove={handleStageMouseMove}
                  onMouseUp={handleStageMouseUp}
                  onWheel={handleStageWheel}
                  style={{ cursor: store.currentTool === "rectangle" ? "crosshair" : "default" }}
                >
                  <Layer ref={layerRef}>
                    {/* Background */}
                    <Rect
                      x={0}
                      y={0}
                      width={stageSize.width}
                      height={stageSize.height}
                      fill="hsl(var(--canvas-bg))"
                    />

                    {/* Image with transform */}
                    <Group
                      x={store.transform.translateX}
                      y={store.transform.translateY}
                      scaleX={store.transform.scale}
                      scaleY={store.transform.scale}
                    >
                      <KonvaImage
                        ref={imageRef}
                        image={imageElement}
                        x={0}
                        y={0}
                      />
                    </Group>

                    {/* Annotations with transform */}
                    <Group
                      x={store.transform.translateX}
                      y={store.transform.translateY}
                      scaleX={store.transform.scale}
                      scaleY={store.transform.scale}
                    >
                      {konvaAnnotations.map((ann) => {
                        const isSelected = store.selectedIds.has(ann.id);
                        
                        // In Profile mode: light color for unselected, dark color for selected
                        let strokeColor = ann.color;
                        if (store.mode === "viewport") {
                          const isProfile = PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
                          if (isProfile) {
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
                        }
                        
                        return (
                          <Group key={ann.id} id={ann.id}>
                            <Rect
                              x={ann.x}
                              y={ann.y}
                              width={ann.width}
                              height={ann.height}
                              stroke={strokeColor}
                              strokeWidth={isSelected ? 3 : 2}
                              dash={isSelected ? [8, 4] : []}
                              fill="transparent"
                              draggable={store.currentTool === "select"}
                              onDragEnd={(e) => handleAnnotationDragEnd(e, ann)}
                              onTransformEnd={(e) => handleAnnotationTransformEnd(e, ann)}
                              onClick={(e) => {
                                e.cancelBubble = true;
                              const annotation = store.annotations.find((candidate) => candidate.id === ann.id);
                              const isProfile = annotation ? isProfileLabel(annotation.label) : false;

                              if (store.mode === "viewport" && e.evt.ctrlKey && annotation && isProfile) {
                                setActiveProfileEditId(annotation.id);
                                if (!store.selectedIds.has(annotation.id)) {
                                  store.setSelected([annotation.id]);
                                }
                                return;
                              }

                              if (e.evt.shiftKey) {
                                if (store.mode === "viewport" && isProfile) {
                                  store.setSelected([ann.id]);
                                } else {
                                  store.toggleSelected(ann.id);
                                }
                              } else {
                                if (store.mode === "viewport") {
                                  if (isProfile) {
                                    setActiveProfileEditId(null);
                                    store.setSelected([ann.id]);
                                  } else {
                                    if (!store.selectedIds.has(ann.id)) {
                                      store.setSelected([ann.id]);
                                    }
                                  }
                                } else {
                                  store.setSelected([ann.id]);
                                }
                              }
                            }}
                            onDblClick={(e) => {
                              e.cancelBubble = true;
                              const annotation = store.annotations.find((candidate) => candidate.id === ann.id);
                              if (!annotation) return;

                              if (!store.selectedIds.has(annotation.id)) {
                                store.setSelected([annotation.id]);
                              }
                              openLabelEditor(annotation);
                              }}
                            />
                          </Group>
                        );
                      })}

                      {/* Current drawing rectangle */}
                      {currentDrawingRect && (
                        <Rect
                          x={currentDrawingRect.x}
                          y={currentDrawingRect.y}
                          width={currentDrawingRect.w}
                          height={currentDrawingRect.h}
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dash={[4, 2]}
                          fill="transparent"
                        />
                      )}

                      {/* Transformer for selected annotations */}
                      <Transformer
                        ref={transformerRef}
                        boundBoxFunc={(oldBox, newBox) => {
                          const minSize = 10;
                          if (Math.abs(newBox.width) < minSize || Math.abs(newBox.height) < minSize) {
                            return oldBox;
                          }
                          return newBox;
                        }}
                      />
                    </Group>

                    {/* Labels rendered separately to maintain readable size */}
                    {store.showLabels && (
                      <Group
                        x={store.transform.translateX}
                        y={store.transform.translateY}
                        scaleX={store.transform.scale}
                        scaleY={store.transform.scale}
                      >
                        {konvaAnnotations.map((ann) => {
                          if (!ann.label || ann.label.trim() === '') {
                            return null;
                          }
                          
                          const isSelected = store.selectedIds.has(ann.id);
                          const fontSize = Math.max(12 / store.transform.scale, 8);
                          const labelWidth = ann.label.length * 8 + 8;
                          const labelHeight = 20;
                          
                          // In Profile mode: use dark color for label background if selected, light if not
                          let labelBgColor = ann.color;
                          if (store.mode === "viewport") {
                            const isProfile = PROFILE_LABEL_CONFIG.some(label => label.name === ann.label);
                            if (isProfile) {
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
                          }
                          
                          // Text color: white for dark backgrounds, dark for light backgrounds
                          const textColor = (store.mode === "viewport" && !isSelected && PROFILE_LABEL_CONFIG.some(label => label.name === ann.label)) 
                            ? ann.color 
                            : "#ffffff";
                          
                          return (
                            <Group key={`label-${ann.id}`}>
                              <Rect
                                x={ann.x}
                                y={ann.y - labelHeight}
                                width={labelWidth}
                                height={labelHeight}
                                fill={labelBgColor}
                                listening={false}
                              />
                              <Text
                                x={ann.x + 4}
                                y={ann.y - labelHeight + 4}
                                text={ann.label}
                                fontSize={fontSize}
                                fill={textColor}
                                listening={false}
                                perfectDrawEnabled={false}
                              />
                            </Group>
                          );
                        })}
                      </Group>
                    )}
                  </Layer>
                </Stage>
                {editingId && overlayPosition && editingAnnotation && editingOptions.length > 0 && (
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
              </div>
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

          {/* Zoom Controls */}
          {imageElement && (
            <ZoomControls
              zoom={store.transform.scale}
              onZoomIn={() => {
                const stage = stageRef.current;
                if (stage) {
                  const rect = stage.container().getBoundingClientRect();
                  zoomAt(rect.width / 2, rect.height / 2, 1);
                }
              }}
              onZoomOut={() => {
                const stage = stageRef.current;
                if (stage) {
                  const rect = stage.container().getBoundingClientRect();
                  zoomAt(rect.width / 2, rect.height / 2, -1);
                }
              }}
              onFit={fitToScreen}
              onReset={() => store.setTransform({ scale: 1 })}
            />
          )}

          {/* Status bar */}
          {imageElement && (
            <StatusBar
              mousePos={store.mousePos}
              currentTool={store.currentTool}
              currentMode={store.mode}
              annotationCount={store.annotations.length}
              selectedCount={store.selectedIds.size}
              imageWidth={imageElement.width}
              imageHeight={imageElement.height}
              scale={store.transform.scale}
            />
          )}
        </div>
      </div>
    </div>
  );
};

