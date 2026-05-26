import { mergePreferencesWithDefaults, evaluateNotification } from '../domain/preference-evaluator.js';
import type {
  EvaluateRequest,
  EvaluateResult,
  PreferenceEntry,
  QuietHours,
  UpdatePreferencesCommand,
  UserPreferencesSnapshot,
} from '../domain/types.js';
import type { PreferencesRepository } from '../infrastructure/db/preferences-repository.js';
import type { Logger } from '../infrastructure/logging/logger.js';

export class PreferencesService {
  constructor(
    private readonly repo: PreferencesRepository,
    private readonly logger: Logger,
  ) {}

  async getUserPreferences(userId: string): Promise<UserPreferencesSnapshot> {
    await this.repo.ensureUser(userId);
    const defaults = await this.repo.getDefaultPreferences();
    const overrides = await this.repo.getUserPreferenceOverrides(userId);
    const quietHours = await this.repo.getUserQuietHours(userId);
    const preferences = mergePreferencesWithDefaults(defaults, overrides);
    return { userId, preferences, quietHours };
  }

  async updateUserPreferences(
    userId: string,
    command: UpdatePreferencesCommand,
    idempotencyKey: string,
  ): Promise<UserPreferencesSnapshot> {
    await this.repo.ensureUser(userId);

    const alreadyApplied = await this.repo.wasCommandApplied(
      userId,
      idempotencyKey,
    );
    if (alreadyApplied) {
      this.logger.info('Idempotent preference update skipped', {
        userId,
        idempotencyKey,
      });
      return this.getUserPreferences(userId);
    }

    if (command.setPreference) {
      await this.repo.upsertUserPreference(
        userId,
        command.setPreference.notificationType,
        command.setPreference.channel,
        command.setPreference.enabled,
      );
      this.logger.info('User preference changed', {
        userId,
        ...command.setPreference,
      });
    }

    if (command.quietHours !== undefined) {
      if (command.quietHours === null) {
        await this.repo.deleteUserQuietHours(userId);
        this.logger.info('Quiet hours removed', { userId });
      } else {
        await this.repo.setUserQuietHours(userId, command.quietHours);
        this.logger.info('Quiet hours updated', {
          userId,
          timezone: command.quietHours.timezone,
        });
      }
    }

    await this.repo.recordCommand(userId, idempotencyKey, command);
    return this.getUserPreferences(userId);
  }

  async evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    const userExists = await this.repo.userExists(request.userId);
    const defaults = await this.repo.getDefaultPreferences();
    const overrides = await this.repo.getUserPreferenceOverrides(request.userId);
    const preferences = mergePreferencesWithDefaults(defaults, overrides);
    const quietHours = userExists
      ? await this.repo.getUserQuietHours(request.userId)
      : null;
    const globalPolicies = await this.repo.getGlobalPolicies();

    const result = evaluateNotification(request, {
      preferences,
      quietHours,
      globalPolicies,
      userExists,
    });

    this.logger.info('Notification evaluate decision', {
      userId: request.userId,
      notificationType: request.notificationType,
      channel: request.channel,
      region: request.region,
      decision: result.decision,
      reason: result.reason,
    });

    return result;
  }
}
