import { Mode } from "@/types/annotation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type LegendItem = {
  id: string;
  name: string;
  color: string;
  shortcut?: string;
};

interface LegendPanelProps {
  items: LegendItem[];
  mode: Mode;
  activeItemId?: string;
  onSelect?: (id: string) => void;
}

const MODE_COPY: Record<
  Mode,
  {
    title: string;
    description: string;
    accent: string;
  }
> = {
  viewport: {
    title: "Profile Legends",
    description: "Available viewport/profile regions",
    accent: "🖼️",
  },
  model: {
    title: "Model Legends",
    description: "Model annotations in this view",
    accent: "🧩",
  },
  ocr: {
    title: "OCR Legends",
    description: "Text extraction labels",
    accent: "🔤",
  },
};

export const LegendPanel = ({ items, mode, activeItemId, onSelect }: LegendPanelProps) => {
  const copy = MODE_COPY[mode];

  return (
    <aside
      className="bg-card border-l border-border/80 flex flex-col shrink-0"
      style={{ width: 256, minWidth: 256, maxWidth: 256 }}
    >
      <div className="px-4 py-3 border-b border-border/70 bg-muted/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legends</p>
        <div className="mt-1 text-sm font-medium text-foreground flex items-center gap-2">
          <span aria-hidden="true" className="text-base leading-none">
            {copy.accent}
          </span>
          <span>{copy.title}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{copy.description}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary",
                  onSelect ? "cursor-pointer" : "cursor-default",
                  isActive
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-transparent hover:bg-muted/60 text-foreground/90"
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm ring-1 ring-black/5"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{item.name}</span>
                {item.shortcut ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                    {item.shortcut}
                  </span>
                ) : null}
                {isActive ? (
                  <span className="text-[10px] font-medium text-primary">Active</span>
                ) : null}
              </button>
            );
          })}

          {items.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center rounded-md border border-dashed border-border/60 bg-muted/20">
              No legends available for this mode
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
};


