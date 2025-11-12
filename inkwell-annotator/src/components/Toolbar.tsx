import { MousePointer2, Square, Tag, RotateCcw, Download, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tool } from "@/types/annotation";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  onToggleLabels: () => void;
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  showLabels: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar = ({
  currentTool,
  onToolChange,
  onToggleLabels,
  onReset,
  onExport,
  onImport,
  onClear,
  showLabels,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) => {
  const tools: { id: Tool; icon: React.ReactNode; label: string; shortcut: string }[] = [
    { id: "select", icon: <MousePointer2 className="h-5 w-5" />, label: "Select", shortcut: "V" },
    { id: "rectangle", icon: <Square className="h-5 w-5" />, label: "Rectangle", shortcut: "R" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-1 p-2 bg-toolbar-bg rounded-lg border border-border">
        {/* Tools */}
        <div className="flex flex-col gap-1 pb-2 border-b border-border/50">
          {tools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-10 w-10 transition-colors",
                    currentTool === tool.id
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => onToolChange(tool.id)}
                  aria-label={tool.label}
                >
                  {tool.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{tool.label} ({tool.shortcut})</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 py-2 border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 transition-colors",
                  showLabels 
                    ? "bg-muted text-foreground" 
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
                onClick={onToggleLabels}
                aria-label="Toggle labels"
              >
                <Tag className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Toggle Labels</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 transition-colors text-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={onReset}
                aria-label="Reset view"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Reset View (0)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* File operations */}
        <div className="flex flex-col gap-1 py-2 border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 transition-colors text-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={onExport}
                aria-label="Export annotations"
              >
                <Download className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Export JSON</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 transition-colors text-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={onImport}
                aria-label="Import annotations"
              >
                <Upload className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Import JSON</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 transition-colors text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                onClick={onClear}
                aria-label="Clear all"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Clear All</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Undo/Redo */}
        <div className="flex flex-col gap-1 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 transition-colors",
                  canUndo 
                    ? "text-foreground/70 hover:bg-muted hover:text-foreground" 
                    : "text-foreground/30 cursor-not-allowed"
                )}
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo"
              >
                <span className="text-sm font-medium">↶</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 transition-colors",
                  canRedo 
                    ? "text-foreground/70 hover:bg-muted hover:text-foreground" 
                    : "text-foreground/30 cursor-not-allowed"
                )}
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo"
              >
                <span className="text-sm font-medium">↷</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Redo (Ctrl+Shift+Z / Ctrl+Y)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};
