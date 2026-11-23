import React, { useEffect, useMemo, useState } from 'react';
import {
  Building,
  CheckCircle2,
  Landmark,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  BankCode,
  BankDebitCode,
  BankDebitTransaction,
  BankDeductionType,
  Customer,
  Loan,
} from '../types';
import {
  BANK_OPTIONS,
  DeductRequestPayload,
  executeBankDirectDebit,
  executeBatchBankDirectDebit,
  fetchBankGatewayStatus,
  GatewayStatusItem,
  getBankDisplayLabel,
  verifyBankAccountOrCheck,
} from '../services/bankDebitApi';
import {
  formatDateSW,
  formatTZS,
  getLoanRemainingBalance,
  todayISO,
} from '../utils/finance';

interface BankDirectDebitViewProps {
  customers: Customer[];
  loans: Loan[];
  bankDebitTransactions: BankDebitTransaction[];
  preselectedCustomerId?: string | null;
  onExecuteSingleDebit: (params: {
    customer: Customer;
    loan: Loan;
    bankCode: BankDebitCode;
    deductionType: BankDeductionType;
    accountOrCheckNumber: string;
    amount: number;
    gatewayReference: string;
    gatewayMode: 'live_api' | 'sandbox_api';
    statusMessage: string;
  }) => Promise<void>;
  onExecuteBatchDebit: (
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
  ) => Promise<void>;
}

export const BankDirectDebitView: React.FC<BankDirectDebitViewProps> = ({
  customers,
  loans,
  bankDebitTransactions,
  preselectedCustomerId,
  onExecuteSingleDebit,
  onExecuteBatchDebit,
}) => {
  const [gateways, setGateways] = useState<GatewayStatusItem[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Eligible loans (active / overdue with remaining balance > 0)
  const activeLoanItems = useMemo(() => {
    return loans
      .filter((l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0)
      .map((loan) => {
        const customer = customers.find((c) => c.id === loan.customerId);
        return { loan, customer, remaining: getLoanRemainingBalance(loan) };
      })
      .filter((x): x is { loan: Loan; customer: Customer; remaining: number } => Boolean(x.customer));
  }, [loans, customers]);

  // Loans whose customer has bank account OR government check number
  const debitReadyItems = useMemo(() => {
    return activeLoanItems.filter(
      ({ customer }) =>
        Boolean(customer.bankName && customer.bankAccountNumber) ||
        Boolean(customer.isGovernmentEmployee && customer.checkNumber),
    );
  }, [activeLoanItems]);

  const initialLoanItem = useMemo(() => {
    if (preselectedCustomerId) {
      const matched = activeLoanItems.find((x) => x.customer.id === preselectedCustomerId);
      if (matched) return matched;
    }
    return debitReadyItems[0] || activeLoanItems[0] || null;
  }, [preselectedCustomerId, activeLoanItems, debitReadyItems]);

  const [selectedLoanId, setSelectedLoanId] = useState<string>(initialLoanItem?.loan.id || '');
  const selectedItem = useMemo(
    () => activeLoanItems.find((x) => x.loan.id === selectedLoanId) || initialLoanItem,
    [activeLoanItems, selectedLoanId, initialLoanItem],
  );

  const [deductionChannel, setDeductionChannel] = useState<BankDeductionType>('bank_direct_debit');
  const [bankCode, setBankCode] = useState<BankCode>('NMB');
  const [accountNumber, setAccountNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [mandateConfirmed, setMandateConfirmed] = useState(true);

  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [processingSingle, setProcessingSingle] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Batch selection
  const [selectedBatchLoanIds, setSelectedBatchLoanIds] = useState<Set<string>>(new Set());
  const [processingBatch, setProcessingBatch] = useState(false);
  const [batchSummary, setBatchSummary] = useState('');

  // Sync form fields whenever selected loan/customer changes
  useEffect(() => {
    if (!selectedItem) return;
    const { customer, loan, remaining } = selectedItem;
    const defaultInst = Math.min(
      remaining,
      Math.round((loan.principal + loan.totalInterest) / Math.max(1, loan.durationCount)),
    );
    setAmountStr(String(defaultInst || remaining));
    if (customer.bankName) setBankCode(customer.bankName);
    setAccountNumber(customer.bankAccountNumber || '');
    setCheckNumber(customer.checkNumber || '');
    setMandateConfirmed(customer.bankMandateActive ?? true);
    if (customer.isGovernmentEmployee && customer.checkNumber && !customer.bankAccountNumber) {
      setDeductionChannel('gov_check_number');
    } else {
      setDeductionChannel('bank_direct_debit');
    }
    setVerifyMsg('');
    setActionError('');
  }, [selectedItem]);

  useEffect(() => {
    if (preselectedCustomerId) {
      const matched = activeLoanItems.find((x) => x.customer.id === preselectedCustomerId);
      if (matched) setSelectedLoanId(matched.loan.id);
    }
  }, [preselectedCustomerId, activeLoanItems]);

  const loadGatewayStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetchBankGatewayStatus();
      setGateways(res);
    } catch {
      // Non-blocking
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadGatewayStatus();
  }, []);

  const handleVerifyAccount = async () => {
    if (!selectedItem) return;
    setVerifying(true);
    setVerifyMsg('');
    setActionError('');
    try {
      const isGov = deductionChannel === 'gov_check_number';
      const res = await verifyBankAccountOrCheck({
        bankCode: isGov ? 'GOV_PAYROLL' : bankCode,
        accountOrCheckNumber: isGov ? checkNumber : accountNumber,
        customerName: selectedItem.customer.fullName,
      });
      setVerifyMsg(res.message || 'Imethibitishwa.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Uhakiki umeshindikana.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSingleDeductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setActionError('');
    setActionSuccess('');

    const amount = Math.round(Number(amountStr) || 0);
    if (amount <= 0) {
      setActionError('Weka kiasi halali cha makato.');
      return;
    }
    if (amount > selectedItem.remaining) {
      setActionError(`Kiasi kinazidi salio lililobaki (${formatTZS(selectedItem.remaining)}).`);
      return;
    }

    const isGov = deductionChannel === 'gov_check_number';
    const targetBank: BankDebitCode = isGov ? 'GOV_PAYROLL' : bankCode;
    const targetAccount = (isGov ? checkNumber : accountNumber).trim();

    setProcessingSingle(true);
    try {
      const apiRes = await executeBankDirectDebit({
        customerId: selectedItem.customer.id,
        customerName: selectedItem.customer.fullName,
        loanId: selectedItem.loan.id,
        bankCode: targetBank,
        deductionType: deductionChannel,
        accountOrCheckNumber: targetAccount,
        amount,
        mandateAuthorized: mandateConfirmed,
        narration: `Rejesho la ${selectedItem.loan.loanTypeName}`,
      });

      await onExecuteSingleDebit({
        customer: selectedItem.customer,
        loan: selectedItem.loan,
        bankCode: apiRes.bankCode,
        deductionType: apiRes.deductionType,
        accountOrCheckNumber: apiRes.accountOrCheckNumber,
        amount: apiRes.amount,
        gatewayReference: apiRes.gatewayReference,
        gatewayMode: apiRes.gatewayMode,
        statusMessage: apiRes.statusMessage,
      });

      setActionSuccess(apiRes.statusMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Makato kupitia benki yameshindikana.');
    } finally {
      setProcessingSingle(false);
    }
  };

  const toggleBatchLoan = (loanId: string) => {
    setSelectedBatchLoanIds((prev) => {
      const next = new Set(prev);
      if (next.has(loanId)) {
        next.delete(loanId);
      } else {
        next.add(loanId);
      }
      return next;
    });
  };

  const handleSelectAllBatch = () => {
    if (selectedBatchLoanIds.size === debitReadyItems.length) {
      setSelectedBatchLoanIds(new Set());
    } else {
      setSelectedBatchLoanIds(new Set(debitReadyItems.map((x) => x.loan.id)));
    }
  };

  const handleRunBatchDebit = async () => {
    const targets = debitReadyItems.filter((x) => selectedBatchLoanIds.has(x.loan.id));
    if (targets.length === 0) return;

    setProcessingBatch(true);
    setBatchSummary('');
    setActionError('');

    try {
      const payloads: DeductRequestPayload[] = targets.map(({ customer, loan, remaining }) => {
        const useGov = Boolean(customer.isGovernmentEmployee && customer.checkNumber && (!customer.bankName || !customer.bankAccountNumber));
        const installmentAmt = Math.min(
          remaining,
          Math.round((loan.principal + loan.totalInterest) / Math.max(1, loan.durationCount)),
        );
        return {
          customerId: customer.id,
          customerName: customer.fullName,
          loanId: loan.id,
          bankCode: useGov ? 'GOV_PAYROLL' : (customer.bankName || 'NMB'),
          deductionType: useGov ? 'gov_check_number' : 'bank_direct_debit',
          accountOrCheckNumber: useGov
            ? customer.checkNumber || ''
            : customer.bankAccountNumber || '',
          amount: installmentAmt || remaining,
          mandateAuthorized: customer.bankMandateActive !== false,
          narration: `Rejesho la Kundi - ${customer.fullName}`,
        };
      });

      const results = await executeBatchBankDirectDebit(payloads);
      const succeeded = results.filter((r) => r.success);

      if (succeeded.length > 0) {
        const mapped = succeeded
          .map((res) => {
            const match = targets.find((t) => t.loan.id === res.loanId);
            if (!match) return null;
            return {
              customer: match.customer,
              loan: match.loan,
              bankCode: res.bankCode,
              deductionType: res.deductionType,
              accountOrCheckNumber: res.accountOrCheckNumber,
              amount: res.amount,
              gatewayReference: res.gatewayReference,
              gatewayMode: res.gatewayMode,
              statusMessage: res.statusMessage,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));

        await onExecuteBatchDebit(mapped);
      }

      const failedCount = results.length - succeeded.length;
      setBatchSummary(
        `Makato ya kundi yamekamilika: ${succeeded.length} yamefanikiwa${
          failedCount > 0 ? `, ${failedCount} yameshindikana (kagua namba za akaunti/check number)` : ''
        }.`,
      );
      setSelectedBatchLoanIds(new Set());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Hitilafu ya makato ya kundi.');
    } finally {
      setProcessingBatch(false);
    }
  };

  const sortedTransactions = useMemo(
    () => [...bankDebitTransactions].sort((a, b) => b.processedDate.localeCompare(a.processedDate)),
    [bankDebitTransactions],
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            API ya Makato ya Moja kwa Moja (Benki &amp; Check Number)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kata marejesho moja kwa moja kwenye akaunti za NMB, CRDB, EXIM, Mwalimu Bank, au kupitia Check Number kwa Watumishi wa Serikali
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadGatewayStatus()}
          disabled={loadingStatus}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
          <span>Kagua API za Benki</span>
        </button>
      </div>

      {/* Supported Bank & Gov Gateways Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {(gateways.length > 0
          ? gateways
          : [
              {
                code: 'NMB' as const,
                label: 'NMB Bank Plc',
                swiftOrSystem: 'NMIBTZTZ',
                mode: 'sandbox_api' as const,
                secretConfigured: false,
                envSecretKeyName: 'NMB_DIRECT_DEBIT_SECRET_VALUE',
                signatureAlgorithm: 'HMAC-SHA256',
                ready: true,
              },
              {
                code: 'CRDB' as const,
                label: 'CRDB Bank Plc',
                swiftOrSystem: 'CORUTZTZ',
                mode: 'sandbox_api' as const,
                secretConfigured: false,
                envSecretKeyName: 'CRDB_DIRECT_DEBIT_SECRET_VALUE',
                signatureAlgorithm: 'HMAC-SHA256',
                ready: true,
              },
              {
                code: 'EXIM' as const,
                label: 'Exim Bank Tanzania',
                swiftOrSystem: 'EXTNTZTZ',
                mode: 'sandbox_api' as const,
                secretConfigured: false,
                envSecretKeyName: 'EXIM_DIRECT_DEBIT_SECRET_VALUE',
                signatureAlgorithm: 'HMAC-SHA256',
                ready: true,
              },
              {
                code: 'MWALIMU' as const,
                label: 'Mwalimu Commercial Bank',
                swiftOrSystem: 'MWCOTZTZ',
                mode: 'sandbox_api' as const,
                secretConfigured: false,
                envSecretKeyName: 'MWALIMU_DIRECT_DEBIT_SECRET_VALUE',
                signatureAlgorithm: 'HMAC-SHA256',
                ready: true,
              },
              {
                code: 'GOV_PAYROLL' as const,
                label: 'Serikali (Check Number)',
                swiftOrSystem: 'UTUMISHI-CHECKOFF',
                mode: 'sandbox_api' as const,
                secretConfigured: false,
                envSecretKeyName: 'GOV_PAYROLL_CHECKOFF_SECRET_VALUE',
                signatureAlgorithm: 'HMAC-SHA256',
                ready: true,
              },
            ]
        ).map((gw) => (
          <div
            key={gw.code}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {gw.code === 'GOV_PAYROLL' ? 'UTUMISHI' : gw.code}
                </span>
                <span className="text-xs font-medium text-emerald-700">
                  {gw.mode === 'live_api' ? 'Live API' : 'Gateway Tayari'}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600 truncate">{gw.label}</div>
              <div className="mt-0.5 text-xs font-mono-num text-slate-400">{gw.swiftOrSystem}</div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-0.5">
              <div
                className={`text-[11px] font-medium ${
                  gw.secretConfigured ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {gw.secretConfigured
                  ? 'Secret Value Imewekwa (HMAC-SHA256)'
                  : 'HMAC-SHA256 Tayari (Sandbox Secret)'}
              </div>
              {gw.envSecretKeyName && (
                <div className="text-[10px] font-mono-num text-slate-400 truncate" title={gw.envSecretKeyName}>
                  {gw.envSecretKeyName}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Single Direct Debit Form */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Kata Rejesho la Mteja Moja kwa Moja
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chagua mteja na mkopo wake, hakiki akaunti au Check Number, kisha kata malipo moja kwa moja
            </p>
          </div>

          {activeLoanItems.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
              Hakuna mikopo inayoendelea yenye salio la kukata kwa sasa.
            </div>
          ) : (
            <form onSubmit={handleSingleDeductSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Chagua Mteja &amp; Mkopo Unaodaiwa
                </label>
                <select
                  value={selectedItem?.loan.id || ''}
                  onChange={(e) => setSelectedLoanId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {activeLoanItems.map(({ loan, customer, remaining }) => (
                    <option key={loan.id} value={loan.id}>
                      {customer.fullName} — {loan.loanTypeName} (Salio: {formatTZS(remaining)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Njia ya Makato ya Moja kwa Moja
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeductionChannel('bank_direct_debit')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      deductionChannel === 'bank_direct_debit'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    <span>Akaunti ya Benki</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeductionChannel('gov_check_number')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      deductionChannel === 'gov_check_number'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>Check # Serikalini</span>
                  </button>
                </div>
              </div>

              {deductionChannel === 'bank_direct_debit' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Chagua Benki
                    </label>
                    <select
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value as BankCode)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Namba ya Akaunti ya Benki
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Mfano: 20110045829"
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Check Number (Mtumishi wa Serikali / Utumishi)
                  </label>
                  <input
                    type="text"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="Mfano: 11204589"
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kiasi cha Kukata (Tsh) · Salio: {selectedItem ? formatTZS(selectedItem.remaining) : '-'}
                </label>
                <input
                  type="number"
                  min={100}
                  max={selectedItem?.remaining || undefined}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mandateConfirmed}
                  onChange={(e) => setMandateConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>
                  Mteja ameridhia na kusaini idhini ya makato ya moja kwa moja (Direct Debit / Check-Off Mandate).
                </span>
              </label>

              {verifyMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{verifyMsg}</span>
                </div>
              )}

              {actionError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {actionError}
                </div>
              )}

              {actionSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  {actionSuccess}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => void handleVerifyAccount()}
                  disabled={verifying}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{verifying ? 'Inahakiki...' : 'Hakiki Akaunti / Check #'}</span>
                </button>
                <button
                  type="submit"
                  disabled={processingSingle}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{processingSingle ? 'Inakata Malipo...' : 'Kata Malipo Moja kwa Moja'}</span>
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Right: Batch Direct Debit Queue */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Wateja Tayari kwa Makato ya Moja kwa Moja ({debitReadyItems.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Wateja wenye akaunti ya NMB, CRDB, EXIM, Mwalimu Bank au Check Number ya Serikali
              </p>
            </div>

            {debitReadyItems.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllBatch}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  {selectedBatchLoanIds.size === debitReadyItems.length
                    ? 'Ondoa Wote'
                    : 'Chagua Wote'}
                </button>
                <button
                  type="button"
                  disabled={selectedBatchLoanIds.size === 0 || processingBatch}
                  onClick={() => void handleRunBatchDebit()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {processingBatch
                      ? 'Inakata Kundi...'
                      : `Kata Waliochaguliwa (${selectedBatchLoanIds.size})`}
                  </span>
                </button>
              </div>
            )}
          </div>

          {batchSummary && (
            <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800">
              {batchSummary}
            </div>
          )}

          {debitReadyItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Bado hakuna mteja mwenye mkopo unaoendelea aliyejaziwa Namba ya Akaunti ya Benki au Check Number. Hariri taarifa za mteja kwenye ukurasa wa Wateja &amp; Usajili ili kumwezesha kukatwa moja kwa moja.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left w-10">Chagua</th>
                    <th className="px-4 py-2.5 text-left">Mteja</th>
                    <th className="px-4 py-2.5 text-left">Benki / Check #</th>
                    <th className="px-4 py-2.5 text-right">Rejesho</th>
                    <th className="px-4 py-2.5 text-right">Salio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debitReadyItems.map(({ customer, loan, remaining }) => {
                    const instAmt = Math.min(
                      remaining,
                      Math.round(
                        (loan.principal + loan.totalInterest) / Math.max(1, loan.durationCount),
                      ),
                    );
                    const checked = selectedBatchLoanIds.has(loan.id);
                    return (
                      <tr
                        key={loan.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelectedLoanId(loan.id)}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBatchLoan(loan.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            aria-label={`Chagua ${customer.fullName}`}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{customer.fullName}</div>
                          <div className="text-slate-500">{loan.loanTypeName}</div>
                        </td>
                        <td className="px-4 py-3">
                          {customer.bankName && customer.bankAccountNumber && (
                            <div className="font-mono-num text-slate-900">
                              {customer.bankName}: {customer.bankAccountNumber}
                            </div>
                          )}
                          {customer.isGovernmentEmployee && customer.checkNumber && (
                            <div className="font-mono-num text-emerald-700 mt-0.5">
                              Serikali Check #: {customer.checkNumber}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">
                          {formatTZS(instAmt)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-slate-700">
                          {formatTZS(remaining)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Transaction History Log */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Historia ya Miamala ya Makato ya Benki &amp; Check Number
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kumbukumbu zote za makato yaliyofanyika moja kwa moja kupitia API ({sortedTransactions.length})
            </p>
          </div>
          <span className="text-xs text-slate-500">Tarehe ya leo: {formatDateSW(todayISO())}</span>
        </div>

        {sortedTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Bado hakuna muamala wa makato ya moja kwa moja uliorekodiwa.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Kumbukumbu (Ref)</th>
                  <th className="px-5 py-3 text-left">Tarehe</th>
                  <th className="px-5 py-3 text-left">Mteja</th>
                  <th className="px-5 py-3 text-left">Benki / Mfumo</th>
                  <th className="px-5 py-3 text-left">Akaunti / Check #</th>
                  <th className="px-5 py-3 text-right">Kiasi</th>
                  <th className="px-5 py-3 text-left">Hali</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTransactions.map((tx) => {
                  const cust = customers.find((c) => c.id === tx.customerId);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono-num font-semibold text-slate-900">
                        {tx.gatewayReference}
                      </td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {formatDateSW(tx.processedDate)}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {cust?.fullName || 'Mteja'}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {getBankDisplayLabel(tx.bankCode)}
                      </td>
                      <td className="px-5 py-3 font-mono-num text-slate-700">
                        {tx.accountOrCheckNumber}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-bold text-emerald-700">
                        {formatTZS(tx.amount)}
                      </td>
                      <td className="px-5 py-3 text-emerald-700 font-semibold">
                        {tx.status === 'completed' ? 'Imekatwa' : tx.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
