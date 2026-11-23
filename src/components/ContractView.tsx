import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { CompanySettings, Customer, Loan } from '../types';
import { downloadLoanContractPdf } from '../services/pdfStatement';
import {
  buildSwahiliContractHtml,
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
} from '../utils/finance';

interface ContractViewProps {
  customers: Customer[];
  loans: Loan[];
  company: CompanySettings;
  preselectedLoanId?: string | null;
  onExit?: () => void;
}

export const ContractView: React.FC<ContractViewProps> = ({
  customers,
  loans,
  company,
  preselectedLoanId,
  onExit,
}) => {
  const [selectedLoanId, setSelectedLoanId] = useState(
    preselectedLoanId || loans[0]?.id || '',
  );

  useEffect(() => {
    if (preselectedLoanId) {
      setSelectedLoanId(preselectedLoanId);
    } else if (!selectedLoanId && loans[0]) {
      setSelectedLoanId(loans[0].id);
    }
  }, [preselectedLoanId, loans, selectedLoanId]);

  const selectedLoan = useMemo(
    () => loans.find((l) => l.id === selectedLoanId) || loans[0],
    [loans, selectedLoanId],
  );

  const selectedCustomer = useMemo(
    () => (selectedLoan ? customers.find((c) => c.id === selectedLoan.customerId) : undefined),
    [customers, selectedLoan],
  );

  const handleDownloadHtml = () => {
    if (!selectedLoan || !selectedCustomer) return;
    const html = buildSwahiliContractHtml(selectedLoan, selectedCustomer, company);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mkataba_${selectedCustomer.fullName.replace(/\s+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    if (!selectedLoan || !selectedCustomer) return;
    downloadLoanContractPdf({ loan: selectedLoan, customer: selectedCustomer, company });
  };

  if (loans.length === 0 || !selectedLoan || !selectedCustomer) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto" />
        <h2 className="mt-2 text-base font-semibold text-slate-900">
          Hakuna Mkopo wa Kutengenezea Mkataba
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sajili mteja na mkopo kwanza ili mfumo uweze kuandaa mkataba rasmi kiotomatiki.
        </p>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ondoka / Rudi Nyuma</span>
          </button>
        )}
      </div>
    );
  }

  const unitLabel = selectedLoan.frequency === 'weekly' ? 'wiki' : 'miezi';
  const freqPhrase = selectedLoan.frequency === 'weekly' ? 'kila wiki' : 'kila mwezi';
  const perPeriodInterest = Math.round(
    selectedLoan.totalInterest / Math.max(1, selectedLoan.durationCount),
  );
  const penaltyRate = selectedLoan.penaltyPercent ?? company.defaultPenaltyPercent ?? 5;
  const interestPctDisplay =
    selectedLoan.interestType === 'fixed_amount'
      ? `${Math.round((selectedLoan.totalInterest / Math.max(1, selectedLoan.principal)) * 100)}%`
      : `${selectedLoan.interestValue}%`;
  const collateralText =
    selectedLoan.collateral || selectedCustomer.collateral || '................................................';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Mkataba Rasmi wa Kukopesha Pesa Taslimu
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Chagua mkopo kutoa mkataba kamili wenye kipengele cha adhabu ya asilimia (%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-lg whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ondoka / Rudi</span>
            </button>
          )}

          <select
            value={selectedLoan.id}
            onChange={(e) => setSelectedLoanId(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg max-w-[260px]"
          >
            {loans.map((l) => {
              const cust = customers.find((c) => c.id === l.customerId);
              return (
                <option key={l.id} value={l.id}>
                  {cust?.fullName || 'Mteja'} — {formatTZS(l.principal)} ({formatDateSW(l.startDate)})
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            <span>Pakua PDF</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Pakua HTML</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Chapisha Mkataba</span>
          </button>
        </div>
      </div>

      {/* Printable Legal Contract Document */}
      <article
        id="printable-contract"
        className="print-only-area bg-white border border-slate-200 rounded-xl p-8 md:p-12 max-w-4xl mx-auto text-slate-900 leading-relaxed"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        <div className="text-center pb-5 border-b-2 border-slate-900">
          <div className="text-lg font-bold tracking-wide uppercase">
            {company.companyName} {(company.district || 'TANDAHIMBA').toUpperCase()}-
            {(company.region || 'MTAA WA AMANI-MTWARA').toUpperCase()}
          </div>
          <div className="text-base font-bold uppercase mt-1">
            {company.contractOrgName || 'MHAIKI_ONLINE_MICRO-CREDIT'}
          </div>
          <div className="text-xs font-sans text-slate-600 mt-0.5">
            {company.companyName} · Wilaya ya {company.district || 'TANDAHIMBA'} · Simu: {company.phone}
          </div>
          <h3 className="text-base font-bold underline mt-3 uppercase">
            MKATABA MDOGO WA KUKOPESHA PESA TASLIMU
          </h3>
        </div>

        <div className="mt-6 space-y-4 text-[15px] text-justify">
          <p>
            Huu ni mkataba baina ya{' '}
            <span className="font-bold underline">{company.lenderName}</span> ambaye katika
            mkataba huu anajulikana kama mkopeshaji na{' '}
            <span className="font-bold underline">{selectedCustomer.fullName}</span> ambaye katika
            mkataba huu anajulikana kama mkopaji na kwamba pande zote mbili zimekubaliana
            kukopeshana pesa taslimu{' '}
            <span className="font-bold underline">{formatTZS(selectedLoan.principal)}</span> kwa
            makubaliano ya kulipa riba ya{' '}
            <span className="font-bold underline">{formatTZS(perPeriodInterest)}</span>{' '}
            {freqPhrase} (Jumla ya riba{' '}
            <span className="font-bold underline">{formatTZS(selectedLoan.totalInterest)}</span>) na
            kwamba mkopo huu utakuwa wa {unitLabel}{' '}
            <span className="font-bold underline">{selectedLoan.durationCount}</span> kuanzia
            tarehe <span className="font-bold underline">{formatDateSW(selectedLoan.startDate)}</span>{' '}
            hadi tarehe{' '}
            <span className="font-bold underline">{formatDateSW(selectedLoan.endDate)}</span>.
          </p>

          <p>
            Mkopo huu una riba ya asilimia{' '}
            <span className="font-bold underline">{interestPctDisplay}</span> ya pesa utakayopewa
            (Jumla ya kurejesha ikiwa{' '}
            <span className="font-bold underline">{formatTZS(selectedLoan.totalDue)}</span>). Na
            kwamba pesa iliyokopwa italipwa yote ikiwa na riba ndani ya {unitLabel}{' '}
            {selectedLoan.durationCount} au pungufu ya hapo kadri atakavyoona mteja inafaa. NA KWAMBA
            RIBA ILIYOKUBALIWA ITAENDELEA MPAKA PALE KIASI CHOTE KITAKAPOLIPWA.
          </p>

          <p>
            Mkopo huu ni wa pesa taslimu ambayo utatakiwa kuilipa kwa utaratibu wa{' '}
            <span className="font-bold underline">{getFrequencyLabel(selectedLoan.frequency)}</span>{' '}
            ndani ya muda uliokubaliwa (au ndani ya siku thelathini tokea kupokea kwa mkopo huu au
            ndani ya siku saba kulingana na makubaliano ya ratiba).
          </p>

          <div className="p-4 border border-slate-800 bg-slate-50 font-sans text-sm">
            <strong>KIPENGELE CHA ADHABU YA UCHELEWESHAJI ({penaltyRate}%):</strong>{' '}
            Endapo mkopaji atashindwa au atachelewesha kurejesha rejesho kwa wakati au atapitisha
            tarehe ya kumaliza mkopo ({formatDateSW(selectedLoan.endDate)}), atatozwa adhabu ya{' '}
            <strong>asilimia {penaltyRate}%</strong> ya kiasi kilichocheleweshwa au salio lililobaki.
          </div>

          <div className="p-4 border border-slate-800 bg-slate-50 font-sans text-sm">
            <strong>KIPENGELE CHA WAJIBU WA MDHAMINI:</strong> Mimi{' '}
            <span className="font-bold underline">{selectedCustomer.witnessName}</span> (Simu:{' '}
            <span className="font-bold underline">{selectedCustomer.witnessPhone}</span>), kama
            mdhamini/shahidi wa mkopaji (
            <span className="font-bold underline">{selectedCustomer.fullName}</span>), ninakubali na
            kuthibitisha kisheria kuwa nitawajibika kikamilifu kulipa deni lote la mkopo huu (ikiwemo
            mtaji, riba, na adhabu iliyoongezeka) endapo mkopaji atashindwa kulipa deni lake au
            atapotea kwa muda mrefu bila taarifa yoyote kwa mkopeshaji ({company.companyName}).
          </div>

          <p>
            Na endapo mkopaji atashindwa kurejesha mkopo huu kwa muda mrefu tofauti na
            walivyokubaliana bila taarifa yoyote, mkopeshaji anaweza kuangalia namna bora zaidi
            itakayosaidia kupatikana kwa kiasi kilichobakia ikiwa ni pamoja na kuthamini mali ya
            mteja itakayosaidia kufidia kwa pesa iliyobaki au vinginevyo. Mdhamini wa mteja
            atahusika kulipa mkopo endapo mdaiwa atashindwa kulipa deni lake au atapotea kwa muda
            mrefu bila taarifa. NA ENDAPO MTEJA ATASHINDWA AU ATAPITISHA MUDA WA KUMALIZA DENI LAKE,
            MKOPESHAJI ANAWEZA KUMUONGEZEA RIBA / ADHABU YA {penaltyRate}% KWENYE MKOPO AU PESA
            ILIYOBAKI ILI KULINDA MKOPO.
          </p>

          <p>
            Na kwamba mteja amekubali kuweka mali yake{' '}
            <span className="font-bold underline">{collateralText}</span> kama dhamana ya mkopo
            wake. NA AMEKUBALI KUWA ENDAPO MKOPO USIPOLIPWA NDANI YA MUDA MREFU BASI MALI YAKE
            ITAUZWA KUFIDIA MKOPO.
          </p>

          <p className="italic text-sm">
            Tafadhali ambatanisha kivuli cha kitambulisho cha mpiga kura / NIDA (
            {selectedCustomer.idNumber || '.....................'}) / cha kazi kwa ushahidi.
          </p>
        </div>

        {/* Signatures Grid */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm pt-6 border-t border-slate-300">
          <div className="space-y-1.5">
            <div>
              <strong>JINA LA MKOPAJI:</strong> {selectedCustomer.fullName}
            </div>
            <div>
              <strong>NAMBA YA SIMU YA MKOPAJI:</strong> {selectedCustomer.phone}
            </div>
            <div>
              <strong>MTAA ANAPOISHI:</strong> {selectedCustomer.street} ·{' '}
              <strong>WILAYA:</strong> {selectedCustomer.district}
            </div>
            <div className="pt-4">
              SAHIHI: ................................. TAREHE: .....................
            </div>
          </div>

          <div className="space-y-1.5">
            <div>
              <strong>JINA LA MDHAMINI / SHAHIDI WA MKOPAJI:</strong> {selectedCustomer.witnessName}
            </div>
            <div>
              <strong>NAMBA YA SIMU YA SHAHIDI:</strong> {selectedCustomer.witnessPhone}
            </div>
            <div>
              <strong>MTAA ANAPOISHI:</strong>{' '}
              {selectedCustomer.witnessStreet || selectedCustomer.street} ·{' '}
              <strong>WILAYA:</strong>{' '}
              {selectedCustomer.witnessDistrict || selectedCustomer.district}
            </div>
            <div className="pt-4">
              SAHIHI: ................................. TAREHE: .....................
            </div>
          </div>

          <div className="space-y-1.5 pt-4 border-t border-slate-200">
            <div>
              <strong>JINA LA MKOPESHAJI:</strong> {company.lenderName}
            </div>
            <div>
              <strong>KAMPUNI:</strong> {company.companyName}
            </div>
            <div className="pt-4">
              SAHIHI: ................................. TAREHE: .....................
            </div>
          </div>

          <div className="space-y-1.5 pt-4 border-t border-slate-200">
            <div>
              <strong>SHAHIDI WA MKOPESHAJI:</strong> {company.lenderWitnessName}
            </div>
            <div>
              <strong>WILAYA:</strong> {company.district}
            </div>
            <div className="pt-4">
              SAHIHI: ................................. TAREHE: .....................
            </div>
          </div>
        </div>

        {/* Official Office Rubber Stamp — Date updates automatically per loan startDate */}
        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs font-sans text-slate-600 space-y-1 text-center sm:text-left">
            <div className="font-semibold text-slate-800 uppercase">
              Uthibitisho wa Ofisi ({company.companyName} {company.district || 'TANDAHIMBA'}-{company.region || 'MTAA WA AMANI-MTWARA'})
            </div>
            <div>
              Tarehe ya Kuchukua Mkopo:{' '}
              <span className="font-semibold text-slate-900">
                {formatDateSW(selectedLoan.startDate)}
              </span>
            </div>
            <div>
              Tarehe ya Mwisho wa Mkopo:{' '}
              <span className="font-semibold text-slate-900">
                {formatDateSW(selectedLoan.endDate)}
              </span>
            </div>
          </div>

          <div
            className="select-none shrink-0"
            style={{
              transform: 'rotate(-6deg)',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
            aria-label={`Muhuri wa Ofisi MM MICROFINANCE-TANDAHIMBA Tarehe ${formatDateSW(selectedLoan.startDate)}`}
          >
            <svg
              width="172"
              height="172"
              viewBox="0 0 180 180"
              xmlns="http://www.w3.org/2000/svg"
              className="font-sans"
            >
              <defs>
                <path
                  id="mm-stamp-top-arc"
                  d="M 31.74,111.20 A 62,62 0 1,1 148.26,111.20"
                />
                <path
                  id="mm-stamp-bottom-arc"
                  d="M 30.20,117.90 A 66,66 0 0,0 149.80,117.90"
                />
              </defs>
              <circle
                cx="90"
                cy="90"
                r="82"
                fill="rgba(30, 58, 138, 0.04)"
                stroke="#1e3a8a"
                strokeWidth="3.5"
              />
              <circle
                cx="90"
                cy="90"
                r="76"
                fill="none"
                stroke="#1e3a8a"
                strokeWidth="1.2"
              />
              <circle
                cx="90"
                cy="90"
                r="48"
                fill="none"
                stroke="#1e3a8a"
                strokeWidth="1.4"
              />

              <text
                fill="#1e3a8a"
                fontSize="10"
                fontWeight="800"
                letterSpacing="1"
              >
                <textPath
                  href="#mm-stamp-top-arc"
                  startOffset="50%"
                  textAnchor="middle"
                >
                  MM MICROFINANCE-TANDAHIMBA
                </textPath>
              </text>

              <text
                fill="#1e3a8a"
                fontSize="8.2"
                fontWeight="700"
                letterSpacing="1"
              >
                <textPath
                  href="#mm-stamp-bottom-arc"
                  startOffset="50%"
                  textAnchor="middle"
                >
                  ★ MHURI RASMI WA OFISI ★
                </textPath>
              </text>

              <text
                x="90"
                y="62"
                textAnchor="middle"
                fill="#1e3a8a"
                fontSize="6.5"
                fontWeight="700"
                letterSpacing="0.8"
              >
                OFISI YA MIKOPO
              </text>

              <line
                x1="44"
                y1="69"
                x2="136"
                y2="69"
                stroke="#1e3a8a"
                strokeWidth="1.2"
              />

              <text
                x="90"
                y="81"
                textAnchor="middle"
                fill="#1e3a8a"
                fontSize="6.5"
                fontWeight="700"
                letterSpacing="0.6"
              >
                TAREHE YA MKOPO
              </text>

              <text
                x="90"
                y="99"
                textAnchor="middle"
                fill="#1e3a8a"
                fontSize="12.5"
                fontWeight="800"
                letterSpacing="0.8"
              >
                {formatDateSW(selectedLoan.startDate).toUpperCase()}
              </text>

              <line
                x1="44"
                y1="109"
                x2="136"
                y2="109"
                stroke="#1e3a8a"
                strokeWidth="1.2"
              />

              <text
                x="90"
                y="122"
                textAnchor="middle"
                fill="#1e3a8a"
                fontSize="6.5"
                fontWeight="700"
                letterSpacing="0.8"
              >
                IMETHIBITISHWA
              </text>
            </svg>
          </div>
        </div>
      </article>

      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 pt-2 no-print">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-lg whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ondoka / Rudi Nyuma</span>
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            <span>Pakua Mkataba (PDF)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Chapisha Mkataba</span>
          </button>
        </div>
      </div>
    </div>
  );
};
