import {
  mergePreferencesWithSources,
  evaluateNotification,
} from '../domain/preference-evaluator.js';
import type {
  EvaluateRequest,
  EvaluateResult,
  GlobalPolicy,
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

  async getDefaultPreferences(): Promise<PreferenceEntry[]> {
    return this.repo.getDefaultPreferences();
  }

  async getGlobalPolicies(): Promise<GlobalPolicy[]> {
    return this.repo.getGlobalPolicies();
  }

  async getUserPreferences(userId: string): Promise<UserPreferencesSnapshot> {
    const isNewUser = await this.repo.ensureUser(userId);
    if (isNewUser) {
      this.logger.info('New user created with default preferences', { userId });
    }
    const defaults = await this.repo.getDefaultPreferences();
    const overrides = await this.repo.getUserPreferenceOverrides(userId);
    const quietHours = await this.repo.getUserQuietHours(userId);
    const preferences = mergePreferencesWithSources(defaults, overrides);
    return { userId, preferences, quietHours };
  }

  async updateUserPreferences(
    userId: string,
    command: UpdatePreferencesCommand,
    idempotencyKey: string,
  ): Promise<UserPreferencesSnapshot> {
    const isNewUser = await this.repo.ensureUser(userId);
    if (isNewUser) {
      this.logger.info('New user created with default preferences', { userId });
    }

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
    const isNewUser = await this.repo.ensureUser(request.userId);
    if (isNewUser) {
      this.logger.info('New user created with default preferences', {
        userId: request.userId,
      });
    }

    const defaults = await this.repo.getDefaultPreferences();
    const overrides = await this.repo.getUserPreferenceOverrides(request.userId);
    const preferences = mergePreferencesWithSources(defaults, overrides);
    const quietHours = await this.repo.getUserQuietHours(request.userId);
    const globalPolicies = await this.repo.getGlobalPolicies();

    const result = evaluateNotification(request, {
      preferences,
      quietHours,
      globalPolicies,
      userExists: true,
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
