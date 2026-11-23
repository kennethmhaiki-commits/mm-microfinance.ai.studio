import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import { StaffAccount, StaffAccountStatus, StaffPermission } from '../types';
import {
  ALL_STAFF_PERMISSIONS,
  PERMISSION_CATALOG,
  STAFF_ROLE_PRESETS,
} from '../utils/permissions';

interface StaffAccountsViewProps {
  staffAccounts: StaffAccount[];
  onCreateStaff: (input: {
    fullName: string;
    phone: string;
    roleTitle: string;
    username: string;
    password: string;
    accountStatus: StaffAccountStatus;
    lockReason: string;
    permissions: StaffPermission[];
  }) => Promise<void>;
  onUpdateStaffCredentials: (params: {
    staff: StaffAccount;
    fullName: string;
    phone: string;
    roleTitle: string;
    username: string;
    newPassword: string;
  }) => Promise<void>;
  onUpdateStaffPermissions: (
    staff: StaffAccount,
    permissions: StaffPermission[],
  ) => Promise<void>;
  onToggleStaffLock: (
    staff: StaffAccount,
    nextStatus: StaffAccountStatus,
    lockReason: string,
  ) => Promise<void>;
  onDeleteStaff: (staffId: string) => Promise<void>;
}

const CATEGORIES: Array<'Msingi & Wateja' | 'Mikopo & Fedha' | 'Ripoti & Mipangilio'> = [
  'Msingi & Wateja',
  'Mikopo & Fedha',
  'Ripoti & Mipangilio',
];

function generateStaffPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
  const arr = new Uint32Array(10);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * chars.length);
    }
  }
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export const StaffAccountsView: React.FC<StaffAccountsViewProps> = ({
  staffAccounts,
  onCreateStaff,
  onUpdateStaffCredentials,
  onUpdateStaffPermissions,
  onToggleStaffLock,
  onDeleteStaff,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create Staff Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('Karani wa Mapokezi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [initialStatus, setInitialStatus] = useState<StaffAccountStatus>('active');
  const [permissions, setPermissions] = useState<StaffPermission[]>(
    STAFF_ROLE_PRESETS[0].permissions,
  );
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdBanner, setCreatedBanner] = useState<{
    fullName: string;
    username: string;
    password: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Modals State
  const [permTarget, setPermTarget] = useState<StaffAccount | null>(null);
  const [editPerms, setEditPerms] = useState<StaffPermission[]>([]);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState('');

  const [credTarget, setCredTarget] = useState<StaffAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRoleTitle, setEditRoleTitle] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditPwd, setShowEditPwd] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState('');

  const [lockTarget, setLockTarget] = useState<StaffAccount | null>(null);
  const [lockReasonInput, setLockReasonInput] = useState('');
  const [lockSaving, setLockSaving] = useState(false);
  const [lockError, setLockError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const summary = useMemo(() => {
    const total = staffAccounts.length;
    const active = staffAccounts.filter((s) => s.accountStatus === 'active').length;
    const locked = staffAccounts.filter((s) => s.accountStatus === 'locked').length;
    return { total, active, locked };
  }, [staffAccounts]);

  const filteredStaff = useMemo(() => {
    return staffAccounts.filter((s) => {
      if (statusFilter !== 'all' && s.accountStatus !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.roleTitle.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
      );
    });
  }, [staffAccounts, statusFilter, searchTerm]);

  const toggleCreatePerm = (key: StaffPermission) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const toggleEditPerm = (key: StaffPermission) => {
    setEditPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const fName = fullName.trim();
    const uName = username.trim();
    const rTitle = roleTitle.trim();

    if (fName.length < 2) {
      setCreateError('Jina kamili la mfanyakazi lazima liwe na angalau herufi 2.');
      return;
    }
    if (!/^[a-zA-Z0-9_.\-]{3,60}$/.test(uName)) {
      setCreateError(
        'Username lazima iwe na herufi/tarakimu 3 hadi 60 bila nafasi (mfano: juma.hassan au juma_01).',
      );
      return;
    }
    if (staffAccounts.some((s) => s.usernameLower === uName.toLowerCase())) {
      setCreateError(`Username "${uName}" tayari inatumika na mfanyakazi mwingine.`);
      return;
    }
    if (password.length < 6) {
      setCreateError('Nenosiri lazima liwe na angalau herufi/tarakimu 6.');
      return;
    }
    if (rTitle.length < 2) {
      setCreateError('Weka cheo au wadhifa wa mfanyakazi (mfano: Afisa Mikopo).');
      return;
    }

    setCreateSaving(true);
    try {
      await onCreateStaff({
        fullName: fName,
        phone: phone.trim(),
        roleTitle: rTitle,
        username: uName,
        password,
        accountStatus: initialStatus,
        lockReason: '',
        permissions,
      });
      setCreatedBanner({ fullName: fName, username: uName, password });
      setFullName('');
      setPhone('');
      setRoleTitle('Karani wa Mapokezi');
      setUsername('');
      setPassword('');
      setInitialStatus('active');
      setPermissions(STAFF_ROLE_PRESETS[0].permissions);
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(formatFirestoreErrorForUser(err));
    } finally {
      setCreateSaving(false);
    }
  };

  const openPermModal = (staff: StaffAccount) => {
    setPermTarget(staff);
    setEditPerms([...staff.permissions]);
    setPermError('');
  };

  const openCredModal = (staff: StaffAccount) => {
    setCredTarget(staff);
    setEditFullName(staff.fullName);
    setEditPhone(staff.phone || '');
    setEditRoleTitle(staff.roleTitle);
    setEditUsername(staff.username);
    setEditNewPassword('');
    setShowEditPwd(false);
    setCredError('');
  };

  const openLockModal = (staff: StaffAccount) => {
    setLockTarget(staff);
    setLockReasonInput(staff.lockReason || '');
    setLockError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Wafanyakazi, Akaunti za Kuingia &amp; Udhibiti wa Ngazi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sajili wafanyakazi, wafungulie username na nenosiri, funga/fungua akaunti zao, na washa au zuia ngazi wanazoweza kufanya
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setCreateError('');
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          <span>{showCreateForm ? 'Funga Fomu' : 'Ongeza Mfanyakazi Mpya'}</span>
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Jumla ya Wafanyakazi
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono-num text-slate-900">
              {summary.total}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Akaunti Zinazofanya Kazi (Active)
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono-num text-emerald-700">
              {summary.active}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Akaunti Zilizofungwa (Locked)
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono-num text-rose-700">
              {summary.locked}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <UserX className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Newly Created Credentials Banner (one-time copy notice) */}
      {createdBanner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-emerald-950">
            <div className="font-bold flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              <span>Akaunti ya {createdBanner.fullName} Imefunguliwa Kikamilifu</span>
            </div>
            <p className="font-mono-num">
              Username: <strong>{createdBanner.username}</strong> · Nenosiri:{' '}
              <strong>{createdBanner.password}</strong>
            </p>
            <p className="text-emerald-800">
              Nakili taarifa hizi na umpe mfanyakazi husika. Nenosiri limehifadhiwa kwa usalama (hashed) na halitaonekana tena baada ya kufunga ujumbe huu.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `Taarifa za Kuingia MM-MICROFINANCE\nJina: ${createdBanner.fullName}\nUsername: ${createdBanner.username}\nPassword: ${createdBanner.password}`,
                  );
                  setCopiedCreds(true);
                  setTimeout(() => setCopiedCreds(false), 2000);
                } catch {
                  // Ignore clipboard restrictions
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
            >
              {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCreds ? 'Imenakiliwa' : 'Nakili Taarifa'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCreatedBanner(null)}
              className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100"
            >
              Funga
            </button>
          </div>
        </div>
      )}

      {/* Create Staff Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Fungua Akaunti Mpya ya Mfanyakazi
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Weka taarifa za kuingia (username &amp; password) kisha washa ngazi ambazo mfanyakazi ataruhusiwa kufanya
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jina Kamili la Mfanyakazi *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mfano: Asha Bakari"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Namba ya Simu
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07... au 06..."
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cheo / Wadhifa *
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Mfano: Afisa Mikopo"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Username ya Kuingia *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Mfano: asha.bakari"
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  Nenosiri (Password) *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(generateStaffPassword());
                    setShowCreatePwd(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Tengeneza Nenosiri
                </button>
              </div>
              <div className="relative">
                <input
                  type={showCreatePwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Angalau herufi 6"
                  className="w-full px-3 py-2 pr-9 text-sm font-mono-num border border-slate-300 rounded-lg"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePwd((v) => !v)}
                  className="absolute inset-y-0 right-0 px-2.5 text-slate-400 hover:text-slate-700"
                  aria-label={showCreatePwd ? 'Ficha' : 'Onyesha'}
                >
                  {showCreatePwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Hali ya Awali ya Akaunti
              </label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as StaffAccountStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="active">Wazi (Active - Anaweza Kuingia)</option>
                <option value="locked">Imefungwa (Locked - Hawezi Kuingia)</option>
              </select>
            </div>
          </div>

          {/* Preset Templates + Permission Matrix */}
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Washa Ngazi Ambazo Mfanyakazi Anaweza Kufanya (Activation Matrix)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ngazi zisizowashwa zitabaki zimefungwa kwa mfanyakazi huyu mpaka utakapozi-activate ({permissions.length} / {ALL_STAFF_PERMISSIONS.length} zimewashwa)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPermissions([...ALL_STAFF_PERMISSIONS])}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                >
                  Washa Zote
                </button>
                <button
                  type="button"
                  onClick={() => setPermissions([])}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200"
                >
                  Zima Zote
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {STAFF_ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setRoleTitle(preset.roleTitle);
                    setPermissions([...preset.permissions]);
                  }}
                  className="text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-400 bg-slate-50/70 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className="text-xs font-bold text-slate-900">{preset.label}</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                    {preset.summary}
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40"
                >
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-800">
                    {category}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {PERMISSION_CATALOG.filter((p) => p.category === category).map((perm) => {
                      const active = permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-start gap-3 p-3 cursor-pointer hover:bg-white transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleCreatePerm(perm.key)}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900">
                                {perm.label}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {active ? 'ACTIVATED' : 'IMEFUNGWA'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                              {perm.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {createError && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {createError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={createSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4" />
              <span>{createSaving ? 'Inahifadhi...' : 'Hifadhi & Fungua Akaunti'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tafuta kwa jina, username, cheo au namba ya simu..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'all' as const, label: `Wote (${summary.total})` },
            { id: 'active' as const, label: `Wazi (${summary.active})` },
            { id: 'locked' as const, label: `Zilizofungwa (${summary.locked})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Staff List */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredStaff.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-700">
              {staffAccounts.length === 0
                ? 'Bado hujasajili mfanyakazi yeyote'
                : 'Hakuna mfanyakazi aliyeonekana kwenye kichujio hiki'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Ongeza wafanyakazi ili uwafungulie username na password zao za kuingia kwenye mfumo huku ukidhibiti ngazi wanazoruhusiwa kufanya.
            </p>
            {staffAccounts.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <UserPlus className="w-4 h-4" />
                <span>Sajili Mfanyakazi wa Kwanza</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Mfanyakazi &amp; Cheo</th>
                  <th className="text-left px-5 py-3">Username</th>
                  <th className="text-left px-5 py-3">Hali ya Akaunti</th>
                  <th className="text-left px-5 py-3">Ngazi Zilizowashwa (Activated)</th>
                  <th className="text-right px-5 py-3">Vitendo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((staff) => {
                  const isLocked = staff.accountStatus === 'locked';
                  return (
                    <tr key={staff.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{staff.fullName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {staff.roleTitle}
                          {staff.phone ? ` · ${staff.phone}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono-num text-xs font-semibold text-slate-800">
                        @{staff.username}
                      </td>
                      <td className="px-5 py-3.5">
                        {isLocked ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                              <Lock className="w-3.5 h-3.5" />
                              Imefungwa (Locked)
                            </span>
                            {staff.lockReason && (
                              <div className="text-[11px] text-rose-600 mt-0.5">
                                {staff.lockReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Wazi (Active)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-xs font-semibold font-mono-num text-slate-900">
                          {staff.permissions.length} / {ALL_STAFF_PERMISSIONS.length} ngazi activated
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">
                          {staff.permissions.length === 0
                            ? 'Hakuna ngazi iliyowashwa bado'
                            : staff.permissions
                                .map(
                                  (k) =>
                                    PERMISSION_CATALOG.find((p) => p.key === k)?.label || k,
                                )
                                .join(' · ')}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPermModal(staff)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 whitespace-nowrap"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Ngazi ({staff.permissions.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openCredModal(staff)}
                            title="Badili Username au Nenosiri"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 whitespace-nowrap"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Nenosiri</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openLockModal(staff)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap ${
                              isLocked
                                ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                : 'text-amber-900 bg-amber-50 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {isLocked ? (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Fungua</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Funga</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError('');
                              setDeleteTarget(staff);
                            }}
                            title="Futa Mfanyakazi"
                            className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal 1: Activate / Limit Staff Levels */}
      {permTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 my-8 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Washa au Zuia Ngazi za Kazi — {permTarget.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  @{permTarget.username} ({permTarget.roleTitle}) · Ngazi{' '}
                  <strong className="font-mono-num text-slate-800">
                    {editPerms.length} / {ALL_STAFF_PERMISSIONS.length}
                  </strong>{' '}
                  zimewashwa (Activated)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {STAFF_ROLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setEditPerms([...preset.permissions])}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200"
                  >
                    {preset.roleTitle}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditPerms([...ALL_STAFF_PERMISSIONS])}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                >
                  Activate Zote
                </button>
                <button
                  type="button"
                  onClick={() => setEditPerms([])}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100"
                >
                  Zuia Zote
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[55vh] overflow-y-auto pr-1">
              {CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40"
                >
                  <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-800">
                    {category}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {PERMISSION_CATALOG.filter((p) => p.category === category).map((perm) => {
                      const active = editPerms.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-white transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleEditPerm(perm.key)}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-semibold text-slate-900">
                                {perm.label}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {active ? 'ON' : 'OFF'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                              {perm.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {permError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {permError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={permSaving}
                onClick={() => setPermTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={permSaving}
                onClick={async () => {
                  setPermError('');
                  setPermSaving(true);
                  try {
                    await onUpdateStaffPermissions(permTarget, editPerms);
                    setPermTarget(null);
                  } catch (err) {
                    setPermError(formatFirestoreErrorForUser(err));
                  } finally {
                    setPermSaving(false);
                  }
                }}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
              >
                {permSaving ? 'Inahifadhi...' : 'Hifadhi Ngazi Zilizowashwa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Profile / Reset Username & Password */}
      {credTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Taarifa, Username &amp; Nenosiri
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hariri maelezo ya {credTarget.fullName} au mfungulie nenosiri jipya
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCredTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jina Kamili *
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Simu
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cheo *
                  </label>
                  <input
                    type="text"
                    value={editRoleTitle}
                    onChange={(e) => setEditRoleTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Username ya Kuingia *
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Nenosiri Jipya (Acha wazi kama hubadili)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditNewPassword(generateStaffPassword());
                      setShowEditPwd(true);
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    Tengeneza Jipya
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPwd ? 'text' : 'password'}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Angalau herufi 6 (si lazima)"
                    className="w-full px-3 py-2 pr-9 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPwd((v) => !v)}
                    className="absolute inset-y-0 right-0 px-2.5 text-slate-400 hover:text-slate-700"
                  >
                    {showEditPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {credError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {credError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={credSaving}
                onClick={() => setCredTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={credSaving}
                onClick={async () => {
                  setCredError('');
                  const uName = editUsername.trim();
                  if (editFullName.trim().length < 2 || editRoleTitle.trim().length < 2) {
                    setCredError('Jina kamili na cheo vinahitajika.');
                    return;
                  }
                  if (!/^[a-zA-Z0-9_.\-]{3,60}$/.test(uName)) {
                    setCredError('Username si sahihi (herufi/tarakimu 3-60 bila nafasi).');
                    return;
                  }
                  if (
                    staffAccounts.some(
                      (s) => s.id !== credTarget.id && s.usernameLower === uName.toLowerCase(),
                    )
                  ) {
                    setCredError(`Username "${uName}" tayari inatumika.`);
                    return;
                  }
                  if (editNewPassword && editNewPassword.length < 6) {
                    setCredError('Nenosiri jipya lazima liwe na angalau herufi 6.');
                    return;
                  }
                  setCredSaving(true);
                  try {
                    await onUpdateStaffCredentials({
                      staff: credTarget,
                      fullName: editFullName.trim(),
                      phone: editPhone.trim(),
                      roleTitle: editRoleTitle.trim(),
                      username: uName,
                      newPassword: editNewPassword,
                    });
                    if (editNewPassword) {
                      setCreatedBanner({
                        fullName: editFullName.trim(),
                        username: uName,
                        password: editNewPassword,
                      });
                    }
                    setCredTarget(null);
                  } catch (err) {
                    setCredError(formatFirestoreErrorForUser(err));
                  } finally {
                    setCredSaving(false);
                  }
                }}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
              >
                {credSaving ? 'Inahifadhi...' : 'Hifadhi Mabadiliko'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Lock / Unlock Staff Account */}
      {lockTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  lockTarget.accountStatus === 'locked'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {lockTarget.accountStatus === 'locked' ? (
                  <Unlock className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lockTarget.accountStatus === 'locked'
                    ? `Fungua Akaunti ya ${lockTarget.fullName}`
                    : `Funga Akaunti ya ${lockTarget.fullName}`}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {lockTarget.accountStatus === 'locked'
                    ? 'Akaunti ikifunguliwa, mfanyakazi ataweza kuingia tena kwenye mfumo kulingana na ngazi ulizomwashia.'
                    : 'Akaunti ikifungwa, mfanyakazi hataweza kuingia kwenye mfumo wala kufanya muamala wowote mpaka utakapoifungua tena.'}
                </p>
              </div>
            </div>

            {lockTarget.accountStatus !== 'locked' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sababu ya Kufunga (Si Lazima)
                </label>
                <input
                  type="text"
                  value={lockReasonInput}
                  onChange={(e) => setLockReasonInput(e.target.value)}
                  placeholder="Mfano: Likizo / Kusimamishwa / Ukaguzi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}

            {lockError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {lockError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={lockSaving}
                onClick={() => setLockTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={lockSaving}
                onClick={async () => {
                  setLockError('');
                  setLockSaving(true);
                  try {
                    const nextStatus: StaffAccountStatus =
                      lockTarget.accountStatus === 'locked' ? 'active' : 'locked';
                    await onToggleStaffLock(
                      lockTarget,
                      nextStatus,
                      nextStatus === 'locked' ? lockReasonInput.trim() : '',
                    );
                    setLockTarget(null);
                  } catch (err) {
                    setLockError(formatFirestoreErrorForUser(err));
                  } finally {
                    setLockSaving(false);
                  }
                }}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-60 ${
                  lockTarget.accountStatus === 'locked'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {lockSaving
                  ? 'Inatekeleza...'
                  : lockTarget.accountStatus === 'locked'
                    ? 'Thibitisha Kufungua Akaunti'
                    : 'Thibitisha Kufunga Akaunti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Delete Staff Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">
              Thibitisha Kufuta Mfanyakazi
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Unakaribia kufuta akaunti ya <strong>{deleteTarget.fullName}</strong> (@{deleteTarget.username}). Hataweza kuingia tena kwenye mfumo.
            </p>
            {deleteError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteSaving}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={deleteSaving}
                onClick={async () => {
                  setDeleteError('');
                  setDeleteSaving(true);
                  try {
                    await onDeleteStaff(deleteTarget.id);
                    setDeleteTarget(null);
                  } catch (err) {
                    setDeleteError(formatFirestoreErrorForUser(err));
                  } finally {
                    setDeleteSaving(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deleteSaving ? 'Inafuta...' : 'Futa Akaunti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
