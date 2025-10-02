import { db } from '../database';
import { StoredDetection, DetectionBatch, DetectionError, generateDetectionId } from '@tpfinal/shared';

export class DetectionModel {

  async createBatch(batch: DetectionBatch): Promise<number> {
    if (!batch.batch || batch.batch.length === 0) {
      return 0;
    }

    const query = `
      INSERT INTO detections (
        detection_id, session_id, first_ts, last_ts, 
        class, score, frame_url, attributes
      ) VALUES ${batch.batch.map((_, i) => {
        const base = i * 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
      }).join(', ')}
      ON CONFLICT (detection_id) DO UPDATE SET
        last_ts = EXCLUDED.last_ts,
        score = EXCLUDED.score,
        frame_url = EXCLUDED.frame_url,
        attributes = EXCLUDED.attributes,
        updated_at = CURRENT_TIMESTAMP
    `;

    const values: any[] = [];
    
    for (const detection of batch.batch) {
      const detectionId = generateDetectionId(
        batch.session_id, 
        detection.first_ts, 
        detection.class
      );
      
      values.push(
        detectionId,
        batch.session_id,
        detection.first_ts,
        detection.last_ts,
        detection.class,
        detection.score,
        detection.frame_url,
        JSON.stringify(detection.attributes || {})
      );
    }

    try {
      await db.query(query, values);
      return batch.batch.length;
    } catch (error) {
      console.error('Error inserting detection batch:', error);
      throw new DetectionError('BATCH_INSERT_FAILED', 'Failed to insert detection batch');
    }
  }

  async findById(detectionId: string): Promise<StoredDetection | null> {
    const query = 'SELECT * FROM detections WHERE detection_id = $1';
    const result = await db.query(query, [detectionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToDetection(result.rows[0]);
  }

  async updateAttributes(detectionId: string, attributes: Record<string, any>): Promise<StoredDetection> {
    const detection = await this.findById(detectionId);
    if (!detection) {
      throw new DetectionError('DETECTION_NOT_FOUND', `Detection ${detectionId} not found`, 404);
    }

    const mergedAttributes = { ...detection.attributes, ...attributes };
    
    const query = `
      UPDATE detections 
      SET attributes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE detection_id = $1
      RETURNING *
    `;

    const result = await db.query(query, [detectionId, JSON.stringify(mergedAttributes)]);
    return this.mapRowToDetection(result.rows[0]);
  }

  async findBySession(sessionId: string): Promise<StoredDetection[]> {
    const query = `
      SELECT * FROM detections 
      WHERE session_id = $1 
      ORDER BY first_ts ASC
    `;
    
    const result = await db.query(query, [sessionId]);
    return result.rows.map((row: any) => this.mapRowToDetection(row));
  }

  async findByClass(className: string, limit: number = 100): Promise<StoredDetection[]> {
    const query = `
      SELECT * FROM detections 
      WHERE class = $1 
      ORDER BY first_ts DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [className, limit]);
    return result.rows.map((row: any) => this.mapRowToDetection(row));
  }

  async findByAttributes(attributes: Record<string, any>, limit: number = 100): Promise<StoredDetection[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(attributes)) {
      conditions.push(`attributes->>$${paramCount} = $${paramCount + 1}`);
      values.push(key, value);
      paramCount += 2;
    }

    const query = `
      SELECT * FROM detections 
      WHERE ${conditions.join(' AND ')}
      ORDER BY first_ts DESC
      LIMIT $${paramCount}
    `;

    const result = await db.query(query, [...values, limit]);
    return result.rows.map((row: any) => this.mapRowToDetection(row));
  }

  async getStats(sessionId?: string): Promise<{
    total: number;
    byClass: Record<string, number>;
    byScore: { min: number; max: number; avg: number };
  }> {
    let whereClause = '';
    const values: any[] = [];
    
    if (sessionId) {
      whereClause = 'WHERE session_id = $1';
      values.push(sessionId);
    }

    // Total y stats por clase
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        MIN(score) as min_score,
        MAX(score) as max_score,
        AVG(score) as avg_score
      FROM detections ${whereClause}
    `;

    const classStatsQuery = `
      SELECT class, COUNT(*) as count
      FROM detections ${whereClause}
      GROUP BY class
      ORDER BY count DESC
    `;

    const [statsResult, classStatsResult] = await Promise.all([
      db.query(statsQuery, values),
      db.query(classStatsQuery, values)
    ]);

    const stats = statsResult.rows[0];
    const byClass: Record<string, number> = {};
    
    for (const row of classStatsResult.rows) {
      byClass[row.class] = parseInt(row.count);
    }

    return {
      total: parseInt(stats.total),
      byClass,
      byScore: {
        min: parseFloat(stats.min_score) || 0,
        max: parseFloat(stats.max_score) || 0,
        avg: parseFloat(stats.avg_score) || 0
      }
    };
  }

  private mapRowToDetection(row: any): StoredDetection {
    return {
      detection_id: row.detection_id,
      session_id: row.session_id,
      first_ts: parseInt(row.first_ts),
      last_ts: parseInt(row.last_ts),
      class: row.class,
      score: parseFloat(row.score),
      frame_url: row.frame_url,
      attributes: typeof row.attributes === 'string' 
        ? JSON.parse(row.attributes) 
        : row.attributes || {}
    };
  }
}