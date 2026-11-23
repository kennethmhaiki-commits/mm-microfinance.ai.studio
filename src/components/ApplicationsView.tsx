import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  FileCheck2,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import {
  CompanySettings,
  InterestType,
  LoanApplication,
  RepaymentFrequency,
} from '../types';
import {
  buildLoanProcessingMessage,
  calculateLoan,
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getOfficialApplyUrl,
  LOAN_PROGRESS_STAGES,
  normalizeTzPhone,
  OFFICIAL_DOMAIN,
  todayISO,
} from '../utils/finance';

interface ApplicationsViewProps {
  applications: LoanApplication[];
  company: CompanySettings;
  onApprove: (
    application: LoanApplication,
    approvedTerms: {
      principal: number;
      interestType: InterestType;
      interestValue: number;
      frequency: RepaymentFrequency;
      durationCount: number;
      penaltyPercent: number;
      startDate: string;
      reviewNote: string;
    },
  ) => Promise<void>;
  onReject: (application: LoanApplication, reason: string) => Promise<void>;
  onDelete: (applicationId: string) => Promise<void>;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  company,
  onApprove,
  onReject,
  onDelete,
}) => {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [copiedLink, setCopiedLink] = useState(false);
  const [approveTarget, setApproveTarget] = useState<LoanApplication | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LoanApplication | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoanApplication | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const filtered = useMemo(() => {
    return applications
      .filter((app) => (filter === 'all' ? true : app.status === filter))
      .sort((a, b) => b.submittedDate.localeCompare(a.submittedDate));
  }, [applications, filter]);

  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === 'pending').length,
    [applications],
  );

  const shareableApplyLink = getOfficialApplyUrl();

  const handleCopyApplyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableApplyLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Wateja wa Mtandaoni (Maombi ya Mikopo Online)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pitia maombi ya wateja kutoka{' '}
            <span className="font-semibold text-emerald-700">{OFFICIAL_DOMAIN}</span>, badilisha
            masharti ikibidi, na uyapitishe au kuyakataa
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyApplyLink}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
        >
          {copiedLink ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          <span>
            {copiedLink ? `Imenakiliwa (${shareableApplyLink})` : `Nakili Link (${OFFICIAL_DOMAIN})`}
          </span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'pending' as const, label: `Yanayosubiri (${pendingCount})` },
            { id: 'approved' as const, label: 'Yaliyopitishwa' },
            { id: 'rejected' as const, label: 'Yaliyokataliwa' },
            { id: 'all' as const, label: 'Yote' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          Jumla ya maombi: <strong className="text-slate-900">{applications.length}</strong>
        </div>
      </div>

      {/* Applications List */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Hakuna maombi ya mikopo katika kundi hili.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Nakili link ya maombi hapo juu uwatumie wateja wako kupitia WhatsApp ili waombe online.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Tarehe</th>
                  <th className="text-left px-5 py-3">Mwombaji & Mdhamini</th>
                  <th className="text-left px-5 py-3">Anwani & Dhamana</th>
                  <th className="text-right px-5 py-3">Kiasi & Muda</th>
                  <th className="text-left px-5 py-3">Hali</th>
                  <th className="text-right px-5 py-3">Hatua</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                      <div>{formatDateSW(app.submittedDate)}</div>
                      <div className="font-mono-num text-slate-400 mt-0.5">{app.id.slice(0, 12)}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{app.fullName}</div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {app.phone} · Shahidi: {app.witnessName} ({app.witnessPhone})
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      <div>
                        {app.street}, {app.district}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Dhamana: {app.collateral || '-'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs">
                      <div className="font-mono-num font-bold text-slate-900">
                        {formatTZS(app.requestedAmount)}
                      </div>
                      <div className="text-slate-500">
                        {app.loanTypeName} · {app.durationCount}{' '}
                        {app.frequency === 'weekly' ? 'Wiki' : 'Miezi'} ({getFrequencyLabel(app.frequency)})
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {app.status === 'pending' && (
                        <span className="text-xs font-semibold text-amber-700">
                          Inasubiri Kupitishwa
                        </span>
                      )}
                      {app.status === 'approved' && (
                        <span className="text-xs font-semibold text-emerald-700">
                          Imepitishwa
                        </span>
                      )}
                      {app.status === 'rejected' && (
                        <span className="text-xs font-semibold text-red-700">
                          Imekataliwa
                        </span>
                      )}
                      {app.reviewNote && (
                        <div className="text-xs text-slate-500 mt-0.5 max-w-[180px] truncate">
                          {app.reviewNote}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {app.status === 'pending' && (
                          <>
                            <a
                              href={`https://wa.me/${normalizeTzPhone(app.phone)}?text=${encodeURIComponent(
                                buildLoanProcessingMessage(
                                  app.fullName,
                                  company.companyName,
                                  LOAN_PROGRESS_STAGES[1],
                                  company.phone,
                                  app.requestedAmount,
                                ),
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 whitespace-nowrap"
                            >
                              Unashughulikiwa (WA)
                            </a>
                            <button
                              type="button"
                              onClick={() => setApproveTarget(app)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Pitisha</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectTarget(app)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 whitespace-nowrap"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Kataa</span>
                            </button>
                          </>
                        )}
                        {app.status !== 'pending' && (
                          <a
                            href={`https://wa.me/${normalizeTzPhone(app.phone)}?text=${encodeURIComponent(
                              app.status === 'approved'
                                ? `Habari ${app.fullName}, ombi lako la mkopo wa ${formatTZS(app.requestedAmount)} limepitishwa na ${company.companyName}. Tafadhali wasiliana nasi kupitia ${company.phone}.`
                                : `Habari ${app.fullName}, samahani ombi lako la mkopo katika ${company.companyName} halijapitishwa kwa sasa. Sababu: ${app.reviewNote || 'Vigezo havijakidhi'}.`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
                          >
                            Mjuze WhatsApp
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(app);
                          }}
                          title="Futa Ombi"
                          className="p-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {approveTarget && (
        <ApproveModal
          application={approveTarget}
          defaultPenaltyPercent={company.defaultPenaltyPercent}
          onClose={() => setApproveTarget(null)}
          onConfirm={async (terms) => {
            await onApprove(approveTarget, terms);
            setApproveTarget(null);
          }}
        />
      )}

      {rejectTarget && (
        <RejectModal
          application={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={async (reason) => {
            await onReject(rejectTarget, reason);
            setRejectTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Thibitisha Kufuta Ombi
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Je, una uhakika unataka kufuta ombi la mkopo la{' '}
              <strong>{deleteTarget.fullName}</strong> ({formatTZS(deleteTarget.requestedAmount)})? Hatua hii haiwezi kutenguliwa.
            </p>
            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError('');
                  try {
                    await onDelete(deleteTarget.id);
                    setDeleteTarget(null);
                  } catch (err) {
                    setDeleteError(formatFirestoreErrorForUser(err));
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Inafuta...' : 'Ndiyo, Futa Ombi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ApproveModal: React.FC<{
  application: LoanApplication;
  defaultPenaltyPercent: number;
  onClose: () => void;
  onConfirm: (terms: {
    principal: number;
    interestType: InterestType;
    interestValue: number;
    frequency: RepaymentFrequency;
    durationCount: number;
    penaltyPercent: number;
    startDate: string;
    reviewNote: string;
  }) => Promise<void>;
}> = ({ application, defaultPenaltyPercent, onClose, onConfirm }) => {
  const [principal, setPrincipal] = useState(String(application.requestedAmount));
  const [interestType, setInterestType] = useState<InterestType>(application.interestType);
  const [interestValue, setInterestValue] = useState(String(application.interestValue));
  const [frequency, setFrequency] = useState<RepaymentFrequency>(application.frequency);
  const [durationCount, setDurationCount] = useState(String(application.durationCount));
  const [penaltyPercent, setPenaltyPercent] = useState(String(defaultPenaltyPercent || 5));
  const [startDate, setStartDate] = useState(todayISO());
  const [reviewNote, setReviewNote] = useState('Ombi limepitishwa rasmi');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (calc.principal < 1000) {
      setFormError('Kiasi kilichopitishwa lazima kiwe angalau Tsh 1,000.');
      return;
    }
    const dur = Math.round(Number(durationCount) || 0);
    if (dur < 1) {
      setFormError('Idadi ya awamu za mkopo lazima iwe angalau 1.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm({
        principal: calc.principal,
        interestType,
        interestValue: Math.max(0, Number(interestValue) || 0),
        frequency,
        durationCount: dur,
        penaltyPercent: Math.min(100, Math.max(0, Number(penaltyPercent) || 0)),
        startDate,
        reviewNote: reviewNote.trim(),
      });
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Pitisha Ombi la Mkopo — {application.fullName}
            </h3>
            <p className="text-xs text-slate-500">
              Mteja na mkopo wake vitasajiliwa moja kwa moja kwenye mfumo
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kiasi Kilichopitishwa (Tsh)
              </label>
              <input
                type="number"
                min={1000}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                required
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
                <option value="flat">Flat Rate (%)</option>
                <option value="reducing">Reducing Balance (%)</option>
                <option value="fixed_amount">Kiasi Maalum (Tsh)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {interestType === 'fixed_amount' ? 'Riba (Tsh)' : 'Riba (%)'}
              </label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={interestValue}
                onChange={(e) => setInterestValue(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Muda wa Makato
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RepaymentFrequency)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="weekly">Wiki</option>
                <option value="monthly">Mwezi</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Idadi ya {frequency === 'weekly' ? 'Wiki' : 'Miezi'}
              </label>
              <input
                type="number"
                min={1}
                value={durationCount}
                onChange={(e) => setDurationCount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                required
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
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tarehe ya Kuchukua Mkopo
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Maoni ya Afisa
            </label>
            <input
              type="text"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex flex-wrap justify-between gap-2">
            <span>Jumla ya Deni: <strong>{formatTZS(calc.totalPayable)}</strong></span>
            <span>Rejesho: <strong>{formatTZS(calc.installmentAmount)}</strong></span>
            <span>Mwisho: <strong>{formatDateSW(calc.endDate)}</strong></span>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
            >
              {saving ? 'Inapitisha...' : 'Thibitisha & Pitisha Mkopo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RejectModal: React.FC<{
  application: LoanApplication;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}> = ({ application, onClose, onConfirm }) => {
  const [reason, setReason] = useState('Taarifa za dhamana au mdhamini hazijakamilika');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (reason.trim().length < 2) {
      setFormError('Tafadhali weka sababu ya kukataa ombi (angalau herufi 2).');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Kataa Ombi — {application.fullName}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Sababu ya Kukataa
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              {saving ? 'Inahifadhi...' : 'Kataa Ombi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
