import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  validateEvaluateRequest,
  validateUpdateCommand,
} from '../src/domain/validation.js';

describe('API validation (assignment §2)', () => {
  it('validateEvaluateRequest accepts assignment example payload', () => {
    const req = validateEvaluateRequest({
      userId: 'user-1',
      notificationType: 'marketing_sms',
      channel: 'sms',
      region: 'EU',
      datetime: '2026-05-21T21:30:00Z',
    });
    expect(req).toEqual({
      userId: 'user-1',
      notificationType: 'marketing_sms',
      channel: 'sms',
      region: 'EU',
      datetime: '2026-05-21T21:30:00Z',
    });
  });

  it('validateEvaluateRequest rejects type/channel mismatch', () => {
    expect(() =>
      validateEvaluateRequest({
        userId: 'u',
        notificationType: 'marketing_email',
        channel: 'sms',
        region: 'EU',
        datetime: '2026-05-21T21:30:00Z',
      }),
    ).toThrow(ValidationError);
  });

  it('validateUpdateCommand accepts setPreference and quietHours', () => {
    const cmd = validateUpdateCommand({
      setPreference: {
        notificationType: 'marketing_email',
        channel: 'email',
        enabled: false,
      },
      quietHours: {
        timezone: 'Europe/Moscow',
        start: '22:00',
        end: '08:00',
      },
    });
    expect(cmd.setPreference?.enabled).toBe(false);
    expect(cmd.quietHours?.timezone).toBe('Europe/Moscow');
  });

  it('validateUpdateCommand accepts quietHours-only update', () => {
    const cmd = validateUpdateCommand({
      quietHours: { timezone: 'UTC', start: '23:00', end: '07:00' },
    });
    expect(cmd.quietHours?.timezone).toBe('UTC');
  });
});
