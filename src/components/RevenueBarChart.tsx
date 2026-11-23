import React, { useMemo, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Repayment } from '../types';
import { formatTZS, todayISO } from '../utils/finance';

interface RevenueBarChartProps {
  repayments: Repayment[];
  onOpenQuickRecord?: () => void;
}

type ChartMode = 'monthly' | 'yearly';

interface PeriodBarDatum {
  key: string;
  shortLabel: string;
  fullLabel: string;
  count: number;
  principal: number;
  interest: number;
  penalty: number;
  profit: number;
  total: number;
}

const MONTH_SHORT_SW = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const MONTH_FULL_SW = [
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

function formatCompactTZS(val: number): string {
  const n = Math.round(val);
  if (n === 0) return '0';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(n);
}

function getNiceMax(rawMax: number): number {
  if (rawMax <= 0) return 100_000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  let niceNormalized = 10;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 1.2) niceNormalized = 1.2;
  else if (normalized <= 1.5) niceNormalized = 1.5;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 3) niceNormalized = 3;
  else if (normalized <= 4) niceNormalized = 4;
  else if (normalized <= 5) niceNormalized = 5;
  else if (normalized <= 6) niceNormalized = 6;
  else if (normalized <= 8) niceNormalized = 8;
  return niceNormalized * magnitude;
}

export const RevenueBarChart: React.FC<RevenueBarChartProps> = ({
  repayments,
  onOpenQuickRecord,
}) => {
  const currentYear = todayISO().slice(0, 4);
  const [mode, setMode] = useState<ChartMode>('monthly');
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [showDetailTable, setShowDetailTable] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const availableYears = useMemo(() => {
    const set = new Set<string>([currentYear]);
    for (const r of repayments) {
      if (r.paymentDate && r.paymentDate.length >= 4) {
        set.add(r.paymentDate.slice(0, 4));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [repayments, currentYear]);

  const effectiveYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] || currentYear;

  const monthlyData: PeriodBarDatum[] = useMemo(() => {
    const buckets: PeriodBarDatum[] = MONTH_SHORT_SW.map((shortLabel, idx) => ({
      key: `${effectiveYear}-${String(idx + 1).padStart(2, '0')}`,
      shortLabel,
      fullLabel: `${MONTH_FULL_SW[idx]} ${effectiveYear}`,
      count: 0,
      principal: 0,
      interest: 0,
      penalty: 0,
      profit: 0,
      total: 0,
    }));

    for (const r of repayments) {
      if (!r.paymentDate || !r.paymentDate.startsWith(`${effectiveYear}-`)) continue;
      const monthIdx = Number(r.paymentDate.slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const b = buckets[monthIdx];
      b.count += 1;
      b.principal += r.principalPortion || 0;
      b.interest += r.interestPortion || 0;
      b.penalty += r.penaltyPortion || 0;
      b.profit = b.interest + b.penalty;
      b.total += r.amount || 0;
    }

    return buckets;
  }, [repayments, effectiveYear]);

  const yearlyData: PeriodBarDatum[] = useMemo(() => {
    const yearsNum = availableYears.map(Number).filter((n) => !isNaN(n));
    const currentYearNum = Number(currentYear) || new Date().getFullYear();
    const minYear = yearsNum.length > 0 ? Math.min(...yearsNum, currentYearNum - 2) : currentYearNum - 2;
    const maxYear = yearsNum.length > 0 ? Math.max(...yearsNum, currentYearNum) : currentYearNum;

    const map = new Map<string, PeriodBarDatum>();
    for (let y = minYear; y <= maxYear; y++) {
      const yStr = String(y);
      map.set(yStr, {
        key: yStr,
        shortLabel: yStr,
        fullLabel: `Mwaka ${yStr}`,
        count: 0,
        principal: 0,
        interest: 0,
        penalty: 0,
        profit: 0,
        total: 0,
      });
    }

    for (const r of repayments) {
      const yStr = r.paymentDate?.slice(0, 4);
      if (!yStr || !map.has(yStr)) continue;
      const b = map.get(yStr)!;
      b.count += 1;
      b.principal += r.principalPortion || 0;
      b.interest += r.interestPortion || 0;
      b.penalty += r.penaltyPortion || 0;
      b.profit = b.interest + b.penalty;
      b.total += r.amount || 0;
    }

    return Array.from(map.values());
  }, [availableYears, repayments, currentYear]);

  const chartData = mode === 'monthly' ? monthlyData : yearlyData;

  const summary = useMemo(() => {
    let total = 0;
    let principal = 0;
    let interest = 0;
    let penalty = 0;
    let count = 0;
    let bestPeriod: PeriodBarDatum | null = null;

    for (const item of chartData) {
      total += item.total;
      principal += item.principal;
      interest += item.interest;
      penalty += item.penalty;
      count += item.count;
      if (!bestPeriod || item.total > bestPeriod.total) {
        bestPeriod = item;
      }
    }

    return {
      total,
      principal,
      interest,
      penalty,
      profit: interest + penalty,
      count,
      bestPeriod: bestPeriod && bestPeriod.total > 0 ? bestPeriod : null,
    };
  }, [chartData]);

  const rawMax = useMemo(
    () => chartData.reduce((max, item) => Math.max(max, item.total), 0),
    [chartData],
  );
  const niceMax = useMemo(() => getNiceMax(rawMax), [rawMax]);
  const yTicks = useMemo(
    () => [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(niceMax * ratio)),
    [niceMax],
  );

  const inspectedItem = useMemo(() => {
    if (activeKey) {
      const found = chartData.find((d) => d.key === activeKey);
      if (found) return found;
    }
    if (summary.bestPeriod) return summary.bestPeriod;
    return chartData[chartData.length - 1] || null;
  }, [activeKey, chartData, summary.bestPeriod]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header & Controls */}
      <div className="px-6 py-4 bg-gradient-to-r from-sky-50/70 via-white to-emerald-50/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Ripoti ya Kina ya Mapato (Chati ya Pau)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mwenendo wa makusanyo ya Mtaji na Faida (Riba + Adhabu){' '}
            {mode === 'monthly' ? `kwa kila mwezi (${effectiveYear})` : 'kwa kila mwaka'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Mode Control */}
          <div
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Aina ya ripoti ya chati"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'monthly'}
              onClick={() => {
                setMode('monthly');
                setActiveKey(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kila Mwezi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'yearly'}
              onClick={() => {
                setMode('yearly');
                setActiveKey(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'yearly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kila Mwaka
            </button>
          </div>

          {mode === 'monthly' && (
            <select
              aria-label="Chagua mwaka wa ripoti"
              value={effectiveYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setActiveKey(null);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Mwaka {yr}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowDetailTable((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>{showDetailTable ? 'Ficha Jedwali' : 'Jedwali la Kina'}</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/70">
        <div className="px-6 py-3.5">
          <div className="text-xs text-slate-500">
            Jumla ya Makusanyo ({mode === 'monthly' ? effectiveYear : 'Miaka Yote'})
          </div>
          <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
            {formatTZS(summary.total)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 font-mono-num">
            Risiti {summary.count}
          </div>
        </div>

        <div className="px-6 py-3.5">
          <div className="text-xs text-slate-500">Mtaji Uliokusanywa</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
            {formatTZS(summary.principal)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 font-mono-num">
            {summary.total > 0
              ? `${Math.round((summary.principal / summary.total) * 100)}% ya makusanyo`
              : '0% ya makusanyo'}
          </div>
        </div>

        <div className="px-6 py-3.5">
          <div className="text-xs text-slate-500">Faida Iliyopatikana (Riba + Adhabu)</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-emerald-700">
            {formatTZS(summary.profit)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 font-mono-num">
            Riba {formatTZS(summary.interest)} · Adhabu {formatTZS(summary.penalty)}
          </div>
        </div>

        <div className="px-6 py-3.5">
          <div className="text-xs text-slate-500">
            {mode === 'monthly' ? 'Mwezi Wenye Makusanyo Zaidi' : 'Mwaka Wenye Makusanyo Zaidi'}
          </div>
          <div className="mt-1 text-lg font-bold font-mono-num text-slate-900">
            {summary.bestPeriod ? summary.bestPeriod.fullLabel : '—'}
          </div>
          <div className="mt-0.5 text-xs text-emerald-700 font-mono-num font-medium">
            {summary.bestPeriod ? formatTZS(summary.bestPeriod.total) : 'Hakuna makusanyo bado'}
          </div>
        </div>
      </div>

      {/* Bar Chart Body */}
      <div className="p-6">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
            <div className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-blue-700 inline-block" aria-hidden="true" />
              <span>Mtaji Uliokusanywa</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" aria-hidden="true" />
              <span>Faida (Riba + Adhabu)</span>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Bofya au pitisha kishale juu ya pau kuona mchanganuo kamili
          </div>
        </div>

        {repayments.length === 0 ? (
          <div className="py-12 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <BarChart3 className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="mt-2.5 text-sm font-medium text-slate-800">
              Bado hakuna marejesho yaliyorekodiwa kwenye mfumo.
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Chati ya pau za mapato ya kila mwezi na mwaka itajichora moja kwa moja mara tu
              utakapoanza kupokea marejesho ya mikopo.
            </p>
            {onOpenQuickRecord && (
              <button
                type="button"
                onClick={onOpenQuickRecord}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Angalia Mikopo na Risiti
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[560px]">
                {/* Chart Canvas */}
                <div className="flex gap-3">
                  {/* Y-Axis Labels */}
                  <div className="w-14 shrink-0 h-64 flex flex-col justify-between text-right pr-2 text-[11px] font-mono-num text-slate-500 select-none">
                    {yTicks.map((tick, idx) => (
                      <span key={idx} className="-translate-y-1.5">
                        {formatCompactTZS(tick)}
                      </span>
                    ))}
                  </div>

                  {/* Plot Area */}
                  <div className="flex-1 relative h-64 border-b border-slate-300">
                    {/* Horizontal Gridlines */}
                    <div
                      className="absolute inset-0 flex flex-col justify-between pointer-events-none"
                      aria-hidden="true"
                    >
                      {yTicks.map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-full border-t ${
                            idx === yTicks.length - 1
                              ? 'border-transparent'
                              : 'border-dashed border-slate-200'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Bars Grid */}
                    <div
                      className="relative z-10 h-full grid items-end gap-2 px-1"
                      style={{
                        gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {chartData.map((item) => {
                        const totalPct = niceMax > 0 ? Math.min(100, (item.total / niceMax) * 100) : 0;
                        const principalShare =
                          item.total > 0 ? (item.principal / item.total) * 100 : 0;
                        const profitShare =
                          item.total > 0 ? (item.profit / item.total) * 100 : 0;
                        const isSelected = inspectedItem?.key === item.key;

                        return (
                          <button
                            key={item.key}
                            type="button"
                            onMouseEnter={() => setActiveKey(item.key)}
                            onFocus={() => setActiveKey(item.key)}
                            onClick={() => setActiveKey(item.key)}
                            aria-label={`${item.fullLabel}: Jumla ${formatTZS(item.total)}, Mtaji ${formatTZS(item.principal)}, Faida ${formatTZS(item.profit)}`}
                            className={`group h-full flex flex-col items-center justify-end focus:outline-none rounded-t-md transition-colors ${
                              isSelected ? 'bg-slate-100/70' : 'hover:bg-slate-50/70'
                            }`}
                          >
                            {/* Top Value Label */}
                            <span
                              className={`mb-1 text-[10px] font-mono-num font-semibold transition-opacity ${
                                item.total > 0
                                  ? isSelected
                                    ? 'text-slate-900 opacity-100'
                                    : 'text-slate-600 opacity-90 group-hover:opacity-100'
                                  : 'opacity-0'
                              }`}
                            >
                              {item.total > 0 ? formatCompactTZS(item.total) : '0'}
                            </span>

                            {/* Stacked Bar */}
                            <div
                              className={`w-full max-w-[44px] flex flex-col justify-end rounded-t-sm overflow-hidden transition-all duration-200 ${
                                isSelected
                                  ? 'ring-2 ring-emerald-600 ring-offset-1'
                                  : ''
                              }`}
                              style={{
                                height: item.total > 0 ? `${Math.max(4, totalPct)}%` : '2px',
                              }}
                            >
                              {item.total === 0 ? (
                                <div className="w-full h-full bg-slate-200" />
                              ) : (
                                <>
                                  {item.profit > 0 && (
                                    <div
                                      className="w-full bg-emerald-500 group-hover:bg-emerald-400 transition-colors"
                                      style={{ height: `${profitShare}%` }}
                                    />
                                  )}
                                  {item.principal > 0 && (
                                    <div
                                      className="w-full bg-blue-700 group-hover:bg-blue-600 transition-colors"
                                      style={{ height: `${principalShare}%` }}
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* X-Axis Labels */}
                <div className="flex gap-3 mt-2">
                  <div className="w-14 shrink-0" />
                  <div
                    className="flex-1 grid gap-2 px-1"
                    style={{
                      gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {chartData.map((item) => {
                      const isSelected = inspectedItem?.key === item.key;
                      return (
                        <div
                          key={item.key}
                          className={`text-center text-xs font-medium truncate ${
                            isSelected ? 'text-slate-900 font-bold' : 'text-slate-600'
                          }`}
                        >
                          {item.shortLabel}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {summary.total === 0 && (
              <p className="mt-3 text-xs text-amber-700 text-center">
                Hakuna makusanyo yaliyorekodiwa kwa {mode === 'monthly' ? `mwaka ${effectiveYear}` : 'kipindi kilichochaguliwa'}.
              </p>
            )}

            {/* Selected Period Detail Inspection Strip */}
            {inspectedItem && (
              <div className="mt-5 p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">Mchanganuo wa Kipindi Kilichochaguliwa</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {inspectedItem.fullLabel}{' '}
                    <span className="font-normal text-xs text-slate-500 font-mono-num">
                      · Risiti {inspectedItem.count}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs">
                  <div>
                    <div className="text-slate-500">Mtaji</div>
                    <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                      {formatTZS(inspectedItem.principal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Riba</div>
                    <div className="font-mono-num font-semibold text-slate-800 mt-0.5">
                      {formatTZS(inspectedItem.interest)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Adhabu</div>
                    <div className="font-mono-num font-semibold text-amber-700 mt-0.5">
                      {formatTZS(inspectedItem.penalty)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Faida Jumla</div>
                    <div className="font-mono-num font-bold text-emerald-700 mt-0.5">
                      {formatTZS(inspectedItem.profit)}
                    </div>
                  </div>
                  <div className="pl-4 border-l border-slate-200">
                    <div className="text-slate-500">Jumla Iliyokusanywa</div>
                    <div className="font-mono-num font-bold text-sm text-slate-900 mt-0.5">
                      {formatTZS(inspectedItem.total)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Expandable Detailed Monthly/Yearly Table */}
      {showDetailTable && (
        <div className="border-t border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3">
                  {mode === 'monthly' ? 'Mwezi' : 'Mwaka'}
                </th>
                <th className="text-right px-6 py-3">Risiti</th>
                <th className="text-right px-6 py-3">Mtaji Uliokusanywa</th>
                <th className="text-right px-6 py-3">Riba</th>
                <th className="text-right px-6 py-3">Adhabu</th>
                <th className="text-right px-6 py-3">Faida (Riba + Adhabu)</th>
                <th className="text-right px-6 py-3">Jumla ya Mapato</th>
                <th className="text-right px-6 py-3">Mchango (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chartData.map((row) => {
                const sharePct =
                  summary.total > 0 ? ((row.total / summary.total) * 100).toFixed(1) : '0.0';
                return (
                  <tr
                    key={row.key}
                    onClick={() => setActiveKey(row.key)}
                    className={`cursor-pointer transition-colors ${
                      inspectedItem?.key === row.key ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-6 py-2.5 font-medium text-slate-900">{row.fullLabel}</td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-700">
                      {row.count}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-900">
                      {formatTZS(row.principal)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-700">
                      {formatTZS(row.interest)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-amber-700">
                      {formatTZS(row.penalty)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num font-semibold text-emerald-700">
                      {formatTZS(row.profit)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num font-bold text-slate-900">
                      {formatTZS(row.total)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-600">
                      {sharePct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
