import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanySettings, Customer, Loan, Repayment } from '../types';
import {
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  getPaymentMethodLabel,
  OFFICIAL_DOMAIN,
  todayISO,
} from '../utils/finance';

type DocWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function sanitizeFileSegment(text: string): string {
  return text
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Mteja';
}

function getLoanStatusLabelSW(loan: Loan): string {
  if (loan.status === 'completed') return 'Amemaliza';
  if (loan.status === 'overdue' || loan.endDate < todayISO()) return 'Imechelewa';
  return 'Anaendelea';
}

function addPageFooters(doc: jsPDF, companyName: string): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${companyName} - Ripoti Rasmi ya Mfumo wa Mikopo`,
      14,
      pageHeight - 8,
    );
    doc.text(
      `Ukurasa ${i} kati ya ${pageCount}`,
      pageWidth - 14,
      pageHeight - 8,
      { align: 'right' },
    );
  }
}

export interface CustomerStatementParams {
  customer: Customer;
  loans: Loan[];
  repayments: Repayment[];
  company: CompanySettings;
}

export function downloadCustomerStatementPdf({
  customer,
  loans,
  repayments,
  company,
}: CustomerStatementParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as DocWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const today = todayISO();

  const custLoans = loans.filter((l) => l.customerId === customer.id);
  const custLoanIds = new Set(custLoans.map((l) => l.id));
  const custRepayments = repayments
    .filter((r) => r.customerId === customer.id || custLoanIds.has(r.loanId))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const totalPrincipal = custLoans.reduce((s, l) => s + (l.principal || 0), 0);
  const totalInterest = custLoans.reduce((s, l) => s + (l.totalInterest || 0), 0);
  const totalPenalty = custLoans.reduce((s, l) => s + (l.penaltyApplied || 0), 0);
  const totalDue = custLoans.reduce((s, l) => s + (l.totalDue || 0), 0);
  const totalPaid = custLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
  const totalRemaining = custLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(company.companyName.toUpperCase(), 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const companyContact = [
    [company.district, company.region].filter(Boolean).join(', '),
    company.phone ? `Simu: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(companyContact, 14, 19.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(110, 231, 183);
  doc.text('TAARIFA YA MTEJA NA MIKOPO (CUSTOMER STATEMENT)', 14, 26.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Tarehe: ${formatDateSW(today)}`, pageWidth - 14, 13, { align: 'right' });
  doc.text(
    `Kumb: ST-${customer.id.slice(0, 6).toUpperCase()}`,
    pageWidth - 14,
    19.5,
    { align: 'right' },
  );

  // Customer & Guarantor Metadata Table
  autoTable(doc, {
    startY: 38,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    head: [['TAARIFA ZA MKOPAJI', 'TAARIFA ZA MDHAMINI & DHAMANA']],
    body: [
      [
        [
          `Jina Kamili: ${customer.fullName}`,
          `Simu: ${customer.phone}`,
          `Email: ${customer.email || '-'}`,
          `Kitambulisho: ${customer.idNumber || '-'}`,
          `Anuani: ${customer.street}, ${customer.district}`,
          `Kazi / Biashara: ${customer.occupation || '-'}`,
          `Benki & Akaunti: ${customer.bankName || customer.bankAccountNumber ? `${customer.bankName || 'Benki'} - ${customer.bankAccountNumber || '-'}` : '-'}`,
        ].join('\n'),
        [
          `Jina la Mdhamini: ${customer.witnessName}`,
          `Simu ya Mdhamini: ${customer.witnessPhone}`,
          `Mtaa / Wilaya: ${[customer.witnessStreet, customer.witnessDistrict].filter(Boolean).join(', ') || customer.district}`,
          `Dhamana ya Mkopo: ${customer.collateral || '-'}`,
          `Check No. (Mtumishi): ${customer.isGovernmentEmployee ? customer.checkNumber || '-' : 'Si Mtumishi'}`,
          `Makato ya Moja kwa Moja: ${customer.bankMandateActive ? 'Ndiyo' : 'Hapana'}`,
          `Idadi ya Mikopo: ${custLoans.length}`,
        ].join('\n'),
      ],
    ],
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc.lastAutoTable?.finalY ?? 76) + 6;

  // Summary Strip Table
  autoTable(doc, {
    startY: nextY,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      halign: 'right',
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'right',
    },
    head: [['MTAJI ULIOKOPWA', 'RIBA + ADHABU', 'JUMLA YA DENI', 'JUMLA ALIYOLIPA', 'SALIO LINALODAIWA']],
    body: [
      [
        formatTZS(totalPrincipal),
        formatTZS(totalInterest + totalPenalty),
        formatTZS(totalDue),
        { content: formatTZS(totalPaid), styles: { textColor: [4, 120, 87], fontStyle: 'bold' } },
        { content: formatTZS(totalRemaining), styles: { textColor: [185, 28, 28], fontStyle: 'bold' } },
      ],
    ],
    margin: { left: 14, right: 14 },
  });

  nextY = (doc.lastAutoTable?.finalY ?? nextY + 18) + 8;

  // Section 1: Loans Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Orodha ya Mikopo ya Mteja', 14, nextY);

  if (custLoans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Mteja huyu hana mkopo uliosajiliwa hadi sasa.', 14, nextY + 6);
    nextY += 14;
  } else {
    autoTable(doc, {
      startY: nextY + 3,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.4,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'center' },
      },
      head: [
        [
          '#',
          'Aina ya Mkopo',
          'Kipindi',
          'Mtaji',
          'Riba',
          'Adhabu',
          'Jumla Deni',
          'Aliyolipa',
          'Salio',
          'Hali',
        ],
      ],
      body: custLoans.map((l, idx) => [
        String(idx + 1),
        `${l.loanTypeName}\n(${l.durationCount} ${l.frequency === 'weekly' ? 'wiki' : 'miezi'})`,
        `${formatDateSW(l.startDate)}\n-> ${formatDateSW(l.endDate)}`,
        formatTZS(l.principal),
        formatTZS(l.totalInterest),
        formatTZS(l.penaltyApplied || 0),
        formatTZS(l.totalDue),
        formatTZS(getLoanPaidTotal(l)),
        formatTZS(getLoanRemainingBalance(l)),
        getLoanStatusLabelSW(l),
      ]),
      foot: [
        [
          '',
          'JUMLA',
          '',
          formatTZS(totalPrincipal),
          formatTZS(totalInterest),
          formatTZS(totalPenalty),
          formatTZS(totalDue),
          formatTZS(totalPaid),
          formatTZS(totalRemaining),
          '',
        ],
      ],
      margin: { left: 14, right: 14 },
    });
    nextY = (doc.lastAutoTable?.finalY ?? nextY + 25) + 8;
  }

  // Section 2: Repayments History
  if (nextY > 245) {
    doc.addPage();
    nextY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Historia ya Marejesho & Risiti za Malipo', 14, nextY);

  if (custRepayments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Hakuna malipo au risiti zilizorekodiwa kwa mteja huyu hadi sasa.', 14, nextY + 6);
    nextY += 16;
  } else {
    const loanNameById = new Map(custLoans.map((l) => [l.id, l.loanTypeName]));
    const sumRepayPrincipal = custRepayments.reduce((s, r) => s + (r.principalPortion || 0), 0);
    const sumRepayInterest = custRepayments.reduce((s, r) => s + (r.interestPortion || 0), 0);
    const sumRepayPenalty = custRepayments.reduce((s, r) => s + (r.penaltyPortion || 0), 0);
    const sumRepayTotal = custRepayments.reduce((s, r) => s + (r.amount || 0), 0);

    autoTable(doc, {
      startY: nextY + 3,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.4,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [6, 95, 70],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      head: [['Na. Risiti', 'Tarehe', 'Mkopo', 'Mtaji', 'Riba', 'Adhabu', 'Jumla', 'Njia ya Malipo']],
      body: custRepayments.map((r) => [
        r.receiptNumber,
        formatDateSW(r.paymentDate),
        loanNameById.get(r.loanId) || 'Mkopo',
        formatTZS(r.principalPortion),
        formatTZS(r.interestPortion),
        formatTZS(r.penaltyPortion),
        formatTZS(r.amount),
        getPaymentMethodLabel(r.paymentMethod),
      ]),
      foot: [
        [
          'JUMLA',
          `${custRepayments.length} Risiti`,
          '',
          formatTZS(sumRepayPrincipal),
          formatTZS(sumRepayInterest),
          formatTZS(sumRepayPenalty),
          formatTZS(sumRepayTotal),
          '',
        ],
      ],
      margin: { left: 14, right: 14 },
    });
    nextY = (doc.lastAutoTable?.finalY ?? nextY + 25) + 10;
  }

  // Official Sign-off Block
  if (nextY > 255) {
    doc.addPage();
    nextY = 20;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(14, nextY, pageWidth - 14, nextY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Imetolewa na: ${company.companyName} - ${company.district}`, 14, nextY + 7);
  doc.text('Sahihi ya Afisa & Muhuri wa Ofisi: ____________________________', 14, nextY + 14);
  doc.text(`Tarehe: ${formatDateSW(today)}`, pageWidth - 14, nextY + 14, { align: 'right' });

  addPageFooters(doc, company.companyName);
  doc.save(`Customer_Statement_${sanitizeFileSegment(customer.fullName)}_${today}.pdf`);
}

export interface AllCustomersReportParams {
  rows: {
    customer: Customer;
    loans: Loan[];
    totalLoaned: number;
    totalPaid: number;
    totalRemaining: number;
    allCompleted: boolean;
  }[];
  company: CompanySettings;
  filterLabel: string;
  searchTerm?: string;
}

export function downloadAllCustomersReportPdf({
  rows,
  company,
  filterLabel,
  searchTerm,
}: AllCustomersReportParams): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as DocWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const today = todayISO();

  const allLoans = rows.flatMap((r) => r.loans.map((loan) => ({ customer: r.customer, loan })));
  const grandPrincipal = allLoans.reduce((s, x) => s + (x.loan.principal || 0), 0);
  const grandInterest = allLoans.reduce((s, x) => s + (x.loan.totalInterest || 0), 0);
  const grandPenalty = allLoans.reduce((s, x) => s + (x.loan.penaltyApplied || 0), 0);
  const grandLoaned = rows.reduce((s, r) => s + r.totalLoaned, 0);
  const grandPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
  const grandRemaining = rows.reduce((s, r) => s + r.totalRemaining, 0);

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(company.companyName.toUpperCase(), 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${company.district}  |  Simu: ${company.phone}  |  Email: ${company.email || '-'}`,
    14,
    17,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(110, 231, 183);
  doc.text('RIPOTI YA WATEJA NA MIKOPO INAYOHUSIKA', 14, 23.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Tarehe: ${formatDateSW(today)}`, pageWidth - 14, 11, { align: 'right' });
  const filterInfo = `Kigezo: ${filterLabel}${searchTerm ? ` | Utafutaji: "${searchTerm}"` : ''}`;
  doc.text(filterInfo, pageWidth - 14, 17, { align: 'right' });

  // KPI Strip
  autoTable(doc, {
    startY: 33,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.8,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      halign: 'right',
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'right',
    },
    head: [
      [
        'WATEJA',
        'MIKOPO',
        'MTAJI ULIOKOPESHWA',
        'JUMLA YA DENI',
        'JUMLA ILIYOLIPWA',
        'SALIO LINALODAIWA',
      ],
    ],
    body: [
      [
        String(rows.length),
        String(allLoans.length),
        formatTZS(grandPrincipal),
        formatTZS(grandLoaned),
        { content: formatTZS(grandPaid), styles: { textColor: [4, 120, 87], fontStyle: 'bold' } },
        { content: formatTZS(grandRemaining), styles: { textColor: [185, 28, 28], fontStyle: 'bold' } },
      ],
    ],
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc.lastAutoTable?.finalY ?? 52) + 8;

  // Table 1: Customer Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Muhtasari wa Wateja', 14, nextY);

  autoTable(doc, {
    startY: nextY + 3,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.4,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'center' },
    },
    head: [
      [
        '#',
        'Jina la Mteja',
        'Simu & Anuani',
        'Mdhamini & Dhamana',
        'Mikopo',
        'Jumla ya Mkopo',
        'Aliyolipa',
        'Anachodaiwa',
        'Hali',
      ],
    ],
    body: rows.map((row, idx) => [
      String(idx + 1),
      row.customer.fullName,
      `${row.customer.phone}\n${row.customer.street}, ${row.customer.district}`,
      `${row.customer.witnessName} (${row.customer.witnessPhone})\nDhamana: ${row.customer.collateral || '-'}`,
      String(row.loans.length),
      formatTZS(row.totalLoaned),
      formatTZS(row.totalPaid),
      formatTZS(row.totalRemaining),
      row.loans.length === 0 ? 'Hana Mkopo' : row.allCompleted ? 'Amemaliza' : 'Anaendelea',
    ]),
    foot: [
      [
        '',
        'JUMLA KUU',
        `${rows.length} Wateja`,
        '',
        String(allLoans.length),
        formatTZS(grandLoaned),
        formatTZS(grandPaid),
        formatTZS(grandRemaining),
        '',
      ],
    ],
    margin: { left: 14, right: 14 },
  });

  nextY = (doc.lastAutoTable?.finalY ?? nextY + 25) + 9;

  // Table 2: Associated Loans Breakdown
  if (allLoans.length > 0) {
    if (nextY > 175) {
      doc.addPage();
      nextY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('2. Maelezo ya Mikopo Inayohusika', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 7.7,
        cellPadding: 2.3,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [6, 95, 70],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' },
        11: { halign: 'center' },
      },
      head: [
        [
          '#',
          'Mteja',
          'Aina ya Mkopo',
          'Makato',
          'Kipindi',
          'Mtaji',
          'Riba',
          'Adhabu',
          'Jumla Deni',
          'Aliyolipa',
          'Salio',
          'Hali',
        ],
      ],
      body: allLoans.map(({ customer, loan }, idx) => [
        String(idx + 1),
        `${customer.fullName}\n(${customer.phone})`,
        loan.loanTypeName,
        `${getFrequencyLabel(loan.frequency)} (${loan.durationCount})`,
        `${formatDateSW(loan.startDate)} - ${formatDateSW(loan.endDate)}`,
        formatTZS(loan.principal),
        formatTZS(loan.totalInterest),
        formatTZS(loan.penaltyApplied || 0),
        formatTZS(loan.totalDue),
        formatTZS(getLoanPaidTotal(loan)),
        formatTZS(getLoanRemainingBalance(loan)),
        getLoanStatusLabelSW(loan),
      ]),
      foot: [
        [
          '',
          'JUMLA',
          `${allLoans.length} Mikopo`,
          '',
          '',
          formatTZS(grandPrincipal),
          formatTZS(grandInterest),
          formatTZS(grandPenalty),
          formatTZS(grandLoaned),
          formatTZS(grandPaid),
          formatTZS(grandRemaining),
          '',
        ],
      ],
      margin: { left: 14, right: 14 },
    });
  }

  addPageFooters(doc, company.companyName);
  doc.save(`Ripoti_ya_Wateja_na_Mikopo_${today}.pdf`);
}

export interface ReceiptPdfParams {
  repayment: Repayment;
  loan: Loan;
  customer: Customer;
  company: CompanySettings;
}

export function downloadReceiptPdf({
  repayment,
  loan,
  customer,
  company,
}: ReceiptPdfParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' }) as DocWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalPaidNow = getLoanPaidTotal(loan);

  // Header Banner with Full Company Details
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(company.companyName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  const locationLine = [
    company.contractOrgName || '',
    [company.district || 'TANDAHIMBA', company.region || 'MTAA WA AMANI-MTWARA']
      .filter(Boolean)
      .join('-'),
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(locationLine, pageWidth / 2, 15.5, { align: 'center', maxWidth: pageWidth - 16 });

  const contactLine = [
    company.phone ? `Simu: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
    OFFICIAL_DOMAIN,
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(contactLine, pageWidth / 2, 20.5, { align: 'center', maxWidth: pageWidth - 16 });

  doc.text(`Afisa Mkopeshaji: ${company.lenderName}`, pageWidth / 2, 25, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(110, 231, 183);
  doc.text('RISITI RASMI YA REJESHO LA MKOPO', pageWidth / 2, 31, { align: 'center' });

  const bodyRows: (string | { content: string; styles: Record<string, unknown> })[][] = [
    ['Namba ya Risiti', repayment.receiptNumber],
    ['Tarehe ya Malipo', formatDateSW(repayment.paymentDate)],
    ['Jina la Mteja', customer.fullName],
    ['Simu ya Mteja', customer.phone],
    ['Aina ya Mkopo', loan.loanTypeName],
    [
      'Njia ya Malipo',
      `${getPaymentMethodLabel(repayment.paymentMethod)}${repayment.channelDetail ? ` (${repayment.channelDetail})` : ''}`,
    ],
  ];

  if (repayment.penaltyPortion > 0) {
    bodyRows.push(['Adhabu Iliyolipwa', formatTZS(repayment.penaltyPortion)]);
  }

  bodyRows.push(
    [
      { content: 'KIASI ALICHOLIPA SASA', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      {
        content: formatTZS(repayment.amount),
        styles: { fontStyle: 'bold', textColor: [4, 120, 87], fillColor: [241, 245, 249] },
      },
    ],
    ['Jumla Aliyolipa Hadi Sasa', formatTZS(totalPaidNow)],
    [
      { content: 'SALIO ANACHODAIWA', styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } },
      {
        content: formatTZS(repayment.balanceAfter),
        styles: { fontStyle: 'bold', textColor: [185, 28, 28], fillColor: [254, 242, 242] },
      },
    ],
  );

  autoTable(doc, {
    startY: 40,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3.1,
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 52, textColor: [71, 85, 105] },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    body: bodyRows,
    margin: { left: 12, right: 12 },
  });

  let endY = (doc.lastAutoTable?.finalY ?? 135) + 7;
  if (company.paymentChannelsNote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Malipo Rasmi: ${company.paymentChannelsNote}`, pageWidth / 2, endY, {
      align: 'center',
      maxWidth: pageWidth - 24,
    });
    endY += 7;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Asante kwa kufanya rejesho lako kwa wakati. Risiti hii imetolewa na ${company.companyName} (${OFFICIAL_DOMAIN}).`,
    pageWidth / 2,
    endY,
    { align: 'center', maxWidth: pageWidth - 24 },
  );

  doc.save(`Risiti_${sanitizeFileSegment(repayment.receiptNumber)}_${repayment.paymentDate}.pdf`);
}

export interface ContractPdfParams {
  loan: Loan;
  customer: Customer;
  company: CompanySettings;
}

export function downloadLoanContractPdf({
  loan,
  customer,
  company,
}: ContractPdfParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;

  const unitLabel = loan.frequency === 'weekly' ? 'wiki' : 'miezi';
  const freqPhrase = loan.frequency === 'weekly' ? 'kila wiki' : 'kila mwezi';
  const perPeriodInterest = Math.round(loan.totalInterest / Math.max(1, loan.durationCount));
  const penaltyRate = loan.penaltyPercent ?? company.defaultPenaltyPercent ?? 5;
  const interestPctDisplay =
    loan.interestType === 'fixed_amount'
      ? `${Math.round((loan.totalInterest / Math.max(1, loan.principal)) * 100)}%`
      : `${loan.interestValue}%`;
  const collateralText = loan.collateral || customer.collateral || '................................';

  // Header
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${(company.companyName || 'MM-MICROFINANCE').toUpperCase()} ${(company.district || 'TANDAHIMBA').toUpperCase()}-${(company.region || 'MTAA WA AMANI-MTWARA').toUpperCase()}`,
    pageWidth / 2,
    18,
    {
      align: 'center',
    },
  );
  doc.setFontSize(11);
  doc.text(
    (company.contractOrgName || 'MHAIKI_ONLINE_MICRO-CREDIT').toUpperCase(),
    pageWidth / 2,
    24,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Simu ya Ofisi: ${company.phone}  |  Namba ya Mkopo: ${loan.id}`, pageWidth / 2, 29.5, {
    align: 'center',
  });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(margin, 33, pageWidth - margin, 33);

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('MKATABA MDOGO WA KUKOPESHA PESA TASLIMU', pageWidth / 2, 40, { align: 'center' });

  let y = 49;
  const writeParagraph = (text: string, italic = false) => {
    doc.setFont('times', italic ? 'italic' : 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(17, 24, 39);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    if (y + lines.length * 5 > 272) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, margin, y);
    y += lines.length * 4.8 + 3.5;
  };

  writeParagraph(
    `Huu ni mkataba baina ya ${company.lenderName} ambaye katika mkataba huu anajulikana kama mkopeshaji na ${customer.fullName} ambaye katika mkataba huu anajulikana kama mkopaji na kwamba pande zote mbili zimekubaliana kukopeshana pesa taslimu ${formatTZS(loan.principal)} kwa makubaliano ya kulipa riba ya ${formatTZS(perPeriodInterest)} ${freqPhrase} (Jumla ya riba ${formatTZS(loan.totalInterest)}) na kwamba mkopo huu utakuwa wa ${unitLabel} ${loan.durationCount} kuanzia tarehe ${formatDateSW(loan.startDate)} hadi tarehe ${formatDateSW(loan.endDate)}.`,
  );

  writeParagraph(
    `Mkopo huu una riba ya asilimia ${interestPctDisplay} ya pesa utakayopewa (Jumla ya kurejesha ikiwa ${formatTZS(loan.totalDue)}). Na kwamba pesa iliyokopwa italipwa yote ikiwa na riba ndani ya ${unitLabel} ${loan.durationCount} au pungufu ya hapo kadri atakavyoona mteja inafaa. NA KWAMBA RIBA ILIYOKUBALIWA ITAENDELEA MPAKA PALE KIASI CHOTE KITAKAPOLIPWA.`,
  );

  writeParagraph(
    `Mkopo huu ni wa pesa taslimu ambayo utatakiwa kuilipa kwa utaratibu wa ${getFrequencyLabel(loan.frequency)} ndani ya muda uliokubaliwa (au ndani ya siku thelathini / siku saba kulingana na makubaliano ya ratiba).`,
  );

  const writeBox = (title: string, body: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const fullLines = doc.splitTextToSize(`${title}: ${body}`, maxWidth - 8) as string[];
    const boxHeight = fullLines.length * 4.3 + 6;
    if (y + boxHeight > 272) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.35);
    doc.rect(margin, y, maxWidth, boxHeight, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.text(fullLines, margin + 4, y + 5);
    y += boxHeight + 4;
  };

  writeBox(
    `KIPENGELE CHA ADHABU YA UCHELEWESHAJI (${penaltyRate}%)`,
    `Endapo mkopaji atachelewesha rejesho au kupitisha tarehe ya kumaliza mkopo (${formatDateSW(loan.endDate)}), atatozwa adhabu ya asilimia ${penaltyRate}% ya kiasi kilichocheleweshwa au salio lililobaki.`,
  );

  writeBox(
    'KIPENGELE CHA WAJIBU WA MDHAMINI',
    `Mimi ${customer.witnessName} (Simu: ${customer.witnessPhone}), kama mdhamini/shahidi wa mkopaji (${customer.fullName}), ninakubali na kuthibitisha kisheria kuwa nitawajibika kikamilifu kulipa deni lote la mkopo huu (ikiwemo mtaji, riba, na adhabu iliyoongezeka) endapo mkopaji atashindwa kulipa deni lake au atapotea kwa muda mrefu bila taarifa yoyote kwa mkopeshaji (${company.companyName}).`,
  );

  writeParagraph(
    `Na endapo mkopaji atashindwa kurejesha mkopo huu kwa muda mrefu tofauti na walivyokubaliana bila taarifa yoyote, mkopeshaji anaweza kuangalia namna bora zaidi itakayosaidia kupatikana kwa kiasi kilichobakia ikiwa ni pamoja na kuthamini mali ya mteja itakayosaidia kufidia kwa pesa iliyobaki au vinginevyo. NA ENDAPO MTEJA ATASHINDWA AU ATAPITISHA MUDA WA KUMALIZA DENI LAKE, MKOPESHAJI ANAWEZA KUMUONGEZEA RIBA / ADHABU YA ${penaltyRate}% KWENYE MKOPO AU PESA ILIYOBAKI.`,
  );

  writeParagraph(
    `Na kwamba mteja amekubali kuweka mali yake ${collateralText} kama dhamana ya mkopo wake. NA AMEKUBALI KUWA ENDAPO MKOPO USIPOLIPWA NDANI YA MUDA MREFU BASI MALI YAKE ITAUZWA KUFIDIA MKOPO.`,
  );

  writeParagraph(
    `Tafadhali ambatanisha kivuli cha kitambulisho cha mpiga kura / NIDA (${customer.idNumber || '.....................'}) / cha kazi kwa ushahidi.`,
    true,
  );

  if (y > 215) {
    doc.addPage();
    y = 20;
  }

  // Signatures Grid (2x2)
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const colW = (maxWidth - 10) / 2;
  const col2X = margin + colW + 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);

  doc.text(`MKOPAJI: ${customer.fullName}`, margin, y);
  doc.text(`Simu: ${customer.phone}`, margin, y + 4.5);
  doc.text(`Mtaa/Wilaya: ${customer.street}, ${customer.district}`, margin, y + 9);
  doc.text('SAHIHI: _________________ TAREHE: _________', margin, y + 15);

  doc.text(`MDHAMINI: ${customer.witnessName}`, col2X, y);
  doc.text(`Simu: ${customer.witnessPhone}`, col2X, y + 4.5);
  doc.text(
    `Mtaa/Wilaya: ${customer.witnessStreet || customer.street}, ${customer.witnessDistrict || customer.district}`,
    col2X,
    y + 9,
  );
  doc.text('SAHIHI: _________________ TAREHE: _________', col2X, y + 15);

  y += 23;
  doc.text(`MKOPESHAJI: ${company.lenderName}`, margin, y);
  doc.text(`Kampuni: ${company.companyName}`, margin, y + 4.5);
  doc.text('SAHIHI: _________________ TAREHE: _________', margin, y + 10.5);

  doc.text(`SHAHIDI WA MKOPESHAJI: ${company.lenderWitnessName}`, col2X, y);
  doc.text(`Wilaya: ${company.district}`, col2X, y + 4.5);
  doc.text('SAHIHI: _________________ TAREHE: _________', col2X, y + 10.5);

  // Official Blue Circular Office Rubber Stamp on bottom-right
  y += 22;
  if (y > 250) {
    doc.addPage();
    y = 30;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`UTHIBITISHO WA OFISI (${company.companyName})`, margin, y + 6);
  doc.text(`Tarehe ya Kuchukua Mkopo: ${formatDateSW(loan.startDate)}`, margin, y + 12);
  doc.text(`Tarehe ya Mwisho wa Mkopo: ${formatDateSW(loan.endDate)}`, margin, y + 18);

  const cx = pageWidth - margin - 20;
  const cy = y + 13;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.9);
  doc.circle(cx, cy, 17, 'S');
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, 15.2, 'S');
  doc.circle(cx, cy, 10.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(5.2);
  doc.text('MM MICROFINANCE', cx, cy - 12.2, { align: 'center' });
  doc.text('TANDAHIMBA', cx, cy + 13.8, { align: 'center' });
  doc.setFontSize(4.8);
  doc.text('OFISI YA MIKOPO', cx, cy - 5.2, { align: 'center' });
  doc.line(cx - 8.5, cy - 3.5, cx + 8.5, cy - 3.5);
  doc.setFontSize(6.5);
  doc.text(formatDateSW(loan.startDate).toUpperCase(), cx, cy + 1.2, { align: 'center' });
  doc.line(cx - 8.5, cy + 3.5, cx + 8.5, cy + 3.5);
  doc.setFontSize(4.6);
  doc.text('IMETHIBITISHWA', cx, cy + 7.2, { align: 'center' });

  addPageFooters(doc, company.companyName);
  doc.save(`Mkataba_${sanitizeFileSegment(customer.fullName)}_${loan.startDate}.pdf`);
}
