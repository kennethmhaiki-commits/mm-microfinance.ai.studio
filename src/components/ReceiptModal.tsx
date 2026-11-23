import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  MessageCircle,
  MessageSquare,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { CompanySettings, Customer, Loan, Repayment } from '../types';
import { downloadReceiptPdf } from '../services/pdfStatement';
import {
  buildReceiptHtml,
  buildReceiptShareText,
  formatDateSW,
  formatTZS,
  getLoanPaidTotal,
  getPaymentMethodLabel,
  normalizeTzPhone,
  OFFICIAL_DOMAIN,
} from '../utils/finance';

interface ReceiptModalProps {
  repayment: Repayment | null;
  loan: Loan | undefined;
  customer: Customer | undefined;
  company: CompanySettings;
  onClose: () => void;
  onShareLogged?: (
    channel: 'whatsapp' | 'sms',
    messageBody: string,
    repayment: Repayment,
    loan: Loan,
    customer: Customer,
  ) => Promise<void>;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  repayment,
  loan,
  customer,
  company,
  onClose,
  onShareLogged,
}) => {
  const [copiedText, setCopiedText] = useState(false);

  const shareText = useMemo(() => {
    if (!repayment || !loan || !customer) return '';
    return buildReceiptShareText(repayment, loan, customer, company);
  }, [repayment, loan, customer, company]);

  if (!repayment || !loan || !customer) return null;

  const totalPaidNow = getLoanPaidTotal(loan);
  const normalizedPhone = normalizeTzPhone(customer.phone);
  const whatsappHref = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const smsHref = normalizedPhone
    ? `sms:+${normalizedPhone}?body=${encodeURIComponent(shareText)}`
    : `sms:?body=${encodeURIComponent(shareText)}`;
  const supportsWebShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const html = buildReceiptHtml(repayment, loan, customer, company);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Risiti_${repayment.receiptNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadPdf = () => {
    downloadReceiptPdf({ repayment, loan, customer, company });
  };

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2200);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleNativeShare = async () => {
    if (!supportsWebShare) {
      await handleCopyShareText();
      return;
    }
    try {
      await navigator.share({
        title: `Risiti ${repayment.receiptNumber} - ${company.companyName}`,
        text: shareText,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  const locationLine = [
    company.district || 'TANDAHIMBA',
    company.region || 'MTAA WA AMANI-MTWARA',
  ]
    .filter(Boolean)
    .join('-');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 no-print">
          <h3 className="text-base font-semibold text-slate-900">
            Risiti ya Malipo ({repayment.receiptNumber})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            aria-label="Ondoka au funga risiti"
          >
            <X className="w-4 h-4" />
            <span>Ondoka</span>
          </button>
        </div>

        <div className="p-6 print-only-area" id="printable-receipt">
          <div className="text-center pb-4 border-b border-slate-200 space-y-1">
            <h2 className="text-lg font-bold text-slate-900">{company.companyName}</h2>
            {company.contractOrgName && (
              <div className="text-xs font-semibold text-slate-700">
                {company.contractOrgName}
              </div>
            )}
            <p className="text-xs text-slate-600">
              {[locationLine, company.phone ? `Simu: ${company.phone}` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-xs text-slate-500">
              {[
                company.email ? `Email: ${company.email}` : '',
                `Afisa: ${company.lenderName}`,
                OFFICIAL_DOMAIN,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="pt-2 text-xs font-semibold tracking-wide text-slate-800">
              RISITI RASMI YA REJESHO LA MKOPO
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Namba ya Risiti</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {repayment.receiptNumber}
              </span>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Tarehe ya Malipo</span>
              <span className="font-medium text-slate-900">
                {formatDateSW(repayment.paymentDate)}
              </span>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Mteja</span>
              <span className="font-semibold text-slate-900">{customer.fullName}</span>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Simu ya Mteja</span>
              <span className="font-mono-num text-slate-900">{customer.phone}</span>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Aina ya Mkopo</span>
              <span className="text-slate-900">{loan.loanTypeName}</span>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <span className="text-slate-500">Njia ya Malipo</span>
              <span className="font-medium text-slate-900">
                {getPaymentMethodLabel(repayment.paymentMethod)}
                {repayment.channelDetail ? ` (${repayment.channelDetail})` : ''}
              </span>
            </div>
            {repayment.penaltyPortion > 0 && (
              <div className="py-2 flex justify-between gap-4">
                <span className="text-slate-500">Adhabu Iliyolipwa</span>
                <span className="font-mono-num text-amber-700">
                  {formatTZS(repayment.penaltyPortion)}
                </span>
              </div>
            )}
            <div className="py-3 flex justify-between gap-4 bg-slate-50 px-3 rounded-lg mt-2">
              <span className="font-semibold text-slate-900">Kiasi Alicholipa Sasa</span>
              <span className="font-mono-num font-bold text-emerald-700">
                {formatTZS(repayment.amount)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-slate-600">Jumla Aliyolipa Hadi Sasa</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {formatTZS(totalPaidNow)}
              </span>
            </div>
            <div className="py-3 flex justify-between gap-4 border-t border-slate-300">
              <span className="font-semibold text-slate-900">Salio Anachodaiwa</span>
              <span className="font-mono-num font-bold text-red-700">
                {formatTZS(repayment.balanceAfter)}
              </span>
            </div>
          </div>

          {company.paymentChannelsNote && (
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 text-center">
              <strong>Njia Rasmi za Malipo:</strong> {company.paymentChannelsNote}
            </div>
          )}

          <p className="mt-4 text-xs text-center text-slate-500">
            Asante kwa kufanya rejesho lako kwa wakati. Risiti hii imetolewa na{' '}
            {company.companyName} ({OFFICIAL_DOMAIN}).
          </p>
        </div>

        {/* Share on WhatsApp / SMS (Meseji ya Kawaida) */}
        <div className="px-6 py-3.5 bg-emerald-50/70 border-t border-emerald-200/80 space-y-2 no-print">
          <div className="text-xs font-semibold text-emerald-950">
            Share Risiti (na Taarifa Zote za Kampuni) kwa Mteja:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                void Promise.resolve(
                  onShareLogged?.('whatsapp', shareText, repayment, loan, customer),
                ).catch(() => {})
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Share WhatsApp</span>
            </a>

            <a
              href={smsHref}
              onClick={() =>
                void Promise.resolve(
                  onShareLogged?.('sms', shareText, repayment, loan, customer),
                ).catch(() => {})
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Meseji ya Kawaida (SMS)</span>
            </a>

            <button
              type="button"
              onClick={() => void handleCopyShareText()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              {copiedText ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedText ? 'Imenakiliwa!' : 'Nakili Risiti'}</span>
            </button>

            {supportsWebShare && (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Nyingine</span>
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 no-print">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-lg whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ondoka / Funga</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
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
              <span>HTML</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Chapisha</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
