import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Landmark,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import {
  AuthSession,
  Customer,
  DailyTask,
  StaffAccount,
  TaskCategory,
  TaskPriority,
} from '../types';
import { formatDateSW, todayISO, tomorrowISO } from '../utils/finance';

export interface DashboardTaskInput {
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string;
  priority: TaskPriority;
  category: TaskCategory;
  customerId: string;
  customerName: string;
  assignedToUsername: string;
  assignedToName: string;
}

interface DashboardTasksSectionProps {
  tasks: DailyTask[];
  customers: Customer[];
  staffAccounts: StaffAccount[];
  session: AuthSession | null;
  onCreateTask: (input: DashboardTaskInput) => Promise<void>;
  onUpdateTask: (task: DailyTask, updates: DashboardTaskInput) => Promise<void>;
  onToggleTaskComplete: (task: DailyTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onSelectCustomerForMessage?: (customerId: string) => void;
}

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  customer_call: 'Piga Simu Mteja',
  report: 'Andaa Ripoti',
  collection: 'Fuatilia Rejesho',
  general: 'Kazi ya Kawaida',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Haraka (Juu)',
  medium: 'Kawaida (Kati)',
  low: 'Chini',
};

function getPriorityStyle(priority: TaskPriority, completed: boolean): string {
  if (completed) return 'text-slate-500 bg-slate-100 border-slate-200';
  if (priority === 'high') return 'text-rose-800 bg-rose-50 border-rose-200';
  if (priority === 'medium') return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-slate-700 bg-slate-100 border-slate-200';
}

function getCategoryIcon(category: TaskCategory) {
  if (category === 'customer_call') return Phone;
  if (category === 'report') return FileText;
  if (category === 'collection') return Landmark;
  return ClipboardCheck;
}

export const DashboardTasksSection: React.FC<DashboardTasksSectionProps> = ({
  tasks,
  customers,
  staffAccounts,
  session,
  onCreateTask,
  onUpdateTask,
  onToggleTaskComplete,
  onDeleteTask,
  onSelectCustomerForMessage,
}) => {
  const today = todayISO();
  const tomorrow = tomorrowISO(today);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [filterTab, setFilterTab] = useState<'pending' | 'today' | 'completed' | 'all'>('pending');
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('customer_call');
  const [customerId, setCustomerId] = useState('');
  const [assignedToUsername, setAssignedToUsername] = useState(
    session?.username || '',
  );
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const assigneeOptions = useMemo(() => {
    const opts: { username: string; label: string }[] = [
      { username: '', label: 'Timu Yote (Wote Wanaona)' },
    ];
    if (session?.username) {
      opts.push({
        username: session.username,
        label: `Mimi (${session.fullName})`,
      });
    }
    for (const st of staffAccounts) {
      if (st.username === session?.username) continue;
      opts.push({
        username: st.username,
        label: `${st.fullName} (${st.roleTitle})`,
      });
    }
    return opts;
  }, [session, staffAccounts]);

  const counts = useMemo(() => {
    let pending = 0;
    let todayPending = 0;
    let overdue = 0;
    let completed = 0;
    for (const t of tasks) {
      if (t.completed) {
        completed += 1;
      } else {
        pending += 1;
        if (t.dueDate === today) todayPending += 1;
        if (t.dueDate < today) overdue += 1;
      }
    }
    return { pending, todayPending, overdue, completed, total: tasks.length };
  }, [tasks, today]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

    return tasks
      .filter((t) => {
        if (filterTab === 'pending' && t.completed) return false;
        if (filterTab === 'today' && t.dueDate !== today) return false;
        if (filterTab === 'completed' && !t.completed) return false;
        if (onlyMine && session?.username) {
          const matchesAssignee =
            !t.assignedToUsername || t.assignedToUsername === session.username;
          const matchesCreator = t.createdByUsername === session.username;
          if (!matchesAssignee && !matchesCreator) return false;
        }
        if (q) {
          const hay = [
            t.title,
            t.notes || '',
            t.customerName || '',
            t.assignedToName || '',
            t.createdByName,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.priority !== b.priority) {
          return priorityRank[a.priority] - priorityRank[b.priority];
        }
        return (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
      });
  }, [tasks, filterTab, today, onlyMine, session?.username, searchQuery]);

  const resetForm = () => {
    setEditingTask(null);
    setTitle('');
    setNotes('');
    setDueDate(today);
    setDueTime('');
    setPriority('medium');
    setCategory('customer_call');
    setCustomerId('');
    setAssignedToUsername(session?.username || '');
    setErrorMsg('');
  };

  const openAddForm = (preset?: { category: TaskCategory; titleHint: string; priority?: TaskPriority }) => {
    resetForm();
    if (preset) {
      setCategory(preset.category);
      setTitle(preset.titleHint);
      if (preset.priority) setPriority(preset.priority);
    }
    setShowForm(true);
  };

  const openEditForm = (task: DailyTask) => {
    setEditingTask(task);
    setTitle(task.title);
    setNotes(task.notes || '');
    setDueDate(task.dueDate || today);
    setDueTime(task.dueTime || '');
    setPriority(task.priority);
    setCategory(task.category);
    setCustomerId(task.customerId || '');
    setAssignedToUsername(task.assignedToUsername || '');
    setErrorMsg('');
    setShowForm(true);
  };

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);
    if (nextCustomerId && !title.trim()) {
      const cust = customers.find((c) => c.id === nextCustomerId);
      if (cust) {
        setTitle(`Piga simu kwa ${cust.fullName} (${cust.phone})`);
        setCategory('customer_call');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (title.trim().length < 2) {
      setErrorMsg('Tafadhali andika kichwa cha kazi (angalau herufi 2).');
      return;
    }

    const matchedCustomer = customerId ? customers.find((c) => c.id === customerId) : undefined;
    const matchedAssignee = assigneeOptions.find((a) => a.username === assignedToUsername);
    const assignedName =
      assignedToUsername && matchedAssignee
        ? assignedToUsername === session?.username
          ? session.fullName
          : staffAccounts.find((s) => s.username === assignedToUsername)?.fullName ||
            matchedAssignee.label
        : 'Timu Yote';

    const payload: DashboardTaskInput = {
      title: title.trim(),
      notes: notes.trim(),
      dueDate: dueDate || today,
      dueTime: dueTime.trim(),
      priority,
      category,
      customerId: matchedCustomer?.id || '',
      customerName: matchedCustomer?.fullName || '',
      assignedToUsername: assignedToUsername.trim(),
      assignedToName: assignedToUsername ? assignedName : 'Timu Yote',
    };

    setSaving(true);
    try {
      if (editingTask) {
        await onUpdateTask(editingTask, payload);
      } else {
        await onCreateTask(payload);
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setErrorMsg(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (task: DailyTask) => {
    setBusyTaskId(task.id);
    setErrorMsg('');
    try {
      await onToggleTaskComplete(task);
    } catch (err) {
      setErrorMsg(formatFirestoreErrorForUser(err));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    setBusyTaskId(taskId);
    setErrorMsg('');
    try {
      await onDeleteTask(taskId);
      if (editingTask?.id === taskId) {
        resetForm();
        setShowForm(false);
      }
    } catch (err) {
      setErrorMsg(formatFirestoreErrorForUser(err));
    } finally {
      setBusyTaskId(null);
    }
  };

  const formatDueLabel = (dateStr: string) => {
    if (dateStr === today) return 'Leo';
    if (dateStr === tomorrow) return 'Kesho';
    return formatDateSW(dateStr);
  };

  return (
    <section
      aria-label="Kazi na Vikumbusho vya Kila Siku"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              Kazi &amp; Vikumbusho vya Kila Siku (Tasks / Todo)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zinazosubiri:{' '}
            <strong className="font-mono-num text-slate-800">{counts.pending}</strong> · Za Leo:{' '}
            <strong className="font-mono-num text-emerald-700">{counts.todayPending}</strong>
            {counts.overdue > 0 && (
              <>
                {' '}
                · Zilizopita Muda:{' '}
                <strong className="font-mono-num text-rose-700">{counts.overdue}</strong>
              </>
            )}{' '}
            · Zimekamilika:{' '}
            <strong className="font-mono-num text-slate-600">{counts.completed}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (showForm && !editingTask) {
                setShowForm(false);
              } else {
                openAddForm();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {showForm && !editingTask ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>Funga Fomu</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Ongeza Kazi / Kikumbusho</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Starter Shortcuts */}
      {!showForm && (
        <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium mr-1">Haraka:</span>
          <button
            type="button"
            onClick={() =>
              openAddForm({
                category: 'customer_call',
                titleHint: 'Piga simu kwa mteja ',
                priority: 'high',
              })
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 hover:border-emerald-400 hover:text-emerald-800"
          >
            <Phone className="w-3 h-3 text-emerald-600" />
            <span>Piga Simu Mteja</span>
          </button>
          <button
            type="button"
            onClick={() =>
              openAddForm({
                category: 'report',
                titleHint: 'Andaa ripoti ya mapato na makusanyo',
                priority: 'medium',
              })
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 hover:border-sky-400 hover:text-sky-800"
          >
            <FileText className="w-3 h-3 text-sky-600" />
            <span>Andaa Ripoti</span>
          </button>
          <button
            type="button"
            onClick={() =>
              openAddForm({
                category: 'collection',
                titleHint: 'Fuatilia rejesho la mkopo',
                priority: 'high',
              })
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 hover:border-amber-400 hover:text-amber-800"
          >
            <Landmark className="w-3 h-3 text-amber-600" />
            <span>Fuatilia Rejesho</span>
          </button>
        </div>
      )}

      {/* Add / Edit Task Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="px-6 py-5 bg-slate-50 border-b border-slate-200 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {editingTask ? 'Hariri Kazi / Kikumbusho' : 'Weka Kikumbusho Kipya cha Kazi'}
            </h3>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
              aria-label="Funga fomu ya kazi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kazi / Kikumbusho *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mfano: Piga simu kwa Juma Hassan au Andaa ripoti ya wiki"
                maxLength={160}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Aina ya Kazi
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="customer_call">Piga Simu Mteja</option>
                <option value="report">Andaa Ripoti</option>
                <option value="collection">Fuatilia Rejesho</option>
                <option value="general">Kazi ya Kawaida</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kipaumbele
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="high">Haraka (Juu)</option>
                <option value="medium">Kawaida (Kati)</option>
                <option value="low">Chini</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tarehe ya Kufanya *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Saa ya Kikumbusho (Hiari)
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mteja Husika (Hiari)
              </label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">-- Hakuna mteja mahsusi --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mhusika / Mkabidhiwa
              </label>
              <select
                value={assignedToUsername}
                onChange={(e) => setAssignedToUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {assigneeOptions.map((opt) => (
                  <option key={opt.username || 'all'} value={opt.username}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Maelezo ya Ziada (Hiari)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={400}
                placeholder="Mfano: Kumbusha kulipa awamu ya 2 kabla ya saa 10 jioni"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving
                ? 'Inahifadhi...'
                : editingTask
                  ? 'Hifadhi Mabadiliko'
                  : 'Hifadhi Kazi'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'pending' as const, label: `Zinazosubiri (${counts.pending})` },
              { id: 'today' as const, label: `Za Leo (${counts.todayPending})` },
              { id: 'completed' as const, label: `Zilizokamilika (${counts.completed})` },
              { id: 'all' as const, label: `Zote (${counts.total})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {session?.username && (
            <button
              type="button"
              onClick={() => setOnlyMine((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                onlyMine
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {onlyMine ? 'Kazi Zangu Tu' : 'Kazi za Timu Yote'}
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tafuta kazi, mteja au mhusika..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {!showForm && errorMsg && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Task Items */}
      {filteredTasks.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {filterTab === 'completed'
              ? 'Bado hakuna kazi zilizokamilika.'
              : filterTab === 'today'
                ? 'Hakuna kazi zilizopangwa kwa leo.'
                : 'Hakuna kazi zinazosubiri kwenye orodha hii.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Bonyeza &ldquo;Ongeza Kazi / Kikumbusho&rdquo; kupanga majukumu ya kupiga simu wateja au kuandaa ripoti.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filteredTasks.map((task) => {
            const linkedCustomer = task.customerId
              ? customers.find((c) => c.id === task.customerId)
              : undefined;
            const isOverdue = !task.completed && task.dueDate < today;
            const CatIcon = getCategoryIcon(task.category);
            const busy = busyTaskId === task.id;

            return (
              <li
                key={task.id}
                className={`px-6 py-3.5 flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 transition-colors ${
                  task.completed ? 'bg-slate-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggle(task)}
                    aria-label={
                      task.completed
                        ? `Rudisha kazi "${task.title}" kwenye zinazosubiri`
                        : `Ashiria kazi "${task.title}" imekamilika`
                    }
                    title={
                      task.completed
                        ? 'Bonyeza kurudisha kwenye kazi zinazosubiri'
                        : 'Bonyeza kuashiria imekamilika'
                    }
                    className="mt-0.5 text-slate-400 hover:text-emerald-600 disabled:opacity-40 shrink-0"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900'
                        }`}
                      >
                        {task.title}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border rounded ${getPriorityStyle(
                          task.priority,
                          task.completed,
                        )}`}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>

                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-rose-800 bg-rose-100 border border-rose-200 rounded">
                          <AlertCircle className="w-3 h-3" />
                          Imechelewa
                        </span>
                      )}
                    </div>

                    {task.notes && (
                      <p
                        className={`text-xs leading-relaxed ${
                          task.completed ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {task.notes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CatIcon className="w-3 h-3 text-slate-400" />
                        <span>{CATEGORY_LABELS[task.category]}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 font-mono-num ${
                          isOverdue ? 'text-rose-700 font-semibold' : ''
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{formatDueLabel(task.dueDate)}</span>
                        {task.dueTime && (
                          <>
                            <Clock className="w-3 h-3 ml-1" />
                            <span>{task.dueTime}</span>
                          </>
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>
                          Mhusika: <strong className="text-slate-700">{task.assignedToName || 'Timu Yote'}</strong>
                        </span>
                      </span>

                      {(linkedCustomer || task.customerName) && (
                        <span className="text-slate-600">
                          Mteja:{' '}
                          <strong className="text-slate-800">
                            {linkedCustomer?.fullName || task.customerName}
                          </strong>
                          {linkedCustomer?.phone ? ` (${linkedCustomer.phone})` : ''}
                        </span>
                      )}

                      {task.completed && task.completedByName && (
                        <span className="text-emerald-700 font-medium">
                          Imekamilishwa na {task.completedByName}
                          {task.completedAt ? ` · ${task.completedAt}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex items-center gap-1.5 shrink-0 pl-8 sm:pl-0">
                  {linkedCustomer?.phone && !task.completed && (
                    <>
                      <a
                        href={`tel:${linkedCustomer.phone.replace(/\s+/g, '')}`}
                        title={`Piga simu kwa ${linkedCustomer.fullName}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                      >
                        <Phone className="w-3 h-3" />
                        <span>Piga</span>
                      </a>
                      {onSelectCustomerForMessage && (
                        <button
                          type="button"
                          onClick={() => onSelectCustomerForMessage(linkedCustomer.id)}
                          title={`Tuma ujumbe kwa ${linkedCustomer.fullName}`}
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEditForm(task)}
                    title="Hariri Kazi"
                    aria-label={`Hariri ${task.title}`}
                    className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(task.id)}
                    title="Futa Kazi"
                    aria-label={`Futa ${task.title}`}
                    className="p-1.5 text-red-600 hover:text-red-800 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
