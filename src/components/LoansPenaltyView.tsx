import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileText, Search, X } from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import { Customer, Loan } from '../types';
import {
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  todayISO,
} from '../utils/finance';

interface LoansPenaltyViewProps {
  customers: Customer[];
  loans: Loan[];
  canApplyPenalty?: boolean;
  onOpenRepay: (loan: Loan) => void;
  onApplyPenalty: (loan: Loan, penaltyAmount: number, reasonNote: string) => Promise<void>;
  onOpenContract: (loanId: string) => void;
}

export const LoansPenaltyView: React.FC<LoansPenaltyViewProps> = ({
  customers,
  loans,
  canApplyPenalty = true,
  onOpenRepay,
  onApplyPenalty,
  onOpenContract,
}) => {
  const [filter, setFilter] = useState<'active' | 'overdue' | 'completed' | 'all'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [penaltyTarget, setPenaltyTarget] = useState<Loan | null>(null);
  const today = todayISO();

  const filteredLoans = useMemo(() => {
    return loans
      .filter((loan) => {
        const isOverdue =
          loan.status === 'overdue' || (loan.status !== 'completed' && loan.endDate < today);
        if (filter === 'active') return loan.status !== 'completed';
        if (filter === 'overdue') return isOverdue;
        if (filter === 'completed') return loan.status === 'completed';
        return true;
      })
      .filter((loan) => {
        if (!searchTerm.trim()) return true;
        const cust = customers.find((c) => c.id === loan.customerId);
        const q = searchTerm.toLowerCase();
        return (
          (cust?.fullName || '').toLowerCase().includes(q) ||
          (cust?.phone || '').toLowerCase().includes(q) ||
          loan.loanTypeName.toLowerCase().includes(q)
        );
      });
  }, [loans, customers, filter, searchTerm, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Mikopo Inayoendelea, Tarehe za Mwisho & Adhabu
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fuatilia mikopo inayoendelea, tarehe za kuchukua na kumaliza, na weka adhabu kwa waliochelewa
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tafuta kwa jina la mteja, simu, au aina ya mkopo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'active' as const, label: 'Inayoendelea' },
            { id: 'overdue' as const, label: 'Iliyochelewa' },
            { id: 'completed' as const, label: 'Iliyokamilika' },
            { id: 'all' as const, label: 'Yote' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredLoans.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Hakuna mikopo katika kundi hili.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Mteja & Aina</th>
                  <th className="text-left px-5 py-3">Mwanzo — Mwisho</th>
                  <th className="text-right px-5 py-3">Mtaji + Riba</th>
                  <th className="text-right px-5 py-3">Adhabu</th>
                  <th className="text-right px-5 py-3">Aliyolipa</th>
                  <th className="text-right px-5 py-3">Salio</th>
                  <th className="text-left px-5 py-3">Hali</th>
                  <th className="text-right px-5 py-3">Vitendo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.map((loan) => {
                  const cust = customers.find((c) => c.id === loan.customerId);
                  const paid = getLoanPaidTotal(loan);
                  const rem = getLoanRemainingBalance(loan);
                  const overdue =
                    loan.status === 'overdue' ||
                    (loan.status !== 'completed' && loan.endDate < today);

                  return (
                    <tr key={loan.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {cust?.fullName || 'Mteja'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {loan.loanTypeName} · {loan.durationCount}{' '}
                          {loan.frequency === 'weekly' ? 'Wiki' : 'Miezi'} ({getFrequencyLabel(loan.frequency)})
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                        <div>Kuchukua: {formatDateSW(loan.startDate)}</div>
                        <div className="font-medium text-slate-900 mt-0.5">
                          Kumaliza: {formatDateSW(loan.endDate)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs">
                        <div className="font-mono-num font-semibold text-slate-900">
                          {formatTZS(loan.principal)}
                        </div>
                        <div className="font-mono-num text-emerald-700">
                          +{formatTZS(loan.totalInterest)} riba
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs">
                        <div className="font-mono-num font-medium text-amber-700">
                          {formatTZS(loan.penaltyApplied || 0)}
                        </div>
                        <div className="text-slate-500">({loan.penaltyPercent}%)</div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono-num text-emerald-700">
                        {formatTZS(paid)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono-num font-bold text-slate-900">
                        {formatTZS(rem)}
                      </td>
                      <td className="px-5 py-3.5">
                        {loan.status === 'completed' ? (
                          <span className="text-xs font-semibold text-emerald-700">
                            Imekamilika
                          </span>
                        ) : overdue ? (
                          <span className="text-xs font-semibold text-red-700">
                            Imechelewa
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-700">
                            Inaendelea
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {loan.status !== 'completed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenRepay(loan)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                              >
                                Lipa
                              </button>
                              <button
                                type="button"
                                disabled={!canApplyPenalty}
                                onClick={() => {
                                  if (canApplyPenalty) setPenaltyTarget(loan);
                                }}
                                title={
                                  canApplyPenalty
                                    ? 'Toza Adhabu ya Ucheleweshaji'
                                    : 'Ngazi hii (Kuweka Adhabu) haijawa activated kwako'
                                }
                                className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                Adhabu
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenContract(loan.id)}
                            title="Mkataba"
                            className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {penaltyTarget && (
        <PenaltyModal
          loan={penaltyTarget}
          customer={customers.find((c) => c.id === penaltyTarget.customerId)}
          onClose={() => setPenaltyTarget(null)}
          onConfirm={async (amount, note) => {
            await onApplyPenalty(penaltyTarget, amount, note);
            setPenaltyTarget(null);
          }}
        />
      )}
    </div>
  );
};

const PenaltyModal: React.FC<{
  loan: Loan;
  customer: Customer | undefined;
  onClose: () => void;
  onConfirm: (penaltyAmount: number, reasonNote: string) => Promise<void>;
}> = ({ loan, customer, onClose, onConfirm }) => {
  const remaining = getLoanRemainingBalance(loan);
  const suggestedPenalty = Math.round(remaining * ((loan.penaltyPercent || 5) / 100));
  const [percent, setPercent] = useState(String(loan.penaltyPercent || 5));
  const [customAmount, setCustomAmount] = useState(String(suggestedPenalty));
  const [reason, setReason] = useState('Adhabu ya kuchelewesha rejesho');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handlePercentChange = (val: string) => {
    setPercent(val);
    const pct = Math.max(0, Number(val) || 0);
    setCustomAmount(String(Math.round(remaining * (pct / 100))));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amt = Math.max(0, Math.round(Number(customAmount) || 0));
    if (amt <= 0) {
      setFormError('Kiasi cha adhabu lazima kiwe kikubwa kuliko Tsh 0.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(amt, reason.trim());
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-base font-semibold text-slate-900">
              Toza Adhabu ya Kuchelewa
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs text-slate-600">
            Mteja: <strong className="text-slate-900">{customer?.fullName}</strong> · Salio la sasa:{' '}
            <strong className="font-mono-num text-slate-900">{formatTZS(remaining)}</strong>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Asilimia ya Adhabu (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={percent}
                onChange={(e) => handlePercentChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kiasi cha Adhabu (Tsh)
              </label>
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Sababu / Maelezo
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700"
            >
              {saving ? 'Inahifadhi...' : 'Ongeza Adhabu Kwenye Deni'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
