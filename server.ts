import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BankGatewayCode = 'NMB' | 'CRDB' | 'EXIM' | 'MWALIMU' | 'GOV_PAYROLL';
type DeductionType = 'bank_direct_debit' | 'gov_check_number';

interface GatewayConfig {
  code: BankGatewayCode;
  label: string;
  swiftOrSystem: string;
  refPrefix: string;
  envUrlKey: string;
  envApiKey: string;
  envSecretKey: string;
  minDigits: number;
  maxDigits: number;
}

const GATEWAYS: Record<BankGatewayCode, GatewayConfig> = {
  NMB: {
    code: 'NMB',
    label: 'NMB Bank Plc (Direct Debit)',
    swiftOrSystem: 'NMIBTZTZ',
    refPrefix: 'NMB-DD',
    envUrlKey: 'NMB_DIRECT_DEBIT_API_URL',
    envApiKey: 'NMB_DIRECT_DEBIT_API_KEY',
    envSecretKey: 'NMB_DIRECT_DEBIT_SECRET_VALUE',
    minDigits: 8,
    maxDigits: 18,
  },
  CRDB: {
    code: 'CRDB',
    label: 'CRDB Bank Plc (Direct Debit)',
    swiftOrSystem: 'CORUTZTZ',
    refPrefix: 'CRDB-DD',
    envUrlKey: 'CRDB_DIRECT_DEBIT_API_URL',
    envApiKey: 'CRDB_DIRECT_DEBIT_API_KEY',
    envSecretKey: 'CRDB_DIRECT_DEBIT_SECRET_VALUE',
    minDigits: 8,
    maxDigits: 18,
  },
  EXIM: {
    code: 'EXIM',
    label: 'Exim Bank Tanzania (Direct Debit)',
    swiftOrSystem: 'EXTNTZTZ',
    refPrefix: 'EXIM-DD',
    envUrlKey: 'EXIM_DIRECT_DEBIT_API_URL',
    envApiKey: 'EXIM_DIRECT_DEBIT_API_KEY',
    envSecretKey: 'EXIM_DIRECT_DEBIT_SECRET_VALUE',
    minDigits: 8,
    maxDigits: 18,
  },
  MWALIMU: {
    code: 'MWALIMU',
    label: 'Mwalimu Commercial Bank (Direct Debit)',
    swiftOrSystem: 'MWCOTZTZ',
    refPrefix: 'MCB-DD',
    envUrlKey: 'MWALIMU_DIRECT_DEBIT_API_URL',
    envApiKey: 'MWALIMU_DIRECT_DEBIT_API_KEY',
    envSecretKey: 'MWALIMU_DIRECT_DEBIT_SECRET_VALUE',
    minDigits: 8,
    maxDigits: 18,
  },
  GOV_PAYROLL: {
    code: 'GOV_PAYROLL',
    label: 'Makato ya Mishahara Serikalini (Utumishi Check Number)',
    swiftOrSystem: 'UTUMISHI-CHECKOFF',
    refPrefix: 'GOV-CHK',
    envUrlKey: 'GOV_PAYROLL_CHECKOFF_API_URL',
    envApiKey: 'GOV_PAYROLL_CHECKOFF_API_KEY',
    envSecretKey: 'GOV_PAYROLL_CHECKOFF_SECRET_VALUE',
    minDigits: 5,
    maxDigits: 20,
  },
};

// Ephemeral in-memory HMAC keys per institution for sandbox signing when live secrets are not set.
const SANDBOX_EPHEMERAL_SECRETS: Record<BankGatewayCode, string> = {
  NMB: crypto.randomBytes(32).toString('hex'),
  CRDB: crypto.randomBytes(32).toString('hex'),
  EXIM: crypto.randomBytes(32).toString('hex'),
  MWALIMU: crypto.randomBytes(32).toString('hex'),
  GOV_PAYROLL: crypto.randomBytes(32).toString('hex'),
};

function isAllowedExternalHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getGatewayMode(cfg: GatewayConfig): {
  liveConfigured: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  url: string;
  apiKey: string;
  secretValue: string;
  signingKey: string;
} {
  const url = (process.env[cfg.envUrlKey] || '').trim();
  const apiKey = (process.env[cfg.envApiKey] || '').trim();
  const secretValue = (process.env[cfg.envSecretKey] || '').trim();
  const apiKeyConfigured = Boolean(apiKey);
  const secretConfigured = Boolean(secretValue);
  const liveConfigured = Boolean(url && apiKey && isAllowedExternalHttpsUrl(url));
  const signingKey = secretValue || SANDBOX_EPHEMERAL_SECRETS[cfg.code];
  return {
    liveConfigured,
    apiKeyConfigured,
    secretConfigured,
    url,
    apiKey,
    secretValue,
    signingKey,
  };
}

function signGatewayPayload(signingKey: string, timestamp: string, payloadJson: string): string {
  return crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.${payloadJson}`)
    .digest('hex');
}

function verifyHmacSignature(
  secretValue: string,
  timestamp: string,
  payloadJson: string,
  providedHeader: string,
): boolean {
  if (!secretValue || !timestamp || !providedHeader) return false;
  const cleaned = providedHeader.startsWith('sha256=')
    ? providedHeader.slice(7).trim()
    : providedHeader.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(cleaned)) return false;

  const expectedHex = signGatewayPayload(secretValue, timestamp, payloadJson);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const providedBuf = Buffer.from(cleaned.toLowerCase(), 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function sanitizeAccountOrCheck(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, '').slice(0, 30);
}

function isValidAccountOrCheckFormat(val: string, cfg: GatewayConfig): boolean {
  if (!val) return false;
  const cleaned = val.replace(/-/g, '');
  if (cleaned.length < cfg.minDigits || cleaned.length > cfg.maxDigits) return false;
  return /^[a-zA-Z0-9]+$/.test(cleaned);
}

function makeGatewayRef(prefix: string): string {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${datePart}-${rand}`;
}

interface DeductItemInput {
  customerId: string;
  customerName: string;
  loanId: string;
  bankCode: BankGatewayCode;
  deductionType: DeductionType;
  accountOrCheckNumber: string;
  amount: number;
  mandateAuthorized: boolean;
  narration?: string;
}

interface DeductItemResult {
  success: boolean;
  customerId: string;
  loanId: string;
  bankCode: BankGatewayCode;
  bankLabel: string;
  deductionType: DeductionType;
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

async function processSingleDeduction(input: DeductItemInput): Promise<DeductItemResult> {
  const cfg = GATEWAYS[input.bankCode];
  if (!cfg) {
    return {
      success: false,
      customerId: input.customerId,
      loanId: input.loanId,
      bankCode: input.bankCode,
      bankLabel: 'Benki Isiyotambulika',
      deductionType: input.deductionType,
      accountOrCheckNumber: input.accountOrCheckNumber,
      amount: input.amount,
      gatewayReference: '',
      gatewayMode: 'sandbox_api',
      processedAt: new Date().toISOString(),
      statusMessage: 'Benki iliyochaguliwa haitambuliwi.',
      error: 'Benki iliyochaguliwa haitambuliwi.',
    };
  }

  if (!input.mandateAuthorized) {
    return {
      success: false,
      customerId: input.customerId,
      loanId: input.loanId,
      bankCode: cfg.code,
      bankLabel: cfg.label,
      deductionType: input.deductionType,
      accountOrCheckNumber: input.accountOrCheckNumber,
      amount: input.amount,
      gatewayReference: '',
      gatewayMode: 'sandbox_api',
      processedAt: new Date().toISOString(),
      statusMessage: 'Mteja hana idhini ya makato ya moja kwa moja (Direct Debit Mandate).',
      error: 'Idhini ya makato (Mandate) inahitajika.',
    };
  }

  const accountClean = sanitizeAccountOrCheck(input.accountOrCheckNumber);
  if (!isValidAccountOrCheckFormat(accountClean, cfg)) {
    const errMsg =
      cfg.code === 'GOV_PAYROLL'
        ? `Check Number "${accountClean || '-'}" si sahihi (lazima iwe na tarakimu ${cfg.minDigits}-${cfg.maxDigits}).`
        : `Namba ya akaunti ya ${cfg.code} "${accountClean || '-'}" si sahihi (tarakimu ${cfg.minDigits}-${cfg.maxDigits}).`;
    return {
      success: false,
      customerId: input.customerId,
      loanId: input.loanId,
      bankCode: cfg.code,
      bankLabel: cfg.label,
      deductionType: input.deductionType,
      accountOrCheckNumber: accountClean,
      amount: input.amount,
      gatewayReference: '',
      gatewayMode: 'sandbox_api',
      processedAt: new Date().toISOString(),
      statusMessage: errMsg,
      error: errMsg,
    };
  }

  const amount = Math.round(Number(input.amount) || 0);
  if (!Number.isFinite(amount) || amount < 100 || amount > 500_000_000) {
    return {
      success: false,
      customerId: input.customerId,
      loanId: input.loanId,
      bankCode: cfg.code,
      bankLabel: cfg.label,
      deductionType: input.deductionType,
      accountOrCheckNumber: accountClean,
      amount,
      gatewayReference: '',
      gatewayMode: 'sandbox_api',
      processedAt: new Date().toISOString(),
      statusMessage: 'Kiasi cha makato lazima kiwe kati ya Tsh 100 na Tsh 500,000,000.',
      error: 'Kiasi si sahihi.',
    };
  }

  const mode = getGatewayMode(cfg);
  const processedAt = new Date().toISOString();
  const payloadBody = {
    bankCode: cfg.code,
    swiftCode: cfg.swiftOrSystem,
    deductionType: input.deductionType,
    accountOrCheckNumber: accountClean,
    customerName: input.customerName.slice(0, 120),
    loanId: input.loanId.slice(0, 128),
    amount,
    currency: 'TZS',
    narration: (input.narration || `Rejesho la Mkopo - ${input.customerName}`).slice(0, 140),
  };
  const payloadJson = JSON.stringify(payloadBody);
  const hmacHex = signGatewayPayload(mode.signingKey, processedAt, payloadJson);
  const signatureDigest = `sha256:${hmacHex.slice(0, 12)}`;

  if (mode.liveConfigured) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const upstreamRes = await fetch(mode.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mode.apiKey}`,
          'X-Gateway-Bank': cfg.code,
          'X-Gateway-Timestamp': processedAt,
          'X-Gateway-Signature': `sha256=${hmacHex}`,
          'X-Signature-Algorithm': 'HMAC-SHA256',
        },
        body: payloadJson,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const upstreamJson = (await upstreamRes.json().catch(() => ({}))) as {
        reference?: string;
        transactionId?: string;
        message?: string;
      };

      if (!upstreamRes.ok) {
        const msg =
          upstreamJson.message || `Seva ya ${cfg.label} imekataa muamala (${upstreamRes.status}).`;
        return {
          success: false,
          customerId: input.customerId,
          loanId: input.loanId,
          bankCode: cfg.code,
          bankLabel: cfg.label,
          deductionType: input.deductionType,
          accountOrCheckNumber: accountClean,
          amount,
          gatewayReference: upstreamJson.reference || '',
          gatewayMode: 'live_api',
          secretConfigured: mode.secretConfigured,
          signatureDigest,
          processedAt,
          statusMessage: msg,
          error: msg,
        };
      }

      const ref = upstreamJson.reference || upstreamJson.transactionId || makeGatewayRef(cfg.refPrefix);
      return {
        success: true,
        customerId: input.customerId,
        loanId: input.loanId,
        bankCode: cfg.code,
        bankLabel: cfg.label,
        deductionType: input.deductionType,
        accountOrCheckNumber: accountClean,
        amount,
        gatewayReference: ref,
        gatewayMode: 'live_api',
        secretConfigured: mode.secretConfigured,
        signatureDigest,
        processedAt,
        statusMessage:
          upstreamJson.message ||
          `Makato ya moja kwa moja kupitia ${cfg.label} yamefanikiwa (Ref: ${ref}).`,
      };
    } catch (err) {
      const msg =
        err instanceof Error ? `Hitilafu ya mtandao kwenda ${cfg.label}: ${err.message}` : 'Hitilafu ya muunganisho wa benki.';
      return {
        success: false,
        customerId: input.customerId,
        loanId: input.loanId,
        bankCode: cfg.code,
        bankLabel: cfg.label,
        deductionType: input.deductionType,
        accountOrCheckNumber: accountClean,
        amount,
        gatewayReference: '',
        gatewayMode: 'live_api',
        secretConfigured: mode.secretConfigured,
        signatureDigest,
        processedAt,
        statusMessage: msg,
        error: msg,
      };
    }
  }

  // Verified Direct-Debit Gateway Sandbox Processor
  const ref = makeGatewayRef(cfg.refPrefix);
  const msg =
    cfg.code === 'GOV_PAYROLL'
      ? `Makato ya Utumishi (Check #${accountClean}) ya Tsh ${amount.toLocaleString('en-US')} yameidhinishwa (Ref: ${ref}).`
      : `Makato ya moja kwa moja kutoka akaunti ${accountClean} (${cfg.code}) ya Tsh ${amount.toLocaleString('en-US')} yamefanikiwa (Ref: ${ref}).`;

  return {
    success: true,
    customerId: input.customerId,
    loanId: input.loanId,
    bankCode: cfg.code,
    bankLabel: cfg.label,
    deductionType: input.deductionType,
    accountOrCheckNumber: accountClean,
    amount,
    gatewayReference: ref,
    gatewayMode: 'sandbox_api',
    secretConfigured: mode.secretConfigured,
    signatureDigest,
    processedAt,
    statusMessage: msg,
  };
}

// =========================================================================
// Staff & Admin Authentication + RBAC Session Store (scrypt + HMAC-SHA256)
// =========================================================================
const ALL_STAFF_PERMISSIONS = [
  'view_dashboard',
  'manage_applications',
  'manage_customers',
  'edit_delete_customers',
  'view_loans_penalties',
  'apply_penalties',
  'view_schedule',
  'collect_repayments',
  'view_revenue_reports',
  'manage_bank_debit',
  'send_messages',
  'use_calculator',
  'view_contracts',
  'manage_loan_types',
  'manage_company_settings',
] as const;

type StaffPermissionKey = (typeof ALL_STAFF_PERMISSIONS)[number];
const VALID_PERMISSION_SET = new Set<string>(ALL_STAFF_PERMISSIONS);

interface ClaimedAdminRecord {
  username: string;
  usernameLower: string;
  fullName: string;
  passwordHash: string;
  claimedAt: string;
}

interface ServerStaffRecord {
  id: string;
  fullName: string;
  roleTitle: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  accountStatus: 'active' | 'locked';
  lockReason: string;
  permissions: StaffPermissionKey[];
  lastLoginAt: string;
}

interface PersistedAuthStore {
  claimedAdmin: ClaimedAdminRecord | null;
  staffRecords: ServerStaffRecord[];
}

interface SessionPayload {
  actorType: 'admin' | 'staff';
  staffId?: string;
  username: string;
  fullName: string;
  roleTitle: string;
  permissions: StaffPermissionKey[];
}

const SESSION_SIGNING_SECRET =
  (process.env.AUTH_SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
const AUTH_STORE_PATH = path.join(os.tmpdir(), 'mm_microfinance_auth_store_v1.json');

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !/^[a-fA-F0-9]{128}$/.test(expectedHex)) return false;
  try {
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

function safeEqualText(a: string, b: string): boolean {
  const aHash = crypto.createHash('sha256').update(a).digest();
  const bHash = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

function isValidScryptFormat(hash: unknown): hash is string {
  return (
    typeof hash === 'string' &&
    /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash.trim())
  );
}

function sanitizePermissionList(raw: unknown): StaffPermissionKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<StaffPermissionKey>();
  for (const item of raw) {
    if (typeof item === 'string' && VALID_PERMISSION_SET.has(item)) {
      seen.add(item as StaffPermissionKey);
    }
  }
  return Array.from(seen);
}

function loadAuthStore(): PersistedAuthStore {
  try {
    if (fs.existsSync(AUTH_STORE_PATH)) {
      const raw = fs.readFileSync(AUTH_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedAuthStore>;
      const claimedAdmin =
        parsed.claimedAdmin &&
        typeof parsed.claimedAdmin.username === 'string' &&
        isValidScryptFormat(parsed.claimedAdmin.passwordHash)
          ? {
              username: parsed.claimedAdmin.username.slice(0, 60),
              usernameLower: parsed.claimedAdmin.username.toLowerCase().slice(0, 60),
              fullName: String(parsed.claimedAdmin.fullName || 'Msimamizi Mkuu').slice(0, 120),
              passwordHash: parsed.claimedAdmin.passwordHash,
              claimedAt: String(parsed.claimedAdmin.claimedAt || new Date().toISOString()),
            }
          : null;
      const staffRecords: ServerStaffRecord[] = Array.isArray(parsed.staffRecords)
        ? parsed.staffRecords
            .filter(
              (s) =>
                s &&
                typeof s.id === 'string' &&
                typeof s.username === 'string' &&
                isValidScryptFormat(s.passwordHash),
            )
            .map((s) => ({
              id: s.id.slice(0, 128),
              fullName: String(s.fullName || 'Mfanyakazi').slice(0, 120),
              roleTitle: String(s.roleTitle || 'Afisa').slice(0, 80),
              username: s.username.slice(0, 60),
              usernameLower: s.username.toLowerCase().slice(0, 60),
              passwordHash: s.passwordHash,
              accountStatus: s.accountStatus === 'locked' ? 'locked' : 'active',
              lockReason: String(s.lockReason || '').slice(0, 200),
              permissions: sanitizePermissionList(s.permissions),
              lastLoginAt: String(s.lastLoginAt || '').slice(0, 40),
            }))
        : [];
      return { claimedAdmin, staffRecords };
    }
  } catch {
    // Fallback to empty in-memory auth store
  }
  return { claimedAdmin: null, staffRecords: [] };
}

function persistAuthStore(store: PersistedAuthStore): void {
  try {
    fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(store), { mode: 0o600 });
  } catch {
    // Non-fatal if temp dir is read-only
  }
}

const authStore: PersistedAuthStore = loadAuthStore();

function getEnvAdminConfig(): { configured: boolean; username: string; password: string } {
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  const username = (process.env.ADMIN_USERNAME || 'Kennymhaiki').trim() || 'Kennymhaiki';
  return {
    configured: password.length > 0,
    username,
    password,
  };
}

function signSessionToken(session: SessionPayload): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const body = Buffer.from(
    JSON.stringify({
      actorType: session.actorType,
      staffId: session.staffId || '',
      username: session.username,
      fullName: session.fullName,
      roleTitle: session.roleTitle,
      exp,
    }),
    'utf8',
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyBearerToken(
  req: Request,
): { valid: true; session: SessionPayload } | { valid: false; status: number; error: string; locked?: boolean } {
  const header = String(req.header('authorization') || '').trim();
  if (!header.startsWith('Bearer ')) {
    return { valid: false, status: 401, error: 'Tafadhali ingia kwenye mfumo kwanza.' };
  }
  const token = header.slice(7).trim();
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) {
    return { valid: false, status: 401, error: 'Kikao cha kuingia si halali.' };
  }
  const body = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(body)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, status: 401, error: 'Kikao chako kimeisha au si halali.' };
  }

  let parsed: {
    actorType?: string;
    staffId?: string;
    username?: string;
    fullName?: string;
    roleTitle?: string;
    exp?: number;
  };
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, status: 401, error: 'Kikao si sahihi.' };
  }

  if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
    return { valid: false, status: 401, error: 'Muda wa kikao umeisha. Tafadhali ingia tena.' };
  }

  if (parsed.actorType === 'admin') {
    return {
      valid: true,
      session: {
        actorType: 'admin',
        username: String(parsed.username || 'Admin'),
        fullName: String(parsed.fullName || 'Msimamizi Mkuu'),
        roleTitle: 'Msimamizi Mkuu (Admin)',
        permissions: [...ALL_STAFF_PERMISSIONS],
      },
    };
  }

  if (parsed.actorType === 'staff' && parsed.staffId) {
    const staff = authStore.staffRecords.find((s) => s.id === parsed.staffId);
    if (!staff) {
      return {
        valid: false,
        status: 403,
        locked: true,
        error: 'Akaunti yako ya mfanyakazi haipo au imeondolewa na Msimamizi Mkuu.',
      };
    }
    if (staff.accountStatus === 'locked') {
      return {
        valid: false,
        status: 403,
        locked: true,
        error: staff.lockReason
          ? `Akaunti yako imefungwa na Msimamizi Mkuu: ${staff.lockReason}`
          : 'Akaunti yako imefungwa na Msimamizi Mkuu. Tafadhali wasiliana na ofisi.',
      };
    }
    return {
      valid: true,
      session: {
        actorType: 'staff',
        staffId: staff.id,
        username: staff.username,
        fullName: staff.fullName,
        roleTitle: staff.roleTitle,
        permissions: staff.permissions,
      },
    };
  }

  return { valid: false, status: 401, error: 'Utambulisho haujakamilika.' };
}

function requireAuthAndPermission(
  req: Request,
  res: Response,
  requiredPermission?: StaffPermissionKey,
  requireAdminOnly = false,
): SessionPayload | null {
  const check = verifyBearerToken(req);
  if (!check.valid) {
    res.status(check.status).json({
      ok: false,
      success: false,
      locked: Boolean(check.locked),
      error: check.error,
    });
    return null;
  }
  if (requireAdminOnly && check.session.actorType !== 'admin') {
    res.status(403).json({
      ok: false,
      success: false,
      error: 'Kitendo hiki kinaruhusiwa kwa Msimamizi Mkuu (Admin) pekee.',
    });
    return null;
  }
  if (
    requiredPermission &&
    check.session.actorType !== 'admin' &&
    !check.session.permissions.includes(requiredPermission)
  ) {
    res.status(403).json({
      ok: false,
      success: false,
      error: 'Huna idhini (ngazi hii haijawezeshwa) kutekeleza kitendo hiki.',
    });
    return null;
  }
  return check.session;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '512kb' }));

  // =========================================================================
  // Auth & Staff Management Endpoints
  // =========================================================================
  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const envCfg = getEnvAdminConfig();
    res.json({
      ok: true,
      envConfigured: envCfg.configured,
      hasClaimedAdmin: Boolean(authStore.claimedAdmin),
      adminConfigured: envCfg.configured || Boolean(authStore.claimedAdmin),
      staffCount: authStore.staffRecords.length,
    });
  });

  app.post('/api/auth/bootstrap-admin', (req: Request, res: Response) => {
    const envCfg = getEnvAdminConfig();
    if (envCfg.configured || authStore.claimedAdmin) {
      res.status(409).json({
        ok: false,
        error: 'Akaunti ya Msimamizi Mkuu tayari imeshafunguliwa. Tafadhali ingia kwa username na nenosiri.',
      });
      return;
    }

    const body = (req.body || {}) as { username?: unknown; password?: unknown; fullName?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName =
      typeof body.fullName === 'string' && body.fullName.trim().length >= 2
        ? body.fullName.trim().slice(0, 120)
        : 'Msimamizi Mkuu';

    if (!/^[a-zA-Z0-9_.\-]{3,60}$/.test(username)) {
      res.status(400).json({
        ok: false,
        error: 'Jina la mtumiaji (username) liwe na herufi/tarakimu 3 hadi 60 bila nafasi.',
      });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({
        ok: false,
        error: 'Nenosiri lazima liwe na angalau herufi 6.',
      });
      return;
    }

    authStore.claimedAdmin = {
      username,
      usernameLower: username.toLowerCase(),
      fullName,
      passwordHash: hashPasswordScrypt(password),
      claimedAt: new Date().toISOString(),
    };
    persistAuthStore(authStore);

    const session: SessionPayload = {
      actorType: 'admin',
      username,
      fullName,
      roleTitle: 'Msimamizi Mkuu (Admin)',
      permissions: [...ALL_STAFF_PERMISSIONS],
    };
    const token = signSessionToken(session);
    res.json({ ok: true, token, session });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body || {}) as { username?: unknown; password?: unknown };
    const rawUser = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!rawUser || !password) {
      res.status(400).json({
        ok: false,
        error: 'Tafadhali jaza jina la mtumiaji (username) na nenosiri.',
      });
      return;
    }

    const lowerUser = rawUser.toLowerCase();
    const envCfg = getEnvAdminConfig();

    // 1. Env admin override takes precedence when configured
    if (envCfg.configured) {
      if (lowerUser === envCfg.username.toLowerCase() && safeEqualText(password, envCfg.password)) {
        const session: SessionPayload = {
          actorType: 'admin',
          username: envCfg.username,
          fullName: 'Msimamizi Mkuu',
          roleTitle: 'Msimamizi Mkuu (Admin)',
          permissions: [...ALL_STAFF_PERMISSIONS],
        };
        res.json({ ok: true, token: signSessionToken(session), session });
        return;
      }
    } else if (authStore.claimedAdmin) {
      // 2. Claimed first-run admin credential
      if (
        lowerUser === authStore.claimedAdmin.usernameLower &&
        verifyPasswordScrypt(password, authStore.claimedAdmin.passwordHash)
      ) {
        const session: SessionPayload = {
          actorType: 'admin',
          username: authStore.claimedAdmin.username,
          fullName: authStore.claimedAdmin.fullName,
          roleTitle: 'Msimamizi Mkuu (Admin)',
          permissions: [...ALL_STAFF_PERMISSIONS],
        };
        res.json({ ok: true, token: signSessionToken(session), session });
        return;
      }
    }

    // 3. Registered staff accounts
    const staff = authStore.staffRecords.find((s) => s.usernameLower === lowerUser);
    if (staff) {
      if (!verifyPasswordScrypt(password, staff.passwordHash)) {
        res.status(401).json({
          ok: false,
          error: 'Jina la mtumiaji au nenosiri si sahihi. Tafadhali hakikisha na jaribu tena.',
        });
        return;
      }
      if (staff.accountStatus === 'locked') {
        res.status(403).json({
          ok: false,
          locked: true,
          error: staff.lockReason
            ? `Akaunti yako imefungwa na Msimamizi Mkuu (${staff.lockReason}).`
            : 'Akaunti yako imefungwa na Msimamizi Mkuu. Tafadhali wasiliana na ofisi kuifungua.',
        });
        return;
      }

      staff.lastLoginAt = new Date().toISOString();
      persistAuthStore(authStore);

      const session: SessionPayload = {
        actorType: 'staff',
        staffId: staff.id,
        username: staff.username,
        fullName: staff.fullName,
        roleTitle: staff.roleTitle,
        permissions: staff.permissions,
      };
      res.json({ ok: true, token: signSessionToken(session), session });
      return;
    }

    res.status(401).json({
      ok: false,
      error: 'Jina la mtumiaji au nenosiri si sahihi. Tafadhali hakikisha na jaribu tena.',
    });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const session = requireAuthAndPermission(req, res);
    if (!session) return;
    res.json({ ok: true, session });
  });

  app.post('/api/staff/hash-password', (req: Request, res: Response) => {
    const session = requireAuthAndPermission(req, res, undefined, true);
    if (!session) return;
    const body = (req.body || {}) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({
        ok: false,
        error: 'Nenosiri la mfanyakazi lazima liwe na angalau herufi 6.',
      });
      return;
    }
    res.json({
      ok: true,
      passwordHash: hashPasswordScrypt(password),
    });
  });

  app.post('/api/staff/sync', (req: Request, res: Response) => {
    const session = requireAuthAndPermission(req, res, undefined, true);
    if (!session) return;
    const body = (req.body || {}) as { staffAccounts?: unknown };
    if (!Array.isArray(body.staffAccounts)) {
      res.status(400).json({ ok: false, error: 'Orodha ya wafanyakazi si sahihi.' });
      return;
    }

    const sanitized: ServerStaffRecord[] = [];
    const seenUsernames = new Set<string>();
    for (const raw of body.staffAccounts.slice(0, 500)) {
      const item = (raw || {}) as Record<string, unknown>;
      const id = typeof item.id === 'string' ? item.id.trim().slice(0, 128) : '';
      const username = typeof item.username === 'string' ? item.username.trim().slice(0, 60) : '';
      const usernameLower = username.toLowerCase();
      if (!id || !/^[a-zA-Z0-9_.\-]{3,60}$/.test(username)) continue;
      if (!isValidScryptFormat(item.passwordHash)) continue;
      if (seenUsernames.has(usernameLower)) continue;
      seenUsernames.add(usernameLower);

      const existingServer = authStore.staffRecords.find((s) => s.id === id);
      sanitized.push({
        id,
        fullName:
          typeof item.fullName === 'string' && item.fullName.trim().length >= 2
            ? item.fullName.trim().slice(0, 120)
            : 'Mfanyakazi',
        roleTitle:
          typeof item.roleTitle === 'string' && item.roleTitle.trim().length >= 2
            ? item.roleTitle.trim().slice(0, 80)
            : 'Afisa',
        username,
        usernameLower,
        passwordHash: item.passwordHash,
        accountStatus: item.accountStatus === 'locked' ? 'locked' : 'active',
        lockReason: typeof item.lockReason === 'string' ? item.lockReason.trim().slice(0, 200) : '',
        permissions: sanitizePermissionList(item.permissions),
        lastLoginAt:
          typeof item.lastLoginAt === 'string' && item.lastLoginAt
            ? item.lastLoginAt.slice(0, 40)
            : existingServer?.lastLoginAt || '',
      });
    }

    authStore.staffRecords = sanitized;
    persistAuthStore(authStore);
    res.json({ ok: true, count: sanitized.length });
  });

  // Gateway capability status (never exposes raw secret values)
  app.get('/api/bank-debit/status', (_req: Request, res: Response) => {
    const gateways = Object.values(GATEWAYS).map((cfg) => {
      const mode = getGatewayMode(cfg);
      return {
        code: cfg.code,
        label: cfg.label,
        swiftOrSystem: cfg.swiftOrSystem,
        mode: mode.liveConfigured ? 'live_api' : 'sandbox_api',
        apiKeyConfigured: mode.apiKeyConfigured,
        secretConfigured: mode.secretConfigured,
        envSecretKeyName: cfg.envSecretKey,
        signatureAlgorithm: 'HMAC-SHA256',
        ready: true,
      };
    });
    res.json({ ok: true, gateways });
  });

  // Institution webhook / callback verification using each institution's SECRET_VALUE
  app.post('/api/bank-debit/webhook/:bankCode', (req: Request, res: Response) => {
    const rawCode = String(req.params.bankCode || '').toUpperCase() as BankGatewayCode;
    const cfg = GATEWAYS[rawCode];
    if (!cfg) {
      res.status(400).json({ ok: false, error: 'Taasisi ya benki haitambuliwi.' });
      return;
    }

    const mode = getGatewayMode(cfg);
    if (!mode.secretConfigured) {
      res.status(503).json({
        ok: false,
        error: `Secret Value (${cfg.envSecretKey}) haijawekwa kwenye vigezo vya seva.`,
      });
      return;
    }

    const timestamp = String(req.header('x-gateway-timestamp') || '').trim();
    const signature = String(req.header('x-gateway-signature') || '').trim();
    const tsMs = Date.parse(timestamp);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      res.status(401).json({ ok: false, error: 'Muda wa sahihi ya webhook umekwisha au si sahihi.' });
      return;
    }

    const payloadJson = JSON.stringify(req.body || {});
    if (!verifyHmacSignature(mode.secretValue, timestamp, payloadJson, signature)) {
      res.status(401).json({ ok: false, error: 'Sahihi ya HMAC-SHA256 (Secret Value) si sahihi.' });
      return;
    }

    res.json({
      ok: true,
      verified: true,
      bankCode: cfg.code,
      receivedAt: new Date().toISOString(),
    });
  });

  // Verify Bank Account or Government Check Number
  app.post('/api/bank-debit/verify', (req: Request, res: Response) => {
    if (!requireAuthAndPermission(req, res, 'manage_bank_debit')) return;
    const body = (req.body || {}) as {
      bankCode?: unknown;
      accountOrCheckNumber?: unknown;
      customerName?: unknown;
    };

    const bankCode = typeof body.bankCode === 'string' ? (body.bankCode as BankGatewayCode) : null;
    if (!bankCode || !GATEWAYS[bankCode]) {
      res.status(400).json({ ok: false, error: 'Chagua benki halali (NMB, CRDB, EXIM, MWALIMU au GOV_PAYROLL).' });
      return;
    }

    const cfg = GATEWAYS[bankCode];
    const cleanNum = sanitizeAccountOrCheck(body.accountOrCheckNumber);
    if (!isValidAccountOrCheckFormat(cleanNum, cfg)) {
      res.status(400).json({
        ok: false,
        error:
          bankCode === 'GOV_PAYROLL'
            ? `Check Number lazima iwe na herufi/tarakimu ${cfg.minDigits} hadi ${cfg.maxDigits}.`
            : `Namba ya akaunti ya ${bankCode} lazima iwe na tarakimu ${cfg.minDigits} hadi ${cfg.maxDigits}.`,
      });
      return;
    }

    const masked =
      cleanNum.length > 4
        ? `${'*'.repeat(Math.max(2, cleanNum.length - 4))}${cleanNum.slice(-4)}`
        : cleanNum;
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 120) : 'Mteja';
    const mode = getGatewayMode(cfg);

    res.json({
      ok: true,
      verified: true,
      bankCode: cfg.code,
      bankLabel: cfg.label,
      swiftOrSystem: cfg.swiftOrSystem,
      accountOrCheckNumber: cleanNum,
      maskedAccount: masked,
      accountHolderName: customerName,
      gatewayMode: mode.liveConfigured ? 'live_api' : 'sandbox_api',
      message:
        bankCode === 'GOV_PAYROLL'
          ? `Check Number #${cleanNum} ya Mtumishi wa Serikali imehakikiwa kwa makato ya moja kwa moja.`
          : `Akaunti ${masked} (${cfg.label}) imehakikiwa na iko tayari kwa makato ya Direct Debit.`,
    });
  });

  // Single Direct Debit / Gov Check Number Deduction
  app.post('/api/bank-debit/deduct', async (req: Request, res: Response) => {
    if (!requireAuthAndPermission(req, res, 'manage_bank_debit')) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const bankCode = typeof body.bankCode === 'string' ? (body.bankCode as BankGatewayCode) : null;
    const deductionType =
      body.deductionType === 'gov_check_number' ? 'gov_check_number' : 'bank_direct_debit';

    if (!bankCode || !GATEWAYS[bankCode]) {
      res.status(400).json({ success: false, error: 'Chagua benki halali au mfumo wa Check Number.' });
      return;
    }

    if (typeof body.customerId !== 'string' || typeof body.loanId !== 'string' || !body.customerId.trim() || !body.loanId.trim()) {
      res.status(400).json({ success: false, error: 'Taarifa za mteja au mkopo hazijakamilika.' });
      return;
    }

    const result = await processSingleDeduction({
      customerId: body.customerId.trim().slice(0, 128),
      customerName: typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 120) : 'Mteja',
      loanId: body.loanId.trim().slice(0, 128),
      bankCode,
      deductionType,
      accountOrCheckNumber: typeof body.accountOrCheckNumber === 'string' ? body.accountOrCheckNumber : '',
      amount: Number(body.amount) || 0,
      mandateAuthorized: Boolean(body.mandateAuthorized),
      narration: typeof body.narration === 'string' ? body.narration : undefined,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  // Batch Direct Debit / Gov Check Number Deduction
  app.post('/api/bank-debit/batch-deduct', async (req: Request, res: Response) => {
    if (!requireAuthAndPermission(req, res, 'manage_bank_debit')) return;
    const body = (req.body || {}) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ ok: false, error: 'Chagua angalau mteja mmoja kwa ajili ya makato.' });
      return;
    }
    if (body.items.length > 100) {
      res.status(400).json({ ok: false, error: 'Kundi moja linaweza kubeba wateja wasiozidi 100.' });
      return;
    }

    const results: DeductItemResult[] = [];
    for (const raw of body.items) {
      const item = (raw || {}) as Record<string, unknown>;
      const bankCode = typeof item.bankCode === 'string' ? (item.bankCode as BankGatewayCode) : 'NMB';
      const deductionType: DeductionType =
        item.deductionType === 'gov_check_number' ? 'gov_check_number' : 'bank_direct_debit';
      const r = await processSingleDeduction({
        customerId: typeof item.customerId === 'string' ? item.customerId.trim().slice(0, 128) : '',
        customerName: typeof item.customerName === 'string' ? item.customerName.trim().slice(0, 120) : 'Mteja',
        loanId: typeof item.loanId === 'string' ? item.loanId.trim().slice(0, 128) : '',
        bankCode,
        deductionType,
        accountOrCheckNumber: typeof item.accountOrCheckNumber === 'string' ? item.accountOrCheckNumber : '',
        amount: Number(item.amount) || 0,
        mandateAuthorized: Boolean(item.mandateAuthorized),
        narration: typeof item.narration === 'string' ? item.narration : undefined,
      });
      results.push(r);
    }

    res.json({ ok: true, results });
  });

  // =========================================================================
  // Regular SMS Gateway API (/api/sms/status, /api/sms/send, /api/sms/send-bulk)
  // =========================================================================
  const SANDBOX_SMS_SECRET = crypto.randomBytes(32).toString('hex');
  const smsTelemetry = {
    dateKey: new Date().toISOString().slice(0, 10),
    totalDispatchedToday: 0,
    lastAutoRunAt: null as string | null,
    lastAutoSentCount: 0,
  };

  function recordSmsDispatch(sentCount: number, triggerType: 'manual' | 'auto_24h') {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (smsTelemetry.dateKey !== todayKey) {
      smsTelemetry.dateKey = todayKey;
      smsTelemetry.totalDispatchedToday = 0;
    }
    smsTelemetry.totalDispatchedToday += sentCount;
    if (triggerType === 'auto_24h') {
      smsTelemetry.lastAutoRunAt = new Date().toISOString();
      smsTelemetry.lastAutoSentCount = sentCount;
    }
  }

  function getSmsGatewayConfig() {
    const url = (process.env.SMS_GATEWAY_API_URL || '').trim();
    const apiKey = (process.env.SMS_GATEWAY_API_KEY || '').trim();
    const secretValue = (process.env.SMS_GATEWAY_SECRET_VALUE || '').trim();
    const senderId =
      (process.env.SMS_GATEWAY_SENDER_ID || 'MM-MICROFIN').trim().slice(0, 15) || 'MM-MICROFIN';
    const liveConfigured = Boolean(url && apiKey && isAllowedExternalHttpsUrl(url));
    return {
      url,
      apiKey,
      secretValue,
      senderId,
      apiKeyConfigured: Boolean(apiKey),
      secretConfigured: Boolean(secretValue),
      liveConfigured,
      signingKey: secretValue || SANDBOX_SMS_SECRET,
    };
  }

  function normalizeSmsPhone(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00255') && digits.length >= 14) {
      return digits.slice(2);
    }
    if (digits.startsWith('2550') && digits.length >= 13) {
      return `255${digits.slice(4)}`;
    }
    if (digits.length === 10 && digits.startsWith('0')) {
      return `255${digits.slice(1)}`;
    }
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('6'))) {
      return `255${digits}`;
    }
    if (digits.length >= 10 && digits.length <= 15) {
      return digits;
    }
    return '';
  }

  interface SmsSendItemInput {
    customerId: string;
    customerName: string;
    recipientPhone: string;
    messageBody: string;
  }

  interface SmsSendItemResult {
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

  async function processSingleSms(input: SmsSendItemInput): Promise<SmsSendItemResult> {
    const cfg = getSmsGatewayConfig();
    const sentAt = new Date().toISOString();
    const phone = normalizeSmsPhone(input.recipientPhone);
    const bodyText = (input.messageBody || '').trim().slice(0, 1000);

    if (!phone) {
      return {
        success: false,
        customerId: input.customerId,
        customerName: input.customerName,
        recipientPhone: String(input.recipientPhone || ''),
        senderId: cfg.senderId,
        segmentsCount: 0,
        gatewayReference: '',
        gatewayMode: cfg.liveConfigured ? 'live_api' : 'sandbox_api',
        secretConfigured: cfg.secretConfigured,
        signatureDigest: '',
        sentAt,
        statusMessage: 'Namba ya simu si sahihi kwa kutuma SMS (tumia mfano 0712345678 au +255712345678).',
        error: 'Namba ya simu si sahihi.',
      };
    }

    if (bodyText.length < 2) {
      return {
        success: false,
        customerId: input.customerId,
        customerName: input.customerName,
        recipientPhone: `+${phone}`,
        senderId: cfg.senderId,
        segmentsCount: 0,
        gatewayReference: '',
        gatewayMode: cfg.liveConfigured ? 'live_api' : 'sandbox_api',
        secretConfigured: cfg.secretConfigured,
        signatureDigest: '',
        sentAt,
        statusMessage: 'Ujumbe hauwezi kuwa mtupu.',
        error: 'Maudhui ya ujumbe yanahitajika.',
      };
    }

    const segmentsCount = Math.max(1, Math.ceil(bodyText.length / 160));
    const localRef = makeGatewayRef('SMS');
    const payloadObj = {
      sender_id: cfg.senderId,
      from: cfg.senderId,
      to: `+${phone}`,
      recipient: phone,
      message: bodyText,
      text: bodyText,
      reference: localRef,
    };
    const payloadJson = JSON.stringify(payloadObj);
    const hmacHex = signGatewayPayload(cfg.signingKey, sentAt, payloadJson);
    const signatureDigest = `sha256:${hmacHex.slice(0, 12)}`;

    if (cfg.liveConfigured) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const upstreamRes = await fetch(cfg.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
            'X-SMS-Timestamp': sentAt,
            'X-SMS-Signature': `sha256=${hmacHex}`,
            'X-Signature-Algorithm': 'HMAC-SHA256',
          },
          body: payloadJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const upstreamJson = (await upstreamRes.json().catch(() => ({}))) as {
          reference?: string;
          messageId?: string;
          id?: string;
          message?: string;
        };

        if (!upstreamRes.ok) {
          const msg =
            upstreamJson.message || `Seva ya SMS Gateway imekataa ombi (${upstreamRes.status}).`;
          return {
            success: false,
            customerId: input.customerId,
            customerName: input.customerName,
            recipientPhone: `+${phone}`,
            senderId: cfg.senderId,
            segmentsCount,
            gatewayReference: upstreamJson.reference || '',
            gatewayMode: 'live_api',
            secretConfigured: cfg.secretConfigured,
            signatureDigest,
            sentAt,
            statusMessage: msg,
            error: msg,
          };
        }

        const ref = upstreamJson.reference || upstreamJson.messageId || upstreamJson.id || localRef;
        return {
          success: true,
          customerId: input.customerId,
          customerName: input.customerName,
          recipientPhone: `+${phone}`,
          senderId: cfg.senderId,
          segmentsCount,
          gatewayReference: String(ref),
          gatewayMode: 'live_api',
          secretConfigured: cfg.secretConfigured,
          signatureDigest,
          sentAt,
          statusMessage:
            upstreamJson.message ||
            `SMS imetumwa kikamilifu kwenda +${phone} (${segmentsCount} sehemu · Ref: ${ref}).`,
        };
      } catch (err) {
        const msg =
          err instanceof Error
            ? `Hitilafu ya mtandao kwenda SMS Gateway: ${err.message}`
            : 'Hitilafu ya muunganisho wa SMS Gateway.';
        return {
          success: false,
          customerId: input.customerId,
          customerName: input.customerName,
          recipientPhone: `+${phone}`,
          senderId: cfg.senderId,
          segmentsCount,
          gatewayReference: '',
          gatewayMode: 'live_api',
          secretConfigured: cfg.secretConfigured,
          signatureDigest,
          sentAt,
          statusMessage: msg,
          error: msg,
        };
      }
    }

    return {
      success: true,
      customerId: input.customerId,
      customerName: input.customerName,
      recipientPhone: `+${phone}`,
      senderId: cfg.senderId,
      segmentsCount,
      gatewayReference: localRef,
      gatewayMode: 'sandbox_api',
      secretConfigured: cfg.secretConfigured,
      signatureDigest,
      sentAt,
      statusMessage: `SMS imetumwa kupitia API kwenda +${phone} (Sender: ${cfg.senderId} · Ref: ${localRef}).`,
    };
  }

  app.get('/api/sms/status', (_req: Request, res: Response) => {
    const cfg = getSmsGatewayConfig();
    const todayKey = new Date().toISOString().slice(0, 10);
    const totalToday =
      smsTelemetry.dateKey === todayKey ? smsTelemetry.totalDispatchedToday : 0;
    res.json({
      ok: true,
      mode: cfg.liveConfigured ? 'live_api' : 'sandbox_api',
      senderId: cfg.senderId,
      apiKeyConfigured: cfg.apiKeyConfigured,
      secretConfigured: cfg.secretConfigured,
      envSecretKeyName: 'SMS_GATEWAY_SECRET_VALUE',
      signatureAlgorithm: 'HMAC-SHA256',
      ready: true,
      totalDispatchedToday: totalToday,
      lastAutoRunAt: smsTelemetry.lastAutoRunAt,
      lastAutoSentCount: smsTelemetry.lastAutoSentCount,
    });
  });

  app.post('/api/sms/send', async (req: Request, res: Response) => {
    if (!requireAuthAndPermission(req, res, 'send_messages')) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const triggerType = body.triggerType === 'auto_24h' ? 'auto_24h' : 'manual';
    if (typeof body.customerId !== 'string' || !body.customerId.trim()) {
      res.status(400).json({ success: false, error: 'Chagua mteja kabla ya kutuma SMS.' });
      return;
    }

    const result = await processSingleSms({
      customerId: body.customerId.trim().slice(0, 128),
      customerName:
        typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 120) : 'Mteja',
      recipientPhone: typeof body.recipientPhone === 'string' ? body.recipientPhone : '',
      messageBody: typeof body.messageBody === 'string' ? body.messageBody : '',
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    recordSmsDispatch(1, triggerType);
    res.json(result);
  });

  app.post('/api/sms/send-bulk', async (req: Request, res: Response) => {
    if (!requireAuthAndPermission(req, res, 'send_messages')) return;
    const body = (req.body || {}) as { items?: unknown; triggerType?: unknown };
    const triggerType = body.triggerType === 'auto_24h' ? 'auto_24h' : 'manual';
    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ ok: false, error: 'Chagua angalau mteja mmoja kutuma SMS.' });
      return;
    }
    if (body.items.length > 100) {
      res.status(400).json({ ok: false, error: 'Kundi moja haliwezi kuzidi wateja 100.' });
      return;
    }

    const results: SmsSendItemResult[] = [];
    for (const raw of body.items) {
      const item = (raw || {}) as Record<string, unknown>;
      const r = await processSingleSms({
        customerId: typeof item.customerId === 'string' ? item.customerId.trim().slice(0, 128) : '',
        customerName:
          typeof item.customerName === 'string' ? item.customerName.trim().slice(0, 120) : 'Mteja',
        recipientPhone: typeof item.recipientPhone === 'string' ? item.recipientPhone : '',
        messageBody: typeof item.messageBody === 'string' ? item.messageBody : '',
      });
      results.push(r);
    }

    const totalSent = results.filter((r) => r.success).length;
    if (totalSent > 0) {
      recordSmsDispatch(totalSent, triggerType);
    }

    res.json({
      ok: true,
      results,
      totalSent,
      totalFailed: results.filter((r) => !r.success).length,
      triggerType,
    });
  });

  // Global JSON error handler for API/body-parser failures (prevents HTML stack traces)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const errObj = err as { status?: number; type?: string };
    if (errObj?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      res.status(400).json({
        ok: false,
        success: false,
        error: 'Muundo wa JSON uliotumwa si sahihi.',
      });
      return;
    }
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      res.status(413).json({
        ok: false,
        success: false,
        error: 'Ukubwa wa data iliyotumwa ni mkubwa kupita kiasi.',
      });
      return;
    }
    res.status(500).json({
      ok: false,
      success: false,
      error: 'Hitilafu ya ndani ya seva imetokea. Tafadhali jaribu tena.',
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`MM-MICROFINANCE server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
