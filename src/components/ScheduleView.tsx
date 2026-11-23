import React, { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Customer, Loan } from '../types';
import {
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getLoanInstallmentsWithStatus,
  getPeriodBounds,
  isDateInRange,
  todayISO,
} from '../utils/finance';

interface ScheduleViewProps {
  customers: Customer[];
  loans: Loan[];
  onOpenRepay: (loan: Loan) => void;
  onOpenMessaging: (customerId: string) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  customers,
  loans,
  onOpenRepay,
  onOpenMessaging,
}) => {
  const [periodMode, setPeriodMode] = useState<'week' | 'month'>('week');
  const [refDate, setRefDate] = useState(todayISO());

  const bounds = useMemo(() => getPeriodBounds(refDate), [refDate]);
  const startRange = periodMode === 'week' ? bounds.weekStart : bounds.monthStart;
  const endRange = periodMode === 'week' ? bounds.weekEnd : bounds.monthEnd;

  const scheduleRows = useMemo(() => {
    const list: {
      loan: Loan;
      customer: Customer | undefined;
      periodNumber: number;
      dueDate: string;
      principalDue: number;
      interestDue: number;
      totalDue: number;
      paidAmount: number;
      remainingAmount: number;
      state: 'paid' | 'partial' | 'pending' | 'overdue';
    }[] = [];

    for (const loan of loans) {
      const cust = customers.find((c) => c.id === loan.customerId);
      const installments = getLoanInstallmentsWithStatus(loan);
      for (const inst of installments) {
        if (isDateInRange(inst.dueDate, startRange, endRange)) {
          list.push({
            ...inst,
            customer: cust,
          });
        }
      }
    }

    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [loans, customers, startRange, endRange]);

  const totals = useMemo(() => {
    return scheduleRows.reduce(
      (acc, r) => {
        acc.principal += r.principalDue;
        acc.interest += r.interestDue;
        acc.total += r.totalDue;
        acc.paid += r.paidAmount;
        acc.remaining += r.remainingAmount;
        return acc;
      },
      { principal: 0, interest: 0, total: 0, paid: 0, remaining: 0 },
    );
  }, [scheduleRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Ratiba ya Wateja Wanaopaswa Kulipa ({periodMode === 'week' ? 'Wiki Husika' : 'Mwezi Husika'})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kipindi: {formatDateSW(startRange)} hadi {formatDateSW(endRange)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value || todayISO())}
            className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
          />
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPeriodMode('week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                periodMode === 'week'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wiki Husika
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                periodMode === 'month'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mwezi Husika
            </button>
          </div>
        </div>
      </div>

      {/* Period Expected Totals Split */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Mtaji Unaotarajiwa</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
            {formatTZS(totals.principal)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Riba Inayotarajiwa</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-emerald-700">
            {formatTZS(totals.interest)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Jumla ya Ratiba</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
            {formatTZS(totals.total)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Yaliyolipwa Tayari</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-emerald-700">
            {formatTZS(totals.paid)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Bado Yanadaiwa</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-red-700">
            {formatTZS(totals.remaining)}
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {scheduleRows.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Hakuna ratiba ya marejesho ndani ya {periodMode === 'week' ? 'wiki hii' : 'mwezi huu'}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Tarehe</th>
                  <th className="text-left px-5 py-3">Mteja</th>
                  <th className="text-left px-5 py-3">Awamu</th>
                  <th className="text-right px-5 py-3">Mtaji</th>
                  <th className="text-right px-5 py-3">Riba</th>
                  <th className="text-right px-5 py-3">Jumla</th>
                  <th className="text-right px-5 py-3">Bado</th>
                  <th className="text-left px-5 py-3">Hali</th>
                  <th className="text-right px-5 py-3">Hatua</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scheduleRows.map((row) => (
                  <tr key={`${row.loan.id}_${row.periodNumber}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-xs font-medium text-slate-900 whitespace-nowrap">
                      {formatDateSW(row.dueDate)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">
                        {row.customer?.fullName || 'Mteja'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {row.customer?.phone} · {getFrequencyLabel(row.loan.frequency)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      #{row.periodNumber} / {row.loan.durationCount}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num text-slate-700">
                      {formatTZS(row.principalDue)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num text-emerald-700">
                      {formatTZS(row.interestDue)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num font-semibold text-slate-900">
                      {formatTZS(row.totalDue)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num font-bold text-slate-900">
                      {formatTZS(row.remainingAmount)}
                    </td>
                    <td className="px-5 py-3">
                      {row.state === 'paid' && (
                        <span className="text-xs font-semibold text-emerald-700">Imelipwa</span>
                      )}
                      {row.state === 'partial' && (
                        <span className="text-xs font-semibold text-amber-700">Nusu</span>
                      )}
                      {row.state === 'pending' && (
                        <span className="text-xs font-semibold text-slate-700">Inasubiri</span>
                      )}
                      {row.state === 'overdue' && (
                        <span className="text-xs font-semibold text-red-700">Imechelewa</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {row.remainingAmount > 0 && row.loan.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => onOpenRepay(row.loan)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Pokea
                          </button>
                        )}
                        {row.customer && (
                          <button
                            type="button"
                            onClick={() => onOpenMessaging(row.customer!.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
                          >
                            Ujumbe
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
