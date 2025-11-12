import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}

export const ZoomControls = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: ZoomControlsProps) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-card backdrop-blur-md border border-border/80 rounded-lg px-2 py-1.5 shadow-lg ring-1 ring-black/5">
        <div className="px-2.5 py-1 text-sm font-mono font-semibold text-foreground min-w-[65px] text-center bg-muted/70 rounded">
          {Math.round(zoom * 100)}%
        </div>
        
        <div className="h-5 w-px bg-border/60 mx-0.5" />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-all duration-200 text-foreground bg-muted/40 hover:bg-muted/70 hover:text-foreground"
              onClick={onZoomOut}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4 stroke-[2]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-medium">
            <p>Zoom Out (-)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-all duration-200 text-foreground bg-muted/40 hover:bg-muted/70 hover:text-foreground"
              onClick={onZoomIn}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4 stroke-[2]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-medium">
            <p>Zoom In (+)</p>
          </TooltipContent>
        </Tooltip>

        <div className="h-5 w-px bg-border/60 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-all duration-200 text-foreground bg-muted/40 hover:bg-muted/70 hover:text-foreground"
              onClick={onFit}
              aria-label="Fit to screen"
            >
              <Maximize2 className="h-4 w-4 stroke-[2]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-medium">
            <p>Fit to Screen (F)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs font-mono font-semibold transition-all duration-200 text-foreground bg-muted/40 hover:bg-muted/70 hover:text-foreground"
              onClick={onReset}
              aria-label="Reset zoom"
            >
              100%
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-medium">
            <p>Reset Zoom (0)</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
