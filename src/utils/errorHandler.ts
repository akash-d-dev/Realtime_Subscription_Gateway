import { logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxAttempts) {
          logger.error(`Operation failed after ${config.maxAttempts} attempts:`, error);
          throw lastError;
        }

        const delay = Math.min(
          config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );

        logger.warn(`Operation failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  static async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreaker: CircuitBreaker
  ): Promise<T> {
    if (circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();
      circuitBreaker.onSuccess();
      return result;
    } catch (error) {
      circuitBreaker.onFailure();
      throw error;
    }
  }

  static async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([operation, timeoutPromise]);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isRetryableError(error: any): boolean {
    // Network errors, timeouts, and temporary server errors are retryable
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNABORTED',
    ];

    return (
      retryableErrors.includes(error.code) ||
      error.message?.includes('timeout') ||
      (error.status >= 500 && error.status < 600) ||
      error.message?.includes('connection')
    );
  }

  static handleError(error: any, context: string): void {
    logger.error(`Error in ${context}:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      status: error.status,
    });
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeoutMs: number = 60000,
    private readonly halfOpenMaxAttempts: number = 3
  ) {}

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.failures = 0;
      }
    }
    return this.state === 'OPEN';
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

// Global circuit breakers for different services
export const redisCircuitBreaker = new CircuitBreaker(3, 30000);
export const firebaseCircuitBreaker = new CircuitBreaker(5, 60000);

export class SafeError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'INTERNAL_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

export function toSafeMessage(error: unknown, fallback = 'Internal server error'): { message: string; code: string } {
  if (error instanceof SafeError) {
    return { message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { message: error.message, code: 'ERROR' };
  }
  return { message: fallback, code: 'INTERNAL_ERROR' };
}