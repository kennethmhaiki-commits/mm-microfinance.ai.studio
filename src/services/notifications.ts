const PREFS_KEY = 'mm_auto_reminder_prefs_v1';
const AUTO_SMS_SENT_KEY = 'mm_auto_sms_sent_v1';

export interface AutoReminderPrefs {
  autoPushEnabled: boolean;
  autoSmsEnabled: boolean;
}

export type PushPermissionState = NotificationPermission | 'unsupported';

export function loadAutoReminderPrefs(): AutoReminderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoReminderPrefs>;
      return {
        autoPushEnabled: parsed.autoPushEnabled !== undefined ? Boolean(parsed.autoPushEnabled) : true,
        autoSmsEnabled: parsed.autoSmsEnabled !== undefined ? Boolean(parsed.autoSmsEnabled) : true,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { autoPushEnabled: true, autoSmsEnabled: true };
}

export function saveAutoReminderPrefs(partial: Partial<AutoReminderPrefs>): AutoReminderPrefs {
  const current = loadAutoReminderPrefs();
  const next: AutoReminderPrefs = {
    ...current,
    ...partial,
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}

function makeAutoSmsKey(todayStr: string, loanId: string, periodNumber: number): string {
  return `${todayStr}_${loanId}_${periodNumber}`;
}

export function hasAutoSmsDispatchedLocally(
  todayStr: string,
  loanId: string,
  periodNumber: number,
): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SMS_SENT_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, string>;
    return Boolean(map[makeAutoSmsKey(todayStr, loanId, periodNumber)]);
  } catch {
    return false;
  }
}

export function markAutoSmsDispatchedLocally(
  todayStr: string,
  loanId: string,
  periodNumber: number,
  gatewayRef?: string,
): void {
  try {
    const raw = localStorage.getItem(AUTO_SMS_SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const pruned: Record<string, string> = {};
    // Keep only keys from today to avoid unbounded growth
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith(`${todayStr}_`)) {
        pruned[k] = v;
      }
    }
    pruned[makeAutoSmsKey(todayStr, loanId, periodNumber)] =
      gatewayRef || new Date().toISOString();
    localStorage.setItem(AUTO_SMS_SENT_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage errors
  }
}

export function getPushPermissionStatus(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserPushNotification(
  title: string,
  body: string,
  tag?: string,
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(title, {
      body,
      tag: tag || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export function buildMailtoHref(toEmail: string, subject: string, body: string): string {
  const cleanEmail = toEmail.trim();
  return `mailto:${encodeURIComponent(cleanEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
