import { Request, Response } from 'express';
import { DetectionModel, SessionModel } from '../models';
import { DetectionBatch } from '@tpfinal/shared';

export class DetectionController {
  private detectionModel: DetectionModel;
  private sessionModel: SessionModel;

  constructor() {
    this.detectionModel = new DetectionModel();
    this.sessionModel = new SessionModel();
  }

  createBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const batchData: DetectionBatch = req.body;
      
      // Validación básica
      if (!batchData.session_id || !batchData.batch || !Array.isArray(batchData.batch)) {
        res.status(400).json({
          error: 'Invalid batch data',
          required: 'session_id and batch array'
        });
        return;
      }

      // Verificar que la sesión existe
      const session = await this.sessionModel.findById(batchData.session_id);
      if (!session) {
        res.status(400).json({ error: 'Session not found' });
        return;
      }

      // Insertar detecciones
      const inserted = await this.detectionModel.createBatch(batchData);

      // Actualizar clases en la sesión
      const uniqueClasses = [...new Set(batchData.batch.map(d => d.class))];
      for (const className of uniqueClasses) {
        await this.sessionModel.addDetectedClass(batchData.session_id, className);
      }

      res.status(202).json({
        inserted,
        session_id: batchData.session_id
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error creating detection batch:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  getDetection = async (req: Request, res: Response): Promise<void> => {
    try {
      const { detectionId } = req.params;
      
      const detection = await this.detectionModel.findById(detectionId);
      
      if (!detection) {
        res.status(404).json({ error: 'Detection not found' });
        return;
      }

      res.status(200).json(detection);
    } catch (error: any) {
      console.error('Error getting detection:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateAttributes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { detectionId } = req.params;
      const { attributes } = req.body;

      if (!attributes || typeof attributes !== 'object') {
        res.status(400).json({ error: 'attributes object is required' });
        return;
      }

      const detection = await this.detectionModel.updateAttributes(detectionId, attributes);
      
      res.status(200).json({
        message: 'attributes updated',
        detection
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error updating detection attributes:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  getSessionDetections = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      const detections = await this.detectionModel.findBySession(sessionId);
      
      res.status(200).json({
        session_id: sessionId,
        detections,
        count: detections.length
      });
    } catch (error: any) {
      console.error('Error getting session detections:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getDetectionStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.query;
      
      const stats = await this.detectionModel.getStats(sessionId as string);
      
      res.status(200).json(stats);
    } catch (error: any) {
      console.error('Error getting detection stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}