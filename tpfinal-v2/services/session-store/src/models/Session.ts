import { db } from '../database';
import { Session, SessionOpenEvent, SessionCloseEvent, SessionError } from '@tpfinal/shared';

export class SessionModel {
  
  async create(sessionData: SessionOpenEvent): Promise<Session> {
    const query = `
      INSERT INTO sessions (
        session_id, dev_id, stream_path, edge_start_ts, 
        thumb_url, thumb_ts, classes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [
      sessionData.session_id,
      sessionData.dev_id,
      sessionData.stream_path,
      sessionData.edge_start_ts,
      sessionData.thumb_url || null,
      sessionData.thumb_ts || null,
      sessionData.classes || []
    ];

    try {
      const result = await db.query(query, values);
      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      if ((error as any).code === '23505') { // Unique violation
        throw new SessionError('SESSION_EXISTS', `Session ${sessionData.session_id} already exists`, 409);
      }
      throw error;
    }
  }

  async findById(sessionId: string): Promise<Session | null> {
    const query = 'SELECT * FROM sessions WHERE session_id = $1';
    const result = await db.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToSession(result.rows[0]);
  }

  async update(sessionId: string, updates: Partial<SessionCloseEvent>): Promise<Session> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new SessionError('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.edge_end_ts !== undefined) {
      fields.push(`edge_end_ts = $${paramCount++}`);
      values.push(updates.edge_end_ts);
    }

    if (updates.playlist_url !== undefined) {
      fields.push(`playlist_url = $${paramCount++}`);
      values.push(updates.playlist_url);
    }

    if (updates.start_pdt !== undefined) {
      fields.push(`start_pdt = $${paramCount++}`);
      values.push(updates.start_pdt);
    }

    if (updates.end_pdt !== undefined) {
      fields.push(`end_pdt = $${paramCount++}`);
      values.push(updates.end_pdt);
    }

    if (updates.meta_url !== undefined) {
      fields.push(`meta_url = $${paramCount++}`);
      values.push(updates.meta_url);
    }

    if (updates.thumb_url !== undefined) {
      fields.push(`thumb_url = $${paramCount++}`);
      values.push(updates.thumb_url);
    }

    if (updates.thumb_ts !== undefined) {
      fields.push(`thumb_ts = $${paramCount++}`);
      values.push(updates.thumb_ts);
    }

    if (fields.length === 0) {
      return session; // No hay cambios
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(sessionId);

    const query = `
      UPDATE sessions 
      SET ${fields.join(', ')}
      WHERE session_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return this.mapRowToSession(result.rows[0]);
  }

  async addDetectedClass(sessionId: string, className: string): Promise<void> {
    const query = `
      UPDATE sessions 
      SET classes = array_append(classes, $2)
      WHERE session_id = $1 
      AND NOT ($2 = ANY(classes))
    `;
    
    await db.query(query, [sessionId, className]);
  }

  async query(filters: {
    existen?: string[];
    noExisten?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: Session[]; total: number }> {
    
    let baseQuery = `
      FROM sessions s
      WHERE 1=1
    `;
    
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Procesar filtros "existen"
    if (filters.existen && filters.existen.length > 0) {
      const existConditions = filters.existen.map(token => {
        const { class: className, attribute } = this.parseToken(token);
        
        if (!attribute) {
          // Solo clase
          const condition = `EXISTS (
            SELECT 1 FROM detections d 
            WHERE d.session_id = s.session_id 
            AND d.class = $${paramCount}
          )`;
          values.push(className);
          paramCount++;
          return condition;
        } else {
          // Clase + atributo
          const condition = `EXISTS (
            SELECT 1 FROM detections d 
            WHERE d.session_id = s.session_id 
            AND d.class = $${paramCount}
            AND d.attributes->>$${paramCount + 1} ${attribute.value ? `= $${paramCount + 2}` : 'IS NOT NULL'}
          )`;
          values.push(className, attribute.key);
          paramCount += 2;
          if (attribute.value) {
            values.push(attribute.value);
            paramCount++;
          }
          return condition;
        }
      });
      
      conditions.push(`(${existConditions.join(' AND ')})`);
    }

    // Procesar filtros "noExisten"
    if (filters.noExisten && filters.noExisten.length > 0) {
      const notExistConditions = filters.noExisten.map(token => {
        const { class: className, attribute } = this.parseToken(token);
        
        if (!attribute) {
          const condition = `NOT EXISTS (
            SELECT 1 FROM detections d 
            WHERE d.session_id = s.session_id 
            AND d.class = $${paramCount}
          )`;
          values.push(className);
          paramCount++;
          return condition;
        } else {
          const condition = `NOT EXISTS (
            SELECT 1 FROM detections d 
            WHERE d.session_id = s.session_id 
            AND d.class = $${paramCount}
            AND d.attributes->>$${paramCount + 1} ${attribute.value ? `= $${paramCount + 2}` : 'IS NOT NULL'}
          )`;
          values.push(className, attribute.key);
          paramCount += 2;
          if (attribute.value) {
            values.push(attribute.value);
            paramCount++;
          }
          return condition;
        }
      });
      
      conditions.push(`(${notExistConditions.join(' AND ')})`);
    }

    if (conditions.length > 0) {
      baseQuery += ` AND ${conditions.join(' AND ')}`;
    }

    // Contar total
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Consulta principal con paginación
    const limit = Math.min(filters.limit || 50, 1000);
    const offset = filters.offset || 0;
    
    const selectQuery = `
      SELECT * ${baseQuery}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const result = await db.query(selectQuery, [...values, limit, offset]);
    const sessions = result.rows.map((row: any) => this.mapRowToSession(row));

    return { sessions, total };
  }

  private parseToken(token: string): { class: string; attribute?: { key: string; value?: string } } {
    if (token.includes(':')) {
      const [className, attr] = token.split(':', 2);
      if (attr.includes('=')) {
        const [key, value] = attr.split('=', 2);
        return { class: className, attribute: { key, value } };
      }
      return { class: className, attribute: { key: attr } };
    }
    return { class: token };
  }

  private mapRowToSession(row: any): Session {
    return {
      session_id: row.session_id,
      dev_id: row.dev_id,
      stream_path: row.stream_path,
      edge_start_ts: parseInt(row.edge_start_ts),
      edge_end_ts: row.edge_end_ts ? parseInt(row.edge_end_ts) : undefined,
      playlist_url: row.playlist_url,
      start_pdt: row.start_pdt ? row.start_pdt.toISOString() : undefined,
      end_pdt: row.end_pdt ? row.end_pdt.toISOString() : undefined,
      meta_url: row.meta_url,
      thumb_url: row.thumb_url,
      thumb_ts: row.thumb_ts ? row.thumb_ts.toISOString() : undefined,
      classes: row.classes || [],
      created_at: row.created_at.toISOString()
    };
  }
}