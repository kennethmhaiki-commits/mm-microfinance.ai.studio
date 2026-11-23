import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellRing,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Landmark,
  Mail,
  Receipt,
  Send,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AuthSession, CompanySettings, Customer, DailyTask, Loan, Repayment, StaffAccount, TomorrowReminderItem, ViewTab } from '../types';
import { hasPermission } from '../utils/permissions';
import {
  buildTomorrowReminderMessage,
  formatDateSW,
  formatTZS,
  getLoanInstallmentsWithStatus,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  getPeriodBounds,
  isDateInRange,
  OFFICIAL_DOMAIN,
  todayISO,
  tomorrowISO,
} from '../utils/finance';
import { buildMailtoHref, PushPermissionState } from '../services/notifications';
import { DashboardTaskInput, DashboardTasksSection } from './DashboardTasksSection';
import { MonthlyFirestoreSummarySection } from './MonthlyFirestoreSummarySection';
import { RevenueBarChart } from './RevenueBarChart';

interface DashboardViewProps {
  customers: Customer[];
  loans: Loan[];
  repayments: Repayment[];
  company: CompanySettings;
  tomorrowReminders: TomorrowReminderItem[];
  autoPushEnabled: boolean;
  autoSmsEnabled: boolean;
  pushPermission: PushPermissionState;
  onRequestPushPermission: () => Promise<void>;
  onToggleAutoPush: (enabled: boolean) => void;
  onToggleAutoSms: (enabled: boolean) => void;
  onSendSmsReminder: (item: TomorrowReminderItem) => Promise<void>;
  onSendAllSmsReminders: () => Promise<void>;
  onSendPushReminder: (item: TomorrowReminderItem) => Promise<void>;
  onSendAllPushReminders: () => Promise<void>;
  onLogEmailReminder: (item: TomorrowReminderItem) => Promise<void>;
  onNavigate: (tab: ViewTab) => void;
  onOpenRepay: (loan: Loan) => void;
  onSelectCustomerForMessage: (customerId: string) => void;
  cloudUserUid: string | null;
  onConnectCloud: () => Promise<void>;
  session?: AuthSession | null;
  tasks?: DailyTask[];
  staffAccounts?: StaffAccount[];
  onCreateTask?: (input: DashboardTaskInput) => Promise<void>;
  onUpdateTask?: (task: DailyTask, updates: DashboardTaskInput) => Promise<void>;
  onToggleTaskComplete?: (task: DailyTask) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  customers,
  loans,
  repayments,
  company,
  tomorrowReminders,
  autoPushEnabled,
  autoSmsEnabled,
  pushPermission,
  onRequestPushPermission,
  onToggleAutoPush,
  onToggleAutoSms,
  onSendSmsReminder,
  onSendAllSmsReminders,
  onSendPushReminder,
  onSendAllPushReminders,
  onLogEmailReminder,
  onNavigate,
  onOpenRepay,
  onSelectCustomerForMessage,
  cloudUserUid,
  onConnectCloud,
  session = null,
  tasks = [],
  staffAccounts = [],
  onCreateTask,
  onUpdateTask,
  onToggleTaskComplete,
  onDeleteTask,
}) => {
  const canSendMessages = !session || hasPermission(session, 'send_messages');
  const today = todayISO();
  const tomorrow = tomorrowISO(today);
  const bounds = useMemo(() => getPeriodBounds(today), [today]);

  const metrics = useMemo(() => {
    const totalDisbursed = loans.reduce((acc, l) => acc + l.principal, 0);
    const totalExpected = loans.reduce((acc, l) => acc + l.totalDue, 0);
    const totalCollected = loans.reduce((acc, l) => acc + getLoanPaidTotal(l), 0);
    const totalOutstanding = loans.reduce((acc, l) => acc + getLoanRemainingBalance(l), 0);
    const activeLoansCount = loans.filter((l) => l.status !== 'completed').length;
    const completedLoansCount = loans.filter((l) => l.status === 'completed').length;
    const overdueLoansCount = loans.filter(
      (l) => l.status === 'overdue' || (l.status !== 'completed' && l.endDate < today),
    ).length;
    const activeCustomerIds = new Set(
      loans
        .filter((l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0)
        .map((l) => l.customerId),
    );
    const activeCustomersCount = activeCustomerIds.size;

    const sumRange = (start: string, end: string) => {
      const items = repayments.filter((r) => isDateInRange(r.paymentDate, start, end));
      return {
        count: items.length,
        total: items.reduce((s, r) => s + r.amount, 0),
        principal: items.reduce((s, r) => s + r.principalPortion, 0),
        interest: items.reduce((s, r) => s + r.interestPortion, 0),
        penalty: items.reduce((s, r) => s + r.penaltyPortion, 0),
      };
    };

    const sumAll = {
      count: repayments.length,
      total: repayments.reduce((s, r) => s + r.amount, 0),
      principal: repayments.reduce((s, r) => s + r.principalPortion, 0),
      interest: repayments.reduce((s, r) => s + r.interestPortion, 0),
      penalty: repayments.reduce((s, r) => s + r.penaltyPortion, 0),
    };

    return {
      totalDisbursed,
      totalExpected,
      totalCollected,
      totalOutstanding,
      activeLoansCount,
      completedLoansCount,
      overdueLoansCount,
      activeCustomersCount,
      day: sumRange(bounds.dayStart, bounds.dayEnd),
      week: sumRange(bounds.weekStart, bounds.weekEnd),
      month: sumRange(bounds.monthStart, bounds.monthEnd),
      year: sumRange(bounds.yearStart, bounds.yearEnd),
      all: sumAll,
    };
  }, [loans, repayments, bounds, today]);

  const dueThisWeek = useMemo(() => {
    const rows: {
      loan: Loan;
      customer: Customer | undefined;
      dueDate: string;
      remainingAmount: number;
      principalDue: number;
      interestDue: number;
      state: string;
    }[] = [];

    for (const loan of loans) {
      if (loan.status === 'completed') continue;
      const cust = customers.find((c) => c.id === loan.customerId);
      const installments = getLoanInstallmentsWithStatus(loan);
      for (const inst of installments) {
        if (
          inst.remainingAmount > 0 &&
          (isDateInRange(inst.dueDate, bounds.weekStart, bounds.weekEnd) ||
            inst.dueDate < bounds.weekStart)
        ) {
          rows.push({
            loan,
            customer: cust,
            dueDate: inst.dueDate,
            remainingAmount: inst.remainingAmount,
            principalDue: inst.principalDue,
            interestDue: inst.interestDue,
            state: inst.dueDate < today ? 'Imechelewa' : 'Inatakiwa Wiki Hii',
          });
          break; // Next due installment for this loan
        }
      }
    }
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [loans, customers, bounds, today]);

  const collectionRatePct =
    metrics.totalExpected > 0
      ? Math.min(100, Math.round((metrics.totalCollected / metrics.totalExpected) * 100))
      : 0;

  const monthProfit = metrics.month.interest + metrics.month.penalty;

  return (
    <div className="space-y-8">
      {/* Top Executive Summary Cards */}
      <section aria-label="Muhtasari wa Haraka wa Biashara">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('loans')}
            className="group text-left bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Jumla ya Mikopo
                </div>
                <div className="mt-2 text-3xl font-bold font-mono-num text-slate-900">
                  {loans.length}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                <Landmark className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-mono-num">
                {metrics.activeLoansCount} inayoendelea · {metrics.completedLoansCount} imekamilika
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('customers')}
            className="group text-left bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-5 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Wateja Hai
                </div>
                <div className="mt-2 text-3xl font-bold font-mono-num text-slate-900">
                  {metrics.activeCustomersCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600 transition-colors">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-mono-num">
                Kati ya wateja {customers.length} waliosajiliwa
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0 transition-colors" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('revenue_report')}
            className="group text-left bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl p-5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Mapato ya Mwezi Huu
                </div>
                <div className="mt-2 text-3xl font-bold font-mono-num text-emerald-700">
                  {formatTZS(metrics.month.total)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-mono-num">
                Faida {formatTZS(monthProfit)} · Risiti {metrics.month.count}
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 shrink-0 transition-colors" />
            </div>
          </button>
        </div>
      </section>

      {/* Hero Portfolio Overview */}
      <section className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-900 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-semibold tracking-wide uppercase text-emerald-300">
              {company.companyName} · {OFFICIAL_DOMAIN}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Muhtasari wa Mzunguko wa Mikopo na Makusanyo
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/85">
              Kiwango cha marejesho yaliyokusanywa:{' '}
              <strong className="font-mono-num text-white">{collectionRatePct}%</strong> ({formatTZS(metrics.totalCollected)} kati ya {formatTZS(metrics.totalExpected)})
            </p>
            <div className="w-full max-w-md h-2 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${collectionRatePct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>Sajili Mteja &amp; Mkopo</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('collections')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors whitespace-nowrap"
            >
              <Receipt className="w-4 h-4" />
              <span>Pokea Marejesho</span>
            </button>
          </div>
        </div>
      </section>

      {/* Portfolio Financial Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('loans')}
          className="text-left bg-gradient-to-br from-white to-sky-50/80 border border-sky-200/80 hover:border-sky-400 rounded-xl p-5 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold text-sky-900">Jumla ya Mtaji Uliotolewa</div>
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-slate-900">
            {formatTZS(metrics.totalDisbursed)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono-num">
            Wateja {customers.length} · Mikopo {loans.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('collections')}
          className="text-left bg-gradient-to-br from-white to-emerald-50/80 border border-emerald-200/80 hover:border-emerald-400 rounded-xl p-5 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold text-emerald-900">Marejesho Yaliyokusanywa</div>
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-emerald-700">
            {formatTZS(metrics.totalCollected)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono-num">
            Kati ya {formatTZS(metrics.totalExpected)} inayotarajiwa
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('loans')}
          className="text-left bg-gradient-to-br from-white to-amber-50/75 border border-amber-200/80 hover:border-amber-400 rounded-xl p-5 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold text-amber-900">Salio Linalodaiwa Nje</div>
            <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-slate-900">
            {formatTZS(metrics.totalOutstanding)}
          </div>
          <div className="mt-2 text-xs text-slate-600 font-mono-num">
            Mikopo inayoendelea: {metrics.activeLoansCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('loans')}
          className="text-left bg-gradient-to-br from-white to-rose-50/80 border border-rose-200/80 hover:border-rose-400 rounded-xl p-5 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold text-rose-900">Mikopo Iliyochelewa</div>
            <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-bold font-mono-num text-rose-700">
            {metrics.overdueLoansCount}
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Inahitaji ufuatiliaji au adhabu
          </div>
        </button>
      </div>

      {/* Tasks / Todo za Kila Siku (Wasimamizi & Wafanyakazi) */}
      {onCreateTask && onUpdateTask && onToggleTaskComplete && onDeleteTask && (
        <DashboardTasksSection
          tasks={tasks}
          customers={customers}
          staffAccounts={staffAccounts}
          session={session}
          onCreateTask={onCreateTask}
          onUpdateTask={onUpdateTask}
          onToggleTaskComplete={onToggleTaskComplete}
          onDeleteTask={onDeleteTask}
          onSelectCustomerForMessage={onSelectCustomerForMessage}
        />
      )}

      {/* Muhtasari wa Mwezi Husika kutoka Firestore (Mtaji Uliokopeshwa, Riba, na Adhabu) */}
      <MonthlyFirestoreSummarySection
        cloudUserUid={cloudUserUid}
        loans={loans}
        repayments={repayments}
        onConnectCloud={onConnectCloud}
      />

      {/* Mtaji na Faida Iliyopatikana: Wiki, Mwezi Wote, na Jumla */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-sky-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-sky-950">
              Makusanyo ya Wiki Hii
            </h3>
            <Clock3 className="w-4 h-4 text-sky-700" />
          </div>
          <div className="p-5 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Mtaji Uliokusanywa</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatTZS(metrics.week.principal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Faida Iliyopatikana (Riba + Adhabu)</span>
              <span className="font-mono-num font-bold text-emerald-700">
                {formatTZS(metrics.week.interest + metrics.week.penalty)}
              </span>
            </div>
            <div className="pt-2.5 border-t border-slate-100 flex justify-between text-sm font-bold">
              <span className="text-slate-900">Jumla ya Wiki</span>
              <span className="font-mono-num text-sky-800">
                {formatTZS(metrics.week.total)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-950">
              Makusanyo ya Mwezi Wote
            </h3>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="p-5 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Mtaji Uliokusanywa</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatTZS(metrics.month.principal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Faida Iliyopatikana (Riba + Adhabu)</span>
              <span className="font-mono-num font-bold text-emerald-700">
                {formatTZS(metrics.month.interest + metrics.month.penalty)}
              </span>
            </div>
            <div className="pt-2.5 border-t border-slate-100 flex justify-between text-sm font-bold">
              <span className="text-slate-900">Jumla ya Mwezi</span>
              <span className="font-mono-num text-emerald-800">
                {formatTZS(metrics.month.total)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Jumla ya Makusanyo Yote
            </h3>
            <span className="text-xs text-emerald-300 font-medium">Muda Wote</span>
          </div>
          <div className="p-5 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Mtaji Wote Uliorejeshwa</span>
              <span className="font-mono-num font-semibold text-white">
                {formatTZS(metrics.all.principal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Faida Yote Iliyopatikana</span>
              <span className="font-mono-num font-bold text-emerald-400">
                {formatTZS(metrics.all.interest + metrics.all.penalty)}
              </span>
            </div>
            <div className="pt-2.5 border-t border-slate-700 flex justify-between text-sm font-bold">
              <span className="text-white">Jumla Kuu</span>
              <span className="font-mono-num text-emerald-300">
                {formatTZS(metrics.all.total)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Ripoti ya Kina ya Mapato (Kila Mwezi & Mwaka) kwa Chati ya Pau */}
      <RevenueBarChart
        repayments={repayments}
        onOpenQuickRecord={() => onNavigate('collections')}
      />

      {/* Period Collections Breakdown: Siku / Wiki / Mwezi / Mwaka */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Muhtasari wa Marejesho Yaliyokusanywa (Mtaji &amp; Faida)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mgawanyo wa Mtaji na Faida iliyopatikana kwa Siku, Wiki, Mwezi, na Mwaka
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('revenue_report')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
          >
            <span>Fungua Ripoti ya Mapato</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3">Kipindi</th>
                <th className="text-right px-6 py-3">Idadi ya Risiti</th>
                <th className="text-right px-6 py-3">Mtaji Uliokusanywa</th>
                <th className="text-right px-6 py-3">Riba</th>
                <th className="text-right px-6 py-3">Adhabu</th>
                <th className="text-right px-6 py-3">Faida Iliyopatikana</th>
                <th className="text-right px-6 py-3">Jumla Iliyokusanywa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { label: `Leo (${formatDateSW(today)})`, data: metrics.day },
                {
                  label: `Wiki Hii (${formatDateSW(bounds.weekStart)} - ${formatDateSW(bounds.weekEnd)})`,
                  data: metrics.week,
                },
                {
                  label: `Mwezi Huu (${formatDateSW(bounds.monthStart)} - ${formatDateSW(bounds.monthEnd)})`,
                  data: metrics.month,
                },
                { label: `Mwaka Huu (${today.slice(0, 4)})`, data: metrics.year },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{row.label}</td>
                  <td className="px-6 py-3 text-right font-mono-num text-slate-700">
                    {row.data.count}
                  </td>
                  <td className="px-6 py-3 text-right font-mono-num text-slate-900">
                    {formatTZS(row.data.principal)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono-num text-slate-700">
                    {formatTZS(row.data.interest)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono-num text-amber-700">
                    {formatTZS(row.data.penalty)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono-num font-semibold text-emerald-700">
                    {formatTZS(row.data.interest + row.data.penalty)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono-num font-bold text-slate-900">
                    {formatTZS(row.data.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Arifa za Kiotomatiki (Masaa 24 / Siku 1 Kabla ya Rejesho - Kesho) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Arifa &amp; SMS za Kiotomatiki — Masaa 24 Kabla ({formatDateSW(tomorrow)})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Wateja {tomorrowReminders.length} wana marejesho kesho · SMS Kiotomatiki (Masaa 24 Kabla):{' '}
              <span className={`font-semibold ${autoSmsEnabled ? 'text-emerald-700' : 'text-slate-600'}`}>
                {autoSmsEnabled ? 'Imewashwa' : 'Imezimwa'}
              </span>{' '}
              · Push Kiotomatiki:{' '}
              <span className="font-semibold text-slate-700">
                {pushPermission === 'granted' && autoPushEnabled
                  ? 'Imewashwa'
                  : pushPermission === 'denied'
                    ? 'Imezuiwa kwenye Kivinjari'
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
                  disabled={!canSendMessages}
                  onClick={() => void onSendAllSmsReminders()}
                  title={canSendMessages ? 'Tuma SMS kwa wote' : 'Ngazi ya kutuma ujumbe haijawa activated kwako'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Tuma SMS kwa Wote ({tomorrowReminders.length})</span>
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
          <div className="px-6 py-6 text-xs text-slate-500">
            Hakuna mteja mwenye tarehe ya rejesho kesho ({formatDateSW(tomorrow)}). Mfumo hutuma SMS za ukumbusho kiotomatiki masaa 24 kabla ya tarehe ya rejesho kwenda namba zilizohifadhiwa kwenye wasifu wa wateja.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Mteja &amp; Namba ya Wasifu</th>
                  <th className="text-left px-5 py-3">Mkopo &amp; Awamu</th>
                  <th className="text-right px-5 py-3">Rejesho la Kesho</th>
                  <th className="text-right px-5 py-3">Salio Lote</th>
                  <th className="text-left px-5 py-3">Hali ya SMS &amp; Arifa Leo</th>
                  <th className="text-right px-5 py-3">Tuma Arifa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tomorrowReminders.map((item) => {
                  const msgBody = buildTomorrowReminderMessage(
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
                        msgBody,
                      )
                    : '';
                  const sentChannels = [
                    item.alreadySmsedToday ? 'SMS' : '',
                    item.alreadyPushedToday ? 'Push' : '',
                    item.alreadyEmailedToday ? 'Email' : '',
                  ].filter(Boolean);

                  return (
                    <tr key={`${item.loan.id}_${item.periodNumber}`} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900">
                          {item.customer.fullName}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-num">
                          {item.customer.phone}
                          {!item.hasValidSmsPhone ? ' · Namba si sahihi' : ''}
                          {item.customer.email ? ` · ${item.customer.email}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700">
                        <div>{item.loan.loanTypeName}</div>
                        <div className="text-slate-500">Awamu #{item.periodNumber}</div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-bold text-slate-900">
                        {formatTZS(item.installmentRemaining)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num text-slate-700">
                        {formatTZS(item.totalOwed)}
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {!item.hasValidSmsPhone ? (
                          <span className="font-medium text-red-700">Namba ya simu haifai</span>
                        ) : sentChannels.length > 0 ? (
                          <span className="font-semibold text-emerald-700">
                            Imetumwa ({sentChannels.join(' & ')})
                          </span>
                        ) : (
                          <span className="font-medium text-amber-700">Inasubiri SMS / Arifa</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!item.hasValidSmsPhone || !canSendMessages}
                            onClick={() => void onSendSmsReminder(item)}
                            title={!canSendMessages ? 'Ngazi ya kutuma ujumbe haijawa activated kwako' : undefined}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            <span>{item.alreadySmsedToday ? 'SMS Tena' : 'SMS'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void onSendPushReminder(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 whitespace-nowrap"
                          >
                            <Bell className="w-3 h-3" />
                            <span>Push</span>
                          </button>

                          {item.customer.email ? (
                            <a
                              href={mailHref}
                              onClick={() => void onLogEmailReminder(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 whitespace-nowrap"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Email</span>
                            </a>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => onSelectCustomerForMessage(item.customer.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                          >
                            WhatsApp
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

      {/* Due This Week + Quick Shortcuts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Wateja Wanaopaswa Kulipa Wiki Hii
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Marejesho yanayoiva ndani ya wiki hii au yaliyochelewa
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              Ratiba Yote
            </button>
          </div>

          {dueThisWeek.length === 0 ? (
            <div className="p-8 text-center">
              <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                Hakuna marejesho yanayosubiri kwa wiki hii.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sajili mteja na mkopo mpya ili kuona ratiba ya makato hapa.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('customers')}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                Sajili Mteja & Mkopo
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3">Mteja</th>
                    <th className="text-left px-5 py-3">Tarehe ya Rejesho</th>
                    <th className="text-right px-5 py-3">Kiasi Kinachohitajika</th>
                    <th className="text-left px-5 py-3">Hali</th>
                    <th className="text-right px-5 py-3">Hatua</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dueThisWeek.slice(0, 8).map((row) => (
                    <tr key={`${row.loan.id}_${row.dueDate}`} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">
                          {row.customer?.fullName || 'Mteja'}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-num">
                          {row.customer?.phone}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700 whitespace-nowrap">
                        {formatDateSW(row.dueDate)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-semibold text-slate-900">
                        {formatTZS(row.remainingAmount)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            row.state === 'Imechelewa'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {row.state}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenRepay(row.loan)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Pokea
                          </button>
                          {row.customer && (
                            <button
                              type="button"
                              onClick={() => onSelectCustomerForMessage(row.customer!.id)}
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

        {/* Quick Operational Actions */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Njia za Haraka za Kazi
          </h2>
          <p className="text-xs text-slate-500">
            Chagua huduma ya kufanya moja kwa moja
          </p>

          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border border-emerald-200/70 bg-emerald-50/40 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Sajili Mteja &amp; Weka Mkopo
                </div>
                <div className="text-xs text-slate-600">
                  Weka taarifa, riba na makato ya wiki/mwezi
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('collections')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border border-sky-200/70 bg-sky-50/40 rounded-lg hover:bg-sky-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Risiti &amp; Marejesho
                </div>
                <div className="text-xs text-slate-600">
                  Cash, Benki au Mitandao ya Simu
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('contract')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border border-amber-200/70 bg-amber-50/40 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Andaa Mkataba wa Mkopo
                </div>
                <div className="text-xs text-slate-600">
                  Mkataba rasmi wenye kipengele cha adhabu
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('calculator')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border border-teal-200/70 bg-teal-50/40 rounded-lg hover:bg-teal-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Kikokotoo cha Mkopo
                </div>
                <div className="text-xs text-slate-600">
                  Kadiria riba, makato na tarehe ya mwisho
                </div>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
