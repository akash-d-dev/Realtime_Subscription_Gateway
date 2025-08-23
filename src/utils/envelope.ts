import { PublishEventInput } from '../types';
import { config } from '../config';

const BASELINE_TYPES = new Set(['op', 'cursor', 'presence', 'metric', 'status']);

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePublishInput(input: PublishEventInput): ValidationResult {
  if (!input || typeof input !== 'object') return { valid: false, reason: 'Invalid input' };

  const { topicId, type, data, priority } = input;

  if (!topicId || typeof topicId !== 'string' || topicId.length > 256) {
    return { valid: false, reason: 'Invalid topicId' };
  }

  if (!type || typeof type !== 'string' || type.length > 128) {
    return { valid: false, reason: 'Invalid type' };
  }

  const isBaseline = BASELINE_TYPES.has(type);
  const isCustom = type.startsWith('custom:');
  if (!isBaseline && !isCustom) {
    return { valid: false, reason: 'Unknown type; must be baseline or custom:*' };
  }

  if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 9)) {
    return { valid: false, reason: 'Invalid priority (0-9)' };
  }

  // Lenient payload validation: ensure object and within size limits
  if (typeof data !== 'object' || data === null) {
    return { valid: false, reason: 'Invalid payload' };
  }
  try {
    const payloadStr = JSON.stringify(data);
    if (payloadStr.length > config.limits.maxPayloadBytes) {
      return { valid: false, reason: 'Payload too large' };
    }
  } catch {
    return { valid: false, reason: 'Payload not serializable' };
  }

  return { valid: true };
}


