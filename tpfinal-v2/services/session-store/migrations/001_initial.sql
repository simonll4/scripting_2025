-- Crear la base de datos y esquemas iniciales
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    dev_id TEXT NOT NULL,
    stream_path TEXT NOT NULL,
    edge_start_ts BIGINT NOT NULL,
    edge_end_ts BIGINT,
    playlist_url TEXT,
    start_pdt TIMESTAMP WITH TIME ZONE,
    end_pdt TIMESTAMP WITH TIME ZONE,
    meta_url TEXT,
    thumb_url TEXT,
    thumb_ts TIMESTAMP WITH TIME ZONE,
    classes TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de detecciones
CREATE TABLE IF NOT EXISTS detections (
    detection_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    first_ts BIGINT NOT NULL,
    last_ts BIGINT NOT NULL,
    class TEXT NOT NULL,
    score REAL NOT NULL,
    frame_url TEXT NOT NULL,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_sessions_classes ON sessions USING GIN (classes);
CREATE INDEX IF NOT EXISTS idx_sessions_start_pdt ON sessions (start_pdt);
CREATE INDEX IF NOT EXISTS idx_sessions_dev_id ON sessions (dev_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at);

CREATE INDEX IF NOT EXISTS idx_detections_session_id ON detections (session_id);
CREATE INDEX IF NOT EXISTS idx_detections_class ON detections (class);
CREATE INDEX IF NOT EXISTS idx_detections_attributes ON detections USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_detections_first_ts ON detections (first_ts);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sessions_updated_at 
    BEFORE UPDATE ON sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_detections_updated_at 
    BEFORE UPDATE ON detections 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();