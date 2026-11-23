import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BankCode, BankDebitCode, BankDeductionType, Customer, Loan, PaymentMethod } from '../types';
import {
  BANK_OPTIONS,
  executeBankDirectDebit,
} from '../services/bankDebitApi';
import {
  formatTZS,
  getLoanRemainingBalance,
  splitRepaymentPortions,
  todayISO,
} from '../utils/finance';

interface RepayModalProps {
  loan: Loan | null;
  customer: Customer | undefined;
  onClose: () => void;
  onSubmit: (payload: {
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
  }) => Promise<void> | void;
}

export const RepayModal: React.FC<RepayModalProps> = ({
  loan,
  customer,
  onClose,
  onSubmit,
}) => {
  const remaining = loan ? getLoanRemainingBalance(loan) : 0;
  const defaultInstallment = loan
    ? Math.min(
        remaining,
        Math.round((loan.principal + loan.totalInterest) / Math.max(1, loan.durationCount)),
      )
    : 0;

  const [amountStr, setAmountStr] = useState(String(defaultInstallment || remaining || ''));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [channelDetail, setChannelDetail] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [useDirectBankApi, setUseDirectBankApi] = useState(false);
  const [apiChannelType, setApiChannelType] = useState<BankDeductionType>(
    customer?.isGovernmentEmployee && customer?.checkNumber && !customer?.bankAccountNumber
      ? 'gov_check_number'
      : 'bank_direct_debit',
  );
  const [apiBankCode, setApiBankCode] = useState<BankCode>(customer?.bankName || 'NMB');
  const [apiAccountOrCheck, setApiAccountOrCheck] = useState(
    customer?.isGovernmentEmployee && customer?.checkNumber && !customer?.bankAccountNumber
      ? customer.checkNumber
      : customer?.bankAccountNumber || '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const numericAmount = Math.max(0, Math.round(Number(amountStr) || 0));

  const split = useMemo(() => {
    if (!loan) return { principalPortion: 0, interestPortion: 0, penaltyPortion: 0 };
    return splitRepaymentPortions(loan, numericAmount);
  }, [loan, numericAmount]);

  if (!loan || !customer) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      setError('Tafadhali weka kiasi sahihi cha malipo kinachozidi sifuri.');
      return;
    }
    if (numericAmount > remaining) {
      setError(`Kiasi kinazidi deni lililobaki (${formatTZS(remaining)}).`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let detail = channelDetail.trim();
      let bankDebitMeta: {
        bankCode: BankDebitCode;
        deductionType: BankDeductionType;
        accountOrCheckNumber: string;
        gatewayReference: string;
        gatewayMode: 'live_api' | 'sandbox_api';
        statusMessage: string;
      } | undefined = undefined;

      if (paymentMethod === 'bank' && useDirectBankApi) {
        const targetBank: BankDebitCode =
          apiChannelType === 'gov_check_number' ? 'GOV_PAYROLL' : apiBankCode;
        const apiRes = await executeBankDirectDebit({
          customerId: customer.id,
          customerName: customer.fullName,
          loanId: loan.id,
          bankCode: targetBank,
          deductionType: apiChannelType,
          accountOrCheckNumber: apiAccountOrCheck.trim(),
          amount: numericAmount,
          mandateAuthorized: customer.bankMandateActive !== false,
          narration: notes.trim() || `Rejesho la ${loan.loanTypeName}`,
        });
        detail =
          apiChannelType === 'gov_check_number'
            ? `Serikali Check #${apiRes.accountOrCheckNumber} · Ref ${apiRes.gatewayReference}`
            : `${apiRes.bankCode} (${apiRes.accountOrCheckNumber}) · Ref ${apiRes.gatewayReference}`;
        bankDebitMeta = {
          bankCode: apiRes.bankCode,
          deductionType: apiRes.deductionType,
          accountOrCheckNumber: apiRes.accountOrCheckNumber,
          gatewayReference: apiRes.gatewayReference,
          gatewayMode: apiRes.gatewayMode,
          statusMessage: apiRes.statusMessage,
        };
      }

      await onSubmit({
        loan,
        amount: numericAmount,
        paymentMethod,
        channelDetail: detail,
        paymentDate,
        notes: notes.trim(),
        bankDebitMeta,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Imeshindwa kuhifadhi malipo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Pokea Rejesho & Toa Risiti
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {customer.fullName} · Salio: {formatTZS(remaining)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md"
            aria-label="Funga dirisha"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kiasi cha Malipo (Tsh)
              </label>
              <input
                type="number"
                min={1}
                max={remaining}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tarehe ya Malipo
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Njia Iliyotumika Kupokea Pesa
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash' as PaymentMethod, label: 'Cash' },
                { id: 'bank' as PaymentMethod, label: 'Benki' },
                { id: 'mobile_money' as PaymentMethod, label: 'Mitandao ya Simu' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentMethod(opt.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    paymentMethod === opt.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'bank' && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDirectBankApi}
                  onChange={(e) => setUseDirectBankApi(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Kata Moja kwa Moja Kupitia API ya Benki / Check Number</span>
              </label>

              {useDirectBankApi && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setApiChannelType('bank_direct_debit');
                        setApiAccountOrCheck(customer.bankAccountNumber || '');
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border ${
                        apiChannelType === 'bank_direct_debit'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Akaunti ya Benki
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setApiChannelType('gov_check_number');
                        setApiAccountOrCheck(customer.checkNumber || '');
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border ${
                        apiChannelType === 'gov_check_number'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Check # Serikali
                    </button>
                  </div>

                  {apiChannelType === 'bank_direct_debit' && (
                    <select
                      value={apiBankCode}
                      onChange={(e) => setApiBankCode(e.target.value as BankCode)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    value={apiAccountOrCheck}
                    onChange={(e) => setApiAccountOrCheck(e.target.value)}
                    placeholder={
                      apiChannelType === 'gov_check_number'
                        ? 'Weka Check Number ya Mtumishi'
                        : 'Weka Namba ya Akaunti ya Benki'
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono-num border border-slate-300 rounded-lg bg-white"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {paymentMethod !== 'cash' && !(paymentMethod === 'bank' && useDirectBankApi) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {paymentMethod === 'bank'
                  ? 'Jina la Benki / Kumbukumbu ya Muamala'
                  : 'Mtandao (M-Pesa / Tigo Pesa / Airtel) & Namba ya Muamala'}
              </label>
              <input
                type="text"
                value={channelDetail}
                onChange={(e) => setChannelDetail(e.target.value)}
                placeholder={
                  paymentMethod === 'bank'
                    ? 'Mfano: NMB - Ref #98211'
                    : 'Mfano: M-Pesa - BH82K91'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
            <div className="font-semibold text-slate-800">
              Mgawanyo wa Rejesho Hili
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Mtaji (Principal)</span>
              <span className="font-mono-num font-medium text-slate-900">
                {formatTZS(split.principalPortion)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Riba (Interest)</span>
              <span className="font-mono-num font-medium text-slate-900">
                {formatTZS(split.interestPortion)}
              </span>
            </div>
            {split.penaltyPortion > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Adhabu (Penalty)</span>
                <span className="font-mono-num font-medium">
                  {formatTZS(split.penaltyPortion)}
                </span>
              </div>
            )}
            <div className="pt-1.5 border-t border-slate-200 flex justify-between font-semibold text-slate-900">
              <span>Salio Baada ya Malipo</span>
              <span className="font-mono-num">
                {formatTZS(Math.max(0, remaining - numericAmount))}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Maelezo ya Ziada (Si Lazima)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mfano: Rejesho la wiki ya pili"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {error && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Inahifadhi...' : 'Hifadhi Malipo & Toa Risiti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
