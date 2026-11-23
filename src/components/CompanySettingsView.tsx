import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe } from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import { CompanySettings } from '../types';
import { getOfficialApplyUrl, OFFICIAL_DOMAIN, OFFICIAL_ORIGIN } from '../utils/finance';

interface CompanySettingsViewProps {
  company: CompanySettings;
  onSave: (updated: CompanySettings) => Promise<void>;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
}) => {
  const [form, setForm] = useState<CompanySettings>({ ...company });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setForm({ ...company });
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavedNotice(false);

    if (
      form.companyName.trim().length < 2 ||
      form.contractOrgName.trim().length < 2 ||
      form.district.trim().length < 2 ||
      form.lenderName.trim().length < 2 ||
      form.lenderWitnessName.trim().length < 2
    ) {
      setErrorMsg(
        'Jina la kampuni, taasisi ya mkataba, wilaya, mkopeshaji na shahidi lazima viwe na angalau herufi 2.',
      );
      return;
    }

    if (form.phone.trim().length < 5) {
      setErrorMsg('Tafadhali weka namba sahihi ya simu ya ofisi (angalau tarakimu 5).');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        companyName: form.companyName.trim(),
        contractOrgName: form.contractOrgName.trim(),
        district: form.district.trim(),
        region: (form.region || '').trim(),
        phone: form.phone.trim(),
        email: (form.email || '').trim(),
        lenderName: form.lenderName.trim(),
        lenderWitnessName: form.lenderWitnessName.trim(),
        paymentChannelsNote: (form.paymentChannelsNote || '').trim(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setErrorMsg(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          Hariri Taarifa za Kampuni
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Mabadiliko haya yataonekana moja kwa moja kwenye mfumo, risiti za malipo, na mikataba ya mikopo
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Jina la Kampuni *
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Jina la Taasisi Kwenye Mkataba *
            </label>
            <input
              type="text"
              value={form.contractOrgName}
              onChange={(e) => setForm({ ...form, contractOrgName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Wilaya *
            </label>
            <input
              type="text"
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Mtaa / Mkoa (Location)
            </label>
            <input
              type="text"
              value={form.region || ''}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              placeholder="Mfano: MTAA WA AMANI-MTWARA"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Simu ya Ofisi *
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Barua Pepe (Email)
            </label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Jina la Mkopeshaji (Kwenye Mkataba) *
            </label>
            <input
              type="text"
              value={form.lenderName}
              onChange={(e) => setForm({ ...form, lenderName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Shahidi wa Mkopeshaji *
            </label>
            <input
              type="text"
              value={form.lenderWitnessName}
              onChange={(e) => setForm({ ...form, lenderWitnessName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Asilimia Chaguo ya Adhabu Ikichelewa (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.defaultPenaltyPercent}
              onChange={(e) =>
                setForm({ ...form, defaultPenaltyPercent: Number(e.target.value) || 0 })
              }
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Maelezo ya Njia za Malipo
            </label>
            <input
              type="text"
              value={form.paymentChannelsNote || ''}
              onChange={(e) => setForm({ ...form, paymentChannelsNote: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
          {savedNotice ? (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Taarifa za kampuni zimehifadhiwa kikamilifu.</span>
            </div>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Inahifadhi...' : 'Hifadhi Taarifa za Kampuni'}
          </button>
        </div>
      </form>

      {/* Official Domain Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Globe className="w-4 h-4 text-emerald-700" />
          <span>Muunganiko wa Domain Rasmi ({OFFICIAL_DOMAIN})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Anwani Kuu ya Mfumo</div>
            <div className="font-mono-num font-semibold text-slate-900 mt-1">{OFFICIAL_ORIGIN}</div>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="text-emerald-700">Link ya Maombi Mtandaoni</div>
            <div className="font-mono-num font-semibold text-emerald-900 mt-1 break-all">
              {getOfficialApplyUrl()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
