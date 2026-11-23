import { BankCode, BankDebitCode, BankDeductionType } from '../types';
import { getAuthHeaders } from './authApi';

export interface BankOptionInfo {
  code: BankCode;
  name: string;
  swift: string;
}

export const BANK_OPTIONS: BankOptionInfo[] = [
  { code: 'NMB', name: 'NMB Bank Plc', swift: 'NMIBTZTZ' },
  { code: 'CRDB', name: 'CRDB Bank Plc', swift: 'CORUTZTZ' },
  { code: 'EXIM', name: 'Exim Bank Tanzania', swift: 'EXTNTZTZ' },
  { code: 'MWALIMU', name: 'Mwalimu Commercial Bank (MCB)', swift: 'MWCOTZTZ' },
];

export function getBankDisplayLabel(code: BankDebitCode | '' | undefined): string {
  if (!code) return '-';
  if (code === 'GOV_PAYROLL') return 'Makato ya Serikali (Utumishi Check #)';
  const found = BANK_OPTIONS.find((b) => b.code === code);
  return found ? `${found.name} (${found.code})` : code;
}

export interface GatewayStatusItem {
  code: BankDebitCode;
  label: string;
  swiftOrSystem: string;
  mode: 'live_api' | 'sandbox_api';
  apiKeyConfigured?: boolean;
  secretConfigured?: boolean;
  envSecretKeyName?: string;
  signatureAlgorithm?: string;
  ready: boolean;
}

export interface VerifyAccountResponse {
  ok: boolean;
  verified?: boolean;
  bankCode?: BankDebitCode;
  bankLabel?: string;
  swiftOrSystem?: string;
  accountOrCheckNumber?: string;
  maskedAccount?: string;
  accountHolderName?: string;
  gatewayMode?: 'live_api' | 'sandbox_api';
  message?: string;
  error?: string;
}

export interface DeductRequestPayload {
  customerId: string;
  customerName: string;
  loanId: string;
  bankCode: BankDebitCode;
  deductionType: BankDeductionType;
  accountOrCheckNumber: string;
  amount: number;
  mandateAuthorized: boolean;
  narration?: string;
}

export interface DeductResponseItem {
  success: boolean;
  customerId: string;
  loanId: string;
  bankCode: BankDebitCode;
  bankLabel: string;
  deductionType: BankDeductionType;
  accountOrCheckNumber: string;
  amount: number;
  gatewayReference: string;
  gatewayMode: 'live_api' | 'sandbox_api';
  secretConfigured?: boolean;
  signatureDigest?: string;
  processedAt: string;
  statusMessage: string;
  error?: string;
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchBankGatewayStatus(): Promise<GatewayStatusItem[]> {
  const res = await fetch('/api/bank-debit/status');
  const data = await parseJsonSafe<{ ok?: boolean; gateways?: GatewayStatusItem[] }>(res);
  if (!res.ok || !data || !data.gateways) {
    throw new Error('Imeshindwa kusoma hali ya API za Benki.');
  }
  return data.gateways;
}

export async function verifyBankAccountOrCheck(params: {
  bankCode: BankDebitCode;
  accountOrCheckNumber: string;
  customerName: string;
}): Promise<VerifyAccountResponse> {
  const res = await fetch('/api/bank-debit/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<VerifyAccountResponse>(res);
  if (!res.ok || !data || !data.ok) {
    throw new Error(data?.error || 'Uhakiki wa akaunti au Check Number umeshindikana.');
  }
  return data;
}

export async function executeBankDirectDebit(
  payload: DeductRequestPayload,
): Promise<DeductResponseItem> {
  const res = await fetch('/api/bank-debit/deduct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe<DeductResponseItem>(res);
  if (!res.ok || !data || !data.success) {
    throw new Error(data?.error || data?.statusMessage || 'Makato ya benki yameshindikana.');
  }
  return data;
}

export async function executeBatchBankDirectDebit(
  items: DeductRequestPayload[],
): Promise<DeductResponseItem[]> {
  const res = await fetch('/api/bank-debit/batch-deduct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items }),
  });
  const data = await parseJsonSafe<{
    ok?: boolean;
    results?: DeductResponseItem[];
    error?: string;
  }>(res);
  if (!res.ok || !data || !data.ok || !data.results) {
    throw new Error(data?.error || 'Makato ya kundi kupitia benki yameshindikana.');
  }
  return data.results;
}
