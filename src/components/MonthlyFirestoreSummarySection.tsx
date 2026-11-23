import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { Loan, Repayment } from '../types';
import {
  firestoreFetchMonthlySummary,
  getMonthDateBounds,
  MonthlyFirestoreSummary,
} from '../services/dataStore';
import { formatDateSW, formatTZS, isDateInRange, todayISO } from '../utils/finance';

interface MonthlyFirestoreSummarySectionProps {
  cloudUserUid: string | null;
  loans: Loan[];
  repayments: Repayment[];
  onConnectCloud: () => Promise<void>;
}

const MONTH_NAMES_SW = [
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

function formatMonthLabelSW(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const mIdx = Number(mStr) - 1;
  if (mIdx >= 0 && mIdx < 12 && yStr) {
    return `${MONTH_NAMES_SW[mIdx]} ${yStr}`;
  }
  return monthKey;
}

export const MonthlyFirestoreSummarySection: React.FC<MonthlyFirestoreSummarySectionProps> = ({
  cloudUserUid,
  loans,
  repayments,
  onConnectCloud,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayISO().slice(0, 7));
  const [cloudSummary, setCloudSummary] = useState<MonthlyFirestoreSummary | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const loadFromFirestore = useCallback(async () => {
    if (!cloudUserUid) {
      setCloudSummary(null);
      return;
    }
    setLoadingCloud(true);
    setCloudError('');
    try {
      const data = await firestoreFetchMonthlySummary(cloudUserUid, selectedMonth);
      setCloudSummary(data);
    } catch (err) {
      setCloudError(
        err instanceof Error ? err.message : 'Imeshindwa kusoma data kutoka Firestore.',
      );
    } finally {
      setLoadingCloud(false);
    }
  }, [cloudUserUid, selectedMonth]);

  useEffect(() => {
    void loadFromFirestore();
  }, [loadFromFirestore, loans, repayments]);

  const localFallbackSummary: MonthlyFirestoreSummary = useMemo(() => {
    const { monthStart, monthEnd } = getMonthDateBounds(selectedMonth);
    const monthLoans = loans.filter((l) => isDateInRange(l.startDate, monthStart, monthEnd));
    const monthRepayments = repayments.filter((r) =>
      isDateInRange(r.paymentDate, monthStart, monthEnd),
    );

    return {
      monthKey: selectedMonth,
      monthStart,
      monthEnd,
      disbursedPrincipal: monthLoans.reduce((s, l) => s + (l.principal || 0), 0),
      loansIssuedCount: monthLoans.length,
      interestCollected: monthRepayments.reduce((s, r) => s + (r.interestPortion || 0), 0),
      penaltyPaid: monthRepayments.reduce((s, r) => s + (r.penaltyPortion || 0), 0),
      principalCollected: monthRepayments.reduce((s, r) => s + (r.principalPortion || 0), 0),
      repaymentsCount: monthRepayments.length,
    };
  }, [selectedMonth, loans, repayments]);

  const activeSummary =
    cloudUserUid && cloudSummary && cloudSummary.monthKey === selectedMonth
      ? cloudSummary
      : localFallbackSummary;

  const totalCollectedMonth =
    activeSummary.principalCollected +
    activeSummary.interestCollected +
    activeSummary.penaltyPaid;
  const totalProfitMonth = activeSummary.interestCollected + activeSummary.penaltyPaid;

  return (
    <section className="bg-white border border-emerald-200/80 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-white border-b border-emerald-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Muhtasari wa Mwezi Husika — {formatMonthLabelSW(selectedMonth)}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Mtaji uliokopeshwa, riba iliyokusanywa, na adhabu zilizolipwa ({formatDateSW(activeSummary.monthStart)} – {formatDateSW(activeSummary.monthEnd)}) ·{' '}
            <span className="font-semibold text-emerald-800">
              {cloudUserUid ? 'Chanzo: Firestore Database' : 'Chanzo: Hifadhi ya Kifaa (Unganisha Firestore)'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="dashboard-month-picker">
            Chagua mwezi husika
          </label>
          <input
            id="dashboard-month-picker"
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              if (e.target.value) setSelectedMonth(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-emerald-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />

          {cloudUserUid ? (
            <button
              type="button"
              onClick={() => void loadFromFirestore()}
              disabled={loadingCloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCloud ? 'animate-spin' : ''}`} />
              <span>{loadingCloud ? 'Inasoma Firestore...' : 'Sasisha Firestore'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onConnectCloud()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Unganisha Firestore</span>
            </button>
          )}
        </div>
      </div>

      {cloudError && (
        <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
          {cloudError}
        </div>
      )}

      {/* 3 Primary Metrics for Selected Month */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="p-6 bg-sky-50/30">
          <div className="text-xs font-semibold text-sky-900">
            Jumla ya Mtaji Uliokopeshwa
          </div>
          {loadingCloud && !cloudSummary ? (
            <div className="mt-2 h-8 w-36 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="mt-2 text-2xl font-bold font-mono-num text-blue-900">
              {formatTZS(activeSummary.disbursedPrincipal)}
            </div>
          )}
          <div className="mt-1.5 text-xs text-slate-600 font-mono-num">
            Mikopo {activeSummary.loansIssuedCount} iliyotolewa mwezi huu
          </div>
        </div>

        <div className="p-6 bg-emerald-50/35">
          <div className="text-xs font-semibold text-emerald-900">
            Jumla ya Riba Iliyokusanywa
          </div>
          {loadingCloud && !cloudSummary ? (
            <div className="mt-2 h-8 w-36 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="mt-2 text-2xl font-bold font-mono-num text-emerald-700">
              {formatTZS(activeSummary.interestCollected)}
            </div>
          )}
          <div className="mt-1.5 text-xs text-slate-600 font-mono-num">
            Kutoka kwenye risiti {activeSummary.repaymentsCount} za mwezi
          </div>
        </div>

        <div className="p-6 bg-amber-50/35">
          <div className="text-xs font-semibold text-amber-900">
            Adhabu (Penalty) Zilizolipwa
          </div>
          {loadingCloud && !cloudSummary ? (
            <div className="mt-2 h-8 w-36 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="mt-2 text-2xl font-bold font-mono-num text-amber-700">
              {formatTZS(activeSummary.penaltyPaid)}
            </div>
          )}
          <div className="mt-1.5 text-xs text-slate-600">
            Malipo ya adhabu za ucheleweshaji mwezi huu
          </div>
        </div>
      </div>

      {/* Supporting Monthly Totals Strip */}
      <div className="px-6 py-3.5 bg-slate-900 text-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-slate-400">Mtaji Uliorejeshwa Mwezi Huu: </span>
            <strong className="font-mono-num text-white">
              {formatTZS(activeSummary.principalCollected)}
            </strong>
          </div>
          <div>
            <span className="text-slate-400">Faida Jumla (Riba + Adhabu): </span>
            <strong className="font-mono-num text-emerald-400">
              {formatTZS(totalProfitMonth)}
            </strong>
          </div>
        </div>

        <div>
          <span className="text-slate-400">Jumla ya Marejesho Yaliyokusanywa: </span>
          <strong className="font-mono-num text-sm text-emerald-300">
            {formatTZS(totalCollectedMonth)}
          </strong>
        </div>
      </div>
    </section>
  );
};
