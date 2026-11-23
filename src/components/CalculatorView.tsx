import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { InterestType, RepaymentFrequency } from '../types';
import {
  calculateLoan,
  formatDateSW,
  formatTZS,
  todayISO,
} from '../utils/finance';

interface CalculatorViewProps {
  defaultPenaltyPercent: number;
  onApplyToNewLoan: (params: {
    principal: number;
    interestType: InterestType;
    interestValue: number;
    frequency: RepaymentFrequency;
    durationCount: number;
    penaltyPercent: number;
    startDate: string;
  }) => void;
}

export const CalculatorView: React.FC<CalculatorViewProps> = ({
  defaultPenaltyPercent,
  onApplyToNewLoan,
}) => {
  const [principal, setPrincipal] = useState('300000');
  const [interestType, setInterestType] = useState<InterestType>('flat');
  const [interestValue, setInterestValue] = useState('20');
  const [frequency, setFrequency] = useState<RepaymentFrequency>('monthly');
  const [durationCount, setDurationCount] = useState('3');
  const [penaltyPercent, setPenaltyPercent] = useState(String(defaultPenaltyPercent || 5));
  const [startDate, setStartDate] = useState(todayISO());

  const calc = useMemo(
    () =>
      calculateLoan(
        Number(principal) || 0,
        interestType,
        Number(interestValue) || 0,
        frequency,
        Number(durationCount) || 1,
        startDate,
      ),
    [principal, interestType, interestValue, frequency, durationCount, startDate],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Kikokotoo cha Mkopo (Loan Calculator)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kokotoa riba, kiasi cha rejesho kwa wiki/mwezi, tarehe ya kumaliza, na ratiba nzima ya malipo
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onApplyToNewLoan({
              principal: calc.principal,
              interestType,
              interestValue: Number(interestValue) || 0,
              frequency,
              durationCount: Math.max(1, Math.round(Number(durationCount) || 1)),
              penaltyPercent: Number(penaltyPercent) || 0,
              startDate,
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
        >
          <span>Tumia Kwenye Usajili wa Mteja</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
            Vigezo vya Mkopo
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kiasi cha Mkopo / Mtaji (Tsh)
            </label>
            <input
              type="number"
              min={1000}
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Aina ya Riba
            </label>
            <select
              value={interestType}
              onChange={(e) => setInterestType(e.target.value as InterestType)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="flat">Riba Isiyobadilika (Flat Rate %)</option>
              <option value="reducing">Riba ya Kupungua (Reducing Balance %)</option>
              <option value="fixed_amount">Kiasi Maalum cha Riba (Tsh)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {interestType === 'fixed_amount'
                ? 'Kiasi cha Riba (Tsh)'
                : interestType === 'reducing'
                  ? 'Riba kwa Kipindi (%)'
                  : 'Asilimia ya Riba (%)'}
            </label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={interestValue}
              onChange={(e) => setInterestValue(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Muda wa Makato
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFrequency('weekly')}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                  frequency === 'weekly'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Wiki
              </button>
              <button
                type="button"
                onClick={() => setFrequency('monthly')}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                  frequency === 'monthly'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Mwezi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Idadi ya {frequency === 'weekly' ? 'Wiki' : 'Miezi'}
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={durationCount}
                onChange={(e) => setDurationCount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Adhabu Ikichelewa (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={penaltyPercent}
                onChange={(e) => setPenaltyPercent(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tarehe ya Kuanza Mkopo
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Summary + Schedule */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Jumla ya Riba</div>
              <div className="mt-1 text-lg font-bold font-mono-num text-emerald-700">
                {formatTZS(calc.totalInterest)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Jumla ya Kurejesha</div>
              <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
                {formatTZS(calc.totalPayable)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">
                Rejesho ({frequency === 'weekly' ? 'Kwa Wiki' : 'Kwa Mwezi'})
              </div>
              <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
                {formatTZS(calc.installmentAmount)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Tarehe ya Kumaliza</div>
              <div className="mt-1 text-base font-bold text-slate-900">
                {formatDateSW(calc.endDate)}
              </div>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Jedwali la Makadirio ya Marejesho
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="text-left px-5 py-2.5">Awamu</th>
                    <th className="text-left px-5 py-2.5">Tarehe</th>
                    <th className="text-right px-5 py-2.5">Mtaji</th>
                    <th className="text-right px-5 py-2.5">Riba</th>
                    <th className="text-right px-5 py-2.5">Rejesho Kamili</th>
                    <th className="text-right px-5 py-2.5">Salio la Mtaji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calc.schedule.map((row) => (
                    <tr key={row.periodNumber} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 text-xs font-medium text-slate-700">
                        #{row.periodNumber}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                        {formatDateSW(row.dueDate)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono-num text-slate-800">
                        {formatTZS(row.principalDue)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono-num text-emerald-700">
                        {formatTZS(row.interestDue)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono-num font-semibold text-slate-900">
                        {formatTZS(row.totalDue)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono-num text-slate-500">
                        {formatTZS(row.remainingPrincipalAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
