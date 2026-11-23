import React from 'react';
import {
  BarChart3,
  Building2,
  Calculator,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Landmark,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Presentation,
  Receipt,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { AuthSession, ViewTab } from '../types';
import { hasTabAccess } from '../utils/permissions';

interface SidebarProps {
  companyName: string;
  district: string;
  region?: string;
  activeTab: ViewTab;
  session: AuthSession | null;
  pendingApplicationsCount?: number;
  tomorrowRemindersCount?: number;
  onSelectTab: (tab: ViewTab) => void;
  onLock: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: ViewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashibodi', icon: LayoutDashboard },
  { id: 'applications', label: 'Wateja wa Mtandaoni', icon: Globe },
  { id: 'customers', label: 'Wateja & Usajili', icon: Users },
  { id: 'loans', label: 'Mikopo & Adhabu', icon: Landmark },
  { id: 'schedule', label: 'Ratiba ya Marejesho', icon: CalendarClock },
  { id: 'collections', label: 'Marejesho & Risiti', icon: Receipt },
  { id: 'revenue_report', label: 'Ripoti ya Mapato', icon: BarChart3 },
  { id: 'bank_debit', label: 'Makato ya Benki (API)', icon: CreditCard },
  { id: 'slides', label: 'Ripoti za Google Slides', icon: Presentation },
  { id: 'google_forms', label: 'Google Forms', icon: ClipboardList },
  { id: 'messaging', label: 'Ujumbe (WhatsApp)', icon: MessageSquare },
  { id: 'calculator', label: 'Kikokotoo cha Mkopo', icon: Calculator },
  { id: 'contract', label: 'Mkataba wa Mkopo', icon: FileText },
  { id: 'loan_types', label: 'Aina za Mikopo', icon: Layers },
  { id: 'staff', label: 'Wafanyakazi & Ruhusa', icon: UserCog },
  { id: 'company', label: 'Taarifa za Kampuni', icon: Building2 },
];

export const Sidebar: React.FC<SidebarProps> = ({
  companyName,
  district,
  region,
  activeTab,
  session,
  pendingApplicationsCount = 0,
  tomorrowRemindersCount = 0,
  onSelectTab,
  onLock,
  mobileOpen,
  onCloseMobile,
}) => {
  const handleNav = (id: ViewTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => hasTabAccess(session, item.id));

  const navContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 w-64">
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-800">
        <div className="min-w-0">
          <div className="text-base font-bold tracking-tight text-white truncate">
            {companyName || 'MM-MICROFINANCE'}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {district || 'TANDAHIMBA'}-{region || 'MTAA WA AMANI-MTWARA'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Funga menyu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const label =
            item.id === 'applications' && pendingApplicationsCount > 0
              ? `${item.label} (${pendingApplicationsCount})`
              : item.id === 'messaging' && tomorrowRemindersCount > 0
                ? `${item.label} (${tomorrowRemindersCount})`
                : item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 space-y-2.5">
        {session && (
          <div className="px-3 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white truncate">
                {session.fullName}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  session.actorType === 'admin'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                <ShieldCheck className="w-2.5 h-2.5" />
                {session.actorType === 'admin' ? 'ADMIN' : 'STAFF'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {session.roleTitle} · @{session.username}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLock}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-200 bg-red-950/40 hover:bg-red-900/60 hover:text-white transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Ondoka (Log Out)</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 border-r border-slate-800 no-print">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
