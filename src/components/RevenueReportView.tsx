import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  CalendarRange,
  Download,
  Filter,
  Receipt,
  RotateCcw,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  CompanySettings,
  Customer,
  Loan,
  LoanType,
  PaymentMethod,
  Repayment,
} from '../types';
import {
  formatDateSW,
  formatTZS,
  getPaymentMethodLabel,
  getPeriodBounds,
  isDateInRange,
  todayISO,
} from '../utils/finance';

interface RevenueReportViewProps {
  repayments: Repayment[];
  loans: Loan[];
  loanTypes: LoanType[];
  customers: Customer[];
  company: CompanySettings;
  onOpenCollections: () => void;
}

type TimePreset = 'this_week' | 'this_month' | 'this_year' | 'all_time' | 'custom';
type ChartVariant = 'principal_vs_interest' | 'bar_stacked' | 'area_trend';

interface PeriodBucketPoint {
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

interface LoanTypeComparisonPoint {
  loanType: string;
  shortLabel: string;
  count: number;
  principal: number;
  interest: number;
  penalty: number;
  total: number;
  interestSharePct: number;
}

interface PaymentMethodBreakdown {
  method: PaymentMethod;
  label: string;
  count: number;
  total: number;
  sharePct: number;
  color: string;
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

const METHOD_COLORS: Record<PaymentMethod, string> = {
  mobile_money: '#059669',
  bank: '#1d4ed8',
  cash: '#d97706',
};

function formatCompactAxisTZS(value: number): string {
  const n = Math.round(value);
  if (n === 0) return '0';
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000;
    return `${b % 1 === 0 ? b.toFixed(0) : b.toFixed(1)}B`;
  }
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

function diffDaysInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some(isNaN)) return 365;
  const s = new Date(sy, sm - 1, sd).getTime();
  const e = new Date(ey, em - 1, ed).getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

function enumerateDaysISO(startIso: string, endIso: string): string[] {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some(isNaN)) return [];
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const out: string[] = [];
  let guard = 0;
  while (cur <= end && guard < 90) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return out;
}

function enumerateMonthsYM(startIso: string, endIso: string): string[] {
  const sy = Number(startIso.slice(0, 4));
  const sm = Number(startIso.slice(5, 7));
  const ey = Number(endIso.slice(0, 4));
  const em = Number(endIso.slice(5, 7));
  if ([sy, sm, ey, em].some(isNaN)) return [];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 120) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

interface PeriodTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: PeriodBucketPoint }>;
}

const PeriodRevenueTooltip: React.FC<PeriodTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const piTotal = point.principal + point.interest;
  const interestPct = piTotal > 0 ? (point.interest / piTotal) * 100 : 0;

  return (
    <div className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-3 shadow-lg text-xs min-w-[240px]">
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-700">
        <span className="font-bold text-sm text-white">{point.fullLabel}</span>
        <span className="font-mono-num text-emerald-300 font-medium">
          Risiti {point.count}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Principal (Mtaji)</span>
          <span className="font-mono-num font-semibold text-sky-300">
            {formatTZS(point.principal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Riba (Interest)</span>
          <span className="font-mono-num font-semibold text-emerald-300">
            {formatTZS(point.interest)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Adhabu</span>
          <span className="font-mono-num font-semibold text-amber-300">
            {formatTZS(point.penalty)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-slate-700">
          <span className="font-semibold text-white">Jumla ya Mapato</span>
          <span className="font-mono-num font-bold text-white">
            {formatTZS(point.total)}
          </span>
        </div>
        {piTotal > 0 && (
          <div className="text-[11px] text-slate-400 font-mono-num pt-0.5">
            Mchango wa Riba vs Principal: {interestPct.toFixed(1)}% Riba
          </div>
        )}
      </div>
    </div>
  );
};

interface LoanTypeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: LoanTypeComparisonPoint }>;
}

const LoanTypeTooltip: React.FC<LoanTypeTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-3 shadow-lg text-xs min-w-[235px]">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-700">
        <span className="font-bold text-white">{item.loanType}</span>
        <span className="font-mono-num text-emerald-300">Risiti {item.count}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Principal (Mtaji)</span>
          <span className="font-mono-num font-semibold text-sky-300">
            {formatTZS(item.principal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Riba (Interest)</span>
          <span className="font-mono-num font-semibold text-emerald-300">
            {formatTZS(item.interest)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Adhabu</span>
          <span className="font-mono-num font-semibold text-amber-300">
            {formatTZS(item.penalty)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-slate-700">
          <span className="font-semibold text-white">Jumla</span>
          <span className="font-mono-num font-bold text-white">{formatTZS(item.total)}</span>
        </div>
      </div>
    </div>
  );
};

interface DirectPvITooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: { name: string; amount: number; sharePct: number };
  }>;
}

const DirectPvITooltip: React.FC<DirectPvITooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="bg-slate-900 text-white border border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg text-xs">
      <div className="font-semibold text-white">{item.name}</div>
      <div className="mt-1 font-mono-num font-bold text-emerald-300">
        {formatTZS(item.amount)}
      </div>
      <div className="mt-0.5 text-slate-300 font-mono-num">
        {item.sharePct.toFixed(1)}% ya Principal + Riba
      </div>
    </div>
  );
};

interface MethodTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: PaymentMethodBreakdown }>;
}

const MethodBreakdownTooltip: React.FC<MethodTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="bg-slate-900 text-white border border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg text-xs">
      <div className="font-semibold text-white">{item.label}</div>
      <div className="mt-1 font-mono-num text-emerald-300 font-bold">
        {formatTZS(item.total)}
      </div>
      <div className="mt-0.5 text-slate-300 font-mono-num">
        Risiti {item.count} · {item.sharePct.toFixed(1)}% ya mapato
      </div>
    </div>
  );
};

export const RevenueReportView: React.FC<RevenueReportViewProps> = ({
  repayments,
  loans,
  loanTypes,
  customers,
  company,
  onOpenCollections,
}) => {
  const today = todayISO();
  const periodBounds = useMemo(() => getPeriodBounds(today), [today]);

  const [timePreset, setTimePreset] = useState<TimePreset>('this_year');
  const [startDate, setStartDate] = useState<string>(periodBounds.yearStart);
  const [endDate, setEndDate] = useState<string>(periodBounds.yearEnd);
  const [selectedLoanType, setSelectedLoanType] = useState<string>('all');
  const [chartVariant, setChartVariant] = useState<ChartVariant>('principal_vs_interest');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  const loansById = useMemo(() => {
    const map = new Map<string, Loan>();
    for (const loan of loans) {
      map.set(loan.id, loan);
    }
    return map;
  }, [loans]);

  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      map.set(c.id, c);
    }
    return map;
  }, [customers]);

  const getRepaymentLoanType = useMemo(() => {
    return (rep: Repayment): string => {
      const loan = loansById.get(rep.loanId);
      const name = loan?.loanTypeName?.trim();
      return name || 'Mkopo Mwingine';
    };
  }, [loansById]);

  const availableLoanTypes = useMemo(() => {
    const set = new Set<string>();
    for (const lt of loanTypes) {
      if (lt.name?.trim()) set.add(lt.name.trim());
    }
    for (const loan of loans) {
      if (loan.loanTypeName?.trim()) set.add(loan.loanTypeName.trim());
    }
    for (const rep of repayments) {
      if (!loansById.has(rep.loanId)) {
        set.add('Mkopo Mwingine');
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [loanTypes, loans, repayments, loansById]);

  const effectiveLoanType =
    selectedLoanType === 'all' || availableLoanTypes.includes(selectedLoanType)
      ? selectedLoanType
      : 'all';

  // Normalize start/end if user enters them in reverse order
  const [normalizedStart, normalizedEnd] = useMemo(() => {
    if (!startDate && !endDate) return ['', ''];
    if (startDate && endDate && startDate > endDate) {
      return [endDate, startDate];
    }
    return [startDate || endDate, endDate || startDate];
  }, [startDate, endDate]);

  const handleSelectPreset = (preset: TimePreset) => {
    setTimePreset(preset);
    setSelectedBucketKey(null);
    if (preset === 'this_week') {
      setStartDate(periodBounds.weekStart);
      setEndDate(periodBounds.weekEnd);
    } else if (preset === 'this_month') {
      setStartDate(periodBounds.monthStart);
      setEndDate(periodBounds.monthEnd);
    } else if (preset === 'this_year') {
      setStartDate(periodBounds.yearStart);
      setEndDate(periodBounds.yearEnd);
    } else if (preset === 'all_time') {
      // Keep date inputs empty when viewing all time or show bounds
      setStartDate('');
      setEndDate('');
    } else if (preset === 'custom') {
      if (!startDate || !endDate) {
        setStartDate(periodBounds.monthStart);
        setEndDate(today);
      }
    }
  };

  const handleResetFilters = () => {
    setTimePreset('this_year');
    setStartDate(periodBounds.yearStart);
    setEndDate(periodBounds.yearEnd);
    setSelectedLoanType('all');
    setSelectedBucketKey(null);
  };

  const periodLabel = useMemo(() => {
    if (timePreset === 'all_time') return 'Muda Wote';
    if (timePreset === 'this_week') {
      return `Wiki Hii (${formatDateSW(normalizedStart)} – ${formatDateSW(normalizedEnd)})`;
    }
    if (timePreset === 'this_month') {
      const mIdx = Number(normalizedStart.slice(5, 7)) - 1;
      const yr = normalizedStart.slice(0, 4);
      return mIdx >= 0 && mIdx <= 11
        ? `${MONTH_FULL_SW[mIdx]} ${yr}`
        : `${formatDateSW(normalizedStart)} – ${formatDateSW(normalizedEnd)}`;
    }
    if (timePreset === 'this_year') {
      return `Mwaka ${normalizedStart.slice(0, 4)}`;
    }
    if (normalizedStart && normalizedEnd) {
      return `${formatDateSW(normalizedStart)} – ${formatDateSW(normalizedEnd)}`;
    }
    return 'Muda Maalum';
  }, [timePreset, normalizedStart, normalizedEnd]);

  const loanTypeLabel =
    effectiveLoanType === 'all' ? 'Aina Zote za Mikopo' : effectiveLoanType;

  const filteredRepayments = useMemo(() => {
    return repayments.filter((r) => {
      if (!r.paymentDate) return false;
      if (timePreset !== 'all_time' && normalizedStart && normalizedEnd) {
        if (!isDateInRange(r.paymentDate, normalizedStart, normalizedEnd)) {
          return false;
        }
      }
      if (effectiveLoanType !== 'all') {
        if (getRepaymentLoanType(r) !== effectiveLoanType) {
          return false;
        }
      }
      return true;
    });
  }, [
    repayments,
    timePreset,
    normalizedStart,
    normalizedEnd,
    effectiveLoanType,
    getRepaymentLoanType,
  ]);

  // Decide whether time-series buckets should be daily (short range <= 45 days) or monthly
  const isDailyGranularity = useMemo(() => {
    if (timePreset === 'this_week' || timePreset === 'this_month') return true;
    if (timePreset === 'custom' && normalizedStart && normalizedEnd) {
      return diffDaysInclusive(normalizedStart, normalizedEnd) <= 45;
    }
    return false;
  }, [timePreset, normalizedStart, normalizedEnd]);

  const timeSeries: PeriodBucketPoint[] = useMemo(() => {
    if (isDailyGranularity && normalizedStart && normalizedEnd) {
      const days = enumerateDaysISO(normalizedStart, normalizedEnd);
      const map = new Map<string, PeriodBucketPoint>();
      for (const d of days) {
        const dayNum = d.slice(8, 10);
        const mIdx = Number(d.slice(5, 7)) - 1;
        const mShort = MONTH_SHORT_SW[mIdx] || d.slice(5, 7);
        map.set(d, {
          key: d,
          shortLabel: `${dayNum} ${mShort}`,
          fullLabel: formatDateSW(d),
          count: 0,
          principal: 0,
          interest: 0,
          penalty: 0,
          profit: 0,
          total: 0,
        });
      }
      for (const r of filteredRepayments) {
        const b = map.get(r.paymentDate);
        if (!b) continue;
        b.count += 1;
        b.principal += Number(r.principalPortion) || 0;
        b.interest += Number(r.interestPortion) || 0;
        b.penalty += Number(r.penaltyPortion) || 0;
        b.profit = b.interest + b.penalty;
        b.total += Number(r.amount) || 0;
      }
      return Array.from(map.values());
    }

    // Monthly granularity
    const validYmRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    let monthKeys: string[] = [];
    if (timePreset === 'all_time') {
      const set = new Set<string>();
      for (const r of filteredRepayments) {
        const candidate = (r.paymentDate || '').slice(0, 7);
        if (validYmRegex.test(candidate)) {
          set.add(candidate);
        }
      }
      if (set.size === 0) {
        const curYr = today.slice(0, 4);
        monthKeys = MONTH_SHORT_SW.map((_, idx) => `${curYr}-${String(idx + 1).padStart(2, '0')}`);
      } else {
        const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
        monthKeys = enumerateMonthsYM(`${sorted[0]}-01`, `${sorted[sorted.length - 1]}-28`);
      }
    } else if (normalizedStart && normalizedEnd) {
      monthKeys = enumerateMonthsYM(normalizedStart, normalizedEnd);
    }

    const multiYear =
      monthKeys.length > 0 && monthKeys[0].slice(0, 4) !== monthKeys[monthKeys.length - 1].slice(0, 4);

    const map = new Map<string, PeriodBucketPoint>();
    for (const ym of monthKeys) {
      const yr = ym.slice(0, 4);
      const mIdx = Number(ym.slice(5, 7)) - 1;
      const shortM = MONTH_SHORT_SW[mIdx] || ym.slice(5, 7);
      const fullM = MONTH_FULL_SW[mIdx] || ym.slice(5, 7);
      map.set(ym, {
        key: ym,
        shortLabel: multiYear ? `${shortM} '${yr.slice(2)}` : shortM,
        fullLabel: `${fullM} ${yr}`,
        count: 0,
        principal: 0,
        interest: 0,
        penalty: 0,
        profit: 0,
        total: 0,
      });
    }

    for (const r of filteredRepayments) {
      const rawYm = (r.paymentDate || '').slice(0, 7);
      const isValidYm = validYmRegex.test(rawYm);
      const ym = isValidYm ? rawYm : '9999-mengineyo';
      let b = map.get(ym);
      if (!b) {
        if (isValidYm) {
          const yr = rawYm.slice(0, 4);
          const mIdx = Number(rawYm.slice(5, 7)) - 1;
          b = {
            key: ym,
            shortLabel: `${MONTH_SHORT_SW[mIdx] || rawYm.slice(5, 7)} '${yr.slice(2)}`,
            fullLabel: `${MONTH_FULL_SW[mIdx] || rawYm.slice(5, 7)} ${yr}`,
            count: 0,
            principal: 0,
            interest: 0,
            penalty: 0,
            profit: 0,
            total: 0,
          };
        } else {
          b = {
            key: ym,
            shortLabel: 'Mengineyo',
            fullLabel: 'Tarehe Isiyo Sahihi / Mengineyo',
            count: 0,
            principal: 0,
            interest: 0,
            penalty: 0,
            profit: 0,
            total: 0,
          };
        }
        map.set(ym, b);
      }
      b.count += 1;
      b.principal += Number(r.principalPortion) || 0;
      b.interest += Number(r.interestPortion) || 0;
      b.penalty += Number(r.penaltyPortion) || 0;
      b.profit = b.interest + b.penalty;
      b.total += Number(r.amount) || 0;
    }

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [isDailyGranularity, normalizedStart, normalizedEnd, filteredRepayments, timePreset, today]);

  const summary = useMemo(() => {
    let total = 0;
    let principal = 0;
    let interest = 0;
    let penalty = 0;
    let count = 0;

    for (const r of filteredRepayments) {
      total += Number(r.amount) || 0;
      principal += Number(r.principalPortion) || 0;
      interest += Number(r.interestPortion) || 0;
      penalty += Number(r.penaltyPortion) || 0;
      count += 1;
    }

    let activeBuckets = 0;
    let bestBucket: PeriodBucketPoint | null = null;
    for (const b of timeSeries) {
      if (b.total > 0) activeBuckets += 1;
      if (!bestBucket || b.total > bestBucket.total) {
        bestBucket = b;
      }
    }

    const profit = interest + penalty;
    const piTotal = principal + interest;
    const interestShareOfPI = piTotal > 0 ? (interest / piTotal) * 100 : 0;
    const principalShareOfPI = piTotal > 0 ? (principal / piTotal) * 100 : 0;
    const interestToPrincipalRatio = principal > 0 ? (interest / principal) * 100 : 0;
    const avgPerReceipt = count > 0 ? Math.round(total / count) : 0;

    return {
      total,
      principal,
      interest,
      penalty,
      profit,
      piTotal,
      interestShareOfPI,
      principalShareOfPI,
      interestToPrincipalRatio,
      count,
      activeBuckets,
      avgPerReceipt,
      bestBucket: bestBucket && bestBucket.total > 0 ? bestBucket : null,
    };
  }, [filteredRepayments, timeSeries]);

  const directPvIData = useMemo(
    () => [
      {
        name: 'Principal (Mtaji)',
        amount: summary.principal,
        sharePct: summary.principalShareOfPI,
        color: '#1d4ed8',
      },
      {
        name: 'Riba (Interest)',
        amount: summary.interest,
        sharePct: summary.interestShareOfPI,
        color: '#059669',
      },
    ],
    [summary.principal, summary.interest, summary.principalShareOfPI, summary.interestShareOfPI],
  );

  // Loan Type comparison within the selected timeframe (ignores selectedLoanType only if we want context,
  // OR reflects selected filters: showing all loan types in timeframe when 'all', or the single filtered loan type)
  const loanTypeBreakdown: LoanTypeComparisonPoint[] = useMemo(() => {
    const map = new Map<string, LoanTypeComparisonPoint>();

    for (const r of filteredRepayments) {
      const lt = getRepaymentLoanType(r);
      let entry = map.get(lt);
      if (!entry) {
        entry = {
          loanType: lt,
          shortLabel: lt.length > 18 ? `${lt.slice(0, 16)}…` : lt,
          count: 0,
          principal: 0,
          interest: 0,
          penalty: 0,
          total: 0,
          interestSharePct: 0,
        };
        map.set(lt, entry);
      }
      entry.count += 1;
      entry.principal += Number(r.principalPortion) || 0;
      entry.interest += Number(r.interestPortion) || 0;
      entry.penalty += Number(r.penaltyPortion) || 0;
      entry.total += Number(r.amount) || 0;
    }

    const list = Array.from(map.values()).map((item) => {
      const pi = item.principal + item.interest;
      return {
        ...item,
        interestSharePct: pi > 0 ? (item.interest / pi) * 100 : 0,
      };
    });

    return list.sort((a, b) => b.total - a.total);
  }, [filteredRepayments, getRepaymentLoanType]);

  const paymentMethodData: PaymentMethodBreakdown[] = useMemo(() => {
    const methods: PaymentMethod[] = ['mobile_money', 'bank', 'cash'];
    const totals = new Map<PaymentMethod, { count: number; total: number }>([
      ['mobile_money', { count: 0, total: 0 }],
      ['bank', { count: 0, total: 0 }],
      ['cash', { count: 0, total: 0 }],
    ]);

    for (const r of filteredRepayments) {
      const method: PaymentMethod = r.paymentMethod || 'cash';
      const entry = totals.get(method) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(r.amount) || 0;
      totals.set(method, entry);
    }

    return methods.map((m) => {
      const item = totals.get(m) || { count: 0, total: 0 };
      return {
        method: m,
        label: getPaymentMethodLabel(m),
        count: item.count,
        total: item.total,
        sharePct: summary.total > 0 ? (item.total / summary.total) * 100 : 0,
        color: METHOD_COLORS[m],
      };
    });
  }, [filteredRepayments, summary.total]);

  const activeBucketMeta = useMemo(() => {
    if (selectedBucketKey) {
      return timeSeries.find((m) => m.key === selectedBucketKey) || null;
    }
    return summary.bestBucket;
  }, [selectedBucketKey, timeSeries, summary.bestBucket]);

  const selectedBucketReceipts = useMemo(() => {
    const targetPrefix = selectedBucketKey || (summary.bestBucket ? summary.bestBucket.key : '');
    if (!targetPrefix) {
      return [...filteredRepayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    }
    return filteredRepayments
      .filter((r) => r.paymentDate.startsWith(targetPrefix))
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [selectedBucketKey, summary.bestBucket, filteredRepayments]);

  const handleExportCsv = () => {
    const headers = [
      isDailyGranularity ? 'Tarehe' : 'Mwezi',
      'Muda Uliowekwa',
      'Aina ya Mkopo',
      'Idadi ya Risiti',
      'Principal / Mtaji (TZS)',
      'Riba (TZS)',
      'Adhabu (TZS)',
      'Faida (Riba + Adhabu) (TZS)',
      'Jumla ya Mapato (TZS)',
      'Mchango wa Riba (%)',
      'Mchango wa Mapato (%)',
    ];

    const escapeCell = (val: string | number) => {
      const s = String(val);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = timeSeries.map((b) => {
      const pi = b.principal + b.interest;
      const ribaShare = pi > 0 ? ((b.interest / pi) * 100).toFixed(1) : '0.0';
      const totalShare = summary.total > 0 ? ((b.total / summary.total) * 100).toFixed(1) : '0.0';
      return [
        b.fullLabel,
        periodLabel,
        loanTypeLabel,
        b.count,
        Math.round(b.principal),
        Math.round(b.interest),
        Math.round(b.penalty),
        Math.round(b.profit),
        Math.round(b.total),
        ribaShare,
        totalShare,
      ];
    });

    rows.push([
      'JUMLA KUU',
      periodLabel,
      loanTypeLabel,
      summary.count,
      Math.round(summary.principal),
      Math.round(summary.interest),
      Math.round(summary.penalty),
      Math.round(summary.profit),
      Math.round(summary.total),
      summary.interestShareOfPI.toFixed(1),
      summary.total > 0 ? '100.0' : '0.0',
    ]);

    const csvText = `\uFEFF${[headers, ...rows]
      .map((line) => line.map(escapeCell).join(','))
      .join('\r\n')}`;

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const slug = (company.companyName || 'mm-microfinance')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const typeSlug =
      effectiveLoanType === 'all'
        ? 'mikopo-yote'
        : effectiveLoanType
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-ripoti-mapato-${typeSlug}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasNonDefaultFilters =
    timePreset !== 'this_year' || effectiveLoanType !== 'all';

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>{company.companyName}</span>
              <span aria-hidden="true">·</span>
              <span>Chanzo: Data za Marejesho (Repayments)</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                Risiti {summary.count} / {repayments.length}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Ripoti ya Mapato: Riba dhidi ya Principal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Chuja mapato kwa aina ya mkopo na muda uliowekwa · Kipindi:{' '}
              <span className="font-semibold text-slate-700">{periodLabel}</span> · Aina:{' '}
              <span className="font-semibold text-slate-700">{loanTypeLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasNonDefaultFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rejesha Vichujio</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pakua Ripoti (CSV)</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Grid: Loan Type + Period Presets + Custom Dates */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Loan Type Filter */}
          <div className="lg:col-span-4">
            <label
              htmlFor="revenue-loan-type-filter"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
            >
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chuja kwa Aina ya Mkopo</span>
            </label>
            <select
              id="revenue-loan-type-filter"
              value={effectiveLoanType}
              onChange={(e) => {
                setSelectedLoanType(e.target.value);
                setSelectedBucketKey(null);
              }}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">Aina Zote za Mikopo ({availableLoanTypes.length})</option>
              {availableLoanTypes.map((ltName) => (
                <option key={ltName} value={ltName}>
                  {ltName}
                </option>
              ))}
            </select>
          </div>

          {/* Time Period Presets */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
              <CalendarRange className="w-3.5 h-3.5 text-blue-700" />
              <span>Muda Uliowekwa (Haraka)</span>
            </div>
            <div
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full"
              role="tablist"
              aria-label="Chagua muda wa ripoti ya mapato"
            >
              {(
                [
                  { id: 'this_week', label: 'Wiki Hii' },
                  { id: 'this_month', label: 'Mwezi Huu' },
                  { id: 'this_year', label: 'Mwaka Huu' },
                  { id: 'all_time', label: 'Muda Wote' },
                  { id: 'custom', label: 'Maalum' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={timePreset === item.id}
                  onClick={() => handleSelectPreset(item.id)}
                  className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    timePreset === item.id
                      ? 'bg-white text-slate-900 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exact Start & End Date Range */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="revenue-start-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Kuanzia Tarehe
              </label>
              <input
                id="revenue-start-date"
                type="date"
                value={timePreset === 'all_time' ? '' : startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (!endDate) setEndDate(today);
                  setTimePreset('custom');
                  setSelectedBucketKey(null);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label
                htmlFor="revenue-end-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Hadi Tarehe
              </label>
              <input
                id="revenue-end-date"
                type="date"
                value={timePreset === 'all_time' ? '' : endDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val);
                  if (!startDate) setStartDate(periodBounds.monthStart);
                  setTimePreset('custom');
                  setSelectedBucketKey(null);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Summary Strip: Interest vs Principal Focused */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">
              Jumla ya Riba (Interest)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-emerald-700">
            {formatTZS(summary.interest)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono-num">
            {summary.interestShareOfPI.toFixed(1)}% ya (Riba + Principal) · Adhabu{' '}
            {formatTZS(summary.penalty)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">
              Jumla ya Principal (Mtaji)
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-blue-800">
            {formatTZS(summary.principal)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono-num">
            {summary.principalShareOfPI.toFixed(1)}% ya (Riba + Principal) ·{' '}
            {summary.total > 0
              ? `${((summary.principal / summary.total) * 100).toFixed(1)}% ya jumla`
              : '0% ya jumla'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">
              Riba dhidi ya Principal
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-slate-900">
            {summary.interestShareOfPI.toFixed(1)}% : {summary.principalShareOfPI.toFixed(1)}%
          </div>
          <div className="mt-2 w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
            <div
              className="bg-emerald-600 h-full transition-all"
              style={{ width: `${summary.interestShareOfPI}%` }}
              title={`Riba: ${summary.interestShareOfPI.toFixed(1)}%`}
            />
            <div
              className="bg-blue-700 h-full transition-all"
              style={{ width: `${summary.principalShareOfPI}%` }}
              title={`Principal: ${summary.principalShareOfPI.toFixed(1)}%`}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono-num">
            Uwiano wa Riba/Principal: {summary.interestToPrincipalRatio.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">
              Jumla Kuu ya Mapato
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-slate-900">
            {formatTZS(summary.total)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono-num">
            Risiti {summary.count} · Wastani {formatTZS(summary.avgPerReceipt)}/risiti
          </div>
        </div>
      </section>

      {/* Dedicated Interest vs Principal Comparison Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left 5 cols: Direct Riba vs Principal Comparison for Selected Period */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Jumla ya Riba dhidi ya Principal
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel} · {loanTypeLabel}
            </p>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between gap-5">
            {filteredRepayments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Hakuna marejesho yanayolingana na vichujio hivi.
              </div>
            ) : (
              <>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={directPvIData}
                      margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactAxisTZS}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={54}
                      />
                      <Tooltip content={<DirectPvITooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={76}>
                        {directPvIData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2 text-xs">
                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs bg-blue-700 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-900">Principal (Mtaji Uliorejeshwa)</span>
                    </div>
                    <div className="font-mono-num text-right">
                      <span className="font-bold text-blue-800">{formatTZS(summary.principal)}</span>
                      <span className="text-slate-500 ml-1.5">
                        ({summary.principalShareOfPI.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-900">Riba (Mapato ya Riba)</span>
                    </div>
                    <div className="font-mono-num text-right">
                      <span className="font-bold text-emerald-700">{formatTZS(summary.interest)}</span>
                      <span className="text-slate-500 ml-1.5">
                        ({summary.interestShareOfPI.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-600">
                      Tofauti (Principal − Riba)
                    </span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {formatTZS(Math.abs(summary.principal - summary.interest))}{' '}
                      <span className="text-slate-500 font-normal">
                        ({summary.principal >= summary.interest ? 'Principal kubwa' : 'Riba kubwa'})
                      </span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right 7 cols: Riba vs Principal Breakdown by Loan Type */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Riba dhidi ya Principal kwa Aina ya Mkopo
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {effectiveLoanType === 'all'
                  ? `Ulinganisho wa mapato kwa aina zote za mikopo katika muda: ${periodLabel}`
                  : `Inaonyesha aina ya mkopo iliyochaguliwa: ${effectiveLoanType}`}
              </p>
            </div>
            {effectiveLoanType !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedLoanType('all')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                Linganisha Aina Zote
              </button>
            )}
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between gap-5">
            {loanTypeBreakdown.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Hakuna data za aina za mikopo kwa kipindi kilichochaguliwa.
              </div>
            ) : (
              <>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={loanTypeBreakdown}
                      margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactAxisTZS}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={54}
                      />
                      <Tooltip content={<LoanTypeTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Bar
                        dataKey="principal"
                        name="Principal (Mtaji)"
                        fill="#1d4ed8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                      <Bar
                        dataKey="interest"
                        name="Riba (Interest)"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto border-t border-slate-100 pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2 font-semibold">Aina ya Mkopo</th>
                        <th className="text-right py-2 font-semibold">Risiti</th>
                        <th className="text-right py-2 font-semibold">Principal</th>
                        <th className="text-right py-2 font-semibold">Riba</th>
                        <th className="text-right py-2 font-semibold">Jumla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loanTypeBreakdown.map((lt) => (
                        <tr
                          key={lt.loanType}
                          onClick={() => {
                            setSelectedLoanType(
                              effectiveLoanType === lt.loanType ? 'all' : lt.loanType,
                            );
                            setSelectedBucketKey(null);
                          }}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          title="Bofya kuchuja kwa aina hii ya mkopo"
                        >
                          <td className="py-2 font-medium text-slate-900">{lt.loanType}</td>
                          <td className="py-2 text-right font-mono-num text-slate-600">
                            {lt.count}
                          </td>
                          <td className="py-2 text-right font-mono-num text-blue-800 font-semibold">
                            {formatTZS(lt.principal)}
                          </td>
                          <td className="py-2 text-right font-mono-num text-emerald-700 font-semibold">
                            {formatTZS(lt.interest)}
                          </td>
                          <td className="py-2 text-right font-mono-num font-bold text-slate-900">
                            {formatTZS(lt.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Main Time-Series Recharts Revenue Graph */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Mwenendo wa Mapato: {periodLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {chartVariant === 'principal_vs_interest'
                ? 'Ulinganisho wa Riba dhidi ya Principal kwa kila kipindi (Recharts Grouped Bar)'
                : chartVariant === 'bar_stacked'
                  ? 'Mgawanyo wa Principal, Riba, na Adhabu (Recharts Stacked Bar)'
                  : 'Mwenendo wa Jumla ya Mapato, Principal na Riba (Recharts Area Trend)'}{' '}
              · {loanTypeLabel}
            </p>
          </div>

          {/* Chart Style Switcher */}
          <div
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Muonekano wa grafu ya mapato"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartVariant === 'principal_vs_interest'}
              onClick={() => setChartVariant('principal_vs_interest')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartVariant === 'principal_vs_interest'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riba vs Principal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartVariant === 'bar_stacked'}
              onClick={() => setChartVariant('bar_stacked')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartVariant === 'bar_stacked'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pau Zilizounganishwa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartVariant === 'area_trend'}
              onClick={() => setChartVariant('area_trend')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartVariant === 'area_trend'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mwenendo wa Mstari
            </button>
          </div>
        </div>

        <div className="p-6">
          {filteredRepayments.length === 0 ? (
            <div className="py-14 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
              <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Hakuna data za marejesho kwa vichujio ulivyochagua.
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                {repayments.length === 0
                  ? 'Mara tu utakaporekodi malipo ya kwanza ya mteja, grafu ya mapato na ulinganisho wa riba dhidi ya principal zitajichora hapa.'
                  : `Hakuna malipo yaliyopatikana kwa "${loanTypeLabel}" ndani ya "${periodLabel}". Badilisha muda au aina ya mkopo.`}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {repayments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Rejesha Vichujio</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenCollections}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Nenda Kwenye Marejesho &amp; Risiti</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartVariant === 'principal_vs_interest' ? (
                  <BarChart
                    data={timeSeries}
                    margin={{ top: 12, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactAxisTZS}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip content={<PeriodRevenueTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                    <Bar
                      dataKey="principal"
                      name="Principal (Mtaji)"
                      fill="#1d4ed8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="interest"
                      name="Riba (Interest)"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                ) : chartVariant === 'bar_stacked' ? (
                  <BarChart
                    data={timeSeries}
                    margin={{ top: 12, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactAxisTZS}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip content={<PeriodRevenueTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                    <Bar
                      dataKey="principal"
                      name="Principal (Mtaji)"
                      stackId="mapato"
                      fill="#1d4ed8"
                      maxBarSize={44}
                    />
                    <Bar
                      dataKey="interest"
                      name="Riba (Interest)"
                      stackId="mapato"
                      fill="#059669"
                      maxBarSize={44}
                    />
                    <Bar
                      dataKey="penalty"
                      name="Adhabu"
                      stackId="mapato"
                      fill="#d97706"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                ) : (
                  <AreaChart
                    data={timeSeries}
                    margin={{ top: 12, right: 16, left: 8, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="revTotalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0f172a" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="revInterestGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactAxisTZS}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip content={<PeriodRevenueTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Jumla ya Mapato"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                      fill="url(#revTotalGrad)"
                      activeDot={{ r: 5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="principal"
                      name="Principal (Mtaji)"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                    <Area
                      type="monotone"
                      dataKey="interest"
                      name="Riba (Interest)"
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#revInterestGrad)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Secondary Analytics Row: Payment Method Breakdown + Selected Period Receipts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Mapato kwa Njia ya Malipo
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel} · {loanTypeLabel}
            </p>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-between gap-5">
            {filteredRepayments.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Hakuna miamala ya njia za malipo kwa vichujio hivi.
              </div>
            ) : (
              <>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={paymentMethodData}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={formatCompactAxisTZS}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={126}
                        tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<MethodBreakdownTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="total" name="Jumla" radius={[0, 6, 6, 0]} maxBarSize={32}>
                        {paymentMethodData.map((entry) => (
                          <Cell key={entry.method} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2 text-xs">
                  {paymentMethodData.map((item) => (
                    <div key={item.method} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-slate-900">{item.label}</span>
                        <span className="text-slate-500 font-mono-num">
                          · Risiti {item.count}
                        </span>
                      </div>
                      <div className="text-right font-mono-num">
                        <span className="font-semibold text-slate-900">
                          {formatTZS(item.total)}
                        </span>
                        <span className="text-slate-500 ml-2">
                          ({item.sharePct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Receipts Preview for Inspected / Best Bucket */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {activeBucketMeta
                  ? `Risiti za ${activeBucketMeta.fullLabel}`
                  : `Risiti Zilizochujwa (${periodLabel})`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeBucketMeta
                  ? `Miamala ${selectedBucketReceipts.length} · Jumla ${formatTZS(activeBucketMeta.total)}`
                  : 'Chagua safu kwenye jedwali chini kukagua risiti zake'}
              </p>
            </div>
            {selectedBucketKey && (
              <button
                type="button"
                onClick={() => setSelectedBucketKey(null)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Onyesha Kipindi Bora
              </button>
            )}
          </div>

          <div className="flex-1 overflow-x-auto">
            {selectedBucketReceipts.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Hakuna risiti zilizorekodiwa kwenye kipindi hiki.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-2.5 font-semibold">Tarehe &amp; Risiti</th>
                    <th className="text-left px-5 py-2.5 font-semibold">Mteja &amp; Mkopo</th>
                    <th className="text-right px-5 py-2.5 font-semibold">Principal / Riba</th>
                    <th className="text-right px-5 py-2.5 font-semibold">Jumla</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBucketReceipts.slice(0, 8).map((rep) => {
                    const cust = customersById.get(rep.customerId);
                    const loanTypeName = getRepaymentLoanType(rep);
                    return (
                      <tr key={rep.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 whitespace-nowrap">
                          <div className="font-mono-num font-semibold text-slate-900">
                            {rep.receiptNumber}
                          </div>
                          <div className="text-slate-500">{formatDateSW(rep.paymentDate)}</div>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-slate-900">
                            {cust?.fullName || 'Mteja'}
                          </div>
                          <div className="text-slate-500">
                            {loanTypeName} · {getPaymentMethodLabel(rep.paymentMethod)}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono-num whitespace-nowrap">
                          <div className="text-blue-800">{formatTZS(rep.principalPortion)}</div>
                          <div className="text-emerald-700">Riba {formatTZS(rep.interestPortion)}</div>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono-num font-bold text-slate-900 whitespace-nowrap">
                          {formatTZS(rep.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Detailed Ledger Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Jedwali la Mapato: {periodLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {loanTypeLabel} · Bofya safu yoyote kukagua orodha ya risiti zake
            </p>
          </div>
          <div className="text-xs font-mono-num text-slate-600">
            Riba: <strong className="text-emerald-700">{formatTZS(summary.interest)}</strong>{' '}
            <span aria-hidden="true">·</span> Principal:{' '}
            <strong className="text-blue-800">{formatTZS(summary.principal)}</strong>{' '}
            <span aria-hidden="true">·</span> Jumla:{' '}
            <strong className="text-slate-900">{formatTZS(summary.total)}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3">
                  {isDailyGranularity ? 'Tarehe' : 'Mwezi'}
                </th>
                <th className="text-right px-6 py-3">Risiti</th>
                <th className="text-right px-6 py-3">Principal (Mtaji)</th>
                <th className="text-right px-6 py-3">Riba (Interest)</th>
                <th className="text-right px-6 py-3">Adhabu</th>
                <th className="text-right px-6 py-3">Jumla ya Mapato</th>
                <th className="text-right px-6 py-3">Riba / (Riba+Principal)</th>
                <th className="text-right px-6 py-3">Mchango (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeSeries.map((row) => {
                const isSelected = activeBucketMeta?.key === row.key;
                const pi = row.principal + row.interest;
                const ribaPct = pi > 0 ? ((row.interest / pi) * 100).toFixed(1) : '0.0';
                const sharePct =
                  summary.total > 0 ? ((row.total / summary.total) * 100).toFixed(1) : '0.0';
                return (
                  <tr
                    key={row.key}
                    onClick={() => setSelectedBucketKey(row.key)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-6 py-2.5 font-medium text-slate-900">{row.fullLabel}</td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-700">
                      {row.count}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num font-semibold text-blue-800">
                      {formatTZS(row.principal)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num font-semibold text-emerald-700">
                      {formatTZS(row.interest)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-amber-700">
                      {formatTZS(row.penalty)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num font-bold text-slate-900">
                      {formatTZS(row.total)}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-600">
                      {ribaPct}%
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-num text-slate-600">
                      {sharePct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-900 text-white text-xs font-bold">
              <tr>
                <td className="px-6 py-3">JUMLA KUU ({periodLabel})</td>
                <td className="px-6 py-3 text-right font-mono-num">{summary.count}</td>
                <td className="px-6 py-3 text-right font-mono-num text-sky-300">
                  {formatTZS(summary.principal)}
                </td>
                <td className="px-6 py-3 text-right font-mono-num text-emerald-300">
                  {formatTZS(summary.interest)}
                </td>
                <td className="px-6 py-3 text-right font-mono-num text-amber-300">
                  {formatTZS(summary.penalty)}
                </td>
                <td className="px-6 py-3 text-right font-mono-num">
                  {formatTZS(summary.total)}
                </td>
                <td className="px-6 py-3 text-right font-mono-num text-emerald-300">
                  {summary.interestShareOfPI.toFixed(1)}%
                </td>
                <td className="px-6 py-3 text-right font-mono-num">
                  {summary.total > 0 ? '100.0%' : '0.0%'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
