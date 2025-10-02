import fs from 'fs/promises';
import path from 'path';
import { ensureDirectoryExists } from '@tpfinal/shared';
import { CONFIG } from '../config';

export class ObjectStorageClient {
  private basePath: string;

  constructor(basePath: string = CONFIG.OBJECT_STORAGE_BASE) {
    this.basePath = basePath;
  }

  async saveFrame(sessionId: string, frameBuffer: Buffer, timestamp: number): Promise<string> {
    const sessionDir = path.join(this.basePath, sessionId);
    const framesDir = path.join(sessionDir, 'frames');
    
    // Asegurar que el directorio existe
    await ensureDirectoryExists(framesDir);

    // Nombre del archivo
    const filename = `frame_${timestamp}.jpg`;
    const filePath = path.join(framesDir, filename);

    // Guardar frame
    await fs.writeFile(filePath, frameBuffer);

    // Retornar URL relativa
    return `/${sessionId}/frames/${filename}`;
  }

  async saveThumb(sessionId: string, thumbBuffer: Buffer): Promise<string> {
    const sessionDir = path.join(this.basePath, sessionId);
    
    // Asegurar que el directorio existe
    await ensureDirectoryExists(sessionDir);

    const filePath = path.join(sessionDir, 'thumb.jpg');
    
    // Guardar thumbnail  
    await fs.writeFile(filePath, thumbBuffer);

    // Retornar URL relativa
    return `/${sessionId}/thumb.jpg`;
  }

  async saveMetadata(sessionId: string, metadata: any): Promise<string> {
    const sessionDir = path.join(this.basePath, sessionId);
    
    // Asegurar que el directorio existe
    await ensureDirectoryExists(sessionDir);

    const filePath = path.join(sessionDir, 'meta.json');
    
    // Guardar metadatos como JSON
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));

    // Guardar timestamp de actualización
    const tsFilePath = path.join(sessionDir, 'meta.ts');
    await fs.writeFile(tsFilePath, Date.now().toString());

    // Retornar URL relativa
    return `/${sessionId}/meta.json`;
  }

  async readFrame(sessionId: string, frameFilename: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, sessionId, 'frames', frameFilename);
    return await fs.readFile(filePath);
  }

  async readThumb(sessionId: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, sessionId, 'thumb.jpg');
    return await fs.readFile(filePath);
  }

  async readMetadata(sessionId: string): Promise<any> {
    const filePath = path.join(this.basePath, sessionId, 'meta.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async listFrames(sessionId: string): Promise<string[]> {
    const framesDir = path.join(this.basePath, sessionId, 'frames');
    
    try {
      const files = await fs.readdir(framesDir);
      return files.filter(file => file.endsWith('.jpg')).sort();
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    const sessionDir = path.join(this.basePath, sessionId);
    
    try {
      await fs.access(sessionDir);
      return true;
    } catch {
      return false;
    }
  }

  async getSessionStats(sessionId: string): Promise<{
    framesCount: number;
    hasThumb: boolean;
    hasMeta: boolean;
    totalSize: number;
  }> {
    const sessionDir = path.join(this.basePath, sessionId);
    
    let framesCount = 0;
    let hasThumb = false;
    let hasMeta = false;
    let totalSize = 0;

    try {
      // Contar frames
      const framesDir = path.join(sessionDir, 'frames');
      try {
        const frames = await fs.readdir(framesDir);
        framesCount = frames.filter(f => f.endsWith('.jpg')).length;
        
        // Calcular tamaño de frames
        for (const frame of frames) {
          const stats = await fs.stat(path.join(framesDir, frame));
          totalSize += stats.size;
        }
      } catch {
        // Directorio no existe
      }

      // Verificar thumb
      try {
        const thumbStats = await fs.stat(path.join(sessionDir, 'thumb.jpg'));
        hasThumb = true;
        totalSize += thumbStats.size;
      } catch {
        // Thumb no existe
      }

      // Verificar meta
      try {
        const metaStats = await fs.stat(path.join(sessionDir, 'meta.json'));
        hasMeta = true;
        totalSize += metaStats.size;
      } catch {
        // Meta no existe
      }

    } catch (error) {
      console.warn(`⚠️ Error getting session stats for ${sessionId}:`, error);
    }

    return { framesCount, hasThumb, hasMeta, totalSize };
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = path.join(this.basePath, sessionId);
    
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ Cleaned up session directory: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup session ${sessionId}:`, error);
      throw error;
    }
  }

  // Crear estructura de directorio para una nueva sesión
  async initializeSession(sessionId: string): Promise<void> {
    const sessionDir = path.join(this.basePath, sessionId);
    const framesDir = path.join(sessionDir, 'frames');
    
    await ensureDirectoryExists(framesDir);
  }

  getAbsolutePath(relativePath: string): string {
    // Remover slash inicial si existe
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return path.join(this.basePath, cleanPath);
  }

  getRelativeUrl(sessionId: string, filename: string): string {
    return `/${sessionId}/${filename}`;
  }
}