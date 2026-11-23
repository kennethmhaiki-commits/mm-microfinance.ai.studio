import { getAuthHeaders } from './authApi';

export interface SmsGatewayStatus {
  ok: boolean;
  mode: 'live_api' | 'sandbox_api';
  senderId: string;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  envSecretKeyName: string;
  signatureAlgorithm: string;
  ready: boolean;
  totalDispatchedToday?: number;
  lastAutoRunAt?: string | null;
  lastAutoSentCount?: number;
}

export type SmsTriggerType = 'manual' | 'auto_24h';

export interface SendSmsPayload {
  customerId: string;
  customerName: string;
  recipientPhone: string;
  messageBody: string;
}

export interface SendSmsResult {
  success: boolean;
  customerId: string;
  customerName: string;
  recipientPhone: string;
  senderId: string;
  segmentsCount: number;
  gatewayReference: string;
  gatewayMode: 'live_api' | 'sandbox_api';
  secretConfigured: boolean;
  signatureDigest: string;
  sentAt: string;
  statusMessage: string;
  error?: string;
}

export interface SendBulkSmsResponse {
  ok: boolean;
  results: SendSmsResult[];
  totalSent: number;
  totalFailed: number;
  triggerType?: SmsTriggerType;
  error?: string;
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSmsGatewayStatus(): Promise<SmsGatewayStatus> {
  const res = await fetch('/api/sms/status');
  const data = await parseJsonSafe<SmsGatewayStatus>(res);
  if (!res.ok || !data || !data.ok) {
    throw new Error('Imeshindwa kusoma hali ya SMS Gateway API.');
  }
  return data;
}

export async function sendSmsViaApi(
  payload: SendSmsPayload,
  triggerType: SmsTriggerType = 'manual',
): Promise<SendSmsResult> {
  const res = await fetch('/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...payload, triggerType }),
  });
  const data = await parseJsonSafe<SendSmsResult>(res);
  if (!res.ok || !data || !data.success) {
    throw new Error(data?.error || data?.statusMessage || 'Imeshindwa kutuma SMS kupitia API.');
  }
  return data;
}

export async function sendBulkSmsViaApi(
  items: SendSmsPayload[],
  triggerType: SmsTriggerType = 'manual',
): Promise<SendBulkSmsResponse> {
  const res = await fetch('/api/sms/send-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items, triggerType }),
  });
  const data = await parseJsonSafe<SendBulkSmsResponse>(res);
  if (!res.ok || !data || !data.ok || !data.results) {
    throw new Error(data?.error || 'Imeshindwa kutuma SMS za kundi kupitia API.');
  }
  return data;
}
