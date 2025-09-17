import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthContext } from '../types';

class FirebaseAuth {
  private app: App | null = null;
  private auth: Auth | null = null;
  private isDisabled: boolean;

  constructor() {
    this.isDisabled = config.featureFlags.firebaseAuthDisabled;

    // Critical security check: prevent auth bypass in production
    if (this.isDisabled && config.server.nodeEnv === 'production') {
      throw new Error(
        'SECURITY ERROR: Firebase Auth cannot be disabled in production environment. ' +
        'Set FIREBASE_AUTH_DISABLED=false or remove the environment variable entirely.'
      );
    }

    if (this.isDisabled) {
      logger.warn('Firebase Auth is DISABLED - using development mode (NOT SAFE FOR PRODUCTION)');
      return;
    }

    // Check if we have valid credentials (not placeholder values)
    const hasValidCredentials = 
      config.firebase.projectId && 
      config.firebase.projectId !== 'your-project-id' &&
      config.firebase.privateKey && 
      config.firebase.privateKey !== '"-----BEGIN PRIVATE KEY-----\\nYour private key here\\n-----END PRIVATE KEY-----\\n"' &&
      config.firebase.clientEmail && 
      config.firebase.clientEmail !== 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com';

    if (!hasValidCredentials) {
      logger.warn('Firebase credentials are placeholder values - Firebase Auth disabled');
      this.isDisabled = true;
      return;
    }

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
      logger.warn('Falling back to disabled Firebase Auth mode');
      this.isDisabled = true;
    }
  }

  async verifyToken(token: string): Promise<AuthContext | null> {
    if (this.isDisabled) {
      logger.warn('SECURITY WARNING: Using development authentication mode - all requests bypass authentication');
      // Return a development user context with environment-based ID
      const devUserId = `dev-user-${config.server.nodeEnv}-${Date.now().toString().slice(-6)}`;
      return {
        userId: devUserId,
        email: 'development@localhost.dev',
        permissions: ['read', 'write'],
        tenantId: config.server.nodeEnv === 'test' ? 'test-tenant' : 'default',
      };
    }

    if (!this.auth) {
      logger.error('Firebase Auth not initialized');
      return null;
    }

    try {
      const decodedToken = await this.auth.verifyIdToken(token);
      
      return {
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        permissions: (decodedToken as any).permissions || [],
        tenantId: (decodedToken as any).tenantId || 'default',
      };
    } catch (error) {
      logger.error('Token verification failed:', error);
      return null;
    }
  }

  async verifySessionCookie(sessionCookie: string): Promise<AuthContext | null> {
    if (this.isDisabled) {
      logger.warn('SECURITY WARNING: Using development authentication mode - session cookie verification bypassed');
      // Return a development user context with environment-based ID
      const devUserId = `dev-user-${config.server.nodeEnv}-${Date.now().toString().slice(-6)}`;
      return {
        userId: devUserId,
        email: 'development@localhost.dev',
        permissions: ['read', 'write'],
        tenantId: config.server.nodeEnv === 'test' ? 'test-tenant' : 'default',
      };
    }

    if (!this.auth) {
      logger.error('Firebase Auth not initialized');
      return null;
    }

    try {
      const decodedClaims = await this.auth.verifySessionCookie(sessionCookie, true);
      
      return {
        userId: decodedClaims.uid,
        email: decodedClaims.email || '',
        permissions: (decodedClaims as any).permissions || [],
        tenantId: (decodedClaims as any).tenantId || 'default',
      };
    } catch (error) {
      logger.error('Session cookie verification failed:', error);
      return null;
    }
  }

  async checkTopicAccess(userId: string, topicId: string): Promise<boolean> {
    if (this.isDisabled) {
      logger.warn(`SECURITY WARNING: Topic access control bypassed for user ${userId} on topic ${topicId} - development mode`);
      // In development mode, allow all topic access
      return true;
    }

    try {
      // Import here to avoid circular dependencies
      const { topicAccessControl } = await import('../firebase/topicAccess');
      return await topicAccessControl.checkTopicAccess(userId, topicId);
    } catch (error) {
      logger.error('Error checking topic access:', error);
      return false;
    }
  }
}

export const firebaseAuth = new FirebaseAuth(); 