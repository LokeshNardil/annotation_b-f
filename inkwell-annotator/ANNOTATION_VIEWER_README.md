# AnnotationViewer Component

A React component for annotating images with rectangular annotations, built with react-konva, Zustand, and TypeScript.

## Features

- ✅ **Rectangular annotations only** - Click + drag to create rectangles
- ✅ **Draggable and resizable** - Transform annotations with handles
- ✅ **Labeled annotations** - Color-coded labels (ELEVATION, VALUE, NOTE, etc.)
- ✅ **Keyboard shortcuts** - Press 1, 2, 3, 4, 5 to switch labels
- ✅ **Single and multi-selection** - Click to select, Shift+drag for marquee
- ✅ **Copy/Paste** - Ctrl/Cmd+C and Ctrl/Cmd+V
- ✅ **Undo/Redo** - Time-travel with Zustand snapshots (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
- ✅ **Delete** - Delete key to remove selected annotations
- ✅ **Zoom and Pan** - Mouse wheel to zoom, Space+drag to pan
- ✅ **Save/Load** - Export annotations as JSON per image
- ✅ **Image navigation** - Sidebar with image list, Next/Previous buttons
- ✅ **Snap to Grid** - Optional grid snapping for precise alignment

## Installation

```bash
npm install react-konva konva react-hotkeys-hook zustand
```

## Usage

### Basic Example

```tsx
import { AnnotationViewer } from "@/components/AnnotationViewer";

const images = [
  {
    id: "1",
    name: "Shear Wall Elevation",
    url: "/path/to/image1.jpg",
  },
  {
    id: "2",
    name: "Foundation Plan",
    url: "/path/to/image2.jpg",
  },
  {
    id: "3",
    name: "Detail Section",
    url: "/path/to/image3.jpg",
  },
];

function App() {
  return (
    <div className="h-screen w-screen">
      <AnnotationViewer 
        images={images}
        initialImageId="1"
      />
    </div>
  );
}
```

### With Custom Labels

```tsx
import { useAnnotationStore } from "@/store/useAnnotationStore";

// After mounting, you can add custom labels
const store = useAnnotationStore();

useEffect(() => {
  store.addLabel({
    id: "custom1",
    name: "CUSTOM_LABEL",
    color: "rgb(255, 0, 0)",
    shortcut: "6",
  });
}, []);
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `1`, `2`, `3`, `4`, `5` | Switch active label |
| `Delete` | Delete selected annotations |
| `Ctrl/Cmd + C` | Copy selected annotations |
| `Ctrl/Cmd + V` | Paste annotations |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Space` (hold) | Enable pan mode |
| `Mouse Wheel` | Zoom in/out |

## Component Props

```typescript
interface AnnotationViewerProps {
  images: Array<{
    id: string;
    name: string;
    url: string;
    thumbnail?: string;
  }>;
  initialImageId?: string;
  className?: string;
  width?: number;  // Default: 1200
  height?: number; // Default: 800
}
```

## Store API

The component uses a Zustand store (`useAnnotationStore`) with the following key methods:

### Image Management
- `setCurrentImage(imageId: string)` - Switch to a different image
- `nextImage()` - Navigate to next image
- `previousImage()` - Navigate to previous image
- `addImage(image: ImageItem)` - Add new image to list

### Annotation Operations
- `addAnnotation(annotation)` - Create new annotation
- `updateAnnotation(id, updates)` - Update existing annotation
- `deleteAnnotation(id)` - Delete annotation
- `deleteSelected()` - Delete all selected annotations

### Selection
- `setSelected(ids: string[])` - Set selection
- `toggleSelected(id: string)` - Toggle annotation selection
- `clearSelection()` - Clear selection

### Labels
- `setActiveLabel(labelId: string)` - Set active label
- `getActiveLabelConfig()` - Get current label config
- `addLabel(label: LabelConfig)` - Add custom label

### History
- `undo()` - Undo last action
- `redo()` - Redo last action
- `canUndo()` - Check if undo is available
- `canRedo()` - Check if redo is available

### Clipboard
- `copySelected()` - Copy selected to clipboard
- `paste()` - Paste from clipboard
- `canPaste()` - Check if clipboard has content

### Export/Import
- `exportAnnotations(imageId?)` - Export as JSON string
- `importAnnotations(json, imageId)` - Import from JSON
- `clearAnnotations(imageId?)` - Clear all annotations

## Annotation Format

```typescript
interface Annotation {
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
```

## Export Format

```json
{
  "imageId": "1",
  "imageName": "Shear Wall Elevation",
  "annotations": [
    {
      "id": "ann-1234567890-abc123",
      "x": 100,
      "y": 200,
      "width": 150,
      "height": 80,
      "label": "ELEVATION",
      "color": "rgb(59, 130, 246)",
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000
    }
  ],
  "exportedAt": "2024-01-01T00:00:00.000Z"
}
```

## File Structure

```
src/
  components/
    AnnotationViewer.tsx    # Main component
  store/
    useAnnotationStore.ts    # Zustand store
```

## Dependencies

- `react` (^18.3.1)
- `react-konva` (for canvas rendering)
- `konva` (canvas library)
- `zustand` (state management)
- `react-hotkeys-hook` (keyboard shortcuts)
- `tailwindcss` (styling)
- `lucide-react` (icons)
- `sonner` (toast notifications)

## Notes

- The component automatically saves snapshots for undo/redo (max 50 entries)
- Annotations are stored per image in the store
- The stage automatically resizes to fit its container
- Images are loaded asynchronously and fitted to the stage on load
- Transformer handles are only shown for single selection
- Pan mode is activated by holding Space key
- Snap to grid can be toggled via the UI button

## Optional Features

- **Snap-to-grid toggle** ✅ - Available in UI
- **Show annotation area** - Tooltip shows dimensions (w×h) ✅
- **Keyboard shortcut to toggle pan mode** ✅ - Space key


