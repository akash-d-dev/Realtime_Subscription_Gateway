import Joi from 'joi';
import validator from 'validator';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { PublishEventInput } from '../types';
import { logger } from './logger';

// Configure DOMPurify for server-side usage
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

// Configure DOMPurify for safe sanitization
purify.setConfig({
  ALLOWED_TAGS: [], // No HTML tags allowed
  ALLOWED_ATTR: [], // No attributes allowed
  KEEP_CONTENT: true, // Keep text content
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
});

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

/**
 * Input validation schemas using Joi
 */
const schemas = {
  topicId: Joi.string()
    .min(1)
    .max(200)
    .pattern(/^[a-zA-Z0-9_\-:\.]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Topic ID can only contain alphanumeric characters, hyphens, underscores, colons, and dots',
      'string.max': 'Topic ID cannot exceed 200 characters',
      'string.min': 'Topic ID cannot be empty',
    }),

  eventType: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_\-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Event type can only contain alphanumeric characters, hyphens, and underscores',
      'string.max': 'Event type cannot exceed 100 characters',
    }),

  userId: Joi.string()
    .min(1)
    .max(128)
    .pattern(/^[a-zA-Z0-9_\-@\.]+$/)
    .required()
    .messages({
      'string.pattern.base': 'User ID contains invalid characters',
      'string.max': 'User ID cannot exceed 128 characters',
    }),

  tenantId: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_\-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Tenant ID can only contain alphanumeric characters, hyphens, and underscores',
      'string.max': 'Tenant ID cannot exceed 100 characters',
    }),

  priority: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .optional()
    .messages({
      'number.base': 'Priority must be a number',
      'number.integer': 'Priority must be an integer',
      'number.min': 'Priority must be at least 0',
      'number.max': 'Priority cannot exceed 10',
    }),

  eventData: Joi.object()
    .unknown(true)
    .max(50) // Maximum 50 properties
    .required()
    .messages({
      'object.max': 'Event data cannot have more than 50 properties',
    }),

  publishEventInput: Joi.object({
    topicId: Joi.string()
      .min(1)
      .max(200)
      .pattern(/^[a-zA-Z0-9_\-:\.]+$/)
      .required(),
    type: Joi.string()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9_\-]+$/)
      .required(),
    data: Joi.object()
      .unknown(true)
      .max(50)
      .required(),
    priority: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .optional(),
  }).required(),
};

/**
 * Sanitizes a string by removing potentially dangerous content
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Use DOMPurify to remove any HTML/XML content
  sanitized = purify.sanitize(sanitized);

  // Additional validation to prevent common injection patterns
  if (validator.contains(sanitized, '<script') ||
      validator.contains(sanitized, 'javascript:') ||
      validator.contains(sanitized, 'data:text/html') ||
      validator.contains(sanitized, 'vbscript:')) {
    logger.warn('Potentially malicious content detected and removed from input');
    return '';
  }

  return sanitized.trim();
}

/**
 * Deeply sanitizes an object by sanitizing all string values
 */
export function sanitizeObject(obj: any, visited = new WeakSet()): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  // Handle circular references
  if (typeof obj === 'object') {
    if (visited.has(obj)) {
      return '[Circular Reference]';
    }
    visited.add(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, visited));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeString(key);
      if (sanitizedKey && sanitizedKey.length > 0) {
        sanitized[sanitizedKey] = sanitizeObject(value, visited);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Validates and sanitizes topic ID
 */
export function validateTopicId(topicId: string): ValidationResult {
  const { error } = schemas.topicId.validate(topicId);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  const sanitized = sanitizeString(topicId);
  return {
    isValid: true,
    errors: [],
    sanitizedData: sanitized,
  };
}

/**
 * Validates and sanitizes user ID
 */
export function validateUserId(userId: string): ValidationResult {
  const { error } = schemas.userId.validate(userId);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  const sanitized = sanitizeString(userId);
  return {
    isValid: true,
    errors: [],
    sanitizedData: sanitized,
  };
}

/**
 * Validates and sanitizes tenant ID
 */
export function validateTenantId(tenantId: string): ValidationResult {
  const { error } = schemas.tenantId.validate(tenantId);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  const sanitized = sanitizeString(tenantId);
  return {
    isValid: true,
    errors: [],
    sanitizedData: sanitized,
  };
}

/**
 * Validates and sanitizes publish event input
 */
export function validateAndSanitizePublishInput(input: PublishEventInput): ValidationResult {
  // First validate the structure
  const { error, value } = schemas.publishEventInput.validate(input);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  // Then sanitize the data
  const sanitized = {
    ...value,
    topicId: sanitizeString(value.topicId),
    type: sanitizeString(value.type),
    data: sanitizeObject(value.data),
  };

  // Additional validation for JSON size (prevent DoS)
  const jsonSize = JSON.stringify(sanitized.data).length;
  if (jsonSize > 65536) { // 64KB limit
    return {
      isValid: false,
      errors: ['Event data payload exceeds maximum size limit of 64KB'],
    };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedData: sanitized,
  };
}

/**
 * Validates query parameters for pagination and limits
 */
export function validateQueryParams(params: {
  count?: number;
  fromSeq?: number;
  limit?: number;
  offset?: number;
}): ValidationResult {
  const schema = Joi.object({
    count: Joi.number().integer().min(1).max(1000).optional(),
    fromSeq: Joi.number().integer().min(0).optional(),
    limit: Joi.number().integer().min(1).max(1000).optional(),
    offset: Joi.number().integer().min(0).optional(),
  });

  const { error, value } = schema.validate(params);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedData: value,
  };
}

/**
 * Validates and sanitizes GraphQL context
 */
export function validateGraphQLContext(context: any): ValidationResult {
  if (!context) {
    return {
      isValid: false,
      errors: ['Context is required'],
    };
  }

  const errors: string[] = [];
  const sanitized: any = {};

  // Validate user context if present
  if (context.user) {
    if (context.user.userId) {
      const userIdResult = validateUserId(context.user.userId);
      if (!userIdResult.isValid) {
        errors.push(...userIdResult.errors);
      } else {
        sanitized.user = {
          ...context.user,
          userId: userIdResult.sanitizedData,
        };
      }
    }

    if (context.user.tenantId) {
      const tenantIdResult = validateTenantId(context.user.tenantId);
      if (!tenantIdResult.isValid) {
        errors.push(...tenantIdResult.errors);
      } else {
        sanitized.user = {
          ...sanitized.user,
          tenantId: tenantIdResult.sanitizedData,
        };
      }
    }
  }

  // Sanitize connection ID if present
  if (context.connectionId) {
    sanitized.connectionId = sanitizeString(context.connectionId);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: sanitized,
  };
}

/**
 * Rate limiting validation for input frequency
 */
const recentInputs = new Map<string, number[]>();

export function checkInputRateLimit(identifier: string, windowMs: number = 60000, maxRequests: number = 100): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!recentInputs.has(identifier)) {
    recentInputs.set(identifier, []);
  }

  const requests = recentInputs.get(identifier)!;

  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Add current request
  validRequests.push(now);
  recentInputs.set(identifier, validRequests);

  return true;
}