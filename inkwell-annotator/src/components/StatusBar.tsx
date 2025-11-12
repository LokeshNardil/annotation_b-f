import { Mode } from "@/types/annotation";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  mousePos: { imageX: number; imageY: number };
  currentTool: string;
  currentMode: Mode;
  annotationCount: number;
  selectedCount: number;
  imageWidth?: number;
  imageHeight?: number;
  scale?: number;
}

export const StatusBar = ({
  mousePos,
  currentTool,
  currentMode,
  annotationCount,
  selectedCount,
  imageWidth,
  imageHeight,
  scale,
}: StatusBarProps) => {
  const scaledWidth = imageWidth && scale ? (imageWidth * scale).toFixed(2) : imageWidth?.toFixed(2);
  const scaledHeight = imageHeight && scale ? (imageHeight * scale).toFixed(2) : imageHeight?.toFixed(2);
  
  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-[hsl(var(--toolbar-bg))] border-t border-border/80 text-sm text-foreground/80 shrink-0 shadow-[0_-1px_4px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Position:</span>
          <span className="font-mono font-medium text-foreground">
            X: {Math.round(mousePos.imageX)} Y: {Math.round(mousePos.imageY)}
          </span>
        </div>
        <div className="h-4 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Mode:</span>
          <span className={cn(
            "font-medium px-2 py-0.5 rounded text-xs",
            currentMode === "viewport" && "bg-blue-500/20 text-blue-400",
            currentMode === "model" && "bg-green-500/20 text-green-400",
            currentMode === "ocr" && "bg-orange-500/20 text-orange-400"
          )}>
            {currentMode === "viewport" && "Profile"}
            {currentMode === "model" && "Model"}
            {currentMode === "ocr" && "OCR"}
          </span>
        </div>
        <div className="h-4 w-px bg-border/60" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Tool:</span>
          <span className="font-medium text-foreground capitalize">{currentTool}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-5">
        {scaledWidth && scaledHeight && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Size:</span>
              <span className="font-mono font-medium text-foreground">
                {scaledWidth} × {scaledHeight} px
              </span>
            </div>
            <div className="h-4 w-px bg-border/60" />
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Annotations:</span>
          <span className="font-medium text-foreground">{annotationCount}</span>
        </div>
        {selectedCount > 0 && (
          <>
            <div className="h-4 w-px bg-border/60" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Selected:</span>
              <span className="font-medium text-primary">{selectedCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
