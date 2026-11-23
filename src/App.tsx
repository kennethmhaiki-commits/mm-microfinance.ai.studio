import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { Cloud, Globe, Lock, LogOut, Menu, UploadCloud, UserPlus } from 'lucide-react';
import { ApplicationsView } from './components/ApplicationsView';
import { BankDirectDebitView } from './components/BankDirectDebitView';
import { CalculatorView } from './components/CalculatorView';
import { CollectionsReceiptsView } from './components/CollectionsReceiptsView';
import { CompanySettingsView } from './components/CompanySettingsView';
import { ContractView } from './components/ContractView';
import { CustomersLoansView } from './components/CustomersLoansView';
import { DashboardTaskInput } from './components/DashboardTasksSection';
import { DashboardView } from './components/DashboardView';
import { GoogleFormsView } from './components/GoogleFormsView';
import { GoogleSlidesView } from './components/GoogleSlidesView';
import { LoginGate } from './components/LoginGate';
import { LoanTypesView } from './components/LoanTypesView';
import { LoansPenaltyView } from './components/LoansPenaltyView';
import { MessagingView } from './components/MessagingView';
import { ReceiptModal } from './components/ReceiptModal';
import { RepayModal } from './components/RepayModal';
import { RevenueReportView } from './components/RevenueReportView';
import { ScheduleView } from './components/ScheduleView';
import { Sidebar } from './components/Sidebar';
import { StaffAccountsView } from './components/StaffAccountsView';
import { auth, googleProvider } from './firebase';
import {
  fetchCurrentSession,
  hashStaffPasswordOnServer,
  setAuthBearerToken,
  syncStaffDirectoryToServer,
} from './services/authApi';
import { getBankDisplayLabel } from './services/bankDebitApi';
import {
  defaultLoanTypes,
  firestoreApplyPenalty,
  firestoreCreateCustomerAndLoan,
  firestoreCreateLoan,
  firestoreDeleteApplication,
  firestoreDeleteCustomerCascade,
  firestoreDeleteLoanType,
  firestoreDeleteStaffAccount,
  firestoreDeleteTask,
  firestoreLogMessage,
  firestoreRecordBankDebitTransaction,
  firestoreRecordRepayment,
  firestoreSaveCompany,
  firestoreSaveLoanType,
  firestoreSaveStaffAccount,
  firestoreSaveTask,
  firestoreSubmitPublicApplication,
  firestoreUpdateApplicationStatus,
  firestoreUpdateCustomer,
  formatFirestoreErrorForUser,
  loadLocalStore,
  makeId,
  pushLocalSnapshotToFirestore,
  saveLocalStore,
  subscribeUserCollections,
} from './services/dataStore';
import {
  getPushPermissionStatus,
  hasAutoSmsDispatchedLocally,
  loadAutoReminderPrefs,
  markAutoSmsDispatchedLocally,
  PushPermissionState,
  requestPushPermission,
  saveAutoReminderPrefs,
  sendBrowserPushNotification,
} from './services/notifications';
import { sendBulkSmsViaApi, sendSmsViaApi } from './services/smsApi';
import {
  AuthSession,
  BankDebitCode,
  BankDebitTransaction,
  BankDeductionType,
  CompanySettings,
  Customer,
  DailyTask,
  InterestType,
  Loan,
  LoanApplication,
  LoanType,
  MessageChannel,
  MessageLog,
  PaymentMethod,
  Repayment,
  RepaymentFrequency,
  StaffAccount,
  StaffAccountStatus,
  StaffPermission,
  TomorrowReminderItem,
  ViewTab,
} from './types';
import {
  buildAutoSmsLogPrefix,
  buildTomorrowReminderMessage,
  calculateLoan,
  formatDateSW,
  formatTZS,
  getLoanRemainingBalance,
  getTomorrowDueReminders,
  splitRepaymentPortions,
  todayISO,
} from './utils/finance';
import {
  getFirstAllowedTab,
  hasPermission,
  hasTabAccess,
} from './utils/permissions';

const TAB_TITLES: Record<ViewTab, string> = {
  dashboard: 'Dashibodi Kuu',
  applications: 'Wateja wa Mtandaoni (Online)',
  customers: 'Wateja & Usajili wa Mikopo',
  loans: 'Mikopo Inayoendelea & Adhabu',
  schedule: 'Ratiba ya Marejesho (Wiki / Mwezi)',
  collections: 'Marejesho & Risiti',
  revenue_report: 'Ripoti ya Mapato (Kila Mwezi)',
  bank_debit: 'Makato ya Benki & Check Number (API)',
  slides: 'Ripoti za Google Slides',
  google_forms: 'Google Forms (Fomu za Maombi)',
  messaging: 'Ujumbe wa WhatsApp & SMS',
  calculator: 'Kikokotoo cha Mkopo',
  contract: 'Mkataba Rasmi wa Mkopo',
  loan_types: 'Aina za Mikopo',
  staff: 'Wafanyakazi & Udhibiti wa Ngazi',
  company: 'Taarifa za Kampuni',
};

function getNextReceiptNumber(existing: Repayment[], offset = 0): string {
  let maxNum = 1000;
  for (const r of existing) {
    const match = /^MM-(\d+)$/.exec(r.receiptNumber || '');
    if (match) {
      const val = Number(match[1]);
      if (Number.isFinite(val) && val > maxNum) {
        maxNum = val;
      }
    }
  }
  return `MM-${String(maxNum + 1 + offset)}`;
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState('');
  const unlocked = Boolean(authToken && authSession);

  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');

  // Store state (hydrated initially from localStorage; replaced by Firestore listeners when signed in)
  const initialLocal = loadLocalStore();
  const [company, setCompany] = useState<CompanySettings>(initialLocal.company);
  const [companyInCloud, setCompanyInCloud] = useState(false);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>(initialLocal.loanTypes);
  const [customers, setCustomers] = useState<Customer[]>(initialLocal.customers);
  const [loans, setLoans] = useState<Loan[]>(initialLocal.loans);
  const [repayments, setRepayments] = useState<Repayment[]>(initialLocal.repayments);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>(initialLocal.messageLogs);
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>(
    initialLocal.loanApplications,
  );
  const [bankDebitTransactions, setBankDebitTransactions] = useState<BankDebitTransaction[]>(
    initialLocal.bankDebitTransactions,
  );
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>(
    initialLocal.staffAccounts || [],
  );
  const [tasks, setTasks] = useState<DailyTask[]>(initialLocal.tasks || []);

  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [repayModalLoan, setRepayModalLoan] = useState<Loan | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Repayment | null>(null);
  const [preselectedContractLoanId, setPreselectedContractLoanId] = useState<string | null>(null);
  const [preselectedMessageCustomerId, setPreselectedMessageCustomerId] = useState<string | null>(
    null,
  );
  const [preselectedBankDebitCustomerId, setPreselectedBankDebitCustomerId] = useState<
    string | null
  >(null);
  const [prefillCalc, setPrefillCalc] = useState<{
    principal: number;
    interestType: InterestType;
    interestValue: number;
    frequency: RepaymentFrequency;
    durationCount: number;
    penaltyPercent: number;
    startDate: string;
  } | null>(null);

  const [autoPushEnabled, setAutoPushEnabled] = useState<boolean>(
    () => loadAutoReminderPrefs().autoPushEnabled,
  );
  const [autoSmsEnabled, setAutoSmsEnabled] = useState<boolean>(
    () => loadAutoReminderPrefs().autoSmsEnabled,
  );
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() =>
    getPushPermissionStatus(),
  );
  const [currentDateKey, setCurrentDateKey] = useState<string>(() => todayISO());
  const [cloudHydratedSets, setCloudHydratedSets] = useState<{
    customers: boolean;
    loans: boolean;
    messageLogs: boolean;
  }>({ customers: false, loans: false, messageLogs: false });
  const [isMigratingCloud, setIsMigratingCloud] = useState(false);
  const dispatchedPushKeysRef = useRef<Set<string>>(new Set());
  const dispatchedSmsKeysRef = useRef<Set<string>>(new Set());
  const isRunningAutoSmsRef = useRef<boolean>(false);

  const isCloudReady = Boolean(cloudUser && cloudUser.emailVerified);
  const isReminderDataHydrated =
    !isCloudReady ||
    (cloudHydratedSets.customers && cloudHydratedSets.loans && cloudHydratedSets.messageLogs);

  const latestSnapshotRef = useRef({
    company,
    loanTypes,
    customers,
    loans,
    repayments,
    messageLogs,
    loanApplications,
    bankDebitTransactions,
    staffAccounts,
    tasks,
  });

  useEffect(() => {
    latestSnapshotRef.current = {
      company,
      loanTypes,
      customers,
      loans,
      repayments,
      messageLogs,
      loanApplications,
      bankDebitTransactions,
      staffAccounts,
      tasks,
    };
  }, [
    company,
    loanTypes,
    customers,
    loans,
    repayments,
    messageLogs,
    loanApplications,
    bankDebitTransactions,
    staffAccounts,
    tasks,
  ]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Keep currentDateKey fresh across midnight rollovers and tab resume
  useEffect(() => {
    const syncDateKey = () => {
      const nowKey = todayISO();
      setCurrentDateKey((prev) => (prev === nowKey ? prev : nowKey));
    };
    const timer = window.setInterval(syncDateKey, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncDateKey();
      }
    };
    window.addEventListener('focus', syncDateKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncDateKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Firestore real-time subscription when authenticated (paused during initial snapshot migration so local records aren't overwritten)
  useEffect(() => {
    if (!authReady || !cloudUser || !cloudUser.emailVerified || isMigratingCloud) {
      setCloudHydratedSets({ customers: false, loans: false, messageLogs: false });
      return;
    }

    const unsub = subscribeUserCollections(cloudUser, {
      onCompany: (items) => {
        if (items.length > 0) {
          const item = items[0];
          const needsLocationUpgrade =
            !item.region || item.region === 'Mtwara' || item.region === 'Mkoa wa Mtwara';
          const upgraded: CompanySettings = needsLocationUpgrade
            ? {
                ...item,
                district: item.district || 'TANDAHIMBA',
                region: 'MTAA WA AMANI-MTWARA',
              }
            : item;
          setCompany(upgraded);
          setCompanyInCloud(true);
          if (needsLocationUpgrade) {
            void firestoreSaveCompany(cloudUser.uid, upgraded, true).catch(() => {});
          }
        } else {
          setCompanyInCloud(false);
        }
      },
      onLoanTypes: (items) => {
        if (items.length > 0) {
          setLoanTypes(items);
        } else {
          const seeded = defaultLoanTypes(cloudUser.uid);
          setLoanTypes(seeded);
          void Promise.all(
            seeded.map((lt) => firestoreSaveLoanType(cloudUser.uid, lt, true)),
          ).catch((err) => console.warn('[Firestore Seed LoanTypes]', err));
        }
      },
      onCustomers: (items) => {
        setCustomers(items);
        setCloudHydratedSets((prev) => (prev.customers ? prev : { ...prev, customers: true }));
      },
      onLoans: (items) => {
        setLoans(items);
        setCloudHydratedSets((prev) => (prev.loans ? prev : { ...prev, loans: true }));
      },
      onRepayments: (items) => setRepayments(items),
      onMessageLogs: (items) => {
        setMessageLogs(items);
        setCloudHydratedSets((prev) => (prev.messageLogs ? prev : { ...prev, messageLogs: true }));
      },
      onLoanApplications: (items) => setLoanApplications(items),
      onBankDebitTransactions: (items) => setBankDebitTransactions(items),
      onStaffAccounts: (items) => setStaffAccounts(items),
      onTasks: (items) => setTasks(items),
    });

    return () => unsub();
  }, [authReady, cloudUser, isMigratingCloud]);

  // Persist to localStorage whenever working locally or migrating
  useEffect(() => {
    if (!isCloudReady && !isMigratingCloud) {
      saveLocalStore({
        company,
        loanTypes,
        customers,
        loans,
        repayments,
        messageLogs,
        loanApplications,
        bankDebitTransactions,
        staffAccounts,
        tasks,
      });
    }
  }, [
    isCloudReady,
    isMigratingCloud,
    company,
    loanTypes,
    customers,
    loans,
    repayments,
    messageLogs,
    loanApplications,
    bankDebitTransactions,
    staffAccounts,
    tasks,
  ]);

  // Sync staff directory to server auth directory whenever Admin updates or loads staff accounts
  useEffect(() => {
    if (unlocked && authSession?.actorType === 'admin' && authToken) {
      void syncStaffDirectoryToServer(staffAccounts).catch(() => {});
    }
  }, [unlocked, authSession?.actorType, authToken, staffAccounts]);

  // Poll active staff session to immediately enforce account lock or updated permission levels
  useEffect(() => {
    if (!unlocked || !authSession || authSession.actorType !== 'staff') return;
    let active = true;
    const checkSession = async () => {
      try {
        const res = await fetchCurrentSession();
        if (!active) return;
        if (!res.valid) {
          setAuthBearerToken(null);
          setAuthToken(null);
          setAuthSession(null);
          setLoginNotice(
            res.error || 'Akaunti yako imefungwa au kikao chako kimeisha. Wasiliana na Msimamizi.',
          );
          return;
        }
        if (res.session) {
          setAuthSession(res.session);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    const interval = window.setInterval(() => {
      void checkSession();
    }, 15_000);
    const onFocus = () => {
      void checkSession();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [unlocked, authSession?.actorType]);

  const handleUnlock = (token: string, session: AuthSession) => {
    setAuthBearerToken(token);
    setAuthToken(token);
    setAuthSession(session);
    setLoginNotice('');
    setActiveTab((prev) => (hasTabAccess(session, prev) ? prev : getFirstAllowedTab(session)));
  };

  const handleLock = () => {
    setAuthBearerToken(null);
    setAuthToken(null);
    setAuthSession(null);
  };

  const handleConnectGoogleCloud = async () => {
    setSyncNotice('Inaunganisha na kuhifadhi taarifa zote kwenye wingu...');
    const preConnectSnapshot = { ...latestSnapshotRef.current };
    setIsMigratingCloud(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        const storedLocal = loadLocalStore();
        const mergedCustomerIds = new Set(preConnectSnapshot.customers.map((c) => c.id));
        const mergedCustomers = [
          ...preConnectSnapshot.customers,
          ...storedLocal.customers.filter((c) => !mergedCustomerIds.has(c.id)),
        ];
        const mergedLoanIds = new Set(preConnectSnapshot.loans.map((l) => l.id));
        const mergedLoans = [
          ...preConnectSnapshot.loans,
          ...storedLocal.loans.filter((l) => !mergedLoanIds.has(l.id)),
        ];
        const mergedStaffIds = new Set(preConnectSnapshot.staffAccounts.map((s) => s.id));
        const mergedStaffAccounts = [
          ...preConnectSnapshot.staffAccounts,
          ...(storedLocal.staffAccounts || []).filter((s) => !mergedStaffIds.has(s.id)),
        ];
        const mergedTaskIds = new Set(preConnectSnapshot.tasks.map((t) => t.id));
        const mergedTasks = [
          ...preConnectSnapshot.tasks,
          ...(storedLocal.tasks || []).filter((t) => !mergedTaskIds.has(t.id)),
        ];
        const summary = await pushLocalSnapshotToFirestore(cred.user, {
          ...preConnectSnapshot,
          customers: mergedCustomers,
          loans: mergedLoans,
          staffAccounts: mergedStaffAccounts,
          tasks: mergedTasks,
        });
        setSyncNotice(
          `Wingu limeunganishwa (${summary.databaseId}): Wateja ${summary.customersSynced} na Mikopo ${summary.loansSynced} vimehifadhiwa salama.`,
        );
      }
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    } finally {
      setIsMigratingCloud(false);
    }
  };

  const handleSaveSnapshotToCloud = async () => {
    if (!isCloudReady || !cloudUser) return;
    setSyncNotice('Inahifadhi taarifa kwenye wingu...');
    try {
      const summary = await pushLocalSnapshotToFirestore(cloudUser, {
        company,
        loanTypes,
        customers,
        loans,
        repayments,
        messageLogs,
        loanApplications,
        bankDebitTransactions,
        staffAccounts,
        tasks,
      });
      setSyncNotice(
        `Faili na taarifa zote zimehifadhiwa kwenye wingu kikamilifu (Wateja ${summary.customersSynced}, Mikopo ${summary.loansSynced}).`,
      );
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    }
  };

  const handleDisconnectCloud = async () => {
    try {
      await signOut(auth);
      setCompanyInCloud(false);
      setSyncNotice('Umetoka kwenye muunganiko wa wingu.');
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    }
  };

  // CRUD Handlers
  const handleCreateCustomerAndLoan = async (
    customerData: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    loanData: Omit<
      Loan,
      | 'id'
      | 'ownerId'
      | 'customerId'
      | 'totalPaidPrincipal'
      | 'totalPaidInterest'
      | 'totalPaidPenalty'
      | 'penaltyApplied'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
    > | null,
  ) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const newCustomer: Customer = {
      ...customerData,
      id: makeId('cust'),
      ownerId: uid,
    };

    const newLoan: Loan | null = loanData
      ? {
          ...loanData,
          id: makeId('loan'),
          ownerId: uid,
          customerId: newCustomer.id,
          penaltyApplied: 0,
          totalPaidPrincipal: 0,
          totalPaidInterest: 0,
          totalPaidPenalty: 0,
          status: 'active',
        }
      : null;

    if (isCloudReady && cloudUser) {
      await firestoreCreateCustomerAndLoan(cloudUser.uid, newCustomer, newLoan);
      setCustomers((prev) => (prev.some((c) => c.id === newCustomer.id) ? prev : [newCustomer, ...prev]));
      if (newLoan) {
        setLoans((prev) => (prev.some((l) => l.id === newLoan.id) ? prev : [newLoan, ...prev]));
      }
      setSyncNotice(
        `Mteja "${newCustomer.fullName}"${newLoan ? ' na mkopo wake' : ''} wamehifadhiwa kwenye Firestore kikamilifu.`,
      );
    } else {
      setCustomers((prev) => [newCustomer, ...prev]);
      if (newLoan) {
        setLoans((prev) => [newLoan, ...prev]);
      }
      setSyncNotice(
        `Mteja "${newCustomer.fullName}" amehifadhiwa kwenye kifaa (Bofya "Hifadhi Wingu" kuunganisha Firestore).`,
      );
    }
    setPrefillCalc(null);
  };

  const handleAddLoanToCustomer = async (
    customerId: string,
    loanData: Omit<
      Loan,
      | 'id'
      | 'ownerId'
      | 'customerId'
      | 'totalPaidPrincipal'
      | 'totalPaidInterest'
      | 'totalPaidPenalty'
      | 'penaltyApplied'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const newLoan: Loan = {
      ...loanData,
      id: makeId('loan'),
      ownerId: uid,
      customerId,
      penaltyApplied: 0,
      totalPaidPrincipal: 0,
      totalPaidInterest: 0,
      totalPaidPenalty: 0,
      status: 'active',
    };

    if (isCloudReady && cloudUser) {
      await firestoreCreateLoan(cloudUser.uid, newLoan);
      setLoans((prev) => (prev.some((l) => l.id === newLoan.id) ? prev : [newLoan, ...prev]));
      setSyncNotice('Mkopo mpya umehifadhiwa kwenye Firestore kikamilifu.');
    } else {
      setLoans((prev) => [newLoan, ...prev]);
    }
  };

  const handleUpdateCustomer = async (updated: Customer) => {
    if (isCloudReady && cloudUser) {
      await firestoreUpdateCustomer(cloudUser.uid, updated);
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSyncNotice(`Taarifa za "${updated.fullName}" zimehifadhiwa kwenye Firestore.`);
    } else {
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const loanIds = loans.filter((l) => l.customerId === customerId).map((l) => l.id);
    const repaymentIds = repayments
      .filter((r) => r.customerId === customerId)
      .map((r) => r.id);
    const messageLogIds = messageLogs
      .filter((m) => m.customerId === customerId)
      .map((m) => m.id);
    const bankDebitIds = bankDebitTransactions
      .filter((t) => t.customerId === customerId)
      .map((t) => t.id);

    if (isCloudReady && cloudUser) {
      await firestoreDeleteCustomerCascade(
        customerId,
        loanIds,
        repaymentIds,
        messageLogIds,
        bankDebitIds,
      );
    }
    setRepayments((prev) => prev.filter((r) => r.customerId !== customerId));
    setBankDebitTransactions((prev) => prev.filter((t) => t.customerId !== customerId));
    setLoans((prev) => prev.filter((l) => l.customerId !== customerId));
    setMessageLogs((prev) => prev.filter((m) => m.customerId !== customerId));
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  };

  const handleRecordRepayment = async (payload: {
    loan: Loan;
    amount: number;
    paymentMethod: PaymentMethod;
    channelDetail: string;
    paymentDate: string;
    notes: string;
    bankDebitMeta?: {
      bankCode: BankDebitCode;
      deductionType: BankDeductionType;
      accountOrCheckNumber: string;
      gatewayReference: string;
      gatewayMode: 'live_api' | 'sandbox_api';
      statusMessage: string;
    };
  }) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const { loan, amount, paymentMethod, channelDetail, paymentDate, notes, bankDebitMeta } = payload;
    const split = splitRepaymentPortions(loan, amount);
    const currentRemaining = getLoanRemainingBalance(loan);
    const balanceAfter = Math.max(0, currentRemaining - amount);

    const updatedLoan: Loan = {
      ...loan,
      totalPaidPrincipal: (loan.totalPaidPrincipal || 0) + split.principalPortion,
      totalPaidInterest: (loan.totalPaidInterest || 0) + split.interestPortion,
      totalPaidPenalty: (loan.totalPaidPenalty || 0) + split.penaltyPortion,
      status: balanceAfter === 0 ? 'completed' : loan.status,
    };

    const receiptNum = getNextReceiptNumber(repayments);
    const newRepayment: Repayment = {
      id: makeId('rcp'),
      ownerId: uid,
      loanId: loan.id,
      customerId: loan.customerId,
      receiptNumber: receiptNum,
      amount,
      principalPortion: split.principalPortion,
      interestPortion: split.interestPortion,
      penaltyPortion: split.penaltyPortion,
      paymentMethod,
      channelDetail,
      paymentDate,
      balanceAfter,
      notes,
    };

    if (isCloudReady && cloudUser) {
      await firestoreRecordRepayment(cloudUser.uid, newRepayment, updatedLoan);
    }
    setRepayments((prev) => (prev.some((r) => r.id === newRepayment.id) ? prev : [newRepayment, ...prev]));
    setLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));

    if (bankDebitMeta) {
      const tx: BankDebitTransaction = {
        id: makeId('btx'),
        ownerId: uid,
        customerId: loan.customerId,
        loanId: loan.id,
        repaymentId: newRepayment.id,
        bankCode: bankDebitMeta.bankCode,
        deductionType: bankDebitMeta.deductionType,
        accountOrCheckNumber: bankDebitMeta.accountOrCheckNumber,
        amount,
        gatewayReference: bankDebitMeta.gatewayReference,
        gatewayMode: bankDebitMeta.gatewayMode,
        status: 'completed',
        statusMessage: bankDebitMeta.statusMessage,
        processedDate: paymentDate,
      };
      if (isCloudReady && cloudUser) {
        await firestoreRecordBankDebitTransaction(cloudUser.uid, tx);
      }
      setBankDebitTransactions((prev) => (prev.some((t) => t.id === tx.id) ? prev : [tx, ...prev]));
    }

    setRepayModalLoan(null);
    setActiveReceipt(newRepayment);
  };

  const handleExecuteSingleBankDebit = async (params: {
    customer: Customer;
    loan: Loan;
    bankCode: BankDebitCode;
    deductionType: BankDeductionType;
    accountOrCheckNumber: string;
    amount: number;
    gatewayReference: string;
    gatewayMode: 'live_api' | 'sandbox_api';
    statusMessage: string;
  }) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const paymentDate = todayISO();
    const split = splitRepaymentPortions(params.loan, params.amount);
    const currentRemaining = getLoanRemainingBalance(params.loan);
    const balanceAfter = Math.max(0, currentRemaining - params.amount);

    const updatedLoan: Loan = {
      ...params.loan,
      totalPaidPrincipal: (params.loan.totalPaidPrincipal || 0) + split.principalPortion,
      totalPaidInterest: (params.loan.totalPaidInterest || 0) + split.interestPortion,
      totalPaidPenalty: (params.loan.totalPaidPenalty || 0) + split.penaltyPortion,
      status: balanceAfter === 0 ? 'completed' : params.loan.status,
    };

    const receiptNum = getNextReceiptNumber(repayments);
    const newRepayment: Repayment = {
      id: makeId('rcp'),
      ownerId: uid,
      loanId: params.loan.id,
      customerId: params.customer.id,
      receiptNumber: receiptNum,
      amount: params.amount,
      principalPortion: split.principalPortion,
      interestPortion: split.interestPortion,
      penaltyPortion: split.penaltyPortion,
      paymentMethod: 'bank',
      channelDetail: `${getBankDisplayLabel(params.bankCode)} • ${params.accountOrCheckNumber} (${params.gatewayReference})`,
      paymentDate,
      balanceAfter,
      notes: `Makato ya moja kwa moja (${params.deductionType === 'gov_check_number' ? 'Check No. Mtumishi' : params.bankCode})`,
    };

    const tx: BankDebitTransaction = {
      id: makeId('btx'),
      ownerId: uid,
      customerId: params.customer.id,
      loanId: params.loan.id,
      repaymentId: newRepayment.id,
      bankCode: params.bankCode,
      deductionType: params.deductionType,
      accountOrCheckNumber: params.accountOrCheckNumber,
      amount: params.amount,
      gatewayReference: params.gatewayReference,
      gatewayMode: params.gatewayMode,
      status: 'completed',
      statusMessage: params.statusMessage,
      processedDate: paymentDate,
    };

    if (isCloudReady && cloudUser) {
      await firestoreRecordRepayment(cloudUser.uid, newRepayment, updatedLoan);
      await firestoreRecordBankDebitTransaction(cloudUser.uid, tx);
    }
    setRepayments((prev) => (prev.some((r) => r.id === newRepayment.id) ? prev : [newRepayment, ...prev]));
    setLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
    setBankDebitTransactions((prev) => (prev.some((t) => t.id === tx.id) ? prev : [tx, ...prev]));

    setActiveReceipt(newRepayment);
    setSyncNotice(
      `Makato ya ${formatTZS(params.amount)} (${getBankDisplayLabel(params.bankCode)}) yamekamilika kwa ${params.customer.fullName}.`,
    );
  };

  const handleExecuteBatchBankDebit = async (
    items: {
      customer: Customer;
      loan: Loan;
      bankCode: BankDebitCode;
      deductionType: BankDeductionType;
      accountOrCheckNumber: string;
      amount: number;
      gatewayReference: string;
      gatewayMode: 'live_api' | 'sandbox_api';
      statusMessage: string;
    }[],
  ) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const paymentDate = todayISO();
    const newRepayments: Repayment[] = [];
    const newTransactions: BankDebitTransaction[] = [];
    const updatedLoansMap = new Map<string, Loan>();

    items.forEach((item, idx) => {
      const baseLoan = updatedLoansMap.get(item.loan.id) || item.loan;
      const split = splitRepaymentPortions(baseLoan, item.amount);
      const currentRemaining = getLoanRemainingBalance(baseLoan);
      const balanceAfter = Math.max(0, currentRemaining - item.amount);

      const updatedLoan: Loan = {
        ...baseLoan,
        totalPaidPrincipal: (baseLoan.totalPaidPrincipal || 0) + split.principalPortion,
        totalPaidInterest: (baseLoan.totalPaidInterest || 0) + split.interestPortion,
        totalPaidPenalty: (baseLoan.totalPaidPenalty || 0) + split.penaltyPortion,
        status: balanceAfter === 0 ? 'completed' : baseLoan.status,
      };
      updatedLoansMap.set(updatedLoan.id, updatedLoan);

      const receiptNum = getNextReceiptNumber(repayments, idx);
      const newRepayment: Repayment = {
        id: makeId('rcp'),
        ownerId: uid,
        loanId: item.loan.id,
        customerId: item.customer.id,
        receiptNumber: receiptNum,
        amount: item.amount,
        principalPortion: split.principalPortion,
        interestPortion: split.interestPortion,
        penaltyPortion: split.penaltyPortion,
        paymentMethod: 'bank',
        channelDetail: `${getBankDisplayLabel(item.bankCode)} • ${item.accountOrCheckNumber} (${item.gatewayReference})`,
        paymentDate,
        balanceAfter,
        notes: `Makato ya kundi (${item.deductionType === 'gov_check_number' ? 'Check No. Mtumishi' : item.bankCode})`,
      };
      newRepayments.push(newRepayment);

      newTransactions.push({
        id: makeId('btx'),
        ownerId: uid,
        customerId: item.customer.id,
        loanId: item.loan.id,
        repaymentId: newRepayment.id,
        bankCode: item.bankCode,
        deductionType: item.deductionType,
        accountOrCheckNumber: item.accountOrCheckNumber,
        amount: item.amount,
        gatewayReference: item.gatewayReference,
        gatewayMode: item.gatewayMode,
        status: 'completed',
        statusMessage: item.statusMessage,
        processedDate: paymentDate,
      });
    });

    if (isCloudReady && cloudUser) {
      for (let i = 0; i < newRepayments.length; i++) {
        const rep = newRepayments[i];
        const uLoan = updatedLoansMap.get(rep.loanId)!;
        await firestoreRecordRepayment(cloudUser.uid, rep, uLoan);
        await firestoreRecordBankDebitTransaction(cloudUser.uid, newTransactions[i]);
      }
    }
    const newRepIds = new Set(newRepayments.map((r) => r.id));
    const newTxIds = new Set(newTransactions.map((t) => t.id));
    setRepayments((prev) => [...[...newRepayments].reverse(), ...prev.filter((r) => !newRepIds.has(r.id))]);
    setLoans((prev) => prev.map((l) => updatedLoansMap.get(l.id) || l));
    setBankDebitTransactions((prev) => [
      ...[...newTransactions].reverse(),
      ...prev.filter((t) => !newTxIds.has(t.id)),
    ]);

    const totalDeducted = items.reduce((s, x) => s + x.amount, 0);
    setSyncNotice(
      `Makato ya pamoja (${items.length}) yenye jumla ya ${formatTZS(totalDeducted)} yamekamilika na risiti zimetolewa.`,
    );
  };

  const handleApplyPenalty = async (
    loan: Loan,
    penaltyAmount: number,
    reasonNote: string,
  ) => {
    const updatedLoan: Loan = {
      ...loan,
      penaltyApplied: (loan.penaltyApplied || 0) + penaltyAmount,
      totalDue: loan.totalDue + penaltyAmount,
      status: 'overdue',
      notes: reasonNote || loan.notes || '',
    };

    if (isCloudReady && cloudUser) {
      await firestoreApplyPenalty(updatedLoan);
    }
    setLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
  };

  const handleSaveCompany = async (updated: CompanySettings) => {
    if (isCloudReady && cloudUser) {
      await firestoreSaveCompany(cloudUser.uid, updated, companyInCloud);
      setCompanyInCloud(true);
    }
    setCompany(updated);
  };

  const handleSaveLoanType = async (
    ltData: Omit<LoanType, 'id' | 'ownerId'>,
    existingId?: string,
  ) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const isNew = !existingId;
    const item: LoanType = {
      ...ltData,
      id: existingId || makeId('type'),
      ownerId: uid,
    };

    if (isCloudReady && cloudUser) {
      await firestoreSaveLoanType(cloudUser.uid, item, isNew);
    }
    setLoanTypes((prev) =>
      isNew
        ? prev.some((t) => t.id === item.id)
          ? prev
          : [item, ...prev]
        : prev.map((t) => (t.id === item.id ? item : t)),
    );
  };

  const handleDeleteLoanType = async (id: string) => {
    if (isCloudReady && cloudUser) {
      await firestoreDeleteLoanType(id);
    }
    setLoanTypes((prev) => prev.filter((t) => t.id !== id));
  };

  const handleLogMessage = useCallback(
    async (payload: {
      customerId: string;
      channel: MessageChannel;
      recipientPhone: string;
      messageBody: string;
      amountPaidSnapshot: number;
      amountOwedSnapshot: number;
    }) => {
      const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
      const log: MessageLog = {
        ...payload,
        id: makeId('msg'),
        ownerId: uid,
        sentDate: todayISO(),
      };
      if (isCloudReady && cloudUser) {
        await firestoreLogMessage(cloudUser.uid, log);
      } else {
        setMessageLogs((prev) => [log, ...prev]);
      }
    },
    [isCloudReady, cloudUser],
  );

  const tomorrowReminders = useMemo(
    () => getTomorrowDueReminders(loans, customers, messageLogs, currentDateKey),
    [loans, customers, messageLogs, currentDateKey],
  );

  // Automatic 24-Hour-Before (1-day-before) SMS Reminders using customer profile phone numbers
  useEffect(() => {
    if (
      !unlocked ||
      !hasPermission(authSession, 'send_messages') ||
      !autoSmsEnabled ||
      !isReminderDataHydrated ||
      isRunningAutoSmsRef.current
    ) {
      return;
    }

    const pending = tomorrowReminders.filter((item) => {
      if (!item.hasValidSmsPhone || item.alreadySmsedToday) return false;
      if (hasAutoSmsDispatchedLocally(currentDateKey, item.loan.id, item.periodNumber)) {
        return false;
      }
      const dedupKey = `${currentDateKey}_${item.loan.id}_${item.periodNumber}`;
      return !dispatchedSmsKeysRef.current.has(dedupKey);
    });

    if (pending.length === 0) return;

    isRunningAutoSmsRef.current = true;
    const keysForAttempt: string[] = [];
    for (const item of pending) {
      const k = `${currentDateKey}_${item.loan.id}_${item.periodNumber}`;
      dispatchedSmsKeysRef.current.add(k);
      keysForAttempt.push(k);
    }

    void (async () => {
      let sentCount = 0;
      let failedCount = 0;
      try {
        for (let offset = 0; offset < pending.length; offset += 100) {
          const chunk = pending.slice(offset, offset + 100);
          const payloadItems = chunk.map((item) => ({
            customerId: item.customer.id,
            customerName: item.customer.fullName,
            recipientPhone: item.customer.phone,
            messageBody: buildTomorrowReminderMessage(
              item.customer.fullName,
              company.companyName,
              item.installmentRemaining,
              item.dueDate,
              item.totalPaid,
              item.totalOwed,
              company.phone,
            ),
          }));

          const batchRes = await sendBulkSmsViaApi(payloadItems, 'auto_24h');
          for (let i = 0; i < batchRes.results.length; i++) {
            const res = batchRes.results[i];
            const item = chunk[i];
            const k = `${currentDateKey}_${item.loan.id}_${item.periodNumber}`;
            if (!res.success) {
              failedCount += 1;
              dispatchedSmsKeysRef.current.delete(k);
              continue;
            }
            sentCount += 1;
            markAutoSmsDispatchedLocally(
              currentDateKey,
              item.loan.id,
              item.periodNumber,
              res.gatewayReference,
            );
            const prefix = buildAutoSmsLogPrefix(
              item.loan.id,
              item.periodNumber,
              res.gatewayReference,
            );
            await handleLogMessage({
              customerId: item.customer.id,
              channel: 'sms',
              recipientPhone: res.recipientPhone || item.customer.phone,
              messageBody: `${prefix} ${payloadItems[i].messageBody}`.slice(0, 1000),
              amountPaidSnapshot: item.totalPaid,
              amountOwedSnapshot: item.totalOwed,
            });
          }
        }

        if (sentCount > 0) {
          setSyncNotice(
            `SMS ${sentCount} za ukumbusho (masaa 24 kabla ya rejesho) zimetumwa kiotomatiki kwenda namba za wateja${
              failedCount > 0 ? ` (${failedCount} hazikuweza kutumwa)` : ''
            }.`,
          );
        }
      } catch {
        for (const k of keysForAttempt) {
          dispatchedSmsKeysRef.current.delete(k);
        }
      } finally {
        isRunningAutoSmsRef.current = false;
      }
    })();
  }, [
    unlocked,
    authSession,
    autoSmsEnabled,
    isReminderDataHydrated,
    tomorrowReminders,
    currentDateKey,
    company,
    handleLogMessage,
  ]);

  // Automatic 1-day-before Browser Push Notifications
  useEffect(() => {
    if (!unlocked || !autoPushEnabled || pushPermission !== 'granted' || !isReminderDataHydrated) {
      return;
    }
    const pending = tomorrowReminders.filter((item) => {
      const dedupKey = `${currentDateKey}_${item.loan.id}_${item.periodNumber}`;
      return !item.alreadyPushedToday && !dispatchedPushKeysRef.current.has(dedupKey);
    });
    if (pending.length === 0) return;

    for (const item of pending) {
      const dedupKey = `${currentDateKey}_${item.loan.id}_${item.periodNumber}`;
      dispatchedPushKeysRef.current.add(dedupKey);
      const body = buildTomorrowReminderMessage(
        item.customer.fullName,
        company.companyName,
        item.installmentRemaining,
        item.dueDate,
        item.totalPaid,
        item.totalOwed,
        company.phone,
      );
      const sent = sendBrowserPushNotification(
        `${company.companyName}: Rejesho Kesho (${item.customer.fullName})`,
        `Kesho ${formatDateSW(item.dueDate)}: ${formatTZS(item.installmentRemaining)} · Simu: ${item.customer.phone}`,
        dedupKey,
      );
      if (sent) {
        void handleLogMessage({
          customerId: item.customer.id,
          channel: 'push',
          recipientPhone: item.customer.phone,
          messageBody: body,
          amountPaidSnapshot: item.totalPaid,
          amountOwedSnapshot: item.totalOwed,
        }).catch((err) => console.warn('[AutoPush Log]', err));
      }
    }
  }, [
    unlocked,
    autoPushEnabled,
    pushPermission,
    isReminderDataHydrated,
    tomorrowReminders,
    currentDateKey,
    company,
    handleLogMessage,
  ]);

  const handleRequestPushPermission = async () => {
    const res = await requestPushPermission();
    setPushPermission(res);
    if (res === 'granted') {
      setAutoPushEnabled(true);
      saveAutoReminderPrefs({ autoPushEnabled: true });
      setSyncNotice('Arifa za Push zimewashwa kikamilifu kwa siku 1 kabla ya rejesho.');
    } else if (res === 'denied') {
      setSyncNotice(
        'Kivinjari kimezuia arifa za Push. Tafadhali ruhusu arifa kwenye mipangilio ya kivinjari.',
      );
    }
  };

  const handleToggleAutoPush = (enabled: boolean) => {
    setAutoPushEnabled(enabled);
    saveAutoReminderPrefs({ autoPushEnabled: enabled });
  };

  const handleToggleAutoSms = (enabled: boolean) => {
    setAutoSmsEnabled(enabled);
    saveAutoReminderPrefs({ autoSmsEnabled: enabled });
    setSyncNotice(
      enabled
        ? 'Mfumo wa SMS za kiotomatiki (masaa 24 kabla ya rejesho) umewashwa.'
        : 'Mfumo wa SMS za kiotomatiki (masaa 24 kabla ya rejesho) umezimwa kwa muda.',
    );
  };

  const handleSendTomorrowSmsSingle = async (item: TomorrowReminderItem) => {
    const body = buildTomorrowReminderMessage(
      item.customer.fullName,
      company.companyName,
      item.installmentRemaining,
      item.dueDate,
      item.totalPaid,
      item.totalOwed,
      company.phone,
    );
    try {
      const res = await sendSmsViaApi(
        {
          customerId: item.customer.id,
          customerName: item.customer.fullName,
          recipientPhone: item.customer.phone,
          messageBody: body,
        },
        'auto_24h',
      );
      markAutoSmsDispatchedLocally(
        currentDateKey,
        item.loan.id,
        item.periodNumber,
        res.gatewayReference,
      );
      const prefix = buildAutoSmsLogPrefix(
        item.loan.id,
        item.periodNumber,
        res.gatewayReference,
      );
      await handleLogMessage({
        customerId: item.customer.id,
        channel: 'sms',
        recipientPhone: res.recipientPhone || item.customer.phone,
        messageBody: `${prefix} ${body}`.slice(0, 1000),
        amountPaidSnapshot: item.totalPaid,
        amountOwedSnapshot: item.totalOwed,
      });
      setSyncNotice(res.statusMessage);
    } catch (err) {
      setSyncNotice(
        err instanceof Error ? err.message : 'Imeshindwa kutuma SMS ya ukumbusho.',
      );
    }
  };

  const handleSendAllTomorrowSms = async (onlyPending = false) => {
    const targets = tomorrowReminders.filter((item) =>
      onlyPending ? !item.alreadySmsedToday && item.hasValidSmsPhone : item.hasValidSmsPhone,
    );
    if (targets.length === 0) {
      setSyncNotice(
        onlyPending
          ? 'Wateja wote wenye marejesho kesho na namba sahihi tayari wameshatumiwa SMS leo.'
          : 'Hakuna mteja mwenye namba sahihi ya simu kwa marejesho ya kesho.',
      );
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    try {
      for (let offset = 0; offset < targets.length; offset += 100) {
        const chunk = targets.slice(offset, offset + 100);
        const payloadItems = chunk.map((item) => ({
          customerId: item.customer.id,
          customerName: item.customer.fullName,
          recipientPhone: item.customer.phone,
          messageBody: buildTomorrowReminderMessage(
            item.customer.fullName,
            company.companyName,
            item.installmentRemaining,
            item.dueDate,
            item.totalPaid,
            item.totalOwed,
            company.phone,
          ),
        }));
        const batchRes = await sendBulkSmsViaApi(payloadItems, 'auto_24h');
        for (let i = 0; i < batchRes.results.length; i++) {
          const r = batchRes.results[i];
          if (!r.success) {
            failedCount += 1;
            continue;
          }
          sentCount += 1;
          const orig = chunk[i];
          markAutoSmsDispatchedLocally(
            currentDateKey,
            orig.loan.id,
            orig.periodNumber,
            r.gatewayReference,
          );
          const prefix = buildAutoSmsLogPrefix(
            orig.loan.id,
            orig.periodNumber,
            r.gatewayReference,
          );
          await handleLogMessage({
            customerId: orig.customer.id,
            channel: 'sms',
            recipientPhone: r.recipientPhone || orig.customer.phone,
            messageBody: `${prefix} ${payloadItems[i].messageBody}`.slice(0, 1000),
            amountPaidSnapshot: orig.totalPaid,
            amountOwedSnapshot: orig.totalOwed,
          });
        }
      }
      setSyncNotice(
        `SMS ${sentCount} za ukumbusho (masaa 24 kabla) zimetumwa kwenda namba za wateja${
          failedCount > 0 ? ` (${failedCount} zimeshindikana)` : ''
        }.`,
      );
    } catch (err) {
      setSyncNotice(
        err instanceof Error ? err.message : 'Imeshindwa kutuma SMS za ukumbusho wa kesho.',
      );
    }
  };

  const handleSendPushReminder = async (item: TomorrowReminderItem) => {
    let perm = pushPermission;
    if (perm !== 'granted' && perm !== 'unsupported') {
      perm = await requestPushPermission();
      setPushPermission(perm);
    }
    const msg = buildTomorrowReminderMessage(
      item.customer.fullName,
      company.companyName,
      item.installmentRemaining,
      item.dueDate,
      item.totalPaid,
      item.totalOwed,
      company.phone,
    );
    const dedupKey = `${todayISO()}_${item.loan.id}_${item.periodNumber}_${Date.now()}`;
    const pushed =
      perm === 'granted' &&
      sendBrowserPushNotification(
        `${company.companyName}: Rejesho Kesho (${item.customer.fullName})`,
        `Kesho ${formatDateSW(item.dueDate)}: ${formatTZS(item.installmentRemaining)} · Simu: ${item.customer.phone}`,
        dedupKey,
      );

    try {
      await handleLogMessage({
        customerId: item.customer.id,
        channel: 'push',
        recipientPhone: item.customer.phone,
        messageBody: msg,
        amountPaidSnapshot: item.totalPaid,
        amountOwedSnapshot: item.totalOwed,
      });

      setSyncNotice(
        pushed
          ? `Arifa ya Push imetumwa kwa ${item.customer.fullName} (rejesho la kesho ${formatTZS(item.installmentRemaining)}).`
          : `Kumbukumbu ya arifa ya ${item.customer.fullName} imehifadhiwa (ruhusu Push kwenye kivinjari kupokea ibukizi).`,
      );
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    }
  };

  const handleSendAllPushReminders = async () => {
    if (tomorrowReminders.length === 0) return;
    let perm = pushPermission;
    if (perm !== 'granted' && perm !== 'unsupported') {
      perm = await requestPushPermission();
      setPushPermission(perm);
    }
    try {
      for (const item of tomorrowReminders) {
        const msg = buildTomorrowReminderMessage(
          item.customer.fullName,
          company.companyName,
          item.installmentRemaining,
          item.dueDate,
          item.totalPaid,
          item.totalOwed,
          company.phone,
        );
        if (perm === 'granted') {
          sendBrowserPushNotification(
            `${company.companyName}: Rejesho Kesho (${item.customer.fullName})`,
            `Kesho ${formatDateSW(item.dueDate)}: ${formatTZS(item.installmentRemaining)}`,
            `${todayISO()}_${item.loan.id}_${item.periodNumber}`,
          );
        }
        await handleLogMessage({
          customerId: item.customer.id,
          channel: 'push',
          recipientPhone: item.customer.phone,
          messageBody: msg,
          amountPaidSnapshot: item.totalPaid,
          amountOwedSnapshot: item.totalOwed,
        });
      }
      setSyncNotice(
        `Arifa ${tomorrowReminders.length} za marejesho ya kesho zimetumwa na kuhifadhiwa.`,
      );
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    }
  };

  const handleLogEmailReminder = async (item: TomorrowReminderItem) => {
    const msg = buildTomorrowReminderMessage(
      item.customer.fullName,
      company.companyName,
      item.installmentRemaining,
      item.dueDate,
      item.totalPaid,
      item.totalOwed,
      company.phone,
    );
    try {
      await handleLogMessage({
        customerId: item.customer.id,
        channel: 'email',
        recipientPhone: item.customer.email || item.customer.phone,
        messageBody: msg,
        amountPaidSnapshot: item.totalPaid,
        amountOwedSnapshot: item.totalOwed,
      });
    } catch (err) {
      setSyncNotice(formatFirestoreErrorForUser(err));
    }
  };

  const handleUpdateCustomerEmail = async (customer: Customer, email: string) => {
    await handleUpdateCustomer({ ...customer, email });
  };

  const handleSubmitOnlineApplication = async (
    appData: Omit<
      LoanApplication,
      'id' | 'ownerId' | 'status' | 'submittedDate' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<string> => {
    const newApp: LoanApplication = {
      ...appData,
      id: makeId('app'),
      ownerId: 'public_portal',
      status: 'pending',
      submittedDate: todayISO(),
    };
    setLoanApplications((prev) => [newApp, ...prev]);
    await firestoreSubmitPublicApplication(newApp);
    return newApp.id;
  };

  const handleImportGoogleFormApplications = async (
    apps: LoanApplication[],
  ): Promise<number> => {
    const existingIds = new Set(loanApplications.map((a) => a.id));
    const uniqueNew = apps.filter((a) => !existingIds.has(a.id));
    if (uniqueNew.length === 0) return 0;

    setLoanApplications((prev) => {
      const seen = new Set(prev.map((a) => a.id));
      const toAdd = uniqueNew.filter((a) => !seen.has(a.id));
      return [...toAdd, ...prev];
    });

    let cloudSaved = 0;
    for (const app of uniqueNew) {
      const ok = await firestoreSubmitPublicApplication(app);
      if (ok) cloudSaved += 1;
    }

    if (cloudSaved === uniqueNew.length) {
      setSyncNotice(
        `Maombi ${uniqueNew.length} kutoka Google Forms yamehifadhiwa kwenye Wateja wa Mtandaoni.`,
      );
    } else {
      setSyncNotice(
        `Maombi ${uniqueNew.length} yameingizwa kwenye mfumo (${cloudSaved} yamesawazishwa moja kwa moja kwenye wingu, mengine yapo kwenye kifaa hiki).`,
      );
    }
    return uniqueNew.length;
  };

  const handleApproveApplication = async (
    application: LoanApplication,
    terms: {
      principal: number;
      interestType: InterestType;
      interestValue: number;
      frequency: RepaymentFrequency;
      durationCount: number;
      penaltyPercent: number;
      startDate: string;
      reviewNote: string;
    },
  ) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const calc = calculateLoan(
      terms.principal,
      terms.interestType,
      terms.interestValue,
      terms.frequency,
      terms.durationCount,
      terms.startDate,
    );

    const existingCustomer = customers.find(
      (c) => c.phone.replace(/\D/g, '') === application.phone.replace(/\D/g, ''),
    );

    const customerId = existingCustomer ? existingCustomer.id : makeId('cust');
    const newLoanId = makeId('loan');

    const newLoan: Loan = {
      id: newLoanId,
      ownerId: uid,
      customerId,
      loanTypeName: application.loanTypeName,
      principal: calc.principal,
      interestType: terms.interestType,
      interestValue: terms.interestValue,
      totalInterest: calc.totalInterest,
      penaltyPercent: terms.penaltyPercent,
      penaltyApplied: 0,
      frequency: terms.frequency,
      durationCount: terms.durationCount,
      startDate: terms.startDate,
      endDate: calc.endDate,
      totalDue: calc.totalPayable,
      totalPaidPrincipal: 0,
      totalPaidInterest: 0,
      totalPaidPenalty: 0,
      status: 'active',
      collateral: application.collateral || '',
      notes: application.purpose || '',
    };

    if (existingCustomer) {
      const hasBankUpdates = Boolean(
        application.bankName ||
          application.bankAccountNumber ||
          application.isGovernmentEmployee ||
          application.checkNumber,
      );
      const updatedCust: Customer = hasBankUpdates
        ? {
            ...existingCustomer,
            bankName: application.bankName || existingCustomer.bankName || '',
            bankAccountNumber:
              application.bankAccountNumber || existingCustomer.bankAccountNumber || '',
            isGovernmentEmployee:
              Boolean(application.isGovernmentEmployee) ||
              Boolean(existingCustomer.isGovernmentEmployee),
            checkNumber: application.checkNumber || existingCustomer.checkNumber || '',
            bankMandateActive:
              Boolean(application.bankAccountNumber || application.checkNumber) ||
              Boolean(existingCustomer.bankMandateActive),
          }
        : existingCustomer;

      if (isCloudReady && cloudUser) {
        await firestoreCreateLoan(cloudUser.uid, newLoan);
        if (hasBankUpdates) {
          await firestoreUpdateCustomer(cloudUser.uid, updatedCust);
        }
      }
      setLoans((prev) => (prev.some((l) => l.id === newLoan.id) ? prev : [newLoan, ...prev]));
      if (hasBankUpdates) {
        setCustomers((prev) => prev.map((c) => (c.id === updatedCust.id ? updatedCust : c)));
      }
    } else {
      const newCustomer: Customer = {
        id: customerId,
        ownerId: uid,
        fullName: application.fullName,
        phone: application.phone,
        email: application.email || '',
        idNumber: application.idNumber || '',
        street: application.street,
        district: application.district,
        occupation: application.occupation || '',
        witnessName: application.witnessName,
        witnessPhone: application.witnessPhone,
        witnessStreet: application.street,
        witnessDistrict: application.district,
        collateral: application.collateral || '',
        bankName: application.bankName || '',
        bankAccountNumber: application.bankAccountNumber || '',
        isGovernmentEmployee: Boolean(application.isGovernmentEmployee),
        checkNumber: application.checkNumber || '',
        bankMandateActive: Boolean(application.bankAccountNumber || application.checkNumber),
      };
      if (isCloudReady && cloudUser) {
        await firestoreCreateCustomerAndLoan(cloudUser.uid, newCustomer, newLoan);
      }
      setCustomers((prev) => (prev.some((c) => c.id === newCustomer.id) ? prev : [newCustomer, ...prev]));
      setLoans((prev) => (prev.some((l) => l.id === newLoan.id) ? prev : [newLoan, ...prev]));
    }

    if (isCloudReady && cloudUser) {
      await firestoreUpdateApplicationStatus(
        application.id,
        'approved',
        terms.reviewNote,
        newLoanId,
      );
    }
    setLoanApplications((prev) =>
      prev.map((a) =>
        a.id === application.id
          ? {
              ...a,
              status: 'approved',
              reviewNote: terms.reviewNote,
              approvedLoanId: newLoanId,
            }
          : a,
      ),
    );
  };

  const handleRejectApplication = async (
    application: LoanApplication,
    reason: string,
  ) => {
    if (isCloudReady && cloudUser) {
      await firestoreUpdateApplicationStatus(application.id, 'rejected', reason, '');
    }
    setLoanApplications((prev) =>
      prev.map((a) =>
        a.id === application.id
          ? { ...a, status: 'rejected', reviewNote: reason }
          : a,
      ),
    );
  };

  const handleDeleteApplication = async (applicationId: string) => {
    if (isCloudReady && cloudUser) {
      await firestoreDeleteApplication(applicationId);
    }
    setLoanApplications((prev) => prev.filter((a) => a.id !== applicationId));
  };

  const handleCreateStaff = async (input: {
    fullName: string;
    phone: string;
    roleTitle: string;
    username: string;
    password: string;
    accountStatus: StaffAccountStatus;
    lockReason: string;
    permissions: StaffPermission[];
  }) => {
    const normalizedUsername = input.username.trim();
    const normalizedLower = normalizedUsername.toLowerCase();
    if (staffAccounts.some((s) => s.usernameLower === normalizedLower)) {
      throw new Error(`Username "${normalizedUsername}" tayari inatumika na mfanyakazi mwingine.`);
    }
    const passwordHash = await hashStaffPasswordOnServer(input.password);
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const newStaff: StaffAccount = {
      id: makeId('staff'),
      ownerId: uid,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      roleTitle: input.roleTitle.trim(),
      username: normalizedUsername,
      usernameLower: normalizedLower,
      passwordHash,
      accountStatus: input.accountStatus,
      lockReason: input.lockReason.trim(),
      permissions: input.permissions,
      lastLoginAt: '',
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveStaffAccount(cloudUser.uid, newStaff, true);
    }
    const nextList = [newStaff, ...staffAccounts.filter((s) => s.id !== newStaff.id)];
    setStaffAccounts(nextList);
    await syncStaffDirectoryToServer(nextList);
    setSyncNotice(
      `Akaunti ya mfanyakazi "${newStaff.fullName}" (@${newStaff.username}) imeundwa kikamilifu.`,
    );
  };

  const handleUpdateStaffCredentials = async (params: {
    staff: StaffAccount;
    fullName: string;
    phone: string;
    roleTitle: string;
    username: string;
    newPassword: string;
  }) => {
    const normalizedUsername = params.username.trim();
    const normalizedLower = normalizedUsername.toLowerCase();
    if (
      staffAccounts.some(
        (s) => s.id !== params.staff.id && s.usernameLower === normalizedLower,
      )
    ) {
      throw new Error(`Username "${normalizedUsername}" tayari inatumika na mfanyakazi mwingine.`);
    }
    const passwordHash = params.newPassword.trim()
      ? await hashStaffPasswordOnServer(params.newPassword.trim())
      : params.staff.passwordHash;
    const updated: StaffAccount = {
      ...params.staff,
      fullName: params.fullName.trim(),
      phone: params.phone.trim(),
      roleTitle: params.roleTitle.trim(),
      username: normalizedUsername,
      usernameLower: normalizedLower,
      passwordHash,
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveStaffAccount(cloudUser.uid, updated, false);
    }
    const nextList = staffAccounts.map((s) => (s.id === updated.id ? updated : s));
    setStaffAccounts(nextList);
    await syncStaffDirectoryToServer(nextList);
    setSyncNotice(`Taarifa za kuingia za "${updated.fullName}" zimesasishwa.`);
  };

  const handleUpdateStaffPermissions = async (
    staff: StaffAccount,
    permissions: StaffPermission[],
  ) => {
    const updated: StaffAccount = {
      ...staff,
      permissions,
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveStaffAccount(cloudUser.uid, updated, false);
    }
    const nextList = staffAccounts.map((s) => (s.id === updated.id ? updated : s));
    setStaffAccounts(nextList);
    await syncStaffDirectoryToServer(nextList);
    setSyncNotice(
      `Ngazi za ruhusa za "${updated.fullName}" zimehifadhiwa (Activated: ${permissions.length}).`,
    );
  };

  const handleToggleStaffLock = async (
    staff: StaffAccount,
    nextStatus: StaffAccountStatus,
    lockReason: string,
  ) => {
    const updated: StaffAccount = {
      ...staff,
      accountStatus: nextStatus,
      lockReason: nextStatus === 'locked' ? lockReason.trim() : '',
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveStaffAccount(cloudUser.uid, updated, false);
    }
    const nextList = staffAccounts.map((s) => (s.id === updated.id ? updated : s));
    setStaffAccounts(nextList);
    await syncStaffDirectoryToServer(nextList);
    setSyncNotice(
      nextStatus === 'locked'
        ? `Akaunti ya "${updated.fullName}" imefungwa (hawezi kuingia).`
        : `Akaunti ya "${updated.fullName}" imefunguliwa (anaweza kuingia).`,
    );
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (isCloudReady && cloudUser) {
      await firestoreDeleteStaffAccount(staffId);
    }
    const nextList = staffAccounts.filter((s) => s.id !== staffId);
    setStaffAccounts(nextList);
    await syncStaffDirectoryToServer(nextList);
    setSyncNotice('Akaunti ya mfanyakazi imefutwa kwenye mfumo.');
  };

  const handleCreateTask = async (input: DashboardTaskInput) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : 'local';
    const newTask: DailyTask = {
      id: makeId('task'),
      ownerId: uid,
      title: input.title,
      notes: input.notes,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      priority: input.priority,
      category: input.category,
      customerId: input.customerId,
      customerName: input.customerName,
      assignedToUsername: input.assignedToUsername,
      assignedToName: input.assignedToName,
      createdByUsername: authSession?.username || 'admin',
      createdByName: authSession?.fullName || 'Msimamizi',
      completed: false,
      completedAt: '',
      completedByName: '',
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveTask(cloudUser.uid, newTask, true);
    }
    setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);
  };

  const handleUpdateTask = async (task: DailyTask, updates: DashboardTaskInput) => {
    const uid = isCloudReady && cloudUser ? cloudUser.uid : task.ownerId || 'local';
    const updatedTask: DailyTask = {
      ...task,
      ownerId: uid,
      title: updates.title,
      notes: updates.notes,
      dueDate: updates.dueDate,
      dueTime: updates.dueTime,
      priority: updates.priority,
      category: updates.category,
      customerId: updates.customerId,
      customerName: updates.customerName,
      assignedToUsername: updates.assignedToUsername,
      assignedToName: updates.assignedToName,
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveTask(cloudUser.uid, updatedTask, false);
    }
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const handleToggleTaskComplete = async (task: DailyTask) => {
    const nextCompleted = !task.completed;
    const nowTime = new Date();
    const stamp = `${todayISO()} ${String(nowTime.getHours()).padStart(2, '0')}:${String(
      nowTime.getMinutes(),
    ).padStart(2, '0')}`;
    const updatedTask: DailyTask = {
      ...task,
      completed: nextCompleted,
      completedAt: nextCompleted ? stamp : '',
      completedByName: nextCompleted ? authSession?.fullName || authSession?.username || 'Mhusika' : '',
    };
    if (isCloudReady && cloudUser) {
      await firestoreSaveTask(cloudUser.uid, updatedTask, false);
    }
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const handleDeleteTask = async (taskId: string) => {
    if (isCloudReady && cloudUser) {
      await firestoreDeleteTask(taskId);
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  if (!unlocked) {
    return (
      <LoginGate
        company={company}
        loanTypes={loanTypes}
        authNotice={loginNotice}
        onUnlock={handleUnlock}
        onSubmitApplication={handleSubmitOnlineApplication}
      />
    );
  }

  const pendingApplicationsCount = loanApplications.filter(
    (a) => a.status === 'pending',
  ).length;

  const pendingTomorrowCount = tomorrowReminders.filter(
    (item) => !item.alreadySmsedToday && !item.alreadyPushedToday && !item.alreadyEmailedToday,
  ).length;

  const canAccessActiveTab = hasTabAccess(authSession, activeTab);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        companyName={company.companyName}
        district={company.district}
        region={company.region}
        activeTab={activeTab}
        session={authSession}
        pendingApplicationsCount={pendingApplicationsCount}
        tomorrowRemindersCount={pendingTomorrowCount}
        onSelectTab={setActiveTab}
        onLock={handleLock}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200"
              aria-label="Fungua menyu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">
                {company.companyName} {company.district || 'TANDAHIMBA'}-
                {company.region || 'MTAA WA AMANI-MTWARA'}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {hasPermission(authSession, 'manage_applications') && (
              <button
                type="button"
                onClick={() => setActiveTab('applications')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                  activeTab === 'applications'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Wateja wa Mtandaoni</span>
                <span className="sm:hidden">Mtandaoni</span>
                {pendingApplicationsCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-700 text-white">
                    {pendingApplicationsCount}
                  </span>
                )}
              </button>
            )}

            {isCloudReady ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveSnapshotToCloud()}
                  title={`Hifadhi nakala kwenye wingu (${cloudUser?.email || ''})`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Hifadhi Wingu</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnectCloud()}
                  title={`Toka wingu (${cloudUser?.email || ''})`}
                  className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Wingu OK</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleConnectGoogleCloud()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hifadhi Wingu (Google)</span>
                <span className="sm:hidden">Wingu</span>
              </button>
            )}

            {hasPermission(authSession, 'manage_customers') && (
              <button
                type="button"
                onClick={() => setActiveTab('customers')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Sajili Mteja</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLock}
              title="Ondoka (Funga Mfumo)"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ondoka</span>
            </button>
          </div>
        </header>

        {syncNotice && (
          <div className="px-4 sm:px-8 py-2 bg-slate-100 border-b border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-3 no-print">
            <span>{syncNotice}</span>
            <button
              type="button"
              onClick={() => setSyncNotice('')}
              className="text-slate-500 hover:text-slate-800 font-semibold"
            >
              Funga
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {!canAccessActiveTab ? (
            <div className="max-w-lg mx-auto mt-10 bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Ngazi Hii Haijawa Activated (Haijawezeshwa)
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Akaunti yako (<strong>@{authSession?.username}</strong>) haina ruhusa ya kufikia sehemu ya{' '}
                  <strong>{TAB_TITLES[activeTab]}</strong>. Tafadhali muombe Msimamizi Mkuu akuwashe (activate) ngazi hii.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab(getFirstAllowedTab(authSession))}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Rudi Sehemu Iliyoruhusiwa
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  customers={customers}
                  loans={loans}
                  repayments={repayments}
                  company={company}
                  tomorrowReminders={tomorrowReminders}
                  autoPushEnabled={autoPushEnabled}
                  autoSmsEnabled={autoSmsEnabled}
                  pushPermission={pushPermission}
                  onRequestPushPermission={handleRequestPushPermission}
                  onToggleAutoPush={handleToggleAutoPush}
                  onToggleAutoSms={handleToggleAutoSms}
                  onSendSmsReminder={handleSendTomorrowSmsSingle}
                  onSendAllSmsReminders={() => handleSendAllTomorrowSms(true)}
                  onSendPushReminder={handleSendPushReminder}
                  onSendAllPushReminders={handleSendAllPushReminders}
                  onLogEmailReminder={handleLogEmailReminder}
                  onNavigate={setActiveTab}
                  onOpenRepay={(loan) => setRepayModalLoan(loan)}
                  onSelectCustomerForMessage={(custId) => {
                    setPreselectedMessageCustomerId(custId);
                    setActiveTab('messaging');
                  }}
                  cloudUserUid={cloudUser && cloudUser.emailVerified ? cloudUser.uid : null}
                  onConnectCloud={handleConnectGoogleCloud}
                  session={authSession}
                  tasks={tasks}
                  staffAccounts={staffAccounts}
                  onCreateTask={handleCreateTask}
                  onUpdateTask={handleUpdateTask}
                  onToggleTaskComplete={handleToggleTaskComplete}
                  onDeleteTask={handleDeleteTask}
                />
              )}

              {activeTab === 'applications' && (
                <ApplicationsView
                  applications={loanApplications}
                  company={company}
                  onApprove={handleApproveApplication}
                  onReject={handleRejectApplication}
                  onDelete={handleDeleteApplication}
                />
              )}

              {activeTab === 'customers' && (
                <CustomersLoansView
                  customers={customers}
                  loans={loans}
                  repayments={repayments}
                  loanTypes={loanTypes}
                  company={company}
                  prefillCalc={prefillCalc}
                  onCreateCustomerAndLoan={handleCreateCustomerAndLoan}
                  onAddLoanToCustomer={handleAddLoanToCustomer}
                  onUpdateCustomer={handleUpdateCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  onOpenRepay={(loan) => setRepayModalLoan(loan)}
                  onOpenContract={(loanId) => {
                    setPreselectedContractLoanId(loanId);
                    setActiveTab('contract');
                  }}
                  onOpenMessaging={(custId) => {
                    setPreselectedMessageCustomerId(custId);
                    setActiveTab('messaging');
                  }}
                  onOpenBankDebit={(custId) => {
                    setPreselectedBankDebitCustomerId(custId);
                    setActiveTab('bank_debit');
                  }}
                  onOpenOnlineCustomers={() => setActiveTab('applications')}
                  canEditDeleteCustomers={hasPermission(authSession, 'edit_delete_customers')}
                />
              )}

              {activeTab === 'loans' && (
                <LoansPenaltyView
                  customers={customers}
                  loans={loans}
                  canApplyPenalty={hasPermission(authSession, 'apply_penalties')}
                  onOpenRepay={(loan) => setRepayModalLoan(loan)}
                  onApplyPenalty={handleApplyPenalty}
                  onOpenContract={(loanId) => {
                    setPreselectedContractLoanId(loanId);
                    setActiveTab('contract');
                  }}
                />
              )}

              {activeTab === 'schedule' && (
                <ScheduleView
                  customers={customers}
                  loans={loans}
                  onOpenRepay={(loan) => setRepayModalLoan(loan)}
                  onOpenMessaging={(custId) => {
                    setPreselectedMessageCustomerId(custId);
                    setActiveTab('messaging');
                  }}
                />
              )}

              {activeTab === 'collections' && (
                <CollectionsReceiptsView
                  customers={customers}
                  loans={loans}
                  repayments={repayments}
                  onOpenRepay={(loan) => setRepayModalLoan(loan)}
                  onViewReceipt={(rep) => setActiveReceipt(rep)}
                />
              )}

              {activeTab === 'revenue_report' && (
                <RevenueReportView
                  repayments={repayments}
                  loans={loans}
                  loanTypes={loanTypes}
                  customers={customers}
                  company={company}
                  onOpenCollections={() => setActiveTab('collections')}
                />
              )}

              {activeTab === 'bank_debit' && (
                <BankDirectDebitView
                  customers={customers}
                  loans={loans}
                  bankDebitTransactions={bankDebitTransactions}
                  preselectedCustomerId={preselectedBankDebitCustomerId}
                  onExecuteSingleDebit={handleExecuteSingleBankDebit}
                  onExecuteBatchDebit={handleExecuteBatchBankDebit}
                />
              )}

              {activeTab === 'slides' && (
                <GoogleSlidesView
                  customers={customers}
                  loans={loans}
                  repayments={repayments}
                  company={company}
                />
              )}

              {activeTab === 'google_forms' && (
                <GoogleFormsView
                  company={company}
                  loanTypes={loanTypes}
                  existingApplications={loanApplications}
                  onImportApplications={handleImportGoogleFormApplications}
                  onOpenOnlineCustomers={() => setActiveTab('applications')}
                />
              )}

              {activeTab === 'messaging' && (
                <MessagingView
                  customers={customers}
                  loans={loans}
                  loanApplications={loanApplications}
                  company={company}
                  messageLogs={messageLogs}
                  tomorrowReminders={tomorrowReminders}
                  autoPushEnabled={autoPushEnabled}
                  autoSmsEnabled={autoSmsEnabled}
                  pushPermission={pushPermission}
                  preselectedCustomerId={preselectedMessageCustomerId}
                  onRequestPushPermission={handleRequestPushPermission}
                  onToggleAutoPush={handleToggleAutoPush}
                  onToggleAutoSms={handleToggleAutoSms}
                  onSendPushReminder={handleSendPushReminder}
                  onSendAllPushReminders={handleSendAllPushReminders}
                  onLogEmailReminder={handleLogEmailReminder}
                  onUpdateCustomerEmail={handleUpdateCustomerEmail}
                  onLogMessage={handleLogMessage}
                />
              )}

              {activeTab === 'calculator' && (
                <CalculatorView
                  defaultPenaltyPercent={company.defaultPenaltyPercent}
                  onApplyToNewLoan={(params) => {
                    setPrefillCalc(params);
                    setActiveTab('customers');
                  }}
                />
              )}

              {activeTab === 'contract' && (
                <ContractView
                  customers={customers}
                  loans={loans}
                  company={company}
                  preselectedLoanId={preselectedContractLoanId}
                  onExit={() => setActiveTab('dashboard')}
                />
              )}

              {activeTab === 'loan_types' && (
                <LoanTypesView
                  loanTypes={loanTypes}
                  onSaveLoanType={handleSaveLoanType}
                  onDeleteLoanType={handleDeleteLoanType}
                />
              )}

              {activeTab === 'staff' && authSession?.actorType === 'admin' && (
                <StaffAccountsView
                  staffAccounts={staffAccounts}
                  onCreateStaff={handleCreateStaff}
                  onUpdateStaffCredentials={handleUpdateStaffCredentials}
                  onUpdateStaffPermissions={handleUpdateStaffPermissions}
                  onToggleStaffLock={handleToggleStaffLock}
                  onDeleteStaff={handleDeleteStaff}
                />
              )}

              {activeTab === 'company' && (
                <CompanySettingsView
                  company={company}
                  onSave={handleSaveCompany}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {repayModalLoan && (
        <RepayModal
          loan={repayModalLoan}
          customer={customers.find((c) => c.id === repayModalLoan.customerId)}
          onClose={() => setRepayModalLoan(null)}
          onSubmit={handleRecordRepayment}
        />
      )}

      {activeReceipt && (
        <ReceiptModal
          repayment={activeReceipt}
          loan={loans.find((l) => l.id === activeReceipt.loanId)}
          customer={customers.find((c) => c.id === activeReceipt.customerId)}
          company={company}
          onClose={() => setActiveReceipt(null)}
          onShareLogged={async (channel, messageBody, repayment, loan, customer) => {
            try {
              await handleLogMessage({
                customerId: customer.id,
                channel,
                recipientPhone: customer.phone,
                messageBody,
                amountPaidSnapshot: repayment.amount,
                amountOwedSnapshot: getLoanRemainingBalance(loan),
              });
            } catch (err) {
              console.warn('[ReceiptShare Log]', err);
            }
          }}
        />
      )}
    </div>
  );
}
