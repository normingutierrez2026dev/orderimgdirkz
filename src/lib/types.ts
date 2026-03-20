import type { ExifData } from "./exif";

export interface ImageItem {
  id: string;
  url: string;
  name: string;
  timestamp: Date;
  reason?: string;
  scene?: string;
  confidence?: number;
  exif?: ExifData | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

export type Stage = "before" | "process" | "after";

export const stageLabels: Record<Stage, string> = {
  before: "Antes",
  process: "Proceso",
  after: "Después",
};

export const sceneLabels: Record<string, string> = {
  interior_walls: "Muros interiores",
  interior_ceiling: "Techos",
  interior_floor: "Pisos",
  exterior_roof: "Techos exteriores",
  exterior_facade: "Fachadas",
  exterior_pavement: "Pavimentos",
  other: "Otro",
};
