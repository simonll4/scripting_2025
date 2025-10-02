import axios, { AxiosResponse } from 'axios';
import { 
  SessionOpenEvent, 
  SessionCloseEvent, 
  DetectionBatch,
  Session,
  retry
} from '@tpfinal/shared';
import { CONFIG } from '../config';

export class SessionStoreClient {
  private baseURL: string;

  constructor(baseURL: string = CONFIG.SESSION_STORE_URL) {
    this.baseURL = baseURL;
  }

  async openSession(sessionData: SessionOpenEvent): Promise<{ message: string; session_id: string; playlist_url?: string }> {
    return retry(async () => {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/api/sessions/open`,
        sessionData,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Session opened: ${sessionData.session_id}`);
      return response.data;
    }, 3, 1000);
  }

  async closeSession(closeData: SessionCloseEvent): Promise<{ message: string; session_id: string }> {
    return retry(async () => {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/api/sessions/close`,
        closeData,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Session closed: ${closeData.session_id}`);
      return response.data;
    }, 3, 1000);
  }

  async sendDetectionsBatch(batch: DetectionBatch): Promise<{ inserted: number; session_id: string }> {
    return retry(async () => {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/api/detections/batch`,
        batch,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Sent ${batch.batch.length} detections for session ${batch.session_id}`);
      return response.data;
    }, 3, 1000);
  }

  async getSession(sessionId: string): Promise<Session> {
    const response: AxiosResponse = await axios.get(
      `${this.baseURL}/api/sessions/${sessionId}`,
      { timeout: 5000 }
    );

    return response.data;
  }

  async updateSessionMetadata(sessionId: string, updates: Partial<SessionCloseEvent>): Promise<Session> {
    const response: AxiosResponse = await axios.patch(
      `${this.baseURL}/api/sessions/${sessionId}`,
      updates,
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.session;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response: AxiosResponse = await axios.get(
        `${this.baseURL}/api/health`,
        { timeout: 3000 }
      );
      
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      console.warn(`⚠️ Session Store health check failed:`, error);
      return false;
    }
  }

  // Enviar evento personalizado (para futuras extensiones)
  async sendEvent(eventType: string, sessionId: string, data: any): Promise<void> {
    await axios.post(
      `${this.baseURL}/api/events`,
      {
        event_type: eventType,
        session_id: sessionId,
        timestamp: Date.now(),
        data
      },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}