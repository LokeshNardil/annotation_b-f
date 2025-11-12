import React, { useRef, useState, useCallback, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Text } from "react-konva";
import { useHotkeys } from "react-hotkeys-hook";
import { useAnnotationStore, DEFAULT_LABELS, type Annotation } from "@/store/useAnnotationStore";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { 
  Upload, 
  Save, 
  Undo2, 
  Redo2, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Copy,
  Clipboard,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * AnnotationViewer Component
 * 
 * A React component for annotating images with rectangular annotations.
 * Features:
 * - Image display with zoom/pan
 * - Rectangular annotations (click + drag to create)
 * - Draggable/resizable rectangles with handles
 * - Labeled annotations with color coding
 * - Keyboard shortcuts for labels (1, 2, 3, etc.)
 * - Single/multi-selection with Shift+drag marquee
 * - Copy/Paste rectangles
 * - Undo/Redo with snapshots
 * - Delete selected (Del key)
 * - Save/Load annotations per image
 * - Sidebar with image list and navigation
 * 
 * Usage:
 * ```tsx
 * import { AnnotationViewer } from "@/components/AnnotationViewer";
 * 
 * const images = [
 *   { id: "1", name: "Image 1", url: "/path/to/image1.jpg" },
 *   { id: "2", name: "Image 2", url: "/path/to/image2.jpg" },
 * ];
 * 
 * <AnnotationViewer images={images} />
 * ```
 */
interface AnnotationViewerProps {
  images: Array<{
    id: string;
    name: string;
    url: string;
    thumbnail?: string;
  }>;
  initialImageId?: string;
  className?: string;
  width?: number;
  height?: number;
}

export const AnnotationViewer: React.FC<AnnotationViewerProps> = ({
  images,
  initialImageId,
  className,
  width = 1200,
  height = 800,
}) => {
  const store = useAnnotationStore();
  const stageRef = useRef<any>(null);
  const imageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const [imageNode, setImageNode] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width, height });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize images on mount
  useEffect(() => {
    if (images.length > 0) {
      // Only set images if store is empty or if we're explicitly initializing
      if (store.images.length === 0) {
        store.setImages(images);
        const imageId = initialImageId || images[0].id;
        store.setCurrentImage(imageId);
        loadImage(images.find((img) => img.id === imageId)?.url || "");
      }
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const updateStageSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    updateStageSize();
    window.addEventListener("resize", updateStageSize);
    return () => window.removeEventListener("resize", updateStageSize);
  }, []);

  // Fit image to screen
  const fitToScreen = useCallback(() => {
    if (!imageNode || !stageRef.current) return;
    
    const stage = stageRef.current;
    const stageWidth = stage.width();
    const stageHeight = stage.height();
    
    // Calculate scale to fit image in viewport with padding
    const padding = 40;
    const availableWidth = stageWidth - padding * 2;
    const availableHeight = stageHeight - padding * 2;
    
    const scaleX = availableWidth / imageNode.width;
    const scaleY = availableHeight / imageNode.height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
    
    // Center the image
    const scaledWidth = imageNode.width * scale;
    const scaledHeight = imageNode.height * scale;
    const translateX = (stageWidth - scaledWidth) / 2;
    const translateY = (stageHeight - scaledHeight) / 2;
    
    store.setScale(scale);
    store.setTranslate(translateX, translateY);
    toast.success("Image fitted to screen");
  }, [imageNode, store]);

  // Load image
  const loadImage = useCallback((url: string) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImageNode(img);
      // Fit image to stage after a brief delay to ensure stage is rendered
      setTimeout(() => {
        fitToScreen();
      }, 100);
    };
    img.onerror = () => {
      toast.error("Failed to load image");
    };
    img.src = url;
  }, [fitToScreen]);

  // Get annotations for current image
  const currentAnnotations = store.currentImageId
    ? store.getAnnotationsForImage(store.currentImageId)
    : [];

  // Snap to grid helper
  const snapToGrid = useCallback((value: number): number => {
    if (!store.snapToGrid) return value;
    return Math.round(value / store.gridSize) * store.gridSize;
  }, [store.snapToGrid, store.gridSize]);

  // Stage mouse events
  const handleStageMouseDown = useCallback((e: any) => {
    // Handle panning with space key
    if (store.isPanning || e.evt.key === " " || e.evt.code === "Space") {
      const stage = e.target.getStage();
      const pointerPos = stage.getPointerPosition();
      setPanStart({ x: pointerPos.x - store.translateX, y: pointerPos.y - store.translateY });
      store.setPanning(true);
      return;
    }

    // Ignore if clicking on transformer or image
    if (e.target === transformerRef.current || e.target === imageRef.current) {
      return;
    }

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    const { scale, translateX, translateY } = store;

    // Convert stage coordinates to image coordinates
    const imageX = snapToGrid((pointerPos.x - translateX) / scale);
    const imageY = snapToGrid((pointerPos.y - translateY) / scale);

    // Check if clicking on an annotation
    const clickedAnnotation = currentAnnotations.find((ann) => {
      return (
        imageX >= ann.x &&
        imageX <= ann.x + ann.width &&
        imageY >= ann.y &&
        imageY <= ann.y + ann.height
      );
    });

    if (e.evt.shiftKey) {
      // Marquee selection
      setMarqueeStart(pointerPos);
      setMarqueeEnd(pointerPos);
      if (!clickedAnnotation) {
        store.clearSelection();
      }
    } else if (clickedAnnotation) {
      // Select annotation (don't prevent dragging - Konva handles it)
      store.setSelected([clickedAnnotation.id]);
    } else {
      // Start drawing new rectangle
      store.clearSelection();
      setIsDrawing(true);
      setDrawStart({ x: imageX, y: imageY });
      setCurrentRect({ x: imageX, y: imageY, width: 0, height: 0 });
    }
  }, [store, currentAnnotations]);

  const handleStageMouseMove = useCallback((e: any) => {
    if (!stageRef.current) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    const { scale, translateX, translateY } = store;

    // Handle panning
    if (store.isPanning && panStart) {
      const newTranslateX = pointerPos.x - panStart.x;
      const newTranslateY = pointerPos.y - panStart.y;
      store.setTranslate(newTranslateX, newTranslateY);
      return;
    }

    const imageX = (pointerPos.x - translateX) / scale;
    const imageY = (pointerPos.y - translateY) / scale;

    // Update marquee
    if (marqueeStart) {
      setMarqueeEnd(pointerPos);
      
      // Select annotations within marquee
      const selected: string[] = [];
      currentAnnotations.forEach((ann) => {
        const annScreenX = ann.x * scale + translateX;
        const annScreenY = ann.y * scale + translateY;
        const annScreenWidth = ann.width * scale;
        const annScreenHeight = ann.height * scale;

        const x1 = Math.min(marqueeStart.x, pointerPos.x);
        const y1 = Math.min(marqueeStart.y, pointerPos.y);
        const x2 = Math.max(marqueeStart.x, pointerPos.x);
        const y2 = Math.max(marqueeStart.y, pointerPos.y);

        if (
          annScreenX >= x1 &&
          annScreenX + annScreenWidth <= x2 &&
          annScreenY >= y1 &&
          annScreenY + annScreenHeight <= y2
        ) {
          selected.push(ann.id);
        }
      });
      
      if (e.evt.shiftKey) {
        // Add to selection
        store.setSelected([...store.selectedIds, ...selected]);
      } else {
        store.setSelected(selected);
      }
    }

    // Update panning
    if (store.isPanning && panStart) {
      const newTranslateX = pointerPos.x - panStart.x;
      const newTranslateY = pointerPos.y - panStart.y;
      store.setTranslate(newTranslateX, newTranslateY);
      return;
    }

    // Update drawing rectangle
    if (isDrawing && drawStart) {
      const width = imageX - drawStart.x;
      const height = imageY - drawStart.y;
      setCurrentRect({
        x: width < 0 ? snapToGrid(imageX) : snapToGrid(drawStart.x),
        y: height < 0 ? snapToGrid(imageY) : snapToGrid(drawStart.y),
        width: Math.abs(snapToGrid(width)),
        height: Math.abs(snapToGrid(height)),
      });
    }

    // Dragging is now handled by Konva's onDragEnd, so we don't need this
  }, [store, marqueeStart, isDrawing, drawStart, currentAnnotations, imageNode, panStart, snapToGrid]);

  const handleStageMouseUp = useCallback(() => {
    // Finish drawing
    if (isDrawing && currentRect && currentRect.width > 10 && currentRect.height > 10) {
      const labelConfig = store.getActiveLabelConfig();
      store.addAnnotation({
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.width,
        height: currentRect.height,
        label: labelConfig?.name || "Column",
        color: labelConfig?.color || "#3b82f6",
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);
    setMarqueeStart(null);
    setMarqueeEnd(null);
    setPanStart(null);
    store.setPanning(false);
  }, [isDrawing, currentRect, store]);

  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current && store.selectedIds.length === 1) {
      const selectedId = store.selectedIds[0];
      const node = stageRef.current?.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    } else {
      transformerRef.current?.nodes([]);
    }
  }, [store.selectedIds]);

  // Handle transformer changes
  const handleTransformEnd = useCallback((e: any) => {
    const node = e.target;
    const id = node.id();
    const annotation = currentAnnotations.find((ann) => ann.id === id);
    if (!annotation || !imageNode) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    
    // Update annotation
    store.updateAnnotation(id, {
      x: Math.max(0, Math.min(imageNode.width - node.width() * scaleX, node.x())),
      y: Math.max(0, Math.min(imageNode.height - node.height() * scaleY, node.y())),
      width: Math.max(10, node.width() * scaleX),
      height: Math.max(10, node.height() * scaleY),
    });

    // Reset transform
    node.scaleX(1);
    node.scaleY(1);
  }, [store, currentAnnotations, imageNode]);

  // Keyboard shortcuts for labels (0-9)
  useHotkeys("0", () => store.setActiveLabel(DEFAULT_LABELS[0].id), { enabled: true });
  useHotkeys("1", () => store.setActiveLabel(DEFAULT_LABELS[1].id), { enabled: true });
  useHotkeys("2", () => store.setActiveLabel(DEFAULT_LABELS[2].id), { enabled: true });
  useHotkeys("3", () => store.setActiveLabel(DEFAULT_LABELS[3].id), { enabled: true });
  useHotkeys("4", () => store.setActiveLabel(DEFAULT_LABELS[4].id), { enabled: true });
  useHotkeys("5", () => store.setActiveLabel(DEFAULT_LABELS[5].id), { enabled: true });
  useHotkeys("6", () => store.setActiveLabel(DEFAULT_LABELS[6].id), { enabled: true });
  useHotkeys("7", () => store.setActiveLabel(DEFAULT_LABELS[7].id), { enabled: true });
  useHotkeys("8", () => store.setActiveLabel(DEFAULT_LABELS[8].id), { enabled: true });
  useHotkeys("9", () => store.setActiveLabel(DEFAULT_LABELS[9].id), { enabled: true });
  
  useHotkeys("delete", () => {
    if (store.selectedIds.length > 0) {
      store.deleteSelected();
      toast.success("Deleted selected annotations");
    }
  }, { enabled: true });

  useHotkeys("ctrl+c, cmd+c", (e) => {
    e.preventDefault();
    store.copySelected();
    toast.success("Copied to clipboard");
  }, { enabled: true });

  useHotkeys("ctrl+v, cmd+v", (e) => {
    e.preventDefault();
    if (store.canPaste()) {
      store.paste();
      toast.success("Pasted annotations");
    }
  }, { enabled: true });

  useHotkeys("ctrl+z, cmd+z", (e) => {
    e.preventDefault();
    if (store.canUndo()) {
      store.undo();
      toast.success("Undone");
    }
  }, { enabled: true });

  useHotkeys("ctrl+shift+z, cmd+shift+z", (e) => {
    e.preventDefault();
    if (store.canRedo()) {
      store.redo();
      toast.success("Redone");
    }
  }, { enabled: true });

  useHotkeys("ctrl+y, cmd+y", (e) => {
    e.preventDefault();
    if (store.canRedo()) {
      store.redo();
      toast.success("Redone");
    }
  }, { enabled: true });

  useHotkeys("space", (e) => {
    e.preventDefault();
    if (!store.isPanning) {
      store.setPanning(true);
    }
  }, { keydown: true });

  useHotkeys("space", () => {
    store.setPanning(false);
  }, { keyup: true });

  // Zoom handler
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    const container = containerRef.current;
    const { scale, translateX, translateY } = store;

    // Get current scroll position
    const scrollLeft = container?.scrollLeft || 0;
    const scrollTop = container?.scrollTop || 0;

    // Calculate mouse position in image coordinates
    // Account for both translate and scroll
    const mouseXToImage = (pointerPos.x + scrollLeft - translateX) / scale;
    const mouseYToImage = (pointerPos.y + scrollTop - translateY) / scale;

    const scaleBy = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * scaleBy));

    // Calculate new translate to keep zoom point under cursor
    const newTranslateX = pointerPos.x + scrollLeft - mouseXToImage * newScale;
    const newTranslateY = pointerPos.y + scrollTop - mouseYToImage * newScale;

    store.setScale(newScale);
    store.setTranslate(newTranslateX, newTranslateY);

    // Update scroll position to maintain view
    if (container) {
      requestAnimationFrame(() => {
        if (!container) return;
        // Adjust scroll to keep the zoomed content visible
        const newScrollLeft = Math.max(0, newTranslateX - stageSize.width / 2);
        const newScrollTop = Math.max(0, newTranslateY - stageSize.height / 2);
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;
      });
    }
  }, [store, stageSize]);

  // Handlers
  const handleUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const newImages: Array<{ id: string; name: string; url: string }> = [];
      
      Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageId = `uploaded-${Date.now()}-${index}`;
          const imageUrl = event.target?.result as string;
          
          newImages.push({
            id: imageId,
            name: file.name,
            url: imageUrl,
          });

          // Add to store
          store.addImage({
            id: imageId,
            name: file.name,
            url: imageUrl,
          });

          // If this is the first image, set it as current and load it
          if (index === 0) {
            store.setCurrentImage(imageId);
            loadImage(imageUrl);
            toast.success(`Loaded ${file.name}`);
          }
        };
        reader.onerror = () => {
          toast.error(`Failed to load ${file.name}`);
        };
        reader.readAsDataURL(file);
      });

      if (files.length > 1) {
        toast.success(`Uploaded ${files.length} images`);
      }
    };
    input.click();
  }, [store, loadImage]);

  const handleSave = useCallback(() => {
    const json = store.exportAnnotations();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annotations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Annotations exported");
  }, [store]);

  const handleUndo = useCallback(() => {
    if (store.canUndo()) {
      store.undo();
      toast.success("Undone");
    }
  }, [store]);

  const handleRedo = useCallback(() => {
    if (store.canRedo()) {
      store.redo();
      toast.success("Redone");
    }
  }, [store]);

  const handleDelete = useCallback(() => {
    if (store.selectedIds.length > 0) {
      store.deleteSelected();
      toast.success("Deleted selected annotations");
    }
  }, [store]);

  const handleNext = useCallback(() => {
    store.nextImage();
    const currentImage = store.images.find((img) => img.id === store.currentImageId);
    if (currentImage) {
      loadImage(currentImage.url);
    }
  }, [store, loadImage]);

  const handlePrevious = useCallback(() => {
    store.previousImage();
    const currentImage = store.images.find((img) => img.id === store.currentImageId);
    if (currentImage) {
      loadImage(currentImage.url);
    }
  }, [store, loadImage]);

  const handleCopy = useCallback(() => {
    store.copySelected();
    toast.success("Copied to clipboard");
  }, [store]);

  const handlePaste = useCallback(() => {
    if (store.canPaste()) {
      store.paste();
      toast.success("Pasted annotations");
    }
  }, [store]);

  const handleImageSelect = useCallback((imageId: string) => {
    store.setCurrentImage(imageId);
    const image = store.images.find((img) => img.id === imageId);
    if (image) {
      loadImage(image.url);
    }
  }, [store, loadImage]);

  const currentImage = store.images.find((img) => img.id === store.currentImageId);
  const activeLabelConfig = store.getActiveLabelConfig();

  return (
    <div className={cn("flex h-full w-full", className)}>
      {/* Sidebar */}
      <div className="w-64 bg-muted/50 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Images</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {store.images.map((image) => (
            <div
              key={image.id}
              onClick={() => handleImageSelect(image.id)}
              className={cn(
                "p-3 rounded cursor-pointer mb-2 transition-colors",
                store.currentImageId === image.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
            >
              <div className="font-medium text-sm">{image.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {store.getAnnotationsForImage(image.id).length} annotations
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="h-12 bg-muted border-b border-border flex items-center gap-2 px-4 shrink-0">
          <Button variant="outline" size="sm" onClick={handleUpload}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <div className="w-px h-6 bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!store.canUndo()}
          >
            <Undo2 className="h-4 w-4 mr-2" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={!store.canRedo()}
          >
            <Redo2 className="h-4 w-4 mr-2" />
            Redo
          </Button>
          <div className="w-px h-6 bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={store.selectedIds.length === 0}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePaste}
            disabled={!store.canPaste()}
          >
            <Clipboard className="h-4 w-4 mr-2" />
            Paste
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={store.selectedIds.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={store.images.length === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={store.images.length === 0}
          >
            <ChevronRight className="h-4 w-4 mr-2" />
            Next
          </Button>
          <div className="w-px h-6 bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={fitToScreen}
            disabled={!imageNode}
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Fit to Screen
          </Button>
        </div>

        {/* Canvas area - fixed viewport size, scrollable when content exceeds */}
        <div 
          ref={containerRef} 
          className="flex-1 relative bg-background scrollable-canvas"
          style={{
            width: "100%",
            height: "100%",
            overflowX: "auto",
            overflowY: "auto",
            position: "relative",
          }}
        >
          {/* Scrollable content area - grows to match scaled image size (like ImageAnnotator) */}
          <div
            style={{
              width: imageNode
                ? `${Math.max(imageNode.width * store.scale, containerRef.current?.clientWidth || stageSize.width)}px`
                : "100%",
              height: imageNode
                ? `${Math.max(imageNode.height * store.scale, containerRef.current?.clientHeight || stageSize.height)}px`
                : "100%",
              position: "relative",
              minWidth: "100%",
              minHeight: "100%",
            }}
          >
            {/* Stage - ALWAYS fixed at viewport size, positioned absolutely within scrollable area */}
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onWheel={handleWheel}
              style={{ 
                cursor: store.isPanning ? "grab" : "default",
                position: "absolute",
                top: 0,
                left: 0,
              }}
            >
            <Layer>
              {/* Background image */}
              {imageNode && (
                <KonvaImage
                  ref={imageRef}
                  image={imageNode}
                  x={store.translateX}
                  y={store.translateY}
                  scaleX={store.scale}
                  scaleY={store.scale}
                  listening={false}
                />
              )}

              {/* Annotations */}
              {currentAnnotations.map((ann) => (
                <React.Fragment key={ann.id}>
                  <Rect
                    id={ann.id}
                    x={ann.x * store.scale + store.translateX}
                    y={ann.y * store.scale + store.translateY}
                    width={ann.width * store.scale}
                    height={ann.height * store.scale}
                    fill="transparent"
                    stroke={ann.color}
                    strokeWidth={2}
                    draggable={true}
                    onMouseEnter={(e) => {
                      const container = e.target.getStage()?.container();
                      if (container) {
                        container.style.cursor = "move";
                        container.title = `${ann.label}: ${Math.round(ann.width)} × ${Math.round(ann.height)} px`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      const container = e.target.getStage()?.container();
                      if (container) {
                        container.style.cursor = "default";
                        container.title = "";
                      }
                    }}
                    onDragStart={(e) => {
                      // Store initial position for calculations
                      const node = e.target;
                      node.setAttr('startX', node.x());
                      node.setAttr('startY', node.y());
                    }}
                    onDragMove={(e) => {
                      // Update cursor during drag
                      const container = e.target.getStage()?.container();
                      if (container) {
                        container.style.cursor = "move";
                      }
                    }}
                    onDragEnd={(e) => {
                      if (!imageNode) return;
                      const node = e.target;
                      
                      // Calculate new position in image coordinates
                      const newX = Math.max(0, Math.min(
                        imageNode.width - ann.width,
                        (node.x() - store.translateX) / store.scale
                      ));
                      const newY = Math.max(0, Math.min(
                        imageNode.height - ann.height,
                        (node.y() - store.translateY) / store.scale
                      ));
                      
                      // Update annotation in store (this saves the position)
                      store.updateAnnotation(ann.id, { x: newX, y: newY });
                      
                      // Update node position to match the constrained position
                      node.position({
                        x: newX * store.scale + store.translateX,
                        y: newY * store.scale + store.translateY,
                      });
                      
                      // Reset cursor
                      const container = node.getStage()?.container();
                      if (container) {
                        container.style.cursor = "default";
                      }
                    }}
                  />
                  {/* Label text */}
                  <Text
                    x={ann.x * store.scale + store.translateX}
                    y={ann.y * store.scale + store.translateY - 20}
                    text={ann.label}
                    fontSize={14}
                    fill={ann.color}
                    fontStyle="bold"
                    padding={4}
                    fillEnabled={false}
                    stroke={ann.color}
                    strokeWidth={1}
                  />
                </React.Fragment>
              ))}

              {/* Current drawing rectangle */}
              {currentRect && (
                <Rect
                  x={currentRect.x * store.scale + store.translateX}
                  y={currentRect.y * store.scale + store.translateY}
                  width={currentRect.width * store.scale}
                  height={currentRect.height * store.scale}
                  fill="transparent"
                  stroke={activeLabelConfig?.color || "#3b82f6"}
                  strokeWidth={2}
                  dash={[5, 5]}
                />
              )}

              {/* Marquee selection */}
              {marqueeStart && marqueeEnd && (
                <Rect
                  x={Math.min(marqueeStart.x, marqueeEnd.x)}
                  y={Math.min(marqueeStart.y, marqueeEnd.y)}
                  width={Math.abs(marqueeEnd.x - marqueeStart.x)}
                  height={Math.abs(marqueeEnd.y - marqueeStart.y)}
                  fill="rgba(59, 130, 246, 0.1)"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth={1}
                  dash={[5, 5]}
                />
              )}

              {/* Transformer for resizing */}
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  // Limit resize to image bounds
                  if (!imageNode) return newBox;
                  const maxX = imageNode.width * store.scale + store.translateX;
                  const maxY = imageNode.height * store.scale + store.translateY;
                  return {
                    ...newBox,
                    x: Math.max(store.translateX, Math.min(maxX - newBox.width, newBox.x)),
                    y: Math.max(store.translateY, Math.min(maxY - newBox.height, newBox.y)),
                    width: Math.min(maxX - newBox.x, newBox.width),
                    height: Math.min(maxY - newBox.y, newBox.height),
                  };
                }}
                onTransformEnd={handleTransformEnd}
              />
            </Layer>
          </Stage>
          </div>
        </div>

        {/* Label selector and options */}
        <div className="h-auto min-h-12 bg-muted border-t border-border flex flex-wrap items-center gap-2 px-4 py-2 shrink-0">
          <Label className="text-sm font-medium w-full mb-1">Active Label (Press 0-9):</Label>
          <div className="flex flex-wrap gap-2 flex-1">
            {store.labels.map((label) => (
              <Button
                key={label.id}
                variant={store.activeLabel === label.id ? "default" : "outline"}
                size="sm"
                onClick={() => store.setActiveLabel(label.id)}
                style={{
                  borderColor: label.color,
                  backgroundColor: store.activeLabel === label.id ? label.color : undefined,
                  color: store.activeLabel === label.id ? "#ffffff" : undefined,
                }}
                title={label.name}
              >
                {label.name} ({label.shortcut})
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant={store.snapToGrid ? "default" : "outline"}
              size="sm"
              onClick={() => store.setSnapToGrid(!store.snapToGrid)}
            >
              <Grid3x3 className="h-4 w-4 mr-2" />
              Snap to Grid
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

