import { Request, Response } from 'express';
import { SessionModel } from '../models';
import { SessionOpenEvent, SessionCloseEvent } from '@tpfinal/shared';

export class SessionController {
  private sessionModel: SessionModel;

  constructor() {
    this.sessionModel = new SessionModel();
  }

  openSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionData: SessionOpenEvent = req.body;
      
      // Validación básica
      if (!sessionData.session_id || !sessionData.dev_id || !sessionData.stream_path) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['session_id', 'dev_id', 'stream_path', 'edge_start_ts']
        });
        return;
      }

      const session = await this.sessionModel.create(sessionData);
      
      res.status(201).json({
        message: 'session opened',
        session_id: session.session_id,
        playlist_url: session.playlist_url || null
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error opening session:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  closeSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const closeData: SessionCloseEvent = req.body;
      
      if (!closeData.session_id) {
        res.status(400).json({ error: 'session_id is required' });
        return;
      }

      const session = await this.sessionModel.update(closeData.session_id, closeData);
      
      res.status(200).json({
        message: 'session closed',
        session_id: session.session_id
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error closing session:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  query = async (req: Request, res: Response): Promise<void> => {
    try {
      const { existen, noExisten, limit, offset } = req.body;

      // Validación
      if ((!existen || existen.length === 0) && (!noExisten || noExisten.length === 0)) {
        // Si no hay filtros, devolver todas las sesiones
      }

      const result = await this.sessionModel.query({
        existen: existen || [],
        noExisten: noExisten || [],
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });

      res.status(200).json({
        sessions: result.sessions,
        total: result.total,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });
    } catch (error: any) {
      console.error('Error querying sessions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      const session = await this.sessionModel.findById(sessionId);
      
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.status(200).json(session);
    } catch (error: any) {
      console.error('Error getting session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateSessionMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const updates = req.body;

      const session = await this.sessionModel.update(sessionId, updates);
      
      res.status(200).json({
        message: 'session updated',
        session
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error updating session:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}