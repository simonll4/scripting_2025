export interface Detection {
    class: string;
    score: number;
    bbox: [number, number, number, number];
    ts: number;
    frame_url: string;
    track_id?: string;
    attributes?: Record<string, any>;
}
export interface Session {
    session_id: string;
    dev_id: string;
    stream_path: string;
    edge_start_ts: number;
    edge_end_ts?: number;
    playlist_url?: string;
    start_pdt?: string;
    end_pdt?: string;
    meta_url?: string;
    thumb_url?: string;
    thumb_ts?: string;
    classes: string[];
    created_at?: string;
}
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
export declare enum SessionState {
    IDLE = "IDLE",
    OPEN = "OPEN",
    ACTIVE = "ACTIVE",
    CLOSING = "CLOSING",
    CLOSED = "CLOSED"
}
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
export declare class SessionError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode?: number);
}
export declare class DetectionError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode?: number);
}
export declare const generateSessionId: () => string;
export declare const generateDetectionId: (sessionId: string, timestamp: number, className: string) => string;
export declare const parseToken: (token: string) => {
    class: string;
    attribute?: {
        key: string;
        value?: string;
    };
};
//# sourceMappingURL=types.d.ts.map