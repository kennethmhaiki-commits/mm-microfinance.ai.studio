import React, { useState } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import { InterestType, LoanType, RepaymentFrequency } from '../types';
import { getFrequencyLabel, getInterestTypeLabel } from '../utils/finance';

interface LoanTypesViewProps {
  loanTypes: LoanType[];
  onSaveLoanType: (lt: Omit<LoanType, 'id' | 'ownerId'>, existingId?: string) => Promise<void>;
  onDeleteLoanType: (id: string) => Promise<void>;
}

export const LoanTypesView: React.FC<LoanTypesViewProps> = ({
  loanTypes,
  onSaveLoanType,
  onDeleteLoanType,
}) => {
  const [editing, setEditing] = useState<LoanType | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultInterestType, setDefaultInterestType] = useState<InterestType>('flat');
  const [defaultInterestValue, setDefaultInterestValue] = useState('20');
  const [defaultFrequency, setDefaultFrequency] = useState<RepaymentFrequency>('monthly');
  const [defaultDuration, setDefaultDuration] = useState('3');
  const [defaultPenaltyPercent, setDefaultPenaltyPercent] = useState('5');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setDefaultInterestType('flat');
    setDefaultInterestValue('20');
    setDefaultFrequency('monthly');
    setDefaultDuration('3');
    setDefaultPenaltyPercent('5');
    setFormError('');
    setCreating(true);
  };

  const openEdit = (lt: LoanType) => {
    setCreating(false);
    setEditing(lt);
    setName(lt.name);
    setDescription(lt.description || '');
    setDefaultInterestType(lt.defaultInterestType);
    setDefaultInterestValue(String(lt.defaultInterestValue));
    setDefaultFrequency(lt.defaultFrequency);
    setDefaultDuration(String(lt.defaultDuration));
    setDefaultPenaltyPercent(String(lt.defaultPenaltyPercent));
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (name.trim().length < 2) {
      setFormError('Jina la aina ya mkopo lazima liwe na angalau herufi 2.');
      return;
    }
    setSaving(true);
    try {
      await onSaveLoanType(
        {
          name: name.trim(),
          description: description.trim(),
          defaultInterestType,
          defaultInterestValue: Math.max(0, Number(defaultInterestValue) || 0),
          defaultFrequency,
          defaultDuration: Math.max(1, Math.round(Number(defaultDuration) || 1)),
          defaultPenaltyPercent: Math.min(100, Math.max(0, Number(defaultPenaltyPercent) || 0)),
        },
        editing?.id,
      );
      setCreating(false);
      setEditing(null);
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setListError('');
    setDeletingId(id);
    try {
      await onDeleteLoanType(id);
    } catch (err) {
      setListError(formatFirestoreErrorForUser(err));
    } finally {
      setDeletingId(null);
    }
  };

  const showModal = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Aina za Mikopo Inayotolewa
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Andika na hariri aina mbalimbali za mikopo pamoja na riba, muda na adhabu zake
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Ongeza Aina ya Mkopo</span>
        </button>
      </div>

      {listError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {listError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loanTypes.map((lt) => (
          <div
            key={lt.id}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">{lt.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(lt)}
                    className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                    title="Hariri"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === lt.id}
                    onClick={() => void handleDelete(lt.id)}
                    className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                    title="Futa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {lt.description && (
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  {lt.description}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Aina ya Riba</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {lt.defaultInterestType === 'fixed_amount'
                    ? `Tsh ${lt.defaultInterestValue}`
                    : `${lt.defaultInterestValue}%`}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Makato</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {getFrequencyLabel(lt.defaultFrequency)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Muda Chaguo</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {lt.defaultDuration} {lt.defaultFrequency === 'weekly' ? 'Wiki' : 'Miezi'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Adhabu</div>
                <div className="font-medium text-amber-700 mt-0.5">
                  {lt.defaultPenaltyPercent}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? 'Hariri Aina ya Mkopo' : 'Ongeza Aina Mpya ya Mkopo'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                className="p-1.5 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jina la Aina ya Mkopo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mfano: Mkopo wa Bodaboda"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Maelezo Mafupi
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Aina ya Riba
                  </label>
                  <select
                    value={defaultInterestType}
                    onChange={(e) => setDefaultInterestType(e.target.value as InterestType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="flat">{getInterestTypeLabel('flat')}</option>
                    <option value="reducing">{getInterestTypeLabel('reducing')}</option>
                    <option value="fixed_amount">{getInterestTypeLabel('fixed_amount')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {defaultInterestType === 'fixed_amount' ? 'Riba (Tsh)' : 'Riba (%)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={defaultInterestValue}
                    onChange={(e) => setDefaultInterestValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Muda wa Makato
                  </label>
                  <select
                    value={defaultFrequency}
                    onChange={(e) => setDefaultFrequency(e.target.value as RepaymentFrequency)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="weekly">Wiki</option>
                    <option value="monthly">Mwezi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Idadi ya {defaultFrequency === 'weekly' ? 'Wiki' : 'Miezi'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={defaultDuration}
                    onChange={(e) => setDefaultDuration(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Asilimia ya Adhabu Ikichelewa (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={defaultPenaltyPercent}
                  onChange={(e) => setDefaultPenaltyPercent(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  required
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Ghairi
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  {saving ? 'Inahifadhi...' : 'Hifadhi Aina ya Mkopo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
