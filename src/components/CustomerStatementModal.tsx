import React, { useMemo } from 'react';
import { Download, X } from 'lucide-react';
import { CompanySettings, Customer, Loan, Repayment } from '../types';
import {
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  getPaymentMethodLabel,
  todayISO,
} from '../utils/finance';
import { downloadCustomerStatementPdf } from '../services/pdfStatement';

interface CustomerStatementModalProps {
  customer: Customer;
  loans: Loan[];
  repayments: Repayment[];
  company: CompanySettings;
  onClose: () => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  customer,
  loans,
  repayments,
  company,
  onClose,
}) => {
  const today = todayISO();

  const { custLoans, custRepayments, totals } = useMemo(() => {
    const filteredLoans = loans.filter((l) => l.customerId === customer.id);
    const loanIds = new Set(filteredLoans.map((l) => l.id));
    const filteredRepayments = repayments
      .filter((r) => r.customerId === customer.id || loanIds.has(r.loanId))
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    const principal = filteredLoans.reduce((s, l) => s + (l.principal || 0), 0);
    const interest = filteredLoans.reduce((s, l) => s + (l.totalInterest || 0), 0);
    const penalty = filteredLoans.reduce((s, l) => s + (l.penaltyApplied || 0), 0);
    const totalDue = filteredLoans.reduce((s, l) => s + (l.totalDue || 0), 0);
    const totalPaid = filteredLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
    const totalRemaining = filteredLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);

    return {
      custLoans: filteredLoans,
      custRepayments: filteredRepayments,
      totals: { principal, interest, penalty, totalDue, totalPaid, totalRemaining },
    };
  }, [customer.id, loans, repayments]);

  const loanNameById = useMemo(
    () => new Map(custLoans.map((l) => [l.id, l.loanTypeName])),
    [custLoans],
  );

  const handleDownloadPdf = () => {
    downloadCustomerStatementPdf({
      customer,
      loans,
      repayments,
      company,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Taarifa ya Mteja na Mikopo (Customer Statement)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {customer.fullName} · {customer.phone} · Tarehe: {formatDateSW(today)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Pakua PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Funga statement"
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Statement Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Customer & Guarantor Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-900 mb-2">Taarifa za Mkopaji</div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Jina Kamili:</span>
                <span className="font-medium text-slate-900 text-right">{customer.fullName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Namba ya Simu:</span>
                <span className="font-mono-num font-medium text-slate-900">{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Barua Pepe:</span>
                  <span className="text-slate-900 text-right">{customer.email}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Kitambulisho:</span>
                <span className="font-mono-num text-slate-900">{customer.idNumber || '-'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Anuani:</span>
                <span className="text-slate-900 text-right">
                  {customer.street}, {customer.district}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Benki &amp; Akaunti:</span>
                <span className="font-mono-num text-slate-900 text-right">
                  {customer.bankName || customer.bankAccountNumber
                    ? `${customer.bankName || 'Benki'} • ${customer.bankAccountNumber || '-'}`
                    : '-'}
                </span>
              </div>
              {customer.isGovernmentEmployee && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Check Number (Mtumishi):</span>
                  <span className="font-mono-num font-medium text-emerald-700 text-right">
                    {customer.checkNumber || '-'}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
              <div className="font-semibold text-slate-900 mb-2">Taarifa za Mdhamini &amp; Dhamana</div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Jina la Mdhamini:</span>
                <span className="font-medium text-slate-900 text-right">{customer.witnessName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Simu ya Mdhamini:</span>
                <span className="font-mono-num text-slate-900">{customer.witnessPhone}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Kazi / Biashara:</span>
                <span className="text-slate-900 text-right">{customer.occupation || '-'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Dhamana ya Mkopo:</span>
                <span className="text-slate-900 text-right">{customer.collateral || '-'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Idhini ya Makato (API):</span>
                <span className="text-slate-900 text-right">
                  {customer.bankMandateActive ? 'Imewashwa' : 'Haijawashwa'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Taasisi:</span>
                <span className="text-slate-900 text-right">{company.companyName}</span>
              </div>
            </div>
          </div>

          {/* 4-Column Financial Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-xs text-slate-500">Mtaji Uliokopwa</div>
              <div className="mt-1 text-base font-bold font-mono-num text-slate-900">
                {formatTZS(totals.principal)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Mikopo {custLoans.length}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-slate-500">Jumla ya Deni (na Riba)</div>
              <div className="mt-1 text-base font-bold font-mono-num text-slate-900">
                {formatTZS(totals.totalDue)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 font-mono-num">
                Riba &amp; Adhabu: {formatTZS(totals.interest + totals.penalty)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-slate-500">Jumla Aliyolipa</div>
              <div className="mt-1 text-base font-bold font-mono-num text-emerald-700">
                {formatTZS(totals.totalPaid)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Risiti {custRepayments.length}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-slate-500">Salio Linalodaiwa</div>
              <div className="mt-1 text-base font-bold font-mono-num text-red-700">
                {formatTZS(totals.totalRemaining)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {totals.totalRemaining === 0 ? 'Hakuna deni' : 'Bado anadaiwa'}
              </div>
            </div>
          </div>

          {/* Loans Table */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2.5">
              1. Orodha ya Mikopo ya Mteja
            </h4>
            {custLoans.length === 0 ? (
              <div className="p-6 text-center border border-slate-200 rounded-lg text-xs text-slate-500">
                Mteja huyu bado hana mkopo uliosajiliwa.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5">Aina ya Mkopo</th>
                      <th className="text-left px-4 py-2.5">Kipindi</th>
                      <th className="text-right px-4 py-2.5">Mtaji</th>
                      <th className="text-right px-4 py-2.5">Riba</th>
                      <th className="text-right px-4 py-2.5">Adhabu</th>
                      <th className="text-right px-4 py-2.5">Jumla Deni</th>
                      <th className="text-right px-4 py-2.5">Aliyolipa</th>
                      <th className="text-right px-4 py-2.5">Salio</th>
                      <th className="text-left px-4 py-2.5">Hali</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {custLoans.map((loan) => {
                      const paid = getLoanPaidTotal(loan);
                      const rem = getLoanRemainingBalance(loan);
                      const statusLabel =
                        loan.status === 'completed'
                          ? 'Amemaliza'
                          : loan.status === 'overdue' || loan.endDate < today
                            ? 'Imechelewa'
                            : 'Anaendelea';
                      const statusColor =
                        loan.status === 'completed'
                          ? 'text-emerald-700'
                          : statusLabel === 'Imechelewa'
                            ? 'text-red-700'
                            : 'text-amber-700';

                      return (
                        <tr key={loan.id}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            <div>{loan.loanTypeName}</div>
                            <div className="text-slate-500">
                              {getFrequencyLabel(loan.frequency)} ({loan.durationCount})
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                            <div>{formatDateSW(loan.startDate)}</div>
                            <div className="text-slate-400">hadi {formatDateSW(loan.endDate)}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num text-slate-900">
                            {formatTZS(loan.principal)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num text-slate-700">
                            {formatTZS(loan.totalInterest)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num text-slate-700">
                            {formatTZS(loan.penaltyApplied || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-slate-900">
                            {formatTZS(loan.totalDue)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num text-emerald-700">
                            {formatTZS(paid)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-bold text-slate-900">
                            {formatTZS(rem)}
                          </td>
                          <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${statusColor}`}>
                            {statusLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Repayments History */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2.5">
              2. Historia ya Marejesho &amp; Risiti za Malipo
            </h4>
            {custRepayments.length === 0 ? (
              <div className="p-6 text-center border border-slate-200 rounded-lg text-xs text-slate-500">
                Hakuna marejesho yaliyolipwa kwa mteja huyu hadi sasa.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5">Na. Risiti</th>
                      <th className="text-left px-4 py-2.5">Tarehe</th>
                      <th className="text-left px-4 py-2.5">Mkopo</th>
                      <th className="text-right px-4 py-2.5">Mtaji</th>
                      <th className="text-right px-4 py-2.5">Riba</th>
                      <th className="text-right px-4 py-2.5">Adhabu</th>
                      <th className="text-right px-4 py-2.5">Jumla</th>
                      <th className="text-left px-4 py-2.5">Njia ya Malipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {custRepayments.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 font-mono-num font-medium text-slate-900">
                          {r.receiptNumber}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {formatDateSW(r.paymentDate)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {loanNameById.get(r.loanId) || 'Mkopo'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-slate-700">
                          {formatTZS(r.principalPortion)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-slate-700">
                          {formatTZS(r.interestPortion)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-slate-700">
                          {formatTZS(r.penaltyPortion)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-emerald-700">
                          {formatTZS(r.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {getPaymentMethodLabel(r.paymentMethod)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Funga
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Pakua Statement (PDF)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
