import type { Channel, NotificationCategory, NotificationType } from './types.js';

const TYPE_CHANNEL_MAP: Record<NotificationType, Channel> = {
  transactional_email: 'email',
  marketing_email: 'email',
  transactional_sms: 'sms',
  marketing_sms: 'sms',
  transactional_push: 'push',
  marketing_push: 'push',
  transactional_messenger: 'messenger',
  marketing_messenger: 'messenger',
};

export function channelForNotificationType(type: NotificationType): Channel {
  return TYPE_CHANNEL_MAP[type];
}

export function categoryForNotificationType(
  type: NotificationType,
): NotificationCategory {
  return type.startsWith('transactional_') ? 'transactional' : 'marketing';
}

export function typesMatchChannel(
  type: NotificationType,
  channel: Channel,
): boolean {
  return channelForNotificationType(type) === channel;
}

export const DEFAULT_MARKETING_BLOCKED_DURING_QUIET: NotificationType[] = [
  'marketing_email',
  'marketing_sms',
  'marketing_push',
  'marketing_messenger',
];
