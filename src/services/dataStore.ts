import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, verifyFirestoreConnection } from '../firebase';
import {
  BankDebitTransaction,
  CompanySettings,
  Customer,
  DailyTask,
  Loan,
  LoanApplication,
  LoanType,
  MessageLog,
  Repayment,
  StaffAccount,
  StaffPermission,
} from '../types';
import { ALL_STAFF_PERMISSIONS } from '../utils/permissions';

const STORAGE_KEY = 'mm_microfinance_local_v1';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function defaultCompanySettings(ownerId = 'local'): CompanySettings {
  return {
    id: ownerId === 'local' ? 'company_local' : `company_${ownerId}`.slice(0, 120),
    ownerId,
    companyName: 'MM-MICROFINANCE',
    contractOrgName: 'MHAIKI_ONLINE_MICRO-CREDIT',
    district: 'TANDAHIMBA',
    region: 'MTAA WA AMANI-MTWARA',
    phone: '0627583847 / 0628007659',
    email: 'kennethmhaiki8@gmail.com',
    lenderName: 'Mwanaharusi Said Mzee',
    lenderWitnessName: 'Kenneth Mhaiki',
    defaultPenaltyPercent: 5,
    paymentChannelsNote: 'M-Pesa / Tigo Pesa / Benki (NMB / CRDB)',
  };
}

export function formatFirestoreErrorForUser(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  let inner = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
    if (parsed && typeof parsed.error === 'string') {
      inner = parsed.error;
    }
  } catch {
    // Plain error message
  }
  const lower = inner.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('permission_denied')) {
    return 'Ruhusa ya kuhifadhi kwenye wingu imekataliwa au taarifa za lazima hazijakamilika (hakikisha jina >= herufi 2, simu >= tarakimu 5, mtaa na wilaya vimejazwa).';
  }
  if (lower.includes('unavailable') || lower.includes('network') || lower.includes('offline')) {
    return 'Mtandao haupatikani kwa sasa. Tafadhali hakikisha intaneti ipo na jaribu tena.';
  }
  if (lower.includes('not-found') || lower.includes('no document to update')) {
    return 'Rekodi haikupatikana kwenye wingu. Jaribu kusawazisha wingu kwanza.';
  }
  if (lower.includes('popup-closed-by-user')) {
    return 'Dirisha la kuingia Google lilifungwa kabla ya kukamilika.';
  }
  return inner || 'Hitilafu isiyotarajiwa imetokea wakati wa kuhifadhi.';
}

export function defaultLoanTypes(ownerId = 'local'): LoanType[] {
  const suffix = ownerId !== 'local' ? `_${ownerId.slice(0, 8)}` : '';
  return [
    {
      id: `type_biashara_mwezi${suffix}`,
      ownerId,
      name: 'Mkopo wa Biashara (Mwezi)',
      description: 'Mkopo wa kukuza biashara ndogo na za kati kwa marejesho ya kila mwezi.',
      defaultInterestType: 'flat',
      defaultInterestValue: 20,
      defaultFrequency: 'monthly',
      defaultDuration: 3,
      defaultPenaltyPercent: 5,
    },
    {
      id: `type_wiki_haraka${suffix}`,
      ownerId,
      name: 'Mkopo wa Wafanyabiashara (Wiki)',
      description: 'Mkopo wa marejesho ya kila wiki kwa wafanyabiashara wa sokoni na madukani.',
      defaultInterestType: 'flat',
      defaultInterestValue: 20,
      defaultFrequency: 'weekly',
      defaultDuration: 4,
      defaultPenaltyPercent: 5,
    },
    {
      id: `type_dharura${suffix}`,
      ownerId,
      name: 'Mkopo wa Dharura',
      description: 'Mkopo wa haraka wa muda mfupi kwa mahitaji ya dharura.',
      defaultInterestType: 'reducing',
      defaultInterestValue: 10,
      defaultFrequency: 'weekly',
      defaultDuration: 4,
      defaultPenaltyPercent: 10,
    },
    {
      id: `type_kilimo${suffix}`,
      ownerId,
      name: 'Mkopo wa Kilimo & Pembejeo',
      description: 'Mkopo maalum kwa wakulima wa korosho, ufuta na mazao ya biashara.',
      defaultInterestType: 'flat',
      defaultInterestValue: 18,
      defaultFrequency: 'monthly',
      defaultDuration: 6,
      defaultPenaltyPercent: 5,
    },
  ];
}

export interface LocalStoreSnapshot {
  company: CompanySettings;
  loanTypes: LoanType[];
  customers: Customer[];
  loans: Loan[];
  repayments: Repayment[];
  messageLogs: MessageLog[];
  loanApplications: LoanApplication[];
  bankDebitTransactions: BankDebitTransaction[];
  staffAccounts?: StaffAccount[];
  tasks?: DailyTask[];
}

export function loadLocalStore(): LocalStoreSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStoreSnapshot>;
      const baseCompany = parsed.company || defaultCompanySettings('local');
      // Upgrade initial placeholder contacts if unchanged
      const company: CompanySettings = {
        ...baseCompany,
        phone:
          !baseCompany.phone || baseCompany.phone === '+255 712 345 678'
            ? '0627583847 / 0628007659'
            : baseCompany.phone,
        email:
          !baseCompany.email || baseCompany.email === 'info@mm-microfinance.co.tz'
            ? 'kennethmhaiki8@gmail.com'
            : baseCompany.email,
        region:
          !baseCompany.region ||
          baseCompany.region === 'Mtwara' ||
          baseCompany.region === 'Mkoa wa Mtwara'
            ? 'MTAA WA AMANI-MTWARA'
            : baseCompany.region,
      };
      return {
        company,
        loanTypes:
          Array.isArray(parsed.loanTypes) && parsed.loanTypes.length > 0
            ? parsed.loanTypes
            : defaultLoanTypes('local'),
        customers: Array.isArray(parsed.customers) ? parsed.customers : [],
        loans: Array.isArray(parsed.loans) ? parsed.loans : [],
        repayments: Array.isArray(parsed.repayments) ? parsed.repayments : [],
        messageLogs: Array.isArray(parsed.messageLogs) ? parsed.messageLogs : [],
        loanApplications: Array.isArray(parsed.loanApplications)
          ? parsed.loanApplications
          : [],
        bankDebitTransactions: Array.isArray(parsed.bankDebitTransactions)
          ? parsed.bankDebitTransactions
          : [],
        staffAccounts: Array.isArray(parsed.staffAccounts) ? parsed.staffAccounts : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      };
    }
  } catch {
    // Fallback to clean defaults
  }
  return {
    company: defaultCompanySettings('local'),
    loanTypes: defaultLoanTypes('local'),
    customers: [],
    loans: [],
    repayments: [],
    messageLogs: [],
    loanApplications: [],
    bankDebitTransactions: [],
    staffAccounts: [],
    tasks: [],
  };
}

export function saveLocalStore(snapshot: LocalStoreSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function clampStr(val: string | undefined, max: number): string {
  return (val || '').trim().slice(0, max);
}

function ensureMinLen(val: string | undefined, min: number, max: number, fallback: string): string {
  const cleaned = clampStr(val, max);
  return cleaned.length >= min ? cleaned : fallback.slice(0, max);
}

export function sanitizeCompanyPayload(c: CompanySettings, uid: string, isCreate: boolean) {
  const base: Record<string, unknown> = {
    ownerId: uid,
    companyName: ensureMinLen(c.companyName, 2, 120, 'MM-MICROFINANCE'),
    contractOrgName: ensureMinLen(c.contractOrgName, 2, 120, 'MHAIKI_ONLINE_MICRO-CREDIT'),
    district: ensureMinLen(c.district, 2, 80, 'TANDAHIMBA'),
    region: clampStr(c.region, 80),
    phone: ensureMinLen(c.phone, 5, 30, '0627583847'),
    email: clampStr(c.email, 120),
    lenderName: ensureMinLen(c.lenderName, 2, 120, 'Mwanaharusi Said Mzee'),
    lenderWitnessName: ensureMinLen(c.lenderWitnessName, 2, 120, 'Kenneth Mhaiki'),
    defaultPenaltyPercent: Math.min(100, Math.max(0, Number(c.defaultPenaltyPercent) || 0)),
    paymentChannelsNote: clampStr(c.paymentChannelsNote, 300),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeLoanTypePayload(lt: LoanType, uid: string, isCreate: boolean) {
  const base: Record<string, unknown> = {
    ownerId: uid,
    name: ensureMinLen(lt.name, 2, 100, 'Mkopo'),
    description: clampStr(lt.description, 300),
    defaultInterestType: ['flat', 'reducing', 'fixed_amount'].includes(lt.defaultInterestType)
      ? lt.defaultInterestType
      : 'flat',
    defaultInterestValue: Math.max(0, Number(lt.defaultInterestValue) || 0),
    defaultFrequency: ['weekly', 'monthly'].includes(lt.defaultFrequency)
      ? lt.defaultFrequency
      : 'monthly',
    defaultDuration: Math.min(600, Math.max(1, Math.round(Number(lt.defaultDuration) || 1))),
    defaultPenaltyPercent: Math.min(100, Math.max(0, Number(lt.defaultPenaltyPercent) || 0)),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeCustomerPayload(cust: Customer, uid: string, isCreate: boolean) {
  const validBank =
    cust.bankName === 'NMB' ||
    cust.bankName === 'CRDB' ||
    cust.bankName === 'EXIM' ||
    cust.bankName === 'MWALIMU'
      ? cust.bankName
      : '';
  const base: Record<string, unknown> = {
    ownerId: uid,
    fullName: ensureMinLen(cust.fullName, 2, 120, 'Mteja'),
    phone: ensureMinLen(cust.phone, 5, 30, '00000'),
    email: clampStr(cust.email, 120),
    idNumber: clampStr(cust.idNumber, 60),
    street: ensureMinLen(cust.street, 2, 100, 'Mtaa'),
    district: ensureMinLen(cust.district, 2, 80, 'TANDAHIMBA'),
    occupation: clampStr(cust.occupation, 100),
    witnessName: ensureMinLen(cust.witnessName, 2, 120, 'Mdhamini'),
    witnessPhone: ensureMinLen(cust.witnessPhone, 5, 30, '00000'),
    witnessStreet: clampStr(cust.witnessStreet, 100),
    witnessDistrict: clampStr(cust.witnessDistrict, 80),
    collateral: clampStr(cust.collateral, 200),
    bankName: validBank,
    bankAccountNumber: clampStr(cust.bankAccountNumber, 40),
    isGovernmentEmployee: Boolean(cust.isGovernmentEmployee),
    checkNumber: clampStr(cust.checkNumber, 40),
    bankMandateActive: Boolean(cust.bankMandateActive),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeLoanPayload(loan: Loan, uid: string, isCreate: boolean) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  const base: Record<string, unknown> = {
    ownerId: uid,
    customerId: loan.customerId,
    loanTypeName: ensureMinLen(loan.loanTypeName, 2, 100, 'Mkopo'),
    principal: Math.max(1, Math.round(Number(loan.principal) || 1)),
    interestType: ['flat', 'reducing', 'fixed_amount'].includes(loan.interestType)
      ? loan.interestType
      : 'flat',
    interestValue: Math.max(0, Number(loan.interestValue) || 0),
    totalInterest: Math.max(0, Math.round(Number(loan.totalInterest) || 0)),
    penaltyPercent: Math.min(100, Math.max(0, Number(loan.penaltyPercent) || 0)),
    penaltyApplied: Math.max(0, Math.round(Number(loan.penaltyApplied) || 0)),
    frequency: ['weekly', 'monthly'].includes(loan.frequency) ? loan.frequency : 'monthly',
    durationCount: Math.min(600, Math.max(1, Math.round(Number(loan.durationCount) || 1))),
    startDate: ensureMinLen(loan.startDate, 8, 30, todayFallback),
    endDate: ensureMinLen(loan.endDate, 8, 30, todayFallback),
    totalDue: Math.max(1, Math.round(Number(loan.totalDue) || 1)),
    totalPaidPrincipal: Math.max(0, Math.round(Number(loan.totalPaidPrincipal) || 0)),
    totalPaidInterest: Math.max(0, Math.round(Number(loan.totalPaidInterest) || 0)),
    totalPaidPenalty: Math.max(0, Math.round(Number(loan.totalPaidPenalty) || 0)),
    status: ['active', 'completed', 'overdue'].includes(loan.status) ? loan.status : 'active',
    collateral: clampStr(loan.collateral, 200),
    notes: clampStr(loan.notes, 400),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeRepaymentPayload(rep: Repayment, uid: string) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  return {
    ownerId: uid,
    loanId: rep.loanId,
    customerId: rep.customerId,
    receiptNumber: ensureMinLen(rep.receiptNumber, 3, 60, 'MM-1000'),
    amount: Math.max(1, Math.round(Number(rep.amount) || 1)),
    principalPortion: Math.max(0, Math.round(Number(rep.principalPortion) || 0)),
    interestPortion: Math.max(0, Math.round(Number(rep.interestPortion) || 0)),
    penaltyPortion: Math.max(0, Math.round(Number(rep.penaltyPortion) || 0)),
    paymentMethod: ['cash', 'bank', 'mobile_money'].includes(rep.paymentMethod)
      ? rep.paymentMethod
      : 'cash',
    channelDetail: clampStr(rep.channelDetail, 100),
    paymentDate: ensureMinLen(rep.paymentDate, 8, 30, todayFallback),
    balanceAfter: Math.max(0, Math.round(Number(rep.balanceAfter) || 0)),
    notes: clampStr(rep.notes, 300),
    createdAt: serverTimestamp(),
  };
}

export function sanitizeMessageLogPayload(log: MessageLog, uid: string) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  return {
    ownerId: uid,
    customerId: log.customerId,
    channel: ['whatsapp', 'sms', 'social', 'email', 'push'].includes(log.channel)
      ? log.channel
      : 'whatsapp',
    recipientPhone: ensureMinLen(log.recipientPhone, 5, 30, '00000'),
    messageBody: ensureMinLen(log.messageBody, 2, 1000, 'Ujumbe'),
    amountPaidSnapshot: Math.max(0, Math.round(Number(log.amountPaidSnapshot) || 0)),
    amountOwedSnapshot: Math.max(0, Math.round(Number(log.amountOwedSnapshot) || 0)),
    sentDate: ensureMinLen(log.sentDate, 8, 30, todayFallback),
    createdAt: serverTimestamp(),
  };
}

export function sanitizeLoanApplicationPayload(
  app: LoanApplication,
  ownerId: string,
  isCreate: boolean,
) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  const validBank =
    app.bankName === 'NMB' ||
    app.bankName === 'CRDB' ||
    app.bankName === 'EXIM' ||
    app.bankName === 'MWALIMU'
      ? app.bankName
      : '';
  const base: Record<string, unknown> = {
    ownerId,
    fullName: ensureMinLen(app.fullName, 2, 120, 'Mwombaji'),
    phone: ensureMinLen(app.phone, 5, 30, '00000'),
    email: clampStr(app.email, 120),
    idNumber: clampStr(app.idNumber, 60),
    street: ensureMinLen(app.street, 2, 100, 'Mtaa'),
    district: ensureMinLen(app.district, 2, 80, 'TANDAHIMBA'),
    occupation: clampStr(app.occupation, 100),
    witnessName: ensureMinLen(app.witnessName, 2, 120, 'Mdhamini'),
    witnessPhone: ensureMinLen(app.witnessPhone, 5, 30, '00000'),
    collateral: clampStr(app.collateral, 200),
    bankName: validBank,
    bankAccountNumber: clampStr(app.bankAccountNumber, 40),
    isGovernmentEmployee: Boolean(app.isGovernmentEmployee),
    checkNumber: clampStr(app.checkNumber, 40),
    loanTypeName: ensureMinLen(app.loanTypeName, 2, 100, 'Mkopo'),
    requestedAmount: Math.max(1000, Math.round(Number(app.requestedAmount) || 1000)),
    interestType: ['flat', 'reducing', 'fixed_amount'].includes(app.interestType)
      ? app.interestType
      : 'flat',
    interestValue: Math.max(0, Number(app.interestValue) || 0),
    frequency: ['weekly', 'monthly'].includes(app.frequency) ? app.frequency : 'monthly',
    durationCount: Math.min(600, Math.max(1, Math.round(Number(app.durationCount) || 1))),
    purpose: clampStr(app.purpose, 400),
    status: ['pending', 'approved', 'rejected'].includes(app.status) ? app.status : 'pending',
    reviewNote: clampStr(app.reviewNote, 300),
    approvedLoanId: clampStr(app.approvedLoanId, 128),
    submittedDate: ensureMinLen(app.submittedDate, 8, 30, todayFallback),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeBankDebitPayload(tx: BankDebitTransaction, uid: string) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  const validBank =
    tx.bankCode === 'NMB' ||
    tx.bankCode === 'CRDB' ||
    tx.bankCode === 'EXIM' ||
    tx.bankCode === 'MWALIMU' ||
    tx.bankCode === 'GOV_PAYROLL'
      ? tx.bankCode
      : 'NMB';
  return {
    ownerId: uid,
    customerId: tx.customerId,
    loanId: tx.loanId,
    repaymentId: clampStr(tx.repaymentId, 128),
    deductionType:
      tx.deductionType === 'gov_check_number' ? 'gov_check_number' : 'bank_direct_debit',
    bankCode: validBank,
    accountOrCheckNumber: ensureMinLen(tx.accountOrCheckNumber, 1, 40, '-'),
    amount: Math.max(1, Math.round(Number(tx.amount) || 1)),
    gatewayReference: ensureMinLen(tx.gatewayReference, 2, 80, 'REF-BANK'),
    gatewayMode: tx.gatewayMode === 'live_api' ? 'live_api' : 'sandbox_api',
    status: tx.status === 'failed' ? 'failed' : 'completed',
    statusMessage: ensureMinLen(tx.statusMessage, 2, 300, 'Imekatwa'),
    processedDate: ensureMinLen(tx.processedDate, 8, 30, todayFallback),
    createdAt: serverTimestamp(),
  };
}

export function sanitizeStaffAccountPayload(staff: StaffAccount, uid: string, isCreate: boolean) {
  const validPermsSet = new Set<string>(ALL_STAFF_PERMISSIONS);
  const cleanedUsername = clampStr(staff.username, 60).replace(/[^a-zA-Z0-9_.\-]/g, '');
  const username = cleanedUsername.length >= 3 ? cleanedUsername : 'staff_user';
  const usernameLower = username.toLowerCase();
  const permissions: StaffPermission[] = Array.from(
    new Set(
      (Array.isArray(staff.permissions) ? staff.permissions : []).filter(
        (p): p is StaffPermission => typeof p === 'string' && validPermsSet.has(p),
      ),
    ),
  ).slice(0, 20);

  const base: Record<string, unknown> = {
    ownerId: uid,
    fullName: ensureMinLen(staff.fullName, 2, 120, 'Mfanyakazi'),
    phone: clampStr(staff.phone, 30),
    roleTitle: ensureMinLen(staff.roleTitle, 2, 80, 'Afisa'),
    username,
    usernameLower,
    passwordHash: ensureMinLen(staff.passwordHash, 20, 300, 'invalid_placeholder_hash_00'),
    accountStatus: staff.accountStatus === 'locked' ? 'locked' : 'active',
    lockReason: clampStr(staff.lockReason, 200),
    permissions,
    lastLoginAt: clampStr(staff.lastLoginAt, 40),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function sanitizeDailyTaskPayload(task: DailyTask, uid: string, isCreate: boolean) {
  const todayFallback = new Date().toISOString().slice(0, 10);
  const cleanedCustomerId = clampStr(task.customerId, 128).replace(/[^a-zA-Z0-9_\-]/g, '');
  const base: Record<string, unknown> = {
    ownerId: uid,
    title: ensureMinLen(task.title, 2, 160, 'Kazi ya Siku'),
    notes: clampStr(task.notes, 400),
    dueDate: ensureMinLen(task.dueDate, 8, 30, todayFallback),
    dueTime: clampStr(task.dueTime, 10),
    priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
    category: ['customer_call', 'report', 'collection', 'general'].includes(task.category)
      ? task.category
      : 'general',
    customerId: cleanedCustomerId,
    customerName: clampStr(task.customerName, 120),
    assignedToUsername: clampStr(task.assignedToUsername, 60),
    assignedToName: clampStr(task.assignedToName, 120),
    createdByUsername: ensureMinLen(task.createdByUsername, 2, 60, 'admin'),
    createdByName: ensureMinLen(task.createdByName, 2, 120, 'Msimamizi'),
    completed: Boolean(task.completed),
    completedAt: clampStr(task.completedAt, 40),
    completedByName: clampStr(task.completedByName, 120),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function subscribeUserCollections(
  user: User,
  callbacks: {
    onCompany: (items: CompanySettings[]) => void;
    onLoanTypes: (items: LoanType[]) => void;
    onCustomers: (items: Customer[]) => void;
    onLoans: (items: Loan[]) => void;
    onRepayments: (items: Repayment[]) => void;
    onMessageLogs: (items: MessageLog[]) => void;
    onLoanApplications: (items: LoanApplication[]) => void;
    onBankDebitTransactions: (items: BankDebitTransaction[]) => void;
    onStaffAccounts?: (items: StaffAccount[]) => void;
    onTasks?: (items: DailyTask[]) => void;
  },
): () => void {
  const uid = user.uid;

  const unsubCompany = onSnapshot(
    query(collection(db, 'companySettings'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onCompany(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanySettings, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'companySettings'),
  );

  const unsubLoanTypes = onSnapshot(
    query(collection(db, 'loanTypes'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onLoanTypes(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LoanType, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'loanTypes'),
  );

  const unsubCustomers = onSnapshot(
    query(collection(db, 'customers'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onCustomers(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
  );

  const unsubLoans = onSnapshot(
    query(collection(db, 'loans'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onLoans(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Loan, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'loans'),
  );

  const unsubRepayments = onSnapshot(
    query(collection(db, 'repayments'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onRepayments(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Repayment, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'repayments'),
  );

  const unsubMessages = onSnapshot(
    query(collection(db, 'messageLogs'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onMessageLogs(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageLog, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'messageLogs'),
  );

  const isAdminUser = user.email?.toLowerCase() === 'kennethmhaiki@gmail.com';
  const appsQuery = isAdminUser
    ? query(collection(db, 'loanApplications'), where('ownerId', 'in', [uid, 'public_portal']))
    : query(collection(db, 'loanApplications'), where('ownerId', '==', uid));

  const unsubApplications = onSnapshot(
    appsQuery,
    (snap) => {
      callbacks.onLoanApplications(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LoanApplication, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'loanApplications'),
  );

  const unsubBankDebits = onSnapshot(
    query(collection(db, 'bankDebitTransactions'), where('ownerId', '==', uid)),
    (snap) => {
      callbacks.onBankDebitTransactions(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BankDebitTransaction, 'id'>),
        })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'bankDebitTransactions'),
  );

  const unsubStaffAccounts = callbacks.onStaffAccounts
    ? onSnapshot(
        query(collection(db, 'staffAccounts'), where('ownerId', '==', uid)),
        (snap) => {
          callbacks.onStaffAccounts?.(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StaffAccount, 'id'>),
            })),
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'staffAccounts'),
      )
    : () => {};

  const unsubTasks = callbacks.onTasks
    ? onSnapshot(
        query(collection(db, 'tasks'), where('ownerId', '==', uid)),
        (snap) => {
          callbacks.onTasks?.(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<DailyTask, 'id'>),
            })),
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'),
      )
    : () => {};

  return () => {
    unsubCompany();
    unsubLoanTypes();
    unsubCustomers();
    unsubLoans();
    unsubRepayments();
    unsubMessages();
    unsubApplications();
    unsubBankDebits();
    unsubStaffAccounts();
    unsubTasks();
  };
}

async function commitBatchedOps(ops: Array<(batch: WriteBatch) => void>): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const apply of chunk) {
      apply(batch);
    }
    await batch.commit();
  }
}

export interface CloudSyncSummary {
  customersSynced: number;
  loansSynced: number;
  repaymentsSynced: number;
  messageLogsSynced: number;
  bankDebitsSynced: number;
  databaseId: string;
  syncedAt: string;
}

export async function pushLocalSnapshotToFirestore(
  user: User,
  local: LocalStoreSnapshot,
): Promise<CloudSyncSummary> {
  const uid = user.uid;
  const conn = await verifyFirestoreConnection('pushLocalSnapshotToFirestore');
  if (!conn.connected) {
    throw new Error(
      'Muunganiko wa intaneti kwenda Firestore haupatikani (offline). Hakikisha mtandao unafanya kazi na jaribu tena.',
    );
  }

  console.info('[Firestore Sync Started]', {
    uid,
    email: user.email,
    databaseId: conn.databaseId,
    customers: local.customers.length,
    loans: local.loans.length,
    repayments: local.repayments.length,
    messageLogs: local.messageLogs.length,
    bankDebits: (local.bankDebitTransactions || []).length,
  });

  try {
    const [
      existingLoanTypesSnap,
      existingCustomersSnap,
      existingLoansSnap,
      existingRepaymentsSnap,
      existingMessagesSnap,
      existingBankDebitsSnap,
      existingStaffSnap,
      existingTasksSnap,
    ] = await Promise.all([
      getDocs(query(collection(db, 'loanTypes'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'customers'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'loans'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'repayments'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'messageLogs'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'bankDebitTransactions'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'staffAccounts'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'tasks'), where('ownerId', '==', uid))),
    ]);

    const existingLoanTypeIds = new Set(existingLoanTypesSnap.docs.map((d) => d.id));
    const existingCustomerIds = new Set(existingCustomersSnap.docs.map((d) => d.id));
    const existingLoansMap = new Map<string, Partial<Loan>>(
      existingLoansSnap.docs.map((d) => [d.id, d.data() as Partial<Loan>]),
    );
    const existingRepaymentIds = new Set(existingRepaymentsSnap.docs.map((d) => d.id));
    const existingMessageIds = new Set(existingMessagesSnap.docs.map((d) => d.id));
    const existingBankDebitIds = new Set(existingBankDebitsSnap.docs.map((d) => d.id));
    const existingStaffIds = new Set(existingStaffSnap.docs.map((d) => d.id));
    const existingTaskIds = new Set(existingTasksSnap.docs.map((d) => d.id));

    // Stage 1: Parent documents (companySettings, loanTypes, customers)
    const stage1Ops: Array<(batch: WriteBatch) => void> = [];

    const compId = `company_${uid}`.slice(0, 120);
    let compExists = false;
    try {
      const compSnap = await getDoc(doc(db, 'companySettings', compId));
      compExists = compSnap.exists();
    } catch {
      compExists = false;
    }

    if (compExists) {
      const compUpd = sanitizeCompanyPayload(local.company, uid, false);
      delete compUpd.ownerId;
      stage1Ops.push((batch) => {
        batch.update(doc(db, 'companySettings', compId), compUpd);
      });
    } else {
      stage1Ops.push((batch) => {
        batch.set(doc(db, 'companySettings', compId), sanitizeCompanyPayload(local.company, uid, true));
      });
    }

    const staticDefaultIds = new Set([
      'type_biashara_mwezi',
      'type_wiki_haraka',
      'type_dharura',
      'type_kilimo',
    ]);

    for (const lt of local.loanTypes) {
      const targetLtId =
        staticDefaultIds.has(lt.id) && !existingLoanTypeIds.has(lt.id)
          ? `${lt.id}_${uid.slice(0, 8)}`
          : lt.id;
      if (existingLoanTypeIds.has(targetLtId)) {
        const ltUpd = sanitizeLoanTypePayload(lt, uid, false);
        delete ltUpd.ownerId;
        stage1Ops.push((batch) => {
          batch.update(doc(db, 'loanTypes', targetLtId), ltUpd);
        });
      } else {
        stage1Ops.push((batch) => {
          batch.set(doc(db, 'loanTypes', targetLtId), sanitizeLoanTypePayload(lt, uid, true));
        });
      }
    }

    const syncedCustomerIds = new Set<string>(existingCustomerIds);
    let customersSynced = 0;
    for (const c of local.customers) {
      if (existingCustomerIds.has(c.id)) {
        const custUpd = sanitizeCustomerPayload(c, uid, false);
        delete custUpd.ownerId;
        stage1Ops.push((batch) => {
          batch.update(doc(db, 'customers', c.id), custUpd);
        });
      } else {
        stage1Ops.push((batch) => {
          batch.set(doc(db, 'customers', c.id), sanitizeCustomerPayload(c, uid, true));
        });
      }
      syncedCustomerIds.add(c.id);
      customersSynced += 1;
    }

    for (const s of local.staffAccounts || []) {
      if (existingStaffIds.has(s.id)) {
        const staffUpd = sanitizeStaffAccountPayload(s, uid, false);
        delete staffUpd.ownerId;
        stage1Ops.push((batch) => {
          batch.update(doc(db, 'staffAccounts', s.id), staffUpd);
        });
      } else {
        stage1Ops.push((batch) => {
          batch.set(doc(db, 'staffAccounts', s.id), sanitizeStaffAccountPayload(s, uid, true));
        });
      }
    }

    for (const t of local.tasks || []) {
      if (existingTaskIds.has(t.id)) {
        const taskUpd = sanitizeDailyTaskPayload(t, uid, false);
        delete taskUpd.ownerId;
        stage1Ops.push((batch) => {
          batch.update(doc(db, 'tasks', t.id), taskUpd);
        });
      } else {
        stage1Ops.push((batch) => {
          batch.set(doc(db, 'tasks', t.id), sanitizeDailyTaskPayload(t, uid, true));
        });
      }
    }

    if (stage1Ops.length > 0) {
      await commitBatchedOps(stage1Ops);
    }
    console.info('[Firestore Sync Stage 1 Committed]', {
      databaseId: conn.databaseId,
      customersSynced,
      stage1OpsCount: stage1Ops.length,
    });

    // Stage 2: Loans (requires customers to already exist in Firestore)
    const stage2Ops: Array<(batch: WriteBatch) => void> = [];
    const syncedLoanIds = new Set<string>(existingLoansMap.keys());
    let loansSynced = 0;

    for (const l of local.loans) {
      if (!syncedCustomerIds.has(l.customerId)) {
        console.warn('[Firestore Sync Warning] Loan skipped because customerId missing:', {
          loanId: l.id,
          customerId: l.customerId,
        });
        continue;
      }

      const existingLoan = existingLoansMap.get(l.id);
      if (!existingLoan) {
        stage2Ops.push((batch) => {
          batch.set(doc(db, 'loans', l.id), sanitizeLoanPayload(l, uid, true));
        });
        loansSynced += 1;
      } else if (existingLoan.status !== 'completed') {
        const localPaidTotal =
          (l.totalPaidPrincipal || 0) + (l.totalPaidInterest || 0) + (l.totalPaidPenalty || 0);
        const cloudPaidTotal =
          (existingLoan.totalPaidPrincipal || 0) +
          (existingLoan.totalPaidInterest || 0) +
          (existingLoan.totalPaidPenalty || 0);

        if (localPaidTotal > cloudPaidTotal || l.status !== existingLoan.status) {
          stage2Ops.push((batch) => {
            batch.update(doc(db, 'loans', l.id), {
              totalPaidPrincipal: Math.max(0, Math.round(l.totalPaidPrincipal || 0)),
              totalPaidInterest: Math.max(0, Math.round(l.totalPaidInterest || 0)),
              totalPaidPenalty: Math.max(0, Math.round(l.totalPaidPenalty || 0)),
              status: ['active', 'completed', 'overdue'].includes(l.status) ? l.status : 'active',
              updatedAt: serverTimestamp(),
            });
          });
          loansSynced += 1;
        } else if ((l.penaltyApplied || 0) > (existingLoan.penaltyApplied || 0)) {
          stage2Ops.push((batch) => {
            batch.update(doc(db, 'loans', l.id), {
              penaltyApplied: Math.max(0, Math.round(l.penaltyApplied || 0)),
              totalDue: Math.max(1, Math.round(l.totalDue || 1)),
              status: ['active', 'completed', 'overdue'].includes(l.status) ? l.status : 'overdue',
              notes: clampStr(l.notes, 400),
              updatedAt: serverTimestamp(),
            });
          });
          loansSynced += 1;
        }
      }
      syncedLoanIds.add(l.id);
    }

    if (stage2Ops.length > 0) {
      await commitBatchedOps(stage2Ops);
    }
    console.info('[Firestore Sync Stage 2 Committed]', {
      databaseId: conn.databaseId,
      loansSynced,
      stage2OpsCount: stage2Ops.length,
    });

    // Stage 3: Child immutable records (repayments, messageLogs, bankDebitTransactions)
    const stage3Ops: Array<(batch: WriteBatch) => void> = [];
    let repaymentsSynced = 0;
    let messageLogsSynced = 0;
    let bankDebitsSynced = 0;

    for (const r of local.repayments) {
      if (existingRepaymentIds.has(r.id)) continue;
      if (!syncedLoanIds.has(r.loanId) || !syncedCustomerIds.has(r.customerId)) continue;
      stage3Ops.push((batch) => {
        batch.set(doc(db, 'repayments', r.id), sanitizeRepaymentPayload(r, uid));
      });
      repaymentsSynced += 1;
    }
    for (const m of local.messageLogs) {
      if (existingMessageIds.has(m.id)) continue;
      if (!syncedCustomerIds.has(m.customerId)) continue;
      stage3Ops.push((batch) => {
        batch.set(doc(db, 'messageLogs', m.id), sanitizeMessageLogPayload(m, uid));
      });
      messageLogsSynced += 1;
    }
    for (const tx of local.bankDebitTransactions || []) {
      if (existingBankDebitIds.has(tx.id)) continue;
      if (!syncedLoanIds.has(tx.loanId) || !syncedCustomerIds.has(tx.customerId)) continue;
      stage3Ops.push((batch) => {
        batch.set(doc(db, 'bankDebitTransactions', tx.id), sanitizeBankDebitPayload(tx, uid));
      });
      bankDebitsSynced += 1;
    }
    if (stage3Ops.length > 0) {
      await commitBatchedOps(stage3Ops);
    }
    console.info('[Firestore Sync Stage 3 Committed]', {
      databaseId: conn.databaseId,
      repaymentsSynced,
      messageLogsSynced,
      bankDebitsSynced,
    });

    // Stage 4: Pending online applications (best-effort, non-blocking for duplicates)
    for (const app of local.loanApplications || []) {
      if (app.status !== 'pending') continue;
      try {
        const existingApp = await getDoc(doc(db, 'loanApplications', app.id));
        if (!existingApp.exists()) {
          await setDoc(
            doc(db, 'loanApplications', app.id),
            sanitizeLoanApplicationPayload(app, 'public_portal', true),
          );
        }
      } catch {
        // Ignore if application already exists in portal or rule rejects duplicate
      }
    }

    const summary: CloudSyncSummary = {
      customersSynced,
      loansSynced,
      repaymentsSynced,
      messageLogsSynced,
      bankDebitsSynced,
      databaseId: conn.databaseId,
      syncedAt: new Date().toISOString(),
    };
    console.info('[Firestore Sync Complete]', summary);
    return summary;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'batch_migration');
  }
}

export async function firestoreCreateCustomerAndLoan(
  uid: string,
  customer: Customer,
  loan: Loan | null,
): Promise<void> {
  const conn = await verifyFirestoreConnection('firestoreCreateCustomerAndLoan');
  if (!conn.connected) {
    throw new Error(
      'Muunganiko wa intaneti kwenda Firestore haupatikani (offline). Hakikisha mtandao unafanya kazi na jaribu tena.',
    );
  }

  console.info('[Firestore Save] Saving customer record...', {
    customerId: customer.id,
    fullName: customer.fullName,
    uid,
    hasLoan: Boolean(loan),
    databaseId: conn.databaseId,
  });

  try {
    await setDoc(doc(db, 'customers', customer.id), sanitizeCustomerPayload(customer, uid, true));
    const customerConfirm = await getDocFromServer(doc(db, 'customers', customer.id));
    console.info('[Firestore Save] Customer confirmed on server', {
      customerId: customer.id,
      exists: customerConfirm.exists(),
      databaseId: conn.databaseId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `customers/${customer.id}`);
  }

  if (loan) {
    console.info('[Firestore Save] Saving loan record...', {
      loanId: loan.id,
      customerId: customer.id,
      principal: loan.principal,
      databaseId: conn.databaseId,
    });
    try {
      await setDoc(doc(db, 'loans', loan.id), sanitizeLoanPayload(loan, uid, true));
      const loanConfirm = await getDocFromServer(doc(db, 'loans', loan.id));
      console.info('[Firestore Save] Loan confirmed on server', {
        loanId: loan.id,
        customerId: customer.id,
        exists: loanConfirm.exists(),
        databaseId: conn.databaseId,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `loans/${loan.id}`);
    }
  }
}

export async function firestoreUpdateCustomer(uid: string, customer: Customer): Promise<void> {
  const path = `customers/${customer.id}`;
  const ref = doc(db, 'customers', customer.id);
  const updatePayload = sanitizeCustomerPayload(customer, uid, false);
  delete updatePayload.ownerId;

  const conn = await verifyFirestoreConnection('firestoreUpdateCustomer');
  if (!conn.connected) {
    throw new Error('Muunganiko wa intaneti kwenda Firestore haupatikani (offline).');
  }

  try {
    await updateDoc(ref, updatePayload);
    console.info('[Firestore Save] Customer updated on server', { customerId: customer.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not-found') || msg.includes('no document to update')) {
      try {
        await setDoc(ref, sanitizeCustomerPayload(customer, uid, true));
        console.info('[Firestore Save] Missing customer created via fallback', {
          customerId: customer.id,
        });
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, path);
      }
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function firestoreDeleteCustomerCascade(
  customerId: string,
  loanIds: string[],
  repaymentIds: string[],
  messageLogIds: string[],
  bankDebitIds: string[] = [],
): Promise<void> {
  try {
    const ops: Array<(batch: WriteBatch) => void> = [];
    for (const rid of repaymentIds) {
      ops.push((batch) => batch.delete(doc(db, 'repayments', rid)));
    }
    for (const tid of bankDebitIds) {
      ops.push((batch) => batch.delete(doc(db, 'bankDebitTransactions', tid)));
    }
    for (const lid of loanIds) {
      ops.push((batch) => batch.delete(doc(db, 'loans', lid)));
    }
    for (const mid of messageLogIds) {
      ops.push((batch) => batch.delete(doc(db, 'messageLogs', mid)));
    }
    ops.push((batch) => batch.delete(doc(db, 'customers', customerId)));
    await commitBatchedOps(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `customers/${customerId}`);
  }
}

export async function firestoreCreateLoan(uid: string, loan: Loan): Promise<void> {
  const conn = await verifyFirestoreConnection('firestoreCreateLoan');
  if (!conn.connected) {
    throw new Error('Muunganiko wa intaneti kwenda Firestore haupatikani (offline).');
  }
  try {
    await setDoc(doc(db, 'loans', loan.id), sanitizeLoanPayload(loan, uid, true));
    console.info('[Firestore Save] Additional loan confirmed', {
      loanId: loan.id,
      customerId: loan.customerId,
      databaseId: conn.databaseId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `loans/${loan.id}`);
  }
}

export async function firestoreRecordRepayment(
  uid: string,
  repayment: Repayment,
  updatedLoan: Loan,
): Promise<void> {
  const conn = await verifyFirestoreConnection('firestoreRecordRepayment');
  if (!conn.connected) {
    throw new Error('Muunganiko wa intaneti kwenda Firestore haupatikani (offline).');
  }
  try {
    await setDoc(doc(db, 'repayments', repayment.id), sanitizeRepaymentPayload(repayment, uid));
    await updateDoc(doc(db, 'loans', updatedLoan.id), {
      totalPaidPrincipal: Math.max(0, Math.round(updatedLoan.totalPaidPrincipal)),
      totalPaidInterest: Math.max(0, Math.round(updatedLoan.totalPaidInterest)),
      totalPaidPenalty: Math.max(0, Math.round(updatedLoan.totalPaidPenalty)),
      status: updatedLoan.status,
      updatedAt: serverTimestamp(),
    });
    console.info('[Firestore Save] Repayment and loan balance confirmed', {
      repaymentId: repayment.id,
      loanId: updatedLoan.id,
      databaseId: conn.databaseId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `repayments/${repayment.id}`);
  }
}

export async function firestoreApplyPenalty(loan: Loan): Promise<void> {
  try {
    await updateDoc(doc(db, 'loans', loan.id), {
      penaltyApplied: Math.max(0, Math.round(loan.penaltyApplied)),
      totalDue: Math.max(1, Math.round(loan.totalDue)),
      status: loan.status,
      notes: clampStr(loan.notes, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `loans/${loan.id}`);
  }
}

export async function firestoreSaveCompany(
  uid: string,
  company: CompanySettings,
  existsInCloud: boolean,
): Promise<void> {
  const compId = `company_${uid}`.slice(0, 120);
  const targetId = existsInCloud && company.id && company.id !== 'company_local' ? company.id : compId;
  try {
    if (!existsInCloud) {
      await setDoc(doc(db, 'companySettings', compId), sanitizeCompanyPayload(company, uid, true));
    } else {
      const updatePayload = sanitizeCompanyPayload(company, uid, false);
      delete updatePayload.ownerId;
      await updateDoc(doc(db, 'companySettings', targetId), updatePayload);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not-found') || msg.includes('no document to update')) {
      try {
        await setDoc(doc(db, 'companySettings', targetId), sanitizeCompanyPayload(company, uid, true));
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, `companySettings/${targetId}`);
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `companySettings/${targetId}`);
  }
}

export async function firestoreSaveLoanType(
  uid: string,
  lt: LoanType,
  isNew: boolean,
): Promise<void> {
  try {
    if (isNew) {
      await setDoc(doc(db, 'loanTypes', lt.id), sanitizeLoanTypePayload(lt, uid, true));
    } else {
      const updatePayload = sanitizeLoanTypePayload(lt, uid, false);
      delete updatePayload.ownerId;
      await updateDoc(doc(db, 'loanTypes', lt.id), updatePayload);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not-found') || msg.includes('no document to update')) {
      try {
        await setDoc(doc(db, 'loanTypes', lt.id), sanitizeLoanTypePayload(lt, uid, true));
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, `loanTypes/${lt.id}`);
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `loanTypes/${lt.id}`);
  }
}

export async function firestoreDeleteLoanType(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'loanTypes', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `loanTypes/${id}`);
  }
}

export async function firestoreLogMessage(uid: string, log: MessageLog): Promise<void> {
  try {
    await setDoc(doc(db, 'messageLogs', log.id), sanitizeMessageLogPayload(log, uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `messageLogs/${log.id}`);
  }
}

export async function firestoreSubmitPublicApplication(
  application: LoanApplication,
): Promise<boolean> {
  try {
    await setDoc(
      doc(db, 'loanApplications', application.id),
      sanitizeLoanApplicationPayload({ ...application, status: 'pending' }, 'public_portal', true),
    );
    return true;
  } catch {
    // Offline or unprovisioned fallback handled by localStorage
    return false;
  }
}

export async function firestoreUpdateApplicationStatus(
  id: string,
  status: 'approved' | 'rejected',
  reviewNote: string,
  approvedLoanId: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'loanApplications', id), {
      status,
      reviewNote: clampStr(reviewNote, 300),
      approvedLoanId: clampStr(approvedLoanId, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `loanApplications/${id}`);
  }
}

export async function firestoreDeleteApplication(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'loanApplications', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `loanApplications/${id}`);
  }
}

export async function firestoreRecordBankDebitTransaction(
  uid: string,
  tx: BankDebitTransaction,
): Promise<void> {
  try {
    await setDoc(doc(db, 'bankDebitTransactions', tx.id), sanitizeBankDebitPayload(tx, uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `bankDebitTransactions/${tx.id}`);
  }
}

export async function firestoreSaveStaffAccount(
  uid: string,
  staff: StaffAccount,
  isNew: boolean,
): Promise<void> {
  const conn = await verifyFirestoreConnection('firestoreSaveStaffAccount');
  if (!conn.connected) {
    throw new Error('Muunganiko wa intaneti kwenda Firestore haupatikani (offline).');
  }
  try {
    if (isNew) {
      await setDoc(doc(db, 'staffAccounts', staff.id), sanitizeStaffAccountPayload(staff, uid, true));
    } else {
      const updatePayload = sanitizeStaffAccountPayload(staff, uid, false);
      delete updatePayload.ownerId;
      await updateDoc(doc(db, 'staffAccounts', staff.id), updatePayload);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not-found') || msg.includes('no document to update')) {
      try {
        await setDoc(doc(db, 'staffAccounts', staff.id), sanitizeStaffAccountPayload(staff, uid, true));
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, `staffAccounts/${staff.id}`);
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `staffAccounts/${staff.id}`);
  }
}

export async function firestoreDeleteStaffAccount(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'staffAccounts', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `staffAccounts/${id}`);
  }
}

export async function firestoreSaveTask(
  uid: string,
  task: DailyTask,
  isNew: boolean,
): Promise<void> {
  const conn = await verifyFirestoreConnection('firestoreSaveTask');
  if (!conn.connected) {
    throw new Error('Muunganiko wa intaneti kwenda Firestore haupatikani (offline).');
  }
  try {
    if (isNew) {
      await setDoc(doc(db, 'tasks', task.id), sanitizeDailyTaskPayload(task, uid, true));
    } else {
      const updatePayload = sanitizeDailyTaskPayload(task, uid, false);
      delete updatePayload.ownerId;
      await updateDoc(doc(db, 'tasks', task.id), updatePayload);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not-found') || msg.includes('no document to update')) {
      try {
        await setDoc(doc(db, 'tasks', task.id), sanitizeDailyTaskPayload(task, uid, true));
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, `tasks/${task.id}`);
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `tasks/${task.id}`);
  }
}

export async function firestoreDeleteTask(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tasks', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
  }
}

export interface MonthlyFirestoreSummary {
  monthKey: string;
  monthStart: string;
  monthEnd: string;
  disbursedPrincipal: number;
  loansIssuedCount: number;
  interestCollected: number;
  penaltyPaid: number;
  principalCollected: number;
  repaymentsCount: number;
}

export function getMonthDateBounds(monthKey: string): { monthStart: string; monthEnd: string } {
  const parts = monthKey.split('-').map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = parts[1] || new Date().getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    monthStart: `${year}-${mm}-01`,
    monthEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function firestoreFetchMonthlySummary(
  uid: string,
  monthKey: string,
): Promise<MonthlyFirestoreSummary> {
  const { monthStart, monthEnd } = getMonthDateBounds(monthKey);

  let loansSnap;
  try {
    loansSnap = await getDocs(query(collection(db, 'loans'), where('ownerId', '==', uid)));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'loans');
  }

  let repaymentsSnap;
  try {
    repaymentsSnap = await getDocs(
      query(collection(db, 'repayments'), where('ownerId', '==', uid)),
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'repayments');
  }

  let disbursedPrincipal = 0;
  let loansIssuedCount = 0;
  for (const d of loansSnap.docs) {
    const data = d.data() as Partial<Loan>;
    const start = data.startDate || '';
    if (start >= monthStart && start <= monthEnd) {
      disbursedPrincipal += Number(data.principal) || 0;
      loansIssuedCount += 1;
    }
  }

  let interestCollected = 0;
  let penaltyPaid = 0;
  let principalCollected = 0;
  let repaymentsCount = 0;
  for (const d of repaymentsSnap.docs) {
    const data = d.data() as Partial<Repayment>;
    const payDate = data.paymentDate || '';
    if (payDate >= monthStart && payDate <= monthEnd) {
      interestCollected += Number(data.interestPortion) || 0;
      penaltyPaid += Number(data.penaltyPortion) || 0;
      principalCollected += Number(data.principalPortion) || 0;
      repaymentsCount += 1;
    }
  }

  return {
    monthKey,
    monthStart,
    monthEnd,
    disbursedPrincipal,
    loansIssuedCount,
    interestCollected,
    penaltyPaid,
    principalCollected,
    repaymentsCount,
  };
}
