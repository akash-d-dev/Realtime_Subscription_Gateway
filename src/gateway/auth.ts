import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthContext } from '../types';

class FirebaseAuth {
  private app: App;
  private auth: Auth;

  constructor() {
    try {
      this.app = initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
          clientEmail: config.firebase.clientEmail,
        }),
      });
      this.auth = getAuth(this.app);
      logger.info('Firebase Admin initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin:', error);
      throw error;
    }
  }

  async verifyToken(token: string): Promise<AuthContext | null> {
    try {
      const decodedToken = await this.auth.verifyIdToken(token);
      
      return {
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        permissions: decodedToken.permissions || [],
      };
    } catch (error) {
      logger.error('Token verification failed:', error);
      return null;
    }
  }

  async verifySessionCookie(sessionCookie: string): Promise<AuthContext | null> {
    try {
      const decodedClaims = await this.auth.verifySessionCookie(sessionCookie, true);
      
      return {
        userId: decodedClaims.uid,
        email: decodedClaims.email || '',
        permissions: decodedClaims.permissions || [],
      };
    } catch (error) {
      logger.error('Session cookie verification failed:', error);
      return null;
    }
  }

  async checkTopicAccess(userId: string, topicId: string): Promise<boolean> {
    // Import here to avoid circular dependencies
    const { topicAccessControl } = await import('../firebase/topicAccess');
    return await topicAccessControl.checkTopicAccess(userId, topicId);
  }
}

export const firebaseAuth = new FirebaseAuth(); 