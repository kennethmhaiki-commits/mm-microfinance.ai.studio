import React, { useMemo, useState } from 'react';
import { Plus, Receipt as ReceiptIcon } from 'lucide-react';
import { Customer, Loan, Repayment } from '../types';
import {
  formatDateSW,
  formatTZS,
  getLoanRemainingBalance,
  getPaymentMethodLabel,
  getPeriodBounds,
  isDateInRange,
  todayISO,
} from '../utils/finance';

interface CollectionsReceiptsViewProps {
  customers: Customer[];
  loans: Loan[];
  repayments: Repayment[];
  onOpenRepay: (loan: Loan) => void;
  onViewReceipt: (repayment: Repayment) => void;
}

export const CollectionsReceiptsView: React.FC<CollectionsReceiptsViewProps> = ({
  customers,
  loans,
  repayments,
  onOpenRepay,
  onViewReceipt,
}) => {
  const [periodTab, setPeriodTab] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('month');
  const [breakdownMode, setBreakdownMode] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const today = todayISO();
  const bounds = useMemo(() => getPeriodBounds(today), [today]);

  const activeLoans = useMemo(
    () => loans.filter((l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0),
    [loans],
  );

  const periodStats = useMemo(() => {
    const calcRange = (start: string, end: string) => {
      const items = repayments.filter((r) => isDateInRange(r.paymentDate, start, end));
      const interest = items.reduce((s, r) => s + r.interestPortion, 0);
      const penalty = items.reduce((s, r) => s + r.penaltyPortion, 0);
      return {
        items,
        principal: items.reduce((s, r) => s + r.principalPortion, 0),
        interest,
        penalty,
        profit: interest + penalty,
        total: items.reduce((s, r) => s + r.amount, 0),
      };
    };

    const allInterest = repayments.reduce((s, r) => s + r.interestPortion, 0);
    const allPenalty = repayments.reduce((s, r) => s + r.penaltyPortion, 0);

    return {
      day: calcRange(bounds.dayStart, bounds.dayEnd),
      week: calcRange(bounds.weekStart, bounds.weekEnd),
      month: calcRange(bounds.monthStart, bounds.monthEnd),
      year: calcRange(bounds.yearStart, bounds.yearEnd),
      all: {
        items: repayments,
        principal: repayments.reduce((s, r) => s + r.principalPortion, 0),
        interest: allInterest,
        penalty: allPenalty,
        profit: allInterest + allPenalty,
        total: repayments.reduce((s, r) => s + r.amount, 0),
      },
    };
  }, [repayments, bounds]);

  // Aggregate all historical collections by Week or by Month to show Mtaji & Faida across every period
  const groupedPeriods = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        count: number;
        principal: number;
        interest: number;
        penalty: number;
        profit: number;
        total: number;
      }
    >();

    for (const r of repayments) {
      let key = '';
      let label = '';
      if (breakdownMode === 'weekly') {
        const b = getPeriodBounds(r.paymentDate);
        key = b.weekStart;
        label = `Wiki: ${formatDateSW(b.weekStart)} – ${formatDateSW(b.weekEnd)}`;
      } else {
        key = r.paymentDate.slice(0, 7); // YYYY-MM
        const [yr, mo] = key.split('-').map(Number);
        const monthNames = [
          'Januari',
          'Februari',
          'Machi',
          'Aprili',
          'Mei',
          'Juni',
          'Julai',
          'Agosti',
          'Septemba',
          'Oktoba',
          'Novemba',
          'Desemba',
        ];
        label = `${monthNames[(mo || 1) - 1]} ${yr}`;
      }

      const existing = map.get(key) || {
        key,
        label,
        count: 0,
        principal: 0,
        interest: 0,
        penalty: 0,
        profit: 0,
        total: 0,
      };
      existing.count += 1;
      existing.principal += r.principalPortion;
      existing.interest += r.interestPortion;
      existing.penalty += r.penaltyPortion;
      existing.profit += r.interestPortion + r.penaltyPortion;
      existing.total += r.amount;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [repayments, breakdownMode]);

  const visibleRepayments = useMemo(() => {
    return [...periodStats[periodTab].items].sort((a, b) =>
      b.paymentDate.localeCompare(a.paymentDate),
    );
  }, [periodStats, periodTab]);

  const handleQuickPay = () => {
    const target = activeLoans.find((l) => l.id === selectedLoanId) || activeLoans[0];
    if (target) onOpenRepay(target);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Marejesho, Mtaji, Faida &amp; Risiti za Malipo
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tenganisha Mtaji na Faida iliyopatikana (Riba + Adhabu) kwenye makusanyo ya Wiki, Mwezi Wote na Mwaka
          </p>
        </div>

        {activeLoans.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedLoanId || activeLoans[0]?.id || ''}
              onChange={(e) => setSelectedLoanId(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg max-w-[240px]"
            >
              {activeLoans.map((l) => {
                const c = customers.find((cust) => cust.id === l.customerId);
                return (
                  <option key={l.id} value={l.id}>
                    {c?.fullName} — Salio {formatTZS(getLoanRemainingBalance(l))}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={handleQuickPay}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Pokea Rejesho &amp; Toa Risiti</span>
            </button>
          </div>
        )}
      </div>

      {/* Weekly, Monthly & Total Mtaji vs Faida Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Wiki Hii (Mtaji &amp; Faida)
            </h3>
            <span className="text-xs text-slate-500">
              {formatDateSW(bounds.weekStart)} – {formatDateSW(bounds.weekEnd)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Mtaji</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.week.principal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Faida</div>
              <div className="font-mono-num font-bold text-emerald-700 mt-0.5">
                {formatTZS(periodStats.week.profit)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Jumla</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.week.total)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Mwezi Wote (Mtaji &amp; Faida)
            </h3>
            <span className="text-xs text-slate-500">
              {formatDateSW(bounds.monthStart)} – {formatDateSW(bounds.monthEnd)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Mtaji</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.month.principal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Faida</div>
              <div className="font-mono-num font-bold text-emerald-700 mt-0.5">
                {formatTZS(periodStats.month.profit)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Jumla</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.month.total)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Makusanyo Yote (Muda Wote)
            </h3>
            <span className="text-xs text-slate-500">Jumla Kuu</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Mtaji</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.all.principal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Faida</div>
              <div className="font-mono-num font-bold text-emerald-700 mt-0.5">
                {formatTZS(periodStats.all.profit)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Jumla</div>
              <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                {formatTZS(periodStats.all.total)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Breakdown by Every Week and Every Month */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Jedwali la Mtaji na Faida Iliyopatikana ({breakdownMode === 'weekly' ? 'Kila Wiki' : 'Kila Mwezi'})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Orodha ya makusanyo yote kwa mgawanyo wa Mtaji, Riba, Adhabu, na Faida
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setBreakdownMode('weekly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                breakdownMode === 'weekly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wiki Zote
            </button>
            <button
              type="button"
              onClick={() => setBreakdownMode('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                breakdownMode === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Miezi Yote
            </button>
          </div>
        </div>

        {groupedPeriods.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Bado hakuna marejesho yaliyorekodiwa. Ukipokea marejesho, Mtaji na Faida kwa kila wiki na mwezi vitaonekana hapa.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Kipindi</th>
                  <th className="text-right px-5 py-3">Risiti</th>
                  <th className="text-right px-5 py-3">Mtaji Uliokusanywa</th>
                  <th className="text-right px-5 py-3">Riba</th>
                  <th className="text-right px-5 py-3">Adhabu</th>
                  <th className="text-right px-5 py-3">Faida Iliyopatikana</th>
                  <th className="text-right px-5 py-3">Jumla Iliyokusanywa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedPeriods.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{g.label}</td>
                    <td className="px-5 py-3 text-right font-mono-num text-slate-700">{g.count}</td>
                    <td className="px-5 py-3 text-right font-mono-num text-slate-900">
                      {formatTZS(g.principal)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num text-slate-700">
                      {formatTZS(g.interest)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num text-amber-700">
                      {formatTZS(g.penalty)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num font-semibold text-emerald-700">
                      {formatTZS(g.profit)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num font-bold text-slate-900">
                      {formatTZS(g.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-900">
                <tr>
                  <td className="px-5 py-3">JUMLA KUU</td>
                  <td className="px-5 py-3 text-right font-mono-num">{repayments.length}</td>
                  <td className="px-5 py-3 text-right font-mono-num">
                    {formatTZS(periodStats.all.principal)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num">
                    {formatTZS(periodStats.all.interest)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num text-amber-700">
                    {formatTZS(periodStats.all.penalty)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num text-emerald-700">
                    {formatTZS(periodStats.all.profit)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num">
                    {formatTZS(periodStats.all.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Period Filter Tabs: Siku / Wiki / Mwezi / Mwaka / Yote */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'day' as const, label: 'Siku (Leo)' },
            { id: 'week' as const, label: 'Wiki Hii' },
            { id: 'month' as const, label: 'Mwezi Huu' },
            { id: 'year' as const, label: 'Mwaka Huu' },
            { id: 'all' as const, label: 'Yote' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriodTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                periodTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-700 flex flex-wrap gap-4">
          <span>
            Mtaji: <strong className="font-mono-num">{formatTZS(periodStats[periodTab].principal)}</strong>
          </span>
          <span>
            Faida: <strong className="font-mono-num text-emerald-700">{formatTZS(periodStats[periodTab].profit)}</strong>
          </span>
          <span>
            Jumla: <strong className="font-mono-num">{formatTZS(periodStats[periodTab].total)}</strong>
          </span>
        </div>
      </div>

      {/* Receipts Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {visibleRepayments.length === 0 ? (
          <div className="p-10 text-center">
            <ReceiptIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Hakuna risiti za marejesho zilizorekodiwa katika kipindi hiki.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Risiti #</th>
                  <th className="text-left px-5 py-3">Tarehe</th>
                  <th className="text-left px-5 py-3">Mteja</th>
                  <th className="text-left px-5 py-3">Njia ya Malipo</th>
                  <th className="text-right px-5 py-3">Mtaji</th>
                  <th className="text-right px-5 py-3">Riba</th>
                  <th className="text-right px-5 py-3">Aliyolipa</th>
                  <th className="text-right px-5 py-3">Anachodaiwa</th>
                  <th className="text-right px-5 py-3">Risiti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRepayments.map((rep) => {
                  const cust = customers.find((c) => c.id === rep.customerId);
                  return (
                    <tr key={rep.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono-num text-xs font-semibold text-slate-900">
                        {rep.receiptNumber}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700 whitespace-nowrap">
                        {formatDateSW(rep.paymentDate)}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {cust?.fullName || 'Mteja'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700">
                        <div>{getPaymentMethodLabel(rep.paymentMethod)}</div>
                        {rep.channelDetail && (
                          <div className="text-slate-500">{rep.channelDetail}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num text-slate-700">
                        {formatTZS(rep.principalPortion)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num text-emerald-700">
                        {formatTZS(rep.interestPortion)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-bold text-slate-900">
                        {formatTZS(rep.amount)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-semibold text-red-700">
                        {formatTZS(rep.balanceAfter)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onViewReceipt(rep)}
                          className="px-3 py-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                        >
                          Fungua Risiti
                        </button>
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
