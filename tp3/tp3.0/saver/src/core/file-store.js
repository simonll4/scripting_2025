/**
 * ============================================================================
 * FILE STORE
 * ============================================================================
 * Gestor de almacenamiento de archivos con organización por cámara/fecha
 * - Nombre: <yyyyMMdd_HHmmss.SSS>.<ext>  (sin _cameraId)
 * - No clobber: evita sobrescrituras añadiendo sufijos -1, -2, ...
 * - Duplicados opcionales por MD5 (checkDuplicates)
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createLogger } from "../../../utils/logger.js";

const logger = createLogger("SAVER-FILE-STORE");

/**
 * Gestor de almacenamiento de archivos
 */
export class FileStore {
  constructor(config) {
    if (!config || !config.baseDir) {
      throw new Error("FileStore requires config with baseDir");
    }

    this.config = config;
    this.baseDir = config.baseDir;

    // Organización de carpetas (podés cambiarlo desde config.storage)
    this.organizeByCamera = config.organizeByCamera !== false; // default: true
    this.organizeByDate = config.organizeByDate === true; // default: false

    // Controles
    this.checkDuplicates = config.checkDuplicates !== false; // default: true
    this.maxFileSize = config.maxFileSize || 15 * 1024 * 1024; // 15 MB
    this.enableCompression = config.enableCompression || false; // placeholder

    // Métricas
    this.stats = {
      totalFiles: 0,
      totalBytes: 0,
      duplicates: 0,
      errors: 0,
    };
  }

  /**
   * Inicializa el almacén (crea directorio base)
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

      // Validaciones mínimas
      if (!cameraId || !timestamp || !format || !imageBuffer) {
        throw new Error("Missing required parameters for saveImage");
      }
      if (imageBuffer.length > this.maxFileSize) {
        throw new Error(
          `Image size (${imageBuffer.length}) exceeds maximum (${this.maxFileSize})`
        );
      }

      // Directorio destino (según config)
      const subdirs = this.generateSubdirectories(cameraId, timestamp);
      const fullDir = path.join(this.baseDir, ...subdirs);
      await this.ensureDirectory(fullDir);

      // Nombre base (sin sufijo ni colisiones)
      const baseFilename = this.generateFilename(timestamp, cameraId, format);
      const basePath = path.join(fullDir, baseFilename);

      // Estrategia:
      // 1) Si checkDuplicates y existe basePath, comparar MD5 y decidir.
      // 2) Si no es duplicado, encontrar nombre disponible con sufijos -1, -2, ...
      // 3) Escribir con flag 'wx' (no clobber). Si EEXIST por race, intentar siguiente sufijo.

      // Paso 1: Chequeo de duplicado en el nombre base (si existe)
      if (this.checkDuplicates && (await this.pathExists(basePath))) {
        const isDup = await this.compareWithExisting(basePath, imageBuffer);
        if (isDup) {
          this.stats.duplicates++;
          logger.debug(
            `Duplicate detected (base name), skipping: ${baseFilename}`
          );
          return {
            saved: false,
            isDuplicate: true,
            filepath: basePath,
            filename: baseFilename,
            size: imageBuffer.length,
          };
        }
      }

      // Paso 2: Encontrar nombre disponible (no clobber)
      const { filepath, filename } = await this.getAvailablePath(basePath);

      // Paso 3: Escribir con 'wx' (si por race existe, buscamos otro nombre y reintentamos)
      try {
        await fs.writeFile(filepath, imageBuffer, { flag: "wx" });
      } catch (err) {
        if (err && err.code === "EEXIST") {
          // Carrera: otra instancia escribió justo este nombre. Buscamos el siguiente y escribimos.
          const retry = await this.getAvailablePath(basePath);
          await fs.writeFile(retry.filepath, imageBuffer, { flag: "wx" });
          this.afterWrite(retry.filepath, imageBuffer.length);
          return {
            saved: true,
            isDuplicate: false,
            filepath: retry.filepath,
            filename: retry.filename,
            size: imageBuffer.length,
          };
        }
        throw err;
      }

      // OK
      this.afterWrite(filepath, imageBuffer.length);
      return {
        saved: true,
        isDuplicate: false,
        filepath,
        filename,
        size: imageBuffer.length,
      };
    } catch (error) {
      this.stats.errors++;
      logger.error("Failed to save image:", error.message);
      throw error;
    }
  }

  /**
   * Actualiza métricas y logging post-escritura
   */
  afterWrite(filepath, bytes) {
    this.stats.totalFiles++;
    this.stats.totalBytes += bytes;
    logger.debug(`Image saved: ${filepath} (${bytes} bytes)`);
  }

  /**
   * Genera subdirectorios según configuración
   * - Por defecto: solo <cameraId> (organizeByCamera = true, organizeByDate = false)
   * - Si organizeByDate = true: agrega /YYYY/MM/DD
   */
  generateSubdirectories(cameraId, timestamp) {
    const subdirs = [];

    if (this.organizeByCamera) {
      const safeCameraId = this.sanitizeForFilename(cameraId);
      subdirs.push(safeCameraId);
    }

    if (this.organizeByDate) {
      const d = new Date(timestamp);
      const yyyy = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      subdirs.push(String(yyyy), MM, dd);
    }

    return subdirs;
  }

  /**
   * Genera nombre de archivo: yyyyMMdd_HHmmss + extensión
   */
  generateFilename(timestamp, _cameraId, format) {
    const d = new Date(timestamp);
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ext = this.getExtensionFromFormat(format);

    return `${yyyy}${MM}${dd}_${HH}${mm}${ss}${ext}`;
  }

  /**
   * Obtiene extensión de archivo desde el mimetype
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
   * Sanitiza cadena para nombre de archivo/directorio
   */
  sanitizeForFilename(str) {
    return String(str)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 50);
  }

  /**
   * Devuelve true si la ruta existe
   */
  async pathExists(p) {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compara MD5 del archivo existente con el nuevo buffer
   * Devuelve true si son idénticos (duplicado)
   */
  async compareWithExisting(existingPath, newBuffer) {
    try {
      const existingBuffer = await fs.readFile(existingPath);
      const existingHash = crypto
        .createHash("md5")
        .update(existingBuffer)
        .digest("hex");
      const newHash = crypto.createHash("md5").update(newBuffer).digest("hex");
      return existingHash === newHash;
    } catch {
      // Si no se puede leer (no existe o error), asumimos que no es duplicado
      return false;
    }
  }

  /**
   * Busca un path disponible. Si base ya existe, itera con sufijos -1, -2, ...
   * Retorna { filepath, filename }
   */
  async getAvailablePath(basePath) {
    if (!(await this.pathExists(basePath))) {
      return { filepath: basePath, filename: path.basename(basePath) };
    }
    const { dir, name, ext } = path.parse(basePath);
    let i = 1;
    while (await this.pathExists(path.join(dir, `${name}-${i}${ext}`))) {
      i++;
    }
    const candidate = path.join(dir, `${name}-${i}${ext}`);
    return { filepath: candidate, filename: path.basename(candidate) };
  }

  /**
   * Asegura que un directorio exista
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      logger.debug(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Métricas actuales del file store
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
