// Tipos base para detecciones
export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x0, y0, x1, y1] normalizadas
  ts: number; // timestamp en ms
  frame_url: string;
  track_id?: string;
  attributes?: Record<string, any>;
}

// Tipos para sesiones
export interface Session {
  session_id: string;
  dev_id: string;
  stream_path: string;
  edge_start_ts: number;
  edge_end_ts?: number;
  playlist_url?: string;
  start_pdt?: string; // ISO timestamp
  end_pdt?: string;
  meta_url?: string;
  thumb_url?: string;
  thumb_ts?: string;
  classes: string[];
  created_at?: string;
}

// Tipos para detecciones almacenadas
export interface StoredDetection {
  detection_id: string;
  session_id: string;
  first_ts: number;
  last_ts: number;
  class: string;
  score: number;
  frame_url: string;
  attributes: Record<string, any>;
}

// Eventos del Edge Agent
export interface SessionOpenEvent {
  session_id: string;
  dev_id: string;
  stream_path: string;
  edge_start_ts: number;
  thumb_url?: string;
  thumb_ts?: string;
  classes: string[];
}

export interface SessionCloseEvent {
  session_id: string;
  edge_end_ts: number;
  playlist_url?: string;
  start_pdt?: string;
  end_pdt?: string;
  meta_url?: string;
  thumb_url?: string;
  thumb_ts?: string;
}

export interface DetectionBatch {
  session_id: string;
  batch: Array<{
    first_ts: number;
    last_ts: number;
    class: string;
    score: number;
    frame_url: string;
    attributes: Record<string, any>;
  }>;
}

// Tipos para queries
export interface QueryRequest {
  existen?: string[];
  noExisten?: string[];
  limit?: number;
  offset?: number;
}

export interface QueryResponse {
  sessions: Session[];
  total?: number;
}

// Tipos para enriquecimiento de atributos
export interface EnrichRequest {
  detections: Array<{
    detection_id: string;
    frame_url: string;
    bbox: [number, number, number, number];
  }>;
}

export interface EnrichResponse {
  processed: number;
  updated: Array<{
    detection_id: string;
    attributes: Record<string, any>;
  }>;
}

// Tipos para anotaciones (meta.json)
export interface FrameAnnotation {
  ts: number;
  detections: Detection[];
  tracks?: Array<{
    track_id: string;
    bbox: [number, number, number, number];
  }>;
}

export interface SessionMetadata {
  session_id: string;
  frames: FrameAnnotation[];
}

// Estados del Edge Agent
export enum SessionState {
  IDLE = 'IDLE',
  OPEN = 'OPEN', 
  ACTIVE = 'ACTIVE',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED'
}

// Configuración del Edge Agent
export interface EdgeAgentConfig {
  device_path: string;
  frame_rate: number;
  video_size: string;
  confidence_threshold: number;
  classes_of_interest: string[];
  post_roll_ms: number;
  mediamtx_url: string;
  session_store_url: string;
  object_storage_base: string;
}

// Errores tipados
export class SessionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export class DetectionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'DetectionError';
  }
}

// Utilidades
export const generateSessionId = (): string => {
  const now = new Date();
  return `sess-${now.toISOString().replace(/[:.]/g, '').slice(0, -1)}Z`;
};

export const generateDetectionId = (
  sessionId: string,
  timestamp: number,
  className: string
): string => {
  return `${sessionId}:${timestamp}:${className}`;
};

export const parseToken = (token: string): { class: string; attribute?: { key: string; value?: string } } => {
  if (token.includes(':')) {
    const [className, attr] = token.split(':', 2);
    if (attr.includes('=')) {
      const [key, value] = attr.split('=', 2);
      return { class: className, attribute: { key, value } };
    }
    return { class: className, attribute: { key: attr } };
  }
  return { class: token };
};