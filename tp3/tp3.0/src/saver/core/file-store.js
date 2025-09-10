/**
 * ============================================================================
 * FILE STORE - Camera System TP3.0
 * ============================================================================
 * Gestor de almacenamiento de archivos con organización por cámara/fecha
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("SAVER-FILE-STORE");

/**
 * Gestor de almacenamiento de archivos
 */
export class FileStore {
  constructor(config) {
    this.config = config;
    this.baseDir = config.OUT_DIR;
    this.organizeByCamera = config.ORGANIZE_BY_CAMERA !== false; // Default true
    this.organizeByDate = config.ORGANIZE_BY_DATE !== false;     // Default true
    
    this.stats = {
      totalFiles: 0,
      totalBytes: 0,
      duplicates: 0,
      errors: 0,
    };
  }

  /**
   * Inicializa el almacén (crea directorios base)
   */
  async initialize() {
    try {
      await this.ensureDirectory(this.baseDir);
      logger.info(`File store initialized: ${this.baseDir}`);
    } catch (error) {
      logger.error("Failed to initialize file store:", error);
      throw error;
    }
  }

  /**
   * Guarda una imagen con organización automática
   */
  async saveImage(message, imageBuffer) {
    try {
      const { cameraId, timestamp, format } = message;
      
      // Generar estructura de directorios
      const subdirs = this.generateSubdirectories(cameraId, timestamp);
      const fullDir = path.join(this.baseDir, ...subdirs);
      
      // Asegurar que el directorio existe
      await this.ensureDirectory(fullDir);
      
      // Generar nombre de archivo único
      const filename = this.generateFilename(timestamp, cameraId, format);
      const filepath = path.join(fullDir, filename);
      
      // Verificar duplicados
      const isDuplicate = await this.checkDuplicate(filepath, imageBuffer);
      if (isDuplicate) {
        this.stats.duplicates++;
        logger.debug(`Duplicate detected, skipping: ${filename}`);
        return {
          saved: false,
          reason: "duplicate",
          filepath,
          size: imageBuffer.length,
        };
      }
      
      // Guardar archivo
      await fs.writeFile(filepath, imageBuffer);
      
      // Actualizar estadísticas
      this.stats.totalFiles++;
      this.stats.totalBytes += imageBuffer.length;
      
      logger.debug(`Image saved: ${filepath} (${imageBuffer.length} bytes)`);
      
      return {
        saved: true,
        filepath,
        filename,
        size: imageBuffer.length,
        directory: fullDir,
      };
      
    } catch (error) {
      this.stats.errors++;
      logger.error("Failed to save image:", error);
      throw error;
    }
  }

  /**
   * Genera subdirectorios basados en configuración
   */
  generateSubdirectories(cameraId, timestamp) {
    const subdirs = [];
    
    if (this.organizeByCamera) {
      // Sanitizar cameraId para uso como directorio
      const safeCameraId = this.sanitizeForFilename(cameraId);
      subdirs.push(safeCameraId);
    }
    
    if (this.organizeByDate) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      subdirs.push(year.toString(), month, day);
    }
    
    return subdirs;
  }

  /**
   * Genera nombre de archivo único
   */
  generateFilename(timestamp, cameraId, format) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    
    const safeCameraId = this.sanitizeForFilename(cameraId);
    const extension = this.getExtensionFromFormat(format);
    
    return `${year}${month}${day}_${hour}${minute}${second}.${milliseconds}_${safeCameraId}${extension}`;
  }

  /**
   * Sanitiza string para uso como nombre de archivo/directorio
   */
  sanitizeForFilename(str) {
    return str
      .replace(/[^a-zA-Z0-9_-]/g, '_')  // Reemplazar caracteres especiales
      .replace(/_+/g, '_')              // Colapsar múltiples underscores
      .replace(/^_|_$/g, '')            // Remover underscores al inicio/final
      .substring(0, 50);                // Limitar longitud
  }

  /**
   * Obtiene extensión de archivo basada en formato
   */
  getExtensionFromFormat(format) {
    switch (format) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      default:
        return ".dat";
    }
  }

  /**
   * Verifica si el archivo es un duplicado
   */
  async checkDuplicate(filepath, newBuffer) {
    try {
      // Verificar si el archivo existe
      const existingBuffer = await fs.readFile(filepath);
      
      // Comparar contenido (hash MD5)
      const existingHash = crypto.createHash('md5').update(existingBuffer).digest('hex');
      const newHash = crypto.createHash('md5').update(newBuffer).digest('hex');
      
      return existingHash === newHash;
      
    } catch (error) {
      // Si no se puede leer (no existe), no es duplicado
      return false;
    }
  }

  /**
   * Asegura que un directorio existe
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
      logger.debug(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Limpia archivos antiguos (housekeeping)
   */
  async cleanupOldFiles(maxAgeMs) {
    try {
      const cutoffTime = Date.now() - maxAgeMs;
      let deletedCount = 0;
      let freedBytes = 0;

      const cleanup = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await cleanup(fullPath);
            
            // Intentar eliminar directorio si está vacío
            try {
              await fs.rmdir(fullPath);
              logger.debug(`Removed empty directory: ${fullPath}`);
            } catch (error) {
              // Ignorar si no está vacío
            }
          } else {
            const stats = await fs.stat(fullPath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(fullPath);
              deletedCount++;
              freedBytes += stats.size;
              logger.debug(`Deleted old file: ${fullPath}`);
            }
          }
        }
      };

      await cleanup(this.baseDir);
      
      logger.info(`Cleanup completed: ${deletedCount} files deleted, ${freedBytes} bytes freed`);
      return { deletedCount, freedBytes };
      
    } catch (error) {
      logger.error("Cleanup failed:", error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de uso de disco
   */
  async getDiskUsage() {
    try {
      let totalFiles = 0;
      let totalSize = 0;
      const dirSizes = {};

      const scan = async (dir, relativePath = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const entryRelativePath = path.join(relativePath, entry.name);
          
          if (entry.isDirectory()) {
            await scan(fullPath, entryRelativePath);
          } else {
            const stats = await fs.stat(fullPath);
            totalFiles++;
            totalSize += stats.size;
            
            // Agregar al directorio padre
            const parentDir = path.dirname(entryRelativePath) || '.';
            dirSizes[parentDir] = (dirSizes[parentDir] || 0) + stats.size;
          }
        }
      };

      await scan(this.baseDir);
      
      return {
        totalFiles,
        totalSize,
        dirSizes,
        averageFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0,
      };
      
    } catch (error) {
      logger.error("Failed to get disk usage:", error);
      return {
        totalFiles: 0,
        totalSize: 0,
        dirSizes: {},
        averageFileSize: 0,
      };
    }
  }

  /**
   * Obtiene estadísticas del file store
   */
  getStats() {
    return {
      ...this.stats,
      baseDir: this.baseDir,
      organizeByCamera: this.organizeByCamera,
      organizeByDate: this.organizeByDate,
    };
  }
}
