export type Annotation = {
  id: string;
  label?: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: number;
  updatedAt: number;
  parentId?: string; // ID of the Profile rectangle this annotation belongs to
  category?: "profile" | "model" | "ocr";
  ocrLabel?: string;
};

export type Tool = "select" | "rectangle";

export type Mode = "viewport" | "model" | "ocr";

export type Transform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type HistoryEntry = {
  annotations: Annotation[];
  timestamp: number;
};
