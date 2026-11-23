import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Smartphone,
  Users,
} from 'lucide-react';
import {
  CompanySettings,
  Customer,
  Loan,
  LoanApplication,
  MessageChannel,
  MessageLog,
  TomorrowReminderItem,
} from '../types';
import {
  buildAutoSmsLogPrefix,
  buildLoanProcessingMessage,
  buildTomorrowReminderMessage,
  formatDateSW,
  formatTZS,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  LOAN_PROGRESS_STAGES,
  normalizeTzPhone,
  todayISO,
  tomorrowISO,
} from '../utils/finance';
import {
  buildMailtoHref,
  markAutoSmsDispatchedLocally,
  PushPermissionState,
} from '../services/notifications';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import {
  fetchSmsGatewayStatus,
  sendBulkSmsViaApi,
  sendSmsViaApi,
  SmsGatewayStatus,
} from '../services/smsApi';

interface MessagingViewProps {
  customers: Customer[];
  loans: Loan[];
  loanApplications: LoanApplication[];
  company: CompanySettings;
  messageLogs: MessageLog[];
  tomorrowReminders: TomorrowReminderItem[];
  autoPushEnabled: boolean;
  autoSmsEnabled: boolean;
  pushPermission: PushPermissionState;
  preselectedCustomerId?: string | null;
  onRequestPushPermission: () => Promise<void>;
  onToggleAutoPush: (enabled: boolean) => void;
  onToggleAutoSms: (enabled: boolean) => void;
  onSendPushReminder: (item: TomorrowReminderItem) => Promise<void>;
  onSendAllPushReminders: () => Promise<void>;
  onLogEmailReminder: (item: TomorrowReminderItem) => Promise<void>;
  onUpdateCustomerEmail: (customer: Customer, email: string) => Promise<void>;
  onLogMessage: (payload: {
    customerId: string;
    channel: MessageChannel;
    recipientPhone: string;
    messageBody: string;
    amountPaidSnapshot: number;
    amountOwedSnapshot: number;
  }) => Promise<void>;
}

export const MessagingView: React.FC<MessagingViewProps> = ({
  customers,
  loans,
  loanApplications,
  company,
  messageLogs,
  tomorrowReminders,
  autoPushEnabled,
  autoSmsEnabled,
  pushPermission,
  preselectedCustomerId,
  onRequestPushPermission,
  onToggleAutoPush,
  onToggleAutoSms,
  onSendPushReminder,
  onSendAllPushReminders,
  onLogEmailReminder,
  onUpdateCustomerEmail,
  onLogMessage,
}) => {
  const pendingApps = useMemo(
    () => loanApplications.filter((a) => a.status === 'pending'),
    [loanApplications],
  );

  const [recipientMode, setRecipientMode] = useState<'customer' | 'online_applicant'>(() =>
    customers.length === 0 && pendingApps.length > 0 ? 'online_applicant' : 'customer',
  );
  const [selectedId, setSelectedId] = useState(
    preselectedCustomerId || customers[0]?.id || '',
  );
  const [selectedAppId, setSelectedAppId] = useState(pendingApps[0]?.id || '');
  const [templateKind, setTemplateKind] = useState<
    'tomorrow' | 'processing' | 'stage_update' | 'reminder' | 'balance' | 'overdue' | 'thanks'
  >('tomorrow');
  const [selectedLoanStage, setSelectedLoanStage] = useState<string>(LOAN_PROGRESS_STAGES[1]);
  const [customStageNote, setCustomStageNote] = useState('');
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSavedNotice, setEmailSavedNotice] = useState('');
  const [emailError, setEmailError] = useState('');

  // SMS Gateway API state
  const [smsGateway, setSmsGateway] = useState<SmsGatewayStatus | null>(null);
  const [loadingSmsStatus, setLoadingSmsStatus] = useState(false);
  const [sendingSmsApi, setSendingSmsApi] = useState(false);
  const [sendingTomorrowSms, setSendingTomorrowSms] = useState(false);
  const [smsNotice, setSmsNotice] = useState('');
  const [smsError, setSmsError] = useState('');

  // Bulk SMS composer state
  const [bulkSelectedCustomerIds, setBulkSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkMessageTemplate, setBulkMessageTemplate] = useState(
    `Habari {JINA}, huu ni ujumbe kutoka ${company.companyName}. Salio lako la mkopo ni {SALIO}. Kwa msaada wasiliana nasi kupitia ${company.phone}.`,
  );
  const [sendingBulkSms, setSendingBulkSms] = useState(false);
  const [bulkResultMsg, setBulkResultMsg] = useState('');

  const loadSmsStatus = async () => {
    setLoadingSmsStatus(true);
    try {
      const status = await fetchSmsGatewayStatus();
      setSmsGateway(status);
    } catch {
      // Non-blocking
    } finally {
      setLoadingSmsStatus(false);
    }
  };

  useEffect(() => {
    void loadSmsStatus();
  }, []);

  useEffect(() => {
    if (preselectedCustomerId) {
      setRecipientMode('customer');
      setSelectedId(preselectedCustomerId);
    } else if (!selectedId && customers[0]) {
      setSelectedId(customers[0].id);
    }
  }, [preselectedCustomerId, customers, selectedId]);

  useEffect(() => {
    if (!selectedAppId && pendingApps[0]) {
      setSelectedAppId(pendingApps[0].id);
    }
  }, [pendingApps, selectedAppId]);

  const selectedCustomer = useMemo(
    () =>
      recipientMode === 'customer'
        ? customers.find((c) => c.id === selectedId) || customers[0]
        : undefined,
    [recipientMode, customers, selectedId],
  );

  const selectedApplicant = useMemo(
    () =>
      recipientMode === 'online_applicant'
        ? pendingApps.find((a) => a.id === selectedAppId) || pendingApps[0]
        : undefined,
    [recipientMode, pendingApps, selectedAppId],
  );

  const activeRecipient = selectedCustomer
    ? {
        id: selectedCustomer.id,
        fullName: selectedCustomer.fullName,
        phone: selectedCustomer.phone,
        email: selectedCustomer.email || '',
        isRegisteredCustomer: true,
      }
    : selectedApplicant
      ? {
          id: selectedApplicant.id,
          fullName: selectedApplicant.fullName,
          phone: selectedApplicant.phone,
          email: selectedApplicant.email || '',
          isRegisteredCustomer: false,
        }
      : null;

  useEffect(() => {
    setEmailInput(activeRecipient?.email || '');
    setEmailSavedNotice('');
    setEmailError('');
  }, [activeRecipient?.id, activeRecipient?.email]);

  const financialSnapshot = useMemo(() => {
    if (!selectedCustomer) {
      return {
        totalLoan: selectedApplicant?.requestedAmount || 0,
        totalPaid: 0,
        totalOwed: selectedApplicant?.requestedAmount || 0,
        latestLoan: undefined as Loan | undefined,
      };
    }
    const custLoans = loans.filter((l) => l.customerId === selectedCustomer.id);
    const totalLoan = custLoans.reduce((s, l) => s + l.totalDue, 0);
    const totalPaid = custLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
    const totalOwed = custLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);
    return {
      totalLoan,
      totalPaid,
      totalOwed,
      latestLoan: custLoans[0],
    };
  }, [selectedCustomer, selectedApplicant, loans]);

  const selectedTomorrowItem = useMemo(
    () =>
      selectedCustomer
        ? tomorrowReminders.find((r) => r.customer.id === selectedCustomer.id)
        : undefined,
    [selectedCustomer, tomorrowReminders],
  );

  useEffect(() => {
    if (!activeRecipient) {
      setMessageText('');
      return;
    }
    const name = activeRecipient.fullName;
    const paidStr = formatTZS(financialSnapshot.totalPaid);
    const owedStr = formatTZS(financialSnapshot.totalOwed);
    const endDateStr = financialSnapshot.latestLoan
      ? formatDateSW(financialSnapshot.latestLoan.endDate)
      : '-';
    const penaltyPct = financialSnapshot.latestLoan?.penaltyPercent ?? company.defaultPenaltyPercent;
    const stageDisplay = customStageNote.trim() || selectedLoanStage;

    if (templateKind === 'processing' || templateKind === 'stage_update') {
      const amountRef = selectedApplicant?.requestedAmount || financialSnapshot.latestLoan?.principal;
      if (templateKind === 'processing') {
        setMessageText(
          buildLoanProcessingMessage(
            name,
            company.companyName,
            stageDisplay,
            company.phone,
            amountRef,
          ),
        );
      } else {
        setMessageText(
          `Habari ${name}, tunakukumbusha hatua tuliyofikia kwenye mkopo wako (${company.companyName}): "${stageDisplay}". Mkopo wako unaendelea kushughulikiwa vizuri. Kwa marejeleo au maswali piga simu/WhatsApp ${company.phone}.`,
        );
      }
      return;
    }

    if (templateKind === 'tomorrow') {
      if (selectedTomorrowItem) {
        setMessageText(
          buildTomorrowReminderMessage(
            name,
            company.companyName,
            selectedTomorrowItem.installmentRemaining,
            selectedTomorrowItem.dueDate,
            selectedTomorrowItem.totalPaid,
            selectedTomorrowItem.totalOwed,
            company.phone,
          ),
        );
      } else {
        setMessageText(
          `Habari ${name}, huu ni ukumbusho kutoka ${company.companyName} siku moja kabla ya rejesho lako. Hadi sasa umeshalipa ${paidStr} na salio unalodaiwa ni ${owedStr}. Tafadhali jiandae kukamilisha rejesho lako kwa wakati (Mwisho: ${endDateStr}). Simu: ${company.phone}.`,
        );
      }
    } else if (templateKind === 'reminder') {
      setMessageText(
        `Habari ${name}, huu ni ukumbusho kutoka ${company.companyName}. Hadi sasa umeshalipa ${paidStr} na kiasi unachodaiwa ni ${owedStr}. Tafadhali kamilisha rejesho lako kabla ya ${endDateStr}. Asante.`,
      );
    } else if (templateKind === 'balance') {
      setMessageText(
        `Habari ${name}, taarifa yako ya mkopo ${company.companyName}: Jumla ya mkopo ni ${formatTZS(financialSnapshot.totalLoan)}, Kiasi ulicholipa ni ${paidStr}, na Salio unalodaiwa ni ${owedStr}. Mawasiliano: ${company.phone}.`,
      );
    } else if (templateKind === 'overdue') {
      setMessageText(
        `TAARIFA MUHIMU ${name} (${company.companyName}): Muda wa rejesho lako umepita. Umeshalipa ${paidStr} na bado unadaiwa ${owedStr}. Tafadhali lipa haraka kuepuka adhabu ya ${penaltyPct}% kulingana na mkataba wetu. Simu: ${company.phone}.`,
      );
    } else {
      setMessageText(
        `Asante sana ${name} kwa kufanya rejesho lako na ${company.companyName}. Jumla uliyolipa hadi sasa ni ${paidStr} na salio lililobaki ni ${owedStr}.`,
      );
    }
  }, [
    activeRecipient,
    selectedApplicant,
    financialSnapshot,
    selectedTomorrowItem,
    templateKind,
    selectedLoanStage,
    customStageNote,
    company,
  ]);

  const normalizedPhone = activeRecipient ? normalizeTzPhone(activeRecipient.phone) : '';
  const whatsappUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(messageText)}`
    : '#';
  const smsUrl = normalizedPhone
    ? `sms:+${normalizedPhone}?body=${encodeURIComponent(messageText)}`
    : '#';
  const cleanRecipientEmail = emailInput.trim();
  const mailtoUrl = cleanRecipientEmail
    ? buildMailtoHref(
        cleanRecipientEmail,
        templateKind === 'processing' || templateKind === 'stage_update'
          ? `Hatua ya Mkopo Wako - ${company.companyName}`
          : `Ukumbusho wa Rejesho la Mkopo - ${company.companyName}`,
        messageText,
      )
    : '';

  const handleDispatchLog = async (channel: MessageChannel) => {
    if (!activeRecipient || !messageText.trim()) return;
    if (!activeRecipient.isRegisteredCustomer) {
      setSmsNotice(`Ujumbe wa hatua ya mkopo umeandaliwa kwa mwombaji ${activeRecipient.fullName}.`);
      return;
    }
    await onLogMessage({
      customerId: activeRecipient.id,
      channel,
      recipientPhone:
        channel === 'email' && cleanRecipientEmail
          ? cleanRecipientEmail
          : activeRecipient.phone,
      messageBody: messageText.trim(),
      amountPaidSnapshot: financialSnapshot.totalPaid,
      amountOwedSnapshot: financialSnapshot.totalOwed,
    });
  };

  const handleSaveCustomerEmail = async () => {
    if (!selectedCustomer) return;
    setSavingEmail(true);
    setEmailSavedNotice('');
    setEmailError('');
    try {
      await onUpdateCustomerEmail(selectedCustomer, emailInput.trim());
      setEmailSavedNotice('Barua pepe imehifadhiwa.');
    } catch (err) {
      setEmailError(formatFirestoreErrorForUser(err));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      try {
        await handleDispatchLog('social');
      } catch (err) {
        setSmsError(formatFirestoreErrorForUser(err));
      }
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const customerSnapshots = useMemo(() => {
    const map = new Map<string, { paid: number; owed: number; hasActive: boolean; hasOverdue: boolean }>();
    const today = todayISO();
    for (const c of customers) {
      const cLoans = loans.filter((l) => l.customerId === c.id);
      const paid = cLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
      const owed = cLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);
      const hasActive = cLoans.some((l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0);
      const hasOverdue = cLoans.some(
        (l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0 && (l.status === 'overdue' || l.endDate < today),
      );
      map.set(c.id, { paid, owed, hasActive, hasOverdue });
    }
    return map;
  }, [customers, loans]);

  const handleSendSingleSmsApi = async () => {
    if (!activeRecipient || !messageText.trim()) return;
    setSendingSmsApi(true);
    setSmsError('');
    setSmsNotice('');
    try {
      const res = await sendSmsViaApi({
        customerId: activeRecipient.id,
        customerName: activeRecipient.fullName,
        recipientPhone: activeRecipient.phone,
        messageBody: messageText.trim(),
      });
      if (activeRecipient.isRegisteredCustomer) {
        await onLogMessage({
          customerId: activeRecipient.id,
          channel: 'sms',
          recipientPhone: res.recipientPhone || activeRecipient.phone,
          messageBody: `[Ref: ${res.gatewayReference}] ${messageText.trim()}`,
          amountPaidSnapshot: financialSnapshot.totalPaid,
          amountOwedSnapshot: financialSnapshot.totalOwed,
        });
      }
      setSmsNotice(res.statusMessage);
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : 'Imeshindwa kutuma SMS kupitia API.');
    } finally {
      setSendingSmsApi(false);
    }
  };

  const handleSendTomorrowSmsSingle = async (item: TomorrowReminderItem) => {
    setSmsError('');
    setSmsNotice('');
    const todayStr = todayISO();
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
        todayStr,
        item.loan.id,
        item.periodNumber,
        res.gatewayReference,
      );
      const prefix = buildAutoSmsLogPrefix(
        item.loan.id,
        item.periodNumber,
        res.gatewayReference,
      );
      await onLogMessage({
        customerId: item.customer.id,
        channel: 'sms',
        recipientPhone: res.recipientPhone || item.customer.phone,
        messageBody: `${prefix} ${body}`.slice(0, 1000),
        amountPaidSnapshot: item.totalPaid,
        amountOwedSnapshot: item.totalOwed,
      });
      setSmsNotice(res.statusMessage);
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : 'Imeshindwa kutuma SMS.');
    }
  };

  const handleSendTomorrowSmsAll = async () => {
    if (tomorrowReminders.length === 0) return;
    setSendingTomorrowSms(true);
    setSmsError('');
    setSmsNotice('');
    const todayStr = todayISO();
    try {
      const items = tomorrowReminders.map((item) => ({
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
      const batchRes = await sendBulkSmsViaApi(items, 'auto_24h');
      for (let i = 0; i < batchRes.results.length; i++) {
        const r = batchRes.results[i];
        if (!r.success) continue;
        const orig = tomorrowReminders[i];
        markAutoSmsDispatchedLocally(
          todayStr,
          orig.loan.id,
          orig.periodNumber,
          r.gatewayReference,
        );
        const prefix = buildAutoSmsLogPrefix(
          orig.loan.id,
          orig.periodNumber,
          r.gatewayReference,
        );
        await onLogMessage({
          customerId: orig.customer.id,
          channel: 'sms',
          recipientPhone: r.recipientPhone || orig.customer.phone,
          messageBody: `${prefix} ${items[i].messageBody}`.slice(0, 1000),
          amountPaidSnapshot: orig.totalPaid,
          amountOwedSnapshot: orig.totalOwed,
        });
      }
      setSmsNotice(
        `SMS ${batchRes.totalSent} za ukumbusho (masaa 24 kabla) zimetumwa kupitia API${
          batchRes.totalFailed > 0 ? ` (${batchRes.totalFailed} zimeshindikana)` : ''
        }.`,
      );
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : 'Imeshindwa kutuma SMS za kundi.');
    } finally {
      setSendingTomorrowSms(false);
    }
  };

  const toggleBulkCustomer = (custId: string) => {
    setBulkSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId);
      else next.add(custId);
      return next;
    });
  };

  const selectBulkGroup = (mode: 'all' | 'active' | 'overdue' | 'none') => {
    if (mode === 'none') {
      setBulkSelectedCustomerIds(new Set());
      return;
    }
    const ids = customers
      .filter((c) => {
        if (mode === 'all') return true;
        const snap = customerSnapshots.get(c.id);
        if (mode === 'active') return Boolean(snap?.hasActive);
        return Boolean(snap?.hasOverdue);
      })
      .map((c) => c.id);
    setBulkSelectedCustomerIds(new Set(ids));
  };

  const handleSendBulkCustomSms = async () => {
    const selectedCusts = customers.filter((c) => bulkSelectedCustomerIds.has(c.id));
    if (selectedCusts.length === 0 || !bulkMessageTemplate.trim()) return;
    setSendingBulkSms(true);
    setBulkResultMsg('');
    setSmsError('');
    try {
      const payloadItems = selectedCusts.map((c) => {
        const snap = customerSnapshots.get(c.id) || { paid: 0, owed: 0 };
        const personalized = bulkMessageTemplate
          .replace(/\{JINA\}/gi, c.fullName)
          .replace(/\{SALIO\}/gi, formatTZS(snap.owed))
          .replace(/\{ALICHOLIPA\}/gi, formatTZS(snap.paid));
        return {
          customerId: c.id,
          customerName: c.fullName,
          recipientPhone: c.phone,
          messageBody: personalized,
        };
      });

      const batchRes = await sendBulkSmsViaApi(payloadItems);
      for (let i = 0; i < batchRes.results.length; i++) {
        const r = batchRes.results[i];
        if (!r.success) continue;
        const c = selectedCusts[i];
        const snap = customerSnapshots.get(c.id) || { paid: 0, owed: 0 };
        await onLogMessage({
          customerId: c.id,
          channel: 'sms',
          recipientPhone: r.recipientPhone || c.phone,
          messageBody: `[Ref: ${r.gatewayReference}] ${payloadItems[i].messageBody}`,
          amountPaidSnapshot: snap.paid,
          amountOwedSnapshot: snap.owed,
        });
      }
      setBulkResultMsg(
        `SMS ${batchRes.totalSent} kati ya ${selectedCusts.length} zimetumwa kupitia API${
          batchRes.totalFailed > 0 ? ` (${batchRes.totalFailed} namba zina hitilafu)` : ''
        }.`,
      );
      setBulkSelectedCustomerIds(new Set());
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : 'Hitilafu ya kutuma SMS kwa kundi.');
    } finally {
      setSendingBulkSms(false);
    }
  };

  const tomorrowDateStr = formatDateSW(tomorrowISO(todayISO()));
  const smsSegments = Math.max(1, Math.ceil(messageText.trim().length / 160));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Kituo cha Ujumbe, SMS API &amp; Arifa za Kiotomatiki
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tuma SMS za kawaida moja kwa moja kupitia API, arifa za Push, Email au WhatsApp kwa wateja
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs">
            <span className="text-slate-500">SMS API: </span>
            <span className="font-semibold text-emerald-700">
              {smsGateway?.mode === 'live_api' ? 'Live Gateway' : 'Gateway Tayari (Sandbox)'}
            </span>
            <span className="text-slate-400 mx-1.5">·</span>
            <span className="font-mono-num text-slate-700">
              Sender: {smsGateway?.senderId || 'MM-MICROFIN'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadSmsStatus()}
            disabled={loadingSmsStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSmsStatus ? 'animate-spin' : ''}`} />
            <span>Kagua SMS API</span>
          </button>
        </div>
      </div>

      {smsNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{smsNotice}</span>
        </div>
      )}

      {smsError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {smsError}
        </div>
      )}

      {/* Automatic 24-Hour-Before (1-Day-Before) SMS & Push Reminders Queue */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              SMS &amp; Arifa za Kiotomatiki (Masaa 24 Kabla — Kesho {tomorrowDateStr})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Wateja {tomorrowReminders.length} wana marejesho kesho · Waliotumiwa SMS Leo:{' '}
              <span className="font-mono-num font-semibold text-emerald-700">
                {tomorrowReminders.filter((r) => r.alreadySmsedToday).length} / {tomorrowReminders.length}
              </span>{' '}
              · SMS Kiotomatiki:{' '}
              <span className={`font-semibold ${autoSmsEnabled ? 'text-emerald-700' : 'text-slate-600'}`}>
                {autoSmsEnabled ? 'Imewashwa' : 'Imezimwa'}
              </span>{' '}
              · Push Kiotomatiki:{' '}
              <span className="font-semibold text-slate-700">
                {pushPermission === 'granted' && autoPushEnabled
                  ? 'Imewashwa'
                  : pushPermission === 'denied'
                    ? 'Imezuiwa na Kivinjari'
                    : pushPermission === 'unsupported'
                      ? 'Kivinjari Hakiungi Mkono'
                      : 'Haijawashwa'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleAutoSms(!autoSmsEnabled)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border whitespace-nowrap ${
                autoSmsEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>
                {autoSmsEnabled ? 'SMS Kiotomatiki (24h): Imewashwa' : 'Washa SMS Kiotomatiki (24h)'}
              </span>
            </button>

            {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void onRequestPushPermission()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Washa Arifa za Push</span>
              </button>
            )}

            {pushPermission === 'granted' && (
              <button
                type="button"
                onClick={() => onToggleAutoPush(!autoPushEnabled)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border whitespace-nowrap ${
                  autoPushEnabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{autoPushEnabled ? 'Push Kiotomatiki: Imewashwa' : 'Washa Push Kiotomatiki'}</span>
              </button>
            )}

            {tomorrowReminders.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={sendingTomorrowSms}
                  onClick={() => void handleSendTomorrowSmsAll()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {sendingTomorrowSms
                      ? 'Inatuma SMS...'
                      : `Tuma SMS kwa Wote (${tomorrowReminders.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onSendAllPushReminders()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Tuma Push kwa Wote ({tomorrowReminders.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {tomorrowReminders.length === 0 ? (
          <div className="px-6 py-4 text-xs text-slate-500">
            Hakuna mteja mwenye tarehe ya rejesho kesho ({tomorrowDateStr}). Kila kunapokuwa na rejesho ndani ya masaa 24 yajayo, mfumo hutuma SMS kiotomatiki kwenda namba ya simu iliyohifadhiwa kwenye wasifu wa mteja.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tomorrowReminders.map((item) => {
              const msg = buildTomorrowReminderMessage(
                item.customer.fullName,
                company.companyName,
                item.installmentRemaining,
                item.dueDate,
                item.totalPaid,
                item.totalOwed,
                company.phone,
              );
              const mailHref = item.customer.email
                ? buildMailtoHref(
                    item.customer.email,
                    `Ukumbusho wa Rejesho Kesho (${formatDateSW(item.dueDate)}) - ${company.companyName}`,
                    msg,
                  )
                : '';

              return (
                <div
                  key={`${item.loan.id}_${item.periodNumber}`}
                  className="px-6 py-3 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="text-xs space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        {item.customer.fullName}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span
                        className={`font-semibold ${
                          !item.hasValidSmsPhone
                            ? 'text-red-700'
                            : item.alreadySmsedToday
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {!item.hasValidSmsPhone
                          ? 'Namba ya simu si sahihi'
                          : item.alreadySmsedToday
                            ? 'SMS Imetumwa Leo'
                            : 'Inasubiri SMS (24h)'}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono-num">
                      Simu ya Wasifu: {item.customer.phone}
                      {item.customer.email ? ` · ${item.customer.email}` : ''} · Awamu #{item.periodNumber} · Rejesho la kesho:{' '}
                      <strong className="text-slate-900">
                        {formatTZS(item.installmentRemaining)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!item.hasValidSmsPhone}
                      onClick={() => void handleSendTomorrowSmsSingle(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{item.alreadySmsedToday ? 'Tuma SMS Tena' : 'Tuma SMS (API)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void onSendPushReminder(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 whitespace-nowrap"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>{item.alreadyPushedToday ? 'Tuma Push Tena' : 'Tuma Push'}</span>
                    </button>

                    {item.customer.email ? (
                      <a
                        href={mailHref}
                        onClick={() =>
                          void onLogEmailReminder(item).catch((err) =>
                            setSmsError(formatFirestoreErrorForUser(err)),
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{item.alreadyEmailedToday ? 'Email Tena' : 'Tuma Email'}</span>
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.customer.id);
                        setTemplateKind('tomorrow');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-md hover:bg-emerald-100 whitespace-nowrap"
                    >
                      Andaa Ujumbe
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {customers.length === 0 && pendingApps.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            Hakuna wateja waliosajiliwa au waombaji mtandaoni bado.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sajili mteja kwanza au subiri ombi la mtandaoni ili uweze kutuma taarifa za hatua ya mkopo na salio kupitia WhatsApp, Email au SMS.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Composer */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            {/* Quick Stage & Processing Presets Banner */}
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-950">
                  <Clock3 className="w-4 h-4 text-sky-700" />
                  <span>Ujumbe wa Hatua ya Mkopo &amp; Taarifa Kuwa Mkopo Unashughulikiwa</span>
                </div>
                <div className="inline-flex items-center gap-1 p-0.5 bg-white border border-sky-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRecipientMode('customer')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                      recipientMode === 'customer'
                        ? 'bg-sky-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Wateja ({customers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientMode('online_applicant');
                      setTemplateKind('processing');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                      recipientMode === 'online_applicant'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Waombaji Mtandaoni ({pendingApps.length})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                    Chagua Hatua Iliyofikiwa
                  </label>
                  <select
                    value={selectedLoanStage}
                    onChange={(e) => {
                      setSelectedLoanStage(e.target.value);
                      if (templateKind !== 'processing' && templateKind !== 'stage_update') {
                        setTemplateKind('processing');
                      }
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-sky-300 rounded-lg bg-white text-slate-900"
                  >
                    {LOAN_PROGRESS_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                    Au Andika Hatua Maalum (Si Lazima)
                  </label>
                  <input
                    type="text"
                    value={customStageNote}
                    onChange={(e) => {
                      setCustomStageNote(e.target.value);
                      if (e.target.value.trim() && templateKind !== 'processing' && templateKind !== 'stage_update') {
                        setTemplateKind('stage_update');
                      }
                    }}
                    placeholder="Mfano: Tunasubiri saini ya mdhamini"
                    className="w-full px-3 py-1.5 text-xs border border-sky-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateKind('processing')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    templateKind === 'processing'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-800 border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  Mkopo Unashughulikiwa
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateKind('stage_update')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    templateKind === 'stage_update'
                      ? 'bg-sky-700 text-white border-sky-700'
                      : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  Kumbusha Hatua Iliyofikiwa
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {recipientMode === 'online_applicant'
                    ? 'Chagua Mwombaji wa Mtandaoni'
                    : 'Chagua Mteja'}
                </label>
                {recipientMode === 'online_applicant' ? (
                  <select
                    value={selectedApplicant?.id || ''}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {pendingApps.length === 0 ? (
                      <option value="">Hakuna maombi yanayosubiri</option>
                    ) : (
                      pendingApps.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.fullName} ({app.phone}) · {formatTZS(app.requestedAmount)}
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <select
                    value={selectedCustomer?.id || ''}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.phone})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Aina ya Ujumbe
                </label>
                <select
                  value={templateKind}
                  onChange={(e) =>
                    setTemplateKind(
                      e.target.value as
                        | 'tomorrow'
                        | 'processing'
                        | 'stage_update'
                        | 'reminder'
                        | 'balance'
                        | 'overdue'
                        | 'thanks',
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="processing">Taarifa: Mkopo Unashughulikiwa</option>
                  <option value="stage_update">Kumbusho la Hatua ya Mkopo</option>
                  <option value="tomorrow">Ukumbusho wa Kesho (Siku 1 Kabla)</option>
                  <option value="reminder">Ukumbusho wa Rejesho</option>
                  <option value="balance">Taarifa ya Salio Kamili</option>
                  <option value="overdue">Onyo la Kuchelewa &amp; Adhabu</option>
                  <option value="thanks">Shukrani Baada ya Kulipa</option>
                </select>
              </div>
            </div>

            {/* Live Paid vs Owed Banner */}
            {activeRecipient && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">Namba ya Simu</div>
                  <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                    {activeRecipient.phone}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">
                    {activeRecipient.isRegisteredCustomer ? 'Jumla ya Mkopo' : 'Kiasi Alichoomba'}
                  </div>
                  <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                    {formatTZS(financialSnapshot.totalLoan)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Kiasi Alicholipa</div>
                  <div className="font-mono-num font-bold text-emerald-700 mt-0.5">
                    {formatTZS(financialSnapshot.totalPaid)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">
                    {activeRecipient.isRegisteredCustomer ? 'Kiasi Anachodaiwa' : 'Hali ya Ombi'}
                  </div>
                  <div className="font-mono-num font-bold text-red-700 mt-0.5">
                    {activeRecipient.isRegisteredCustomer
                      ? formatTZS(financialSnapshot.totalOwed)
                      : 'Inashughulikiwa'}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Customer Email Editor for Email Reminders */}
            {selectedCustomer && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Barua Pepe ya Mteja (Email kwa Arifa za Ukumbusho)
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Mfano: mteja@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingEmail || emailInput.trim() === (selectedCustomer.email || '')}
                  onClick={() => void handleSaveCustomerEmail()}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
                >
                  {savingEmail ? 'Inahifadhi...' : 'Hifadhi Email'}
                </button>
                {emailSavedNotice && (
                  <span className="text-xs font-medium text-emerald-700 pb-2">
                    {emailSavedNotice}
                  </span>
                )}
                {emailError && (
                  <span className="text-xs font-medium text-red-700 pb-2">
                    {emailError}
                  </span>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Maudhui ya Ujumbe (Unaweza Kuhariri Kabla ya Kutuma)
                </label>
                <span className="text-xs font-mono-num text-slate-500">
                  {messageText.trim().length} herufi · SMS {smsSegments}
                </span>
              </div>
              <textarea
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={sendingSmsApi || !messageText.trim()}
                onClick={() => void handleSendSingleSmsApi()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>{sendingSmsApi ? 'Inatuma SMS...' : 'Tuma SMS Moja kwa Moja (API)'}</span>
              </button>

              <a
                href={whatsappUrl}
                target={normalizedPhone ? '_blank' : undefined}
                rel={normalizedPhone ? 'noopener noreferrer' : undefined}
                onClick={(e) => {
                  if (!normalizedPhone) {
                    e.preventDefault();
                    setSmsError('Namba ya simu si sahihi kwa kutuma ujumbe.');
                    return;
                  }
                  setSmsError('');
                  void handleDispatchLog('whatsapp').catch((err) =>
                    setSmsError(formatFirestoreErrorForUser(err)),
                  );
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Tuma WhatsApp</span>
              </a>

              {mailtoUrl ? (
                <a
                  href={mailtoUrl}
                  onClick={() =>
                    void handleDispatchLog('email').catch((err) =>
                      setSmsError(formatFirestoreErrorForUser(err)),
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  <span>Tuma Email</span>
                </a>
              ) : null}

              <a
                href={smsUrl}
                onClick={(e) => {
                  if (!normalizedPhone) {
                    e.preventDefault();
                    setSmsError('Namba ya simu si sahihi kwa kutuma ujumbe.');
                    return;
                  }
                  setSmsError('');
                  void handleDispatchLog('sms').catch((err) =>
                    setSmsError(formatFirestoreErrorForUser(err)),
                  );
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Smartphone className="w-4 h-4" />
                <span>Fungua App ya SMS</span>
              </a>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Imenakiliwa!' : 'Nakili'}</span>
              </button>
            </div>
          </div>

          {/* Right Recent Message Logs */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              Historia ya Arifa & Ujumbe Uliotumwa
            </h3>
            {messageLogs.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                Bado hakuna arifa au ujumbe uliorekodiwa. Ukituma kupitia Push, Email, WhatsApp au SMS kumbukumbu itaonekana hapa.
              </p>
            ) : (
              <div className="mt-3 space-y-3 max-h-[460px] overflow-y-auto">
                {messageLogs.slice(0, 20).map((log) => {
                  const cust = customers.find((c) => c.id === log.customerId);
                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex justify-between font-semibold text-slate-900">
                        <span>{cust?.fullName || log.recipientPhone}</span>
                        <span className="uppercase text-emerald-700">{log.channel}</span>
                      </div>
                      <div className="text-slate-500">
                        {formatDateSW(log.sentDate)} · Alilipa {formatTZS(log.amountPaidSnapshot)} · Anadaiwa{' '}
                        {formatTZS(log.amountOwedSnapshot)}
                      </div>
                      <p className="text-slate-700 line-clamp-3">{log.messageBody}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Regular SMS API Panel */}
      {customers.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-700" />
                <span>Tuma Meseji za Kawaida kwa Wateja Wengi (Bulk SMS API)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chagua wateja kisha tuma SMS moja kwa moja kwa wote kwa wakati mmoja. Tumia{' '}
                <code className="font-mono-num text-slate-700">{'{JINA}'}</code> na{' '}
                <code className="font-mono-num text-slate-700">{'{SALIO}'}</code> kubinafsisha ujumbe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => selectBulkGroup('all')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Chagua Wote ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => selectBulkGroup('active')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Wenye Madeni
              </button>
              <button
                type="button"
                onClick={() => selectBulkGroup('overdue')}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
              >
                Waliochelewa
              </button>
              <button
                type="button"
                onClick={() => selectBulkGroup('none')}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Ondoa Wote
              </button>
            </div>
          </div>

          {bulkResultMsg && (
            <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800">
              {bulkResultMsg}
            </div>
          )}

          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Ujumbe wa Kawaida kwa Waliochaguliwa ({bulkSelectedCustomerIds.size} wateja)
              </label>
              <textarea
                rows={4}
                value={bulkMessageTemplate}
                onChange={(e) => setBulkMessageTemplate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="button"
                disabled={sendingBulkSms || bulkSelectedCustomerIds.size === 0 || !bulkMessageTemplate.trim()}
                onClick={() => void handleSendBulkCustomSms()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>
                  {sendingBulkSms
                    ? 'Inatuma SMS za Kundi...'
                    : `Tuma SMS kwa Wateja (${bulkSelectedCustomerIds.size})`}
                </span>
              </button>
            </div>

            <div className="lg:col-span-7 max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {customers.map((c) => {
                const snap = customerSnapshots.get(c.id) || { paid: 0, owed: 0, hasActive: false, hasOverdue: false };
                const checked = bulkSelectedCustomerIds.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBulkCustomer(c.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{c.fullName}</div>
                        <div className="font-mono-num text-slate-500">{c.phone}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-num font-semibold text-slate-900">
                        {formatTZS(snap.owed)}
                      </div>
                      <div className={`text-[11px] ${snap.hasOverdue ? 'text-red-700 font-medium' : 'text-slate-400'}`}>
                        {snap.hasOverdue ? 'Amechelewa' : snap.hasActive ? 'Anaendelea' : 'Hana Deni'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
