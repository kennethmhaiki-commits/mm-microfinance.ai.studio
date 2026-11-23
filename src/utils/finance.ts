import {
  CompanySettings,
  Customer,
  InstallmentItem,
  InterestType,
  Loan,
  LoanCalculationResult,
  MessageLog,
  PaymentMethod,
  Repayment,
  RepaymentFrequency,
  TomorrowReminderItem,
} from '../types';

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function tomorrowISO(baseDateStr: string = todayISO()): string {
  const parts = baseDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    const dt = new Date();
    dt.setDate(dt.getDate() + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function addPeriods(
  startDateStr: string,
  frequency: RepaymentFrequency,
  count: number,
): string {
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return todayISO();
  }
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + count * 7);
  } else {
    const targetMonth = date.getMonth() + count;
    const day = date.getDate();
    date.setMonth(targetMonth);
    if (date.getDate() !== day) {
      date.setDate(0);
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateLoan(
  principalInput: number,
  interestType: InterestType,
  interestValueInput: number,
  frequency: RepaymentFrequency,
  durationInput: number,
  startDate: string,
): LoanCalculationResult {
  const principal = Math.max(0, Math.round(principalInput));
  const durationCount = Math.max(1, Math.round(durationInput));
  const interestValue = Math.max(0, Number(interestValueInput) || 0);

  const schedule: InstallmentItem[] = [];
  let totalInterest = 0;

  if (interestType === 'flat') {
    totalInterest = Math.round(principal * (interestValue / 100));
    const perPrincipal = Math.floor(principal / durationCount);
    const perInterest = Math.floor(totalInterest / durationCount);
    let remP = principal;
    let remI = totalInterest;

    for (let i = 1; i <= durationCount; i++) {
      const pDue = i === durationCount ? remP : perPrincipal;
      const iDue = i === durationCount ? remI : perInterest;
      remP -= pDue;
      remI -= iDue;
      schedule.push({
        periodNumber: i,
        dueDate: addPeriods(startDate, frequency, i),
        principalDue: pDue,
        interestDue: iDue,
        totalDue: pDue + iDue,
        remainingPrincipalAfter: Math.max(0, remP),
      });
    }
  } else if (interestType === 'fixed_amount') {
    totalInterest = Math.round(interestValue);
    const perPrincipal = Math.floor(principal / durationCount);
    const perInterest = Math.floor(totalInterest / durationCount);
    let remP = principal;
    let remI = totalInterest;

    for (let i = 1; i <= durationCount; i++) {
      const pDue = i === durationCount ? remP : perPrincipal;
      const iDue = i === durationCount ? remI : perInterest;
      remP -= pDue;
      remI -= iDue;
      schedule.push({
        periodNumber: i,
        dueDate: addPeriods(startDate, frequency, i),
        principalDue: pDue,
        interestDue: iDue,
        totalDue: pDue + iDue,
        remainingPrincipalAfter: Math.max(0, remP),
      });
    }
  } else {
    // Reducing balance: rate per period
    const ratePerPeriod = interestValue / 100;
    const perPrincipal = Math.floor(principal / durationCount);
    let remP = principal;

    for (let i = 1; i <= durationCount; i++) {
      const pDue = i === durationCount ? remP : perPrincipal;
      const iDue = Math.round(remP * ratePerPeriod);
      totalInterest += iDue;
      remP -= pDue;
      schedule.push({
        periodNumber: i,
        dueDate: addPeriods(startDate, frequency, i),
        principalDue: pDue,
        interestDue: iDue,
        totalDue: pDue + iDue,
        remainingPrincipalAfter: Math.max(0, remP),
      });
    }
  }

  const totalPayable = principal + totalInterest;
  const installmentAmount =
    schedule.length > 0 ? Math.round(totalPayable / durationCount) : totalPayable;
  const endDate = addPeriods(startDate, frequency, durationCount);

  return {
    principal,
    totalInterest,
    totalPayable,
    installmentAmount,
    endDate,
    schedule,
  };
}

export function formatTZS(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  return `Tsh ${rounded.toLocaleString('en-US')}`;
}

export function formatDateSW(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const months = [
    'Jan',
    'Feb',
    'Mac',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthLabel = months[parts[1] - 1] || String(parts[1]).padStart(2, '0');
  return `${String(parts[2]).padStart(2, '0')} ${monthLabel} ${parts[0]}`;
}

export function normalizeTzPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('00255') && digits.length >= 14) return digits.slice(2);
  if (digits.startsWith('2550') && digits.length >= 13) return `255${digits.slice(4)}`;
  if (digits.startsWith('255') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `255${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('6'))) {
    return `255${digits}`;
  }
  return digits;
}

export function isValidTzSmsPhone(phone: string): boolean {
  const normalized = normalizeTzPhone(phone);
  return normalized.length >= 10 && normalized.length <= 15;
}

export function buildAutoSmsLogPrefix(
  loanId: string,
  periodNumber: number,
  gatewayReference?: string,
): string {
  const refPart = gatewayReference ? `|Ref:${gatewayReference}` : '';
  return `[AUTO-24H:${loanId}#${periodNumber}${refPart}]`;
}

export function getLoanPaidTotal(loan: Loan): number {
  return (
    (loan.totalPaidPrincipal || 0) +
    (loan.totalPaidInterest || 0) +
    (loan.totalPaidPenalty || 0)
  );
}

export function getLoanRemainingBalance(loan: Loan): number {
  return Math.max(0, (loan.totalDue || 0) - getLoanPaidTotal(loan));
}

export function getPeriodBounds(refDateStr: string = todayISO()) {
  const [y, m, d] = refDateStr.split('-').map(Number);
  const ref = new Date(y, m - 1, d);

  // Day
  const dayStart = refDateStr;
  const dayEnd = refDateStr;

  // Week (Monday - Sunday)
  const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStartD = new Date(ref);
  weekStartD.setDate(ref.getDate() + diffToMon);
  const weekEndD = new Date(weekStartD);
  weekEndD.setDate(weekStartD.getDate() + 6);

  // Month
  const monthStartD = new Date(y, m - 1, 1);
  const monthEndD = new Date(y, m, 0);

  // Year
  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;

  const toISO = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  return {
    dayStart,
    dayEnd,
    weekStart: toISO(weekStartD),
    weekEnd: toISO(weekEndD),
    monthStart: toISO(monthStartD),
    monthEnd: toISO(monthEndD),
    yearStart,
    yearEnd,
  };
}

export function isDateInRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

export interface InstallmentStatusRow {
  loan: Loan;
  periodNumber: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
  state: 'paid' | 'partial' | 'pending' | 'overdue';
}

export function getLoanInstallmentsWithStatus(loan: Loan): InstallmentStatusRow[] {
  const calc = calculateLoan(
    loan.principal,
    loan.interestType,
    loan.interestValue,
    loan.frequency,
    loan.durationCount,
    loan.startDate,
  );
  let remainingPaidPool =
    (loan.totalPaidPrincipal || 0) + (loan.totalPaidInterest || 0);
  const today = todayISO();

  return calc.schedule.map((item) => {
    const paidForRow = Math.min(item.totalDue, Math.max(0, remainingPaidPool));
    remainingPaidPool -= paidForRow;
    const rem = Math.max(0, item.totalDue - paidForRow);

    let state: InstallmentStatusRow['state'] = 'pending';
    if (rem === 0) {
      state = 'paid';
    } else if (paidForRow > 0) {
      state = item.dueDate < today ? 'overdue' : 'partial';
    } else if (item.dueDate < today) {
      state = 'overdue';
    }

    return {
      loan,
      periodNumber: item.periodNumber,
      dueDate: item.dueDate,
      principalDue: item.principalDue,
      interestDue: item.interestDue,
      totalDue: item.totalDue,
      paidAmount: paidForRow,
      remainingAmount: rem,
      state,
    };
  });
}

export function buildTomorrowReminderMessage(
  customerName: string,
  companyName: string,
  installmentDue: number,
  dueDate: string,
  totalPaid: number,
  totalOwed: number,
  companyPhone: string,
): string {
  return `Habari ${customerName}, huu ni ukumbusho kutoka ${companyName}. Tarehe ya rejesho lako ni KESHO (${formatDateSW(dueDate)}). Kiasi cha rejesho la kesho ni ${formatTZS(installmentDue)}. Hadi sasa umeshalipa ${formatTZS(totalPaid)} na salio lote la mkopo ni ${formatTZS(totalOwed)}. Tafadhali lipa kwa wakati kuepuka adhabu ya ucheleweshaji. Simu: ${companyPhone}.`;
}

export function getTomorrowDueReminders(
  loans: Loan[],
  customers: Customer[],
  messageLogs: MessageLog[],
  todayStr: string = todayISO(),
): TomorrowReminderItem[] {
  const targetTomorrow = tomorrowISO(todayStr);
  const items: TomorrowReminderItem[] = [];

  for (const loan of loans) {
    if (loan.status === 'completed') continue;
    const customer = customers.find((c) => c.id === loan.customerId);
    if (!customer) continue;

    const installments = getLoanInstallmentsWithStatus(loan);
    const tomorrowInst = installments.find(
      (inst) => inst.dueDate === targetTomorrow && inst.remainingAmount > 0,
    );
    if (!tomorrowInst) continue;

    const totalPaid = getLoanPaidTotal(loan);
    const totalOwed = getLoanRemainingBalance(loan);
    const alreadyPushedToday = messageLogs.some(
      (m) => m.customerId === customer.id && m.sentDate === todayStr && m.channel === 'push',
    );
    const alreadyEmailedToday = messageLogs.some(
      (m) => m.customerId === customer.id && m.sentDate === todayStr && m.channel === 'email',
    );
    const loanMarker = `${loan.id}#${tomorrowInst.periodNumber}`;
    const alreadySmsedToday = messageLogs.some(
      (m) =>
        m.customerId === customer.id &&
        m.sentDate === todayStr &&
        m.channel === 'sms' &&
        (m.messageBody.includes(loanMarker) || !m.messageBody.includes('[AUTO-24H:')),
    );

    items.push({
      loan,
      customer,
      periodNumber: tomorrowInst.periodNumber,
      dueDate: tomorrowInst.dueDate,
      installmentRemaining: tomorrowInst.remainingAmount,
      totalPaid,
      totalOwed,
      alreadyPushedToday,
      alreadyEmailedToday,
      alreadySmsedToday,
      hasValidSmsPhone: isValidTzSmsPhone(customer.phone),
    });
  }

  return items.sort((a, b) => b.installmentRemaining - a.installmentRemaining);
}

export function splitRepaymentPortions(
  loan: Loan,
  paymentAmount: number,
): { principalPortion: number; interestPortion: number; penaltyPortion: number } {
  const remPenalty = Math.max(0, (loan.penaltyApplied || 0) - (loan.totalPaidPenalty || 0));
  const remInterest = Math.max(0, (loan.totalInterest || 0) - (loan.totalPaidInterest || 0));
  const remPrincipal = Math.max(0, (loan.principal || 0) - (loan.totalPaidPrincipal || 0));

  let left = Math.max(0, Math.round(paymentAmount));

  // First clear any penalty, then proportional split between remaining interest & principal
  const penaltyPortion = Math.min(left, remPenalty);
  left -= penaltyPortion;

  const remPI = remInterest + remPrincipal;
  if (left <= 0 || remPI <= 0) {
    return { principalPortion: 0, interestPortion: 0, penaltyPortion };
  }

  if (left >= remPI) {
    return {
      principalPortion: remPrincipal,
      interestPortion: remInterest,
      penaltyPortion,
    };
  }

  const interestRatio = remInterest / remPI;
  let interestPortion = Math.round(left * interestRatio);
  interestPortion = Math.min(interestPortion, remInterest);
  let principalPortion = left - interestPortion;
  if (principalPortion > remPrincipal) {
    principalPortion = remPrincipal;
    interestPortion = Math.min(remInterest, left - principalPortion);
  }

  return { principalPortion, interestPortion, penaltyPortion };
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash (Fedha Taslimu)';
    case 'bank':
      return 'Benki (Bank Transfer)';
    case 'mobile_money':
      return 'Mitandao ya Simu (Mobile Money)';
  }
}

export function getInterestTypeLabel(type: InterestType): string {
  switch (type) {
    case 'flat':
      return 'Riba Isiyobadilika (Flat Rate %)';
    case 'reducing':
      return 'Riba ya Kupungua (Reducing Balance %)';
    case 'fixed_amount':
      return 'Kiasi Maalum cha Riba (Tsh)';
  }
}

export function getFrequencyLabel(freq: RepaymentFrequency): string {
  return freq === 'weekly' ? 'Kila Wiki' : 'Kila Mwezi';
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildSwahiliContractHtml(
  loan: Loan,
  customer: Customer,
  company: CompanySettings,
): string {
  const unitLabel = loan.frequency === 'weekly' ? 'wiki' : 'miezi';
  const freqPhrase = loan.frequency === 'weekly' ? 'kila wiki' : 'kila mwezi';
  const perPeriodInterest = Math.round(loan.totalInterest / Math.max(1, loan.durationCount));
  const collateralText = escapeHtml(
    loan.collateral || customer.collateral || '................................................',
  );
  const penaltyRate = loan.penaltyPercent ?? company.defaultPenaltyPercent ?? 0;
  const safeDistrict = escapeHtml((company.district || 'TANDAHIMBA').toUpperCase());
  const safeRegion = escapeHtml((company.region || 'MTAA WA AMANI-MTWARA').toUpperCase());
  const safeContractOrg = escapeHtml(company.contractOrgName || 'MHAIKI_ONLINE_MICRO-CREDIT');
  const safeCompanyName = escapeHtml(company.companyName);
  const safeCompanyPhone = escapeHtml(company.phone);
  const safeLenderName = escapeHtml(company.lenderName);
  const safeLenderWitness = escapeHtml(company.lenderWitnessName);
  const safeCompanyDistrict = escapeHtml(company.district);
  const safeCustomerName = escapeHtml(customer.fullName);
  const safeCustomerPhone = escapeHtml(customer.phone);
  const safeCustomerStreet = escapeHtml(customer.street);
  const safeCustomerDistrict = escapeHtml(customer.district);
  const safeCustomerId = escapeHtml(customer.idNumber || '.....................');
  const safeWitnessName = escapeHtml(customer.witnessName);
  const safeWitnessPhone = escapeHtml(customer.witnessPhone);
  const safeWitnessStreet = escapeHtml(customer.witnessStreet || customer.street);
  const safeWitnessDistrict = escapeHtml(customer.witnessDistrict || customer.district);
  const safeLoanId = escapeHtml(loan.id);
  const safeLoanTypeName = escapeHtml(loan.loanTypeName);
  const safeStartDate = escapeHtml(formatDateSW(loan.startDate));
  const safeEndDate = escapeHtml(formatDateSW(loan.endDate));

  return `<!doctype html>
<html lang="sw">
<head>
<meta charset="UTF-8" />
<title>Mkataba wa Mkopo - ${safeCustomerName}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111827; max-width: 780px; margin: 32px auto; padding: 24px; line-height: 1.65; }
  .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 22px; }
  .header h1 { margin: 0; font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase; }
  .header h2 { margin: 4px 0; font-size: 16px; text-transform: uppercase; }
  .header h3 { margin: 6px 0 0; font-size: 15px; text-decoration: underline; }
  .meta-bar { display: flex; justify-content: space-between; font-size: 12px; color: #374151; margin-bottom: 16px; }
  p { margin: 12px 0; text-align: justify; }
  .fill { font-weight: bold; text-decoration: underline; padding: 0 3px; }
  .penalty-box { border: 1px solid #111827; padding: 10px 14px; margin: 16px 0; background: #f9fafb; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 28px; font-size: 14px; }
  .sig-block { border-top: 1px dashed #9ca3af; padding-top: 10px; }
  .stamp-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 26px; padding-top: 18px; border-top: 1px solid #cbd5e1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .stamp-meta { font-family: Arial, sans-serif; font-size: 12px; color: #374151; line-height: 1.6; }
  .stamp-box { transform: rotate(-6deg); flex-shrink: 0; }
  .action-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; margin-bottom: 18px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; font-family: Arial, sans-serif; }
  .btn { padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; }
  .btn-primary { background: #0f172a; color: #ffffff; border-color: #0f172a; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="action-bar no-print">
    <button type="button" class="btn" onclick="window.close(); if (!window.closed && window.history.length > 1) window.history.back();">← Ondoka / Funga</button>
    <button type="button" class="btn btn-primary" onclick="window.print()">Chapisha Mkataba / Hifadhi PDF</button>
  </div>
  <div class="header">
    <h1>${safeCompanyName} ${safeDistrict}-${safeRegion}</h1>
    <h2>${safeContractOrg}</h2>
    <h3>MKATABA MDOGO WA KUKOPESHA PESA TASLIMU</h3>
  </div>

  <div class="meta-bar">
    <span>Namba ya Mkopo: <strong>${safeLoanId}</strong></span>
    <span>Aina ya Mkopo: <strong>${safeLoanTypeName}</strong></span>
    <span>Simu ya Ofisi: <strong>${safeCompanyPhone}</strong></span>
  </div>

  <p>
    Huu ni mkataba baina ya <span class="fill">${safeLenderName}</span> ambaye katika mkataba huu
    anajulikana kama mkopeshaji na <span class="fill">${safeCustomerName}</span> ambaye katika
    mkataba huu anajulikana kama mkopaji na kwamba pande zote mbili zimekubaliana kukopeshana pesa taslimu
    <span class="fill">${escapeHtml(formatTZS(loan.principal))}</span> kwa makubaliano ya kulipa riba ya
    <span class="fill">${escapeHtml(formatTZS(perPeriodInterest))}</span> ${freqPhrase} (Jumla ya Riba ${escapeHtml(formatTZS(loan.totalInterest))})
    na kwamba mkopo huu utakuwa wa ${unitLabel} <span class="fill">${loan.durationCount}</span>
    kuanzia tarehe <span class="fill">${safeStartDate}</span> hadi tarehe
    <span class="fill">${safeEndDate}</span>.
  </p>

  <p>
    Mkopo huu una riba ya asilimia <span class="fill">${loan.interestType === 'fixed_amount' ? `${Math.round((loan.totalInterest / Math.max(1, loan.principal)) * 100)}%` : `${loan.interestValue}%`}</span>
    ya pesa utakayopewa (Jumla ya kurejesha ikiwa ni <span class="fill">${escapeHtml(formatTZS(loan.totalDue))}</span>).
    Na kwamba pesa iliyokopwa italipwa yote ikiwa na riba ndani ya ${unitLabel} ${loan.durationCount} au pungufu ya hapo
    kadri atakavyoona mteja inafaa. NA KWAMBA RIBA ILIYOKUBALIWA ITAENDELEA MPAKA PALE KIASI CHOTE KITAKAPOLIPWA.
  </p>

  <p>
    Mkopo huu ni wa pesa taslimu ambayo utatakiwa kuilipa kwa utaratibu wa <span class="fill">${escapeHtml(getFrequencyLabel(loan.frequency))}</span>
    ndani ya muda uliokubaliwa (au ndani ya siku thelathini / siku saba kadri ya mkataba wa rejesho).
  </p>

  <div class="penalty-box">
    <strong>KIPENGELE CHA ADHABU YA UCHELEWESHAJI:</strong> Endapo mkopaji atachelewesha rejesho au kupitisha muda wa mwisho wa mkataba (${safeEndDate}),
    atatozwa adhabu ya asilimia <span class="fill">${penaltyRate}%</span> juu ya kiasi kilichocheleweshwa au salio lililobaki kwa kila kipindi cha ucheleweshaji.
  </div>

  <div class="penalty-box">
    <strong>KIPENGELE CHA WAJIBU WA MDHAMINI:</strong> Mimi <span class="fill">${safeWitnessName}</span>
    (Simu: <span class="fill">${safeWitnessPhone}</span>), kama mdhamini/shahidi wa mkopaji
    (<span class="fill">${safeCustomerName}</span>), ninakubali na kuthibitisha kisheria kuwa nitawajibika kikamilifu
    kulipa deni lote la mkopo huu (ikiwemo mtaji, riba, na adhabu iliyoongezeka) endapo mkopaji atashindwa kulipa deni lake
    au atapotea kwa muda mrefu bila taarifa yoyote kwa mkopeshaji (${safeCompanyName}).
  </div>

  <p>
    Na endapo mkopaji atashindwa kurejesha mkopo huu kwa muda mrefu tofauti na walivyokubaliana bila taarifa yoyote,
    mkopeshaji anaweza kuangalia namna bora zaidi itakayosaidia kupatikana kwa kiasi kilichobakia ikiwa ni pamoja na
    kuthamini mali ya mteja itakayosaidia kufidia kwa pesa iliyobaki au vinginevyo.
    Mdhamini wa mteja atahusika kulipa mkopo endapo mdaiwa atashindwa kulipa deni lake au atapotea kwa muda mrefu bila taarifa.
    NA ENDAPO MTEJA ATASHINDWA AU ATAPITISHA MUDA WA KUMALIZA DENI LAKE, MKOPESHAJI ANAWEZA KUMUONGEZEA RIBA / ADHABU YA ${penaltyRate}%
    KWENYE MKOPO AU PESA ILIYOBAKI ILI KULINDA MKOPO.
  </p>

  <p>
    Na kwamba mteja amekubali kuweka mali yake <span class="fill">${collateralText}</span> kama dhamana ya mkopo wake.
    NA AMEKUBALI KUWA ENDAPO MKOPO USIPOLIPWA NDANI YA MUDA MREFU BASI MALI YAKE ITAUZWA KUFIDIA MKOPO.
  </p>

  <p><em>Tafadhali ambatanisha kivuli cha kitambulisho cha mpiga kura / NIDA (${safeCustomerId}) / cha kazi kwa ushahidi.</em></p>

  <div class="sig-grid">
    <div class="sig-block">
      <div><strong>JINA LA MKOPAJI:</strong> ${safeCustomerName}</div>
      <div><strong>NAMBA YA SIMU:</strong> ${safeCustomerPhone}</div>
      <div><strong>MTAA ANAPOISHI:</strong> ${safeCustomerStreet} · <strong>WILAYA:</strong> ${safeCustomerDistrict}</div>
      <div style="margin-top:14px;">SAHIHI: ........................... TAREHE: .................</div>
    </div>
    <div class="sig-block">
      <div><strong>JINA LA MDHAMINI / SHAHIDI WA MKOPAJI:</strong> ${safeWitnessName}</div>
      <div><strong>NAMBA YA SIMU:</strong> ${safeWitnessPhone}</div>
      <div><strong>MTAA ANAPOISHI:</strong> ${safeWitnessStreet} · <strong>WILAYA:</strong> ${safeWitnessDistrict}</div>
      <div style="margin-top:14px;">SAHIHI: ........................... TAREHE: .................</div>
    </div>
    <div class="sig-block">
      <div><strong>JINA LA MKOPESHAJI:</strong> ${safeLenderName}</div>
      <div><strong>KAMPUNI:</strong> ${safeCompanyName}</div>
      <div style="margin-top:14px;">SAHIHI: ........................... TAREHE: .................</div>
    </div>
    <div class="sig-block">
      <div><strong>SHAHIDI WA MKOPESHAJI:</strong> ${safeLenderWitness}</div>
      <div><strong>WILAYA:</strong> ${safeCompanyDistrict}</div>
      <div style="margin-top:14px;">SAHIHI: ........................... TAREHE: .................</div>
    </div>
  </div>

  <div class="stamp-row">
    <div class="stamp-meta">
      <div><strong>UTHIBITISHO WA OFISI (${safeCompanyName})</strong></div>
      <div>Tarehe ya Kuchukua Mkopo: <strong>${safeStartDate}</strong></div>
      <div>Tarehe ya Mwisho wa Mkopo: <strong>${safeEndDate}</strong></div>
    </div>
    <div class="stamp-box">
      <svg width="172" height="172" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, sans-serif;">
        <defs>
          <path id="html-stamp-top" d="M 31.74,111.20 A 62,62 0 1,1 148.26,111.20" />
          <path id="html-stamp-bot" d="M 30.20,117.90 A 66,66 0 0,0 149.80,117.90" />
        </defs>
        <circle cx="90" cy="90" r="82" fill="rgba(30, 58, 138, 0.04)" stroke="#1e3a8a" stroke-width="3.5" />
        <circle cx="90" cy="90" r="76" fill="none" stroke="#1e3a8a" stroke-width="1.2" />
        <circle cx="90" cy="90" r="48" fill="none" stroke="#1e3a8a" stroke-width="1.4" />
        <text fill="#1e3a8a" font-size="10" font-weight="800" letter-spacing="1">
          <textPath href="#html-stamp-top" startOffset="50%" text-anchor="middle">MM MICROFINANCE-TANDAHIMBA</textPath>
        </text>
        <text fill="#1e3a8a" font-size="8.2" font-weight="700" letter-spacing="1">
          <textPath href="#html-stamp-bot" startOffset="50%" text-anchor="middle">★ MHURI RASMI WA OFISI ★</textPath>
        </text>
        <text x="90" y="62" text-anchor="middle" fill="#1e3a8a" font-size="6.5" font-weight="700" letter-spacing="0.8">OFISI YA MIKOPO</text>
        <line x1="44" y1="69" x2="136" y2="69" stroke="#1e3a8a" stroke-width="1.2" />
        <text x="90" y="81" text-anchor="middle" fill="#1e3a8a" font-size="6.5" font-weight="700" letter-spacing="0.6">TAREHE YA MKOPO</text>
        <text x="90" y="99" text-anchor="middle" fill="#1e3a8a" font-size="12.5" font-weight="800" letter-spacing="0.8">${escapeHtml(formatDateSW(loan.startDate).toUpperCase())}</text>
        <line x1="44" y1="109" x2="136" y2="109" stroke="#1e3a8a" stroke-width="1.2" />
        <text x="90" y="122" text-anchor="middle" fill="#1e3a8a" font-size="6.5" font-weight="700" letter-spacing="0.8">IMETHIBITISHWA</text>
      </svg>
    </div>
  </div>
</body>
</html>`;
}

export function buildReceiptHtml(
  repayment: Repayment,
  loan: Loan,
  customer: Customer,
  company: CompanySettings,
): string {
  const totalPaidNow = getLoanPaidTotal(loan);
  const penaltyRow =
    repayment.penaltyPortion > 0
      ? `<tr><td>Adhabu Iliyolipwa</td><td>${escapeHtml(formatTZS(repayment.penaltyPortion))}</td></tr>`
      : '';
  const locationText = [
    company.district || 'TANDAHIMBA',
    company.region || 'MTAA WA AMANI-MTWARA',
  ]
    .filter(Boolean)
    .join('-');
  const contactParts = [
    company.phone ? `Simu: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
    OFFICIAL_DOMAIN,
  ].filter(Boolean);
  const safeReceiptNo = escapeHtml(repayment.receiptNumber);
  const safeCompanyName = escapeHtml(company.companyName);
  const safeContractOrg = escapeHtml(company.contractOrgName || company.companyName);
  const safeLocation = escapeHtml(locationText);
  const safeContact = escapeHtml(contactParts.join(' · '));
  const safeLender = escapeHtml(company.lenderName);
  const safePaymentDate = escapeHtml(formatDateSW(repayment.paymentDate));
  const safeCustomerName = escapeHtml(customer.fullName);
  const safeCustomerPhone = escapeHtml(customer.phone);
  const safeLoanType = escapeHtml(loan.loanTypeName);
  const safeChannelDetail = repayment.channelDetail ? ` (${escapeHtml(repayment.channelDetail)})` : '';
  const safeMethodLabel = escapeHtml(getPaymentMethodLabel(repayment.paymentMethod));
  const safeChannelsNote = company.paymentChannelsNote ? escapeHtml(company.paymentChannelsNote) : '';

  return `<!doctype html>
<html lang="sw">
<head>
<meta charset="UTF-8" />
<title>Risiti ${safeReceiptNo}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 480px; margin: 24px auto; padding: 20px; border: 1px solid #cbd5e1; color: #0f172a; }
  h1 { font-size: 18px; margin: 0; text-align: center; }
  .sub { font-size: 12px; color: #475569; text-align: center; margin-top: 4px; line-height: 1.45; }
  .company-box { border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  td { padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
  td:last-child { text-align: right; font-weight: 600; }
  .total { font-size: 15px; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
  .channels { margin-top: 12px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px; color: #334155; }
  .action-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; }
  .btn { padding: 6px 12px; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; }
  .btn-primary { background: #0f172a; color: #ffffff; border-color: #0f172a; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="action-bar no-print">
    <button type="button" class="btn" onclick="window.close(); if (!window.closed && window.history.length > 1) window.history.back();">← Ondoka / Funga</button>
    <button type="button" class="btn btn-primary" onclick="window.print()">Chapisha Risiti</button>
  </div>
  <div class="company-box">
    <h1>${safeCompanyName}</h1>
    <div class="sub">
      <div><strong>${safeContractOrg}</strong></div>
      <div>${safeLocation}</div>
      <div>${safeContact}</div>
      <div>Afisa Mkopeshaji: ${safeLender}</div>
    </div>
  </div>
  <h2 style="font-size:14px;text-align:center;text-transform:uppercase;margin:8px 0;">RISITI RASMI YA MALIPO YA MKOPO</h2>
  <table>
    <tr><td>Namba ya Risiti</td><td>${safeReceiptNo}</td></tr>
    <tr><td>Tarehe ya Malipo</td><td>${safePaymentDate}</td></tr>
    <tr><td>Jina la Mteja</td><td>${safeCustomerName}</td></tr>
    <tr><td>Simu ya Mteja</td><td>${safeCustomerPhone}</td></tr>
    <tr><td>Aina ya Mkopo</td><td>${safeLoanType}</td></tr>
    <tr><td>Njia ya Malipo</td><td>${safeMethodLabel}${safeChannelDetail}</td></tr>
    ${penaltyRow}
    <tr class="total"><td>KIASI ALICHOLIPA SASA</td><td>${escapeHtml(formatTZS(repayment.amount))}</td></tr>
    <tr><td>Jumla Aliyolipa Hadi Sasa</td><td>${escapeHtml(formatTZS(totalPaidNow))}</td></tr>
    <tr class="total"><td>SALIO ANACHODAIWA</td><td>${escapeHtml(formatTZS(repayment.balanceAfter))}</td></tr>
  </table>
  ${safeChannelsNote ? `<div class="channels"><strong>Njia Rasmi za Malipo:</strong> ${safeChannelsNote}</div>` : ''}
  <p style="font-size:11px;text-align:center;color:#64748b;margin-top:16px;">Asante kwa kufanya rejesho kwa wakati. ${safeCompanyName} (${escapeHtml(OFFICIAL_DOMAIN)})</p>
</body>
</html>`;
}

export function buildReceiptShareText(
  repayment: Repayment,
  loan: Loan,
  customer: Customer,
  company: CompanySettings,
): string {
  const totalPaidNow = getLoanPaidTotal(loan);
  const locationText = [
    company.district || 'TANDAHIMBA',
    company.region || 'MTAA WA AMANI-MTWARA',
  ]
    .filter(Boolean)
    .join('-');

  const lines = [
    `*RISITI RASMI YA REJESHO LA MKOPO*`,
    `--------------------------------`,
    `*${company.companyName}*`,
    company.contractOrgName && company.contractOrgName !== company.companyName
      ? `Taasisi: ${company.contractOrgName}`
      : '',
    locationText ? `Anwani: ${locationText}` : '',
    `Simu ya Ofisi: ${company.phone}`,
    company.email ? `Email: ${company.email}` : '',
    `Afisa Mkopeshaji: ${company.lenderName}`,
    `Tovuti: https://${OFFICIAL_DOMAIN}`,
    `--------------------------------`,
    `Namba ya Risiti: ${repayment.receiptNumber}`,
    `Tarehe ya Malipo: ${formatDateSW(repayment.paymentDate)}`,
    `Mteja: ${customer.fullName}`,
    `Simu ya Mteja: ${customer.phone}`,
    `Aina ya Mkopo: ${loan.loanTypeName}`,
    `Njia ya Malipo: ${getPaymentMethodLabel(repayment.paymentMethod)}${repayment.channelDetail ? ` (${repayment.channelDetail})` : ''}`,
    repayment.penaltyPortion > 0 ? `Adhabu Iliyolipwa: ${formatTZS(repayment.penaltyPortion)}` : '',
    `*Kiasi Alicholipa Sasa: ${formatTZS(repayment.amount)}*`,
    `Jumla Aliyolipa Hadi Sasa: ${formatTZS(totalPaidNow)}`,
    `*Salio Anachodaiwa: ${formatTZS(repayment.balanceAfter)}*`,
    company.paymentChannelsNote ? `--------------------------------\nMalipo Rasmi: ${company.paymentChannelsNote}` : '',
    `--------------------------------`,
    `Asante kwa kufanya rejesho kwa wakati. Imetolewa na ${company.companyName}.`,
  ];

  return lines.filter(Boolean).join('\n');
}

export const OFFICIAL_DOMAIN = 'www.m-microfinance.co.tz';
export const OFFICIAL_ORIGIN = 'https://www.m-microfinance.co.tz';

export function getOfficialApplyUrl(): string {
  return `${OFFICIAL_ORIGIN}/?omba=1`;
}

export const LOAN_PROGRESS_STAGES = [
  'Ombi limepokelewa na linaanza kushughulikiwa',
  'Uhakiki wa taarifa binafsi na kitambulisho unaendelea',
  'Uthibitisho wa mdhamini na dhamana unaendelea',
  'Maandalizi ya mkataba wa mkopo yanaendelea',
  'Mkopo upo hatua ya mwisho ya kuidhinishwa',
  'Mkopo umekamilika na uko tayari kutolewa (malipo)',
] as const;

export function buildLoanProcessingMessage(
  customerName: string,
  companyName: string,
  stageText: string,
  officePhone: string,
  loanAmount?: number,
): string {
  const amountText =
    loanAmount && loanAmount > 0 ? ` wa kiasi cha ${formatTZS(loanAmount)}` : '';
  return `Habari ${customerName}, tunakujulisha kutoka ${companyName} kuwa ombi/mkopo wako${amountText} UNASHUGHULIKIWA kwa sasa. Hatua iliyofikiwa: "${stageText}". Tafadhali endelea kuwa karibu na simu yako au wasiliana nasi kwa marejeleo kupitia ${officePhone} (${OFFICIAL_DOMAIN}). Asante.`;
}

export interface CustomerCsvRow {
  customer: Customer;
  loansCount: number;
  totalLoaned: number;
  totalPaid: number;
  totalRemaining: number;
  statusLabel: string;
}

function escapeCsvCell(value: string | number | boolean | undefined): string {
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function downloadCustomersCsv(rows: CustomerCsvRow[], companyName: string): void {
  const headers = [
    'Na.',
    'Jina Kamili',
    'Namba ya Simu',
    'Barua Pepe (Email)',
    'Kitambulisho (NIDA/Kura)',
    'Mtaa',
    'Wilaya',
    'Kazi / Biashara',
    'Jina la Mdhamini',
    'Simu ya Mdhamini',
    'Mtaa wa Mdhamini',
    'Wilaya ya Mdhamini',
    'Dhamana',
    'Benki',
    'Akaunti ya Benki',
    'Mtumishi wa Serikali',
    'Check Number',
    'Idadi ya Mikopo',
    'Jumla ya Mkopo (TZS)',
    'Kiasi Alicholipa (TZS)',
    'Salio Anachodaiwa (TZS)',
    'Hali',
  ];

  const lines = [
    headers.map((h) => escapeCsvCell(h)).join(','),
    ...rows.map((row, idx) =>
      [
        idx + 1,
        row.customer.fullName,
        row.customer.phone,
        row.customer.email || '',
        row.customer.idNumber || '',
        row.customer.street,
        row.customer.district,
        row.customer.occupation || '',
        row.customer.witnessName,
        row.customer.witnessPhone,
        row.customer.witnessStreet || '',
        row.customer.witnessDistrict || '',
        row.customer.collateral || '',
        row.customer.bankName || '',
        row.customer.bankAccountNumber || '',
        row.customer.isGovernmentEmployee ? 'Ndiyo' : 'Hapana',
        row.customer.checkNumber || '',
        row.loansCount,
        Math.round(row.totalLoaned),
        Math.round(row.totalPaid),
        Math.round(row.totalRemaining),
        row.statusLabel,
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(','),
    ),
  ];

  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const slug = (companyName || 'mm-microfinance')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-orodha-wateja-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

