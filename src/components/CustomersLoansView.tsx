import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Globe,
  Landmark,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BankCode,
  CompanySettings,
  Customer,
  InterestType,
  Loan,
  LoanType,
  Repayment,
  RepaymentFrequency,
} from '../types';
import { BANK_OPTIONS } from '../services/bankDebitApi';
import { formatFirestoreErrorForUser } from '../services/dataStore';
import { CustomerStatementModal } from './CustomerStatementModal';
import {
  downloadAllCustomersReportPdf,
  downloadCustomerStatementPdf,
} from '../services/pdfStatement';
import {
  calculateLoan,
  downloadCustomersCsv,
  formatDateSW,
  formatTZS,
  getFrequencyLabel,
  getInterestTypeLabel,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  todayISO,
} from '../utils/finance';

interface CustomersLoansViewProps {
  customers: Customer[];
  loans: Loan[];
  repayments: Repayment[];
  loanTypes: LoanType[];
  company: CompanySettings;
  prefillCalc?: {
    principal: number;
    interestType: InterestType;
    interestValue: number;
    frequency: RepaymentFrequency;
    durationCount: number;
    penaltyPercent: number;
    startDate: string;
  } | null;
  onCreateCustomerAndLoan: (
    customerData: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    loanData: Omit<
      Loan,
      | 'id'
      | 'ownerId'
      | 'customerId'
      | 'totalPaidPrincipal'
      | 'totalPaidInterest'
      | 'totalPaidPenalty'
      | 'penaltyApplied'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
    > | null,
  ) => Promise<void>;
  onAddLoanToCustomer: (
    customerId: string,
    loanData: Omit<
      Loan,
      | 'id'
      | 'ownerId'
      | 'customerId'
      | 'totalPaidPrincipal'
      | 'totalPaidInterest'
      | 'totalPaidPenalty'
      | 'penaltyApplied'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) => Promise<void>;
  onUpdateCustomer: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onOpenRepay: (loan: Loan) => void;
  onOpenContract: (loanId: string) => void;
  onOpenMessaging: (customerId: string) => void;
  onOpenBankDebit: (customerId: string) => void;
  onOpenOnlineCustomers?: () => void;
  canEditDeleteCustomers?: boolean;
}

export const CustomersLoansView: React.FC<CustomersLoansViewProps> = ({
  customers,
  loans,
  repayments,
  loanTypes,
  company,
  prefillCalc,
  onCreateCustomerAndLoan,
  onAddLoanToCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onOpenRepay,
  onOpenContract,
  onOpenMessaging,
  onOpenBankDebit,
  onOpenOnlineCustomers,
  canEditDeleteCustomers = true,
}) => {
  const [showRegisterForm, setShowRegisterForm] = useState(Boolean(prefillCalc));
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed'>('all');

  // Registration Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [street, setStreet] = useState('');
  const [district, setDistrict] = useState(company.district || 'Tandahimba');
  const [occupation, setOccupation] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [witnessPhone, setWitnessPhone] = useState('');
  const [witnessStreet, setWitnessStreet] = useState('');
  const [witnessDistrict, setWitnessDistrict] = useState(company.district || 'Tandahimba');
  const [collateral, setCollateral] = useState('');
  const [bankName, setBankName] = useState<BankCode | ''>('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [isGovernmentEmployee, setIsGovernmentEmployee] = useState(false);
  const [checkNumber, setCheckNumber] = useState('');
  const [bankMandateActive, setBankMandateActive] = useState(true);

  // Loan Immediate Issuance State
  const [issueLoanNow, setIssueLoanNow] = useState(true);
  const firstType = loanTypes[0];
  const [loanTypeName, setLoanTypeName] = useState(
    firstType?.name || 'Mkopo wa Biashara (Mwezi)',
  );
  const [principal, setPrincipal] = useState(
    String(prefillCalc?.principal ?? 200000),
  );
  const [interestType, setInterestType] = useState<InterestType>(
    prefillCalc?.interestType ?? firstType?.defaultInterestType ?? 'flat',
  );
  const [interestValue, setInterestValue] = useState(
    String(prefillCalc?.interestValue ?? firstType?.defaultInterestValue ?? 20),
  );
  const [frequency, setFrequency] = useState<RepaymentFrequency>(
    prefillCalc?.frequency ?? firstType?.defaultFrequency ?? 'monthly',
  );
  const [durationCount, setDurationCount] = useState(
    String(prefillCalc?.durationCount ?? firstType?.defaultDuration ?? 3),
  );
  const [penaltyPercent, setPenaltyPercent] = useState(
    String(prefillCalc?.penaltyPercent ?? company.defaultPenaltyPercent ?? 5),
  );
  const [startDate, setStartDate] = useState(prefillCalc?.startDate ?? todayISO());
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit / Delete / Add Loan / Statement Modals
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deletingCustomerBusy, setDeletingCustomerBusy] = useState(false);
  const [deleteCustomerError, setDeleteCustomerError] = useState('');
  const [addingLoanCustomer, setAddingLoanCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  const previewCalc = useMemo(() => {
    return calculateLoan(
      Number(principal) || 0,
      interestType,
      Number(interestValue) || 0,
      frequency,
      Number(durationCount) || 1,
      startDate,
    );
  }, [principal, interestType, interestValue, frequency, durationCount, startDate]);

  const handleSelectLoanType = (name: string) => {
    setLoanTypeName(name);
    const matched = loanTypes.find((lt) => lt.name === name);
    if (matched) {
      setInterestType(matched.defaultInterestType);
      setInterestValue(String(matched.defaultInterestValue));
      setFrequency(matched.defaultFrequency);
      setDurationCount(String(matched.defaultDuration));
      setPenaltyPercent(String(matched.defaultPenaltyPercent));
    }
  };

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setIdNumber('');
    setStreet('');
    setDistrict(company.district || 'Tandahimba');
    setOccupation('');
    setWitnessName('');
    setWitnessPhone('');
    setWitnessStreet('');
    setWitnessDistrict(company.district || 'Tandahimba');
    setCollateral('');
    setBankName('');
    setBankAccountNumber('');
    setIsGovernmentEmployee(false);
    setCheckNumber('');
    setBankMandateActive(true);
    setNotes('');
    setFormError('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const fName = fullName.trim();
    const fPhone = phone.trim();
    const fStreet = street.trim();
    const fDistrict = (district.trim() || company.district || 'TANDAHIMBA').trim();
    const fWitnessName = witnessName.trim();
    const fWitnessPhone = witnessPhone.trim();

    if (!fName || !fPhone || !fStreet || !fWitnessName || !fWitnessPhone) {
      setFormError('Tafadhali jaza taarifa zote za lazima za mteja na mdhamini wake.');
      return;
    }
    if (fName.length < 2 || fStreet.length < 2 || fDistrict.length < 2 || fWitnessName.length < 2) {
      setFormError('Jina la mteja, mtaa, wilaya, na jina la mdhamini lazima viwe na angalau herufi 2.');
      return;
    }
    if (fPhone.length < 5 || fWitnessPhone.length < 5) {
      setFormError('Namba ya simu ya mteja na ya mdhamini lazima ziwe na angalau tarakimu 5.');
      return;
    }

    const pNum = Math.round(Number(principal) || 0);
    const dNum = Math.max(1, Math.round(Number(durationCount) || 1));
    if (issueLoanNow && pNum <= 0) {
      setFormError('Kiasi cha mkopo lazima kiwe kikubwa kuliko sifuri.');
      return;
    }

    setSaving(true);
    try {
      await onCreateCustomerAndLoan(
        {
          fullName: fName,
          phone: fPhone,
          email: email.trim(),
          idNumber: idNumber.trim(),
          street: fStreet,
          district: fDistrict,
          occupation: occupation.trim(),
          witnessName: fWitnessName,
          witnessPhone: fWitnessPhone,
          witnessStreet: witnessStreet.trim(),
          witnessDistrict: witnessDistrict.trim(),
          collateral: collateral.trim(),
          bankName,
          bankAccountNumber: bankAccountNumber.trim(),
          isGovernmentEmployee,
          checkNumber: checkNumber.trim(),
          bankMandateActive,
        },
        issueLoanNow
          ? {
              loanTypeName,
              principal: pNum,
              interestType,
              interestValue: Number(interestValue) || 0,
              totalInterest: previewCalc.totalInterest,
              penaltyPercent: Math.min(100, Math.max(0, Number(penaltyPercent) || 0)),
              frequency,
              durationCount: dNum,
              startDate,
              endDate: previewCalc.endDate,
              totalDue: previewCalc.totalPayable,
              collateral: collateral.trim(),
              notes: notes.trim(),
            }
          : null,
      );
      resetForm();
      setShowRegisterForm(false);
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  const customerSummaries = useMemo(() => {
    return customers
      .map((cust) => {
        const custLoans = loans.filter((l) => l.customerId === cust.id);
        const totalLoaned = custLoans.reduce((s, l) => s + l.totalDue, 0);
        const totalPaid = custLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
        const totalRemaining = custLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);
        const hasActive = custLoans.some((l) => l.status !== 'completed');
        const allCompleted = custLoans.length > 0 && custLoans.every((l) => l.status === 'completed');
        const latestLoan = custLoans[0];
        return {
          customer: cust,
          loans: custLoans,
          latestLoan,
          totalLoaned,
          totalPaid,
          totalRemaining,
          hasActive,
          allCompleted,
        };
      })
      .filter((item) => {
        if (filterMode === 'active' && !item.hasActive) return false;
        if (filterMode === 'completed' && !item.allCompleted) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          item.customer.fullName.toLowerCase().includes(q) ||
          item.customer.phone.toLowerCase().includes(q) ||
          item.customer.street.toLowerCase().includes(q)
        );
      });
  }, [customers, loans, filterMode, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Usajili wa Wateja & Utoaji wa Mikopo
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sajili mteja, weka mkopo na riba hapo hapo, hariri au futa waliomaliza
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenOnlineCustomers && (
            <button
              type="button"
              onClick={onOpenOnlineCustomers}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0"
            >
              <Globe className="w-4 h-4" />
              <span>Wateja wa Mtandaoni</span>
            </button>
          )}

          <button
            type="button"
            disabled={customers.length === 0}
            onClick={() => {
              const allRows = customers.map((cust) => {
                const custLoans = loans.filter((l) => l.customerId === cust.id);
                const totalLoaned = custLoans.reduce((s, l) => s + l.totalDue, 0);
                const totalPaid = custLoans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
                const totalRemaining = custLoans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);
                const allCompleted =
                  custLoans.length > 0 && custLoans.every((l) => l.status === 'completed');
                return {
                  customer: cust,
                  loansCount: custLoans.length,
                  totalLoaned,
                  totalPaid,
                  totalRemaining,
                  statusLabel:
                    custLoans.length === 0
                      ? 'Hana Mkopo'
                      : allCompleted
                        ? 'Amemaliza'
                        : 'Anaendelea',
                };
              });
              downloadCustomersCsv(allRows, company.companyName);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Pakua Wote (CSV · {customers.length})</span>
          </button>

          <button
            type="button"
            disabled={customerSummaries.length === 0}
            onClick={() => {
              const filterLabel =
                filterMode === 'active'
                  ? 'Wanaodaiwa'
                  : filterMode === 'completed'
                    ? 'Waliomaliza'
                    : 'Wote';
              downloadAllCustomersReportPdf({
                rows: customerSummaries,
                company,
                filterLabel,
                searchTerm: searchTerm.trim(),
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Pakua Ripoti ya Wateja (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRegisterForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {showRegisterForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{showRegisterForm ? 'Funga Fomu ya Usajili' : 'Sajili Mteja & Mkopo Mpya'}</span>
          </button>
        </div>
      </div>

      {/* Unified Registration + Loan Issuance Form */}
      {showRegisterForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Fomu ya Kusajili Mteja & Mkopo Hapo Hapo
            </h3>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={issueLoanNow}
                onChange={(e) => setIssueLoanNow(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>Weka Mkopo na Riba Hapo Hapo</span>
            </label>
          </div>

          {/* Section 1: Taarifa za Mteja & Mdhamini */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jina Kamili la Mkopaji *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mfano: Asha Juma Bakari"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Namba ya Simu (WhatsApp/SMS) *
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Mfano: 0712345678"
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Barua Pepe (Email kwa Arifa)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Mfano: mteja@gmail.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Namba ya Kitambulisho (NIDA/Kura/Kazi)
              </label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Mfano: 19900512-12345-00001-20"
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mtaa Anapoishi *
              </label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Mfano: Majengo"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Wilaya *
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Biashara / Kazi
              </label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="Mfano: Duka la Nafaka"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jina la Shahidi / Mdhamini *
              </label>
              <input
                type="text"
                value={witnessName}
                onChange={(e) => setWitnessName(e.target.value)}
                placeholder="Jina kamili la mdhamini"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Simu ya Shahidi *
              </label>
              <input
                type="text"
                value={witnessPhone}
                onChange={(e) => setWitnessPhone(e.target.value)}
                placeholder="07..."
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Dhamana ya Mkopo (Mali)
              </label>
              <input
                type="text"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                placeholder="Mfano: Pikipiki Boxer / Friji / Kiwanja"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Section 1B: Akaunti ya Benki & Check Number (Makato ya Moja kwa Moja) */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-900">
                Taarifa za Benki &amp; Mtumishi wa Serikali (Kwa Makato ya Moja kwa Moja)
              </h4>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGovernmentEmployee}
                  onChange={(e) => setIsGovernmentEmployee(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Mteja ni Mtumishi wa Serikali</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jina la Benki (Direct Debit)
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value as BankCode | '')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="">-- Chagua Benki (Si Lazima) --</option>
                  {BANK_OPTIONS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Namba ya Akaunti ya Benki
                </label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Mfano: 20110045829"
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Check Number {isGovernmentEmployee ? '(Mtumishi wa Serikali)' : '(Ikiwa ni Mtumishi)'}
                </label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder="Mfano: 11204589"
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={bankMandateActive}
                onChange={(e) => setBankMandateActive(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>
                Mteja ameidhinisha mfumo kumkata rejesho moja kwa moja kutoka benki au mshahara (Direct Debit Mandate).
              </span>
            </label>
          </div>

          {/* Section 2: Mkopo na Riba Hapo Hapo */}
          {issueLoanNow && (
            <div className="pt-5 border-t border-slate-200 space-y-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Maelezo ya Mkopo, Aina ya Riba & Muda wa Makato
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Aina ya Mkopo
                  </label>
                  <select
                    value={loanTypeName}
                    onChange={(e) => handleSelectLoanType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {loanTypes.map((lt) => (
                      <option key={lt.id} value={lt.name}>
                        {lt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kiasi cha Mkopo / Mtaji (Tsh) *
                  </label>
                  <input
                    type="number"
                    min={1000}
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="flat">Riba Isiyobadilika (Flat Rate %)</option>
                    <option value="reducing">Riba ya Kupungua (Reducing Balance %)</option>
                    <option value="fixed_amount">Kiasi Maalum cha Riba (Tsh)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {interestType === 'fixed_amount'
                      ? 'Kiasi cha Riba (Tsh)'
                      : interestType === 'reducing'
                        ? 'Asilimia ya Riba kwa Kipindi (%)'
                        : 'Asilimia ya Riba (%)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={interestValue}
                    onChange={(e) => setInterestValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Muda wa Makato
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFrequency('weekly')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                        frequency === 'weekly'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Wiki
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrequency('monthly')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                        frequency === 'monthly'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Mwezi
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Idadi ya {frequency === 'weekly' ? 'Wiki' : 'Miezi'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={durationCount}
                    onChange={(e) => setDurationCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tarehe ya Kuchukua Mkopo
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
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
                    value={penaltyPercent}
                    onChange={(e) => setPenaltyPercent(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Maelezo / Maelekezo
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Maelezo mafupi ya mkopo"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Live Calculation Summary */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">Mtaji</div>
                  <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                    {formatTZS(previewCalc.principal)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Jumla ya Riba</div>
                  <div className="font-mono-num font-semibold text-emerald-700 mt-0.5">
                    {formatTZS(previewCalc.totalInterest)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Jumla ya Kurejesha</div>
                  <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                    {formatTZS(previewCalc.totalPayable)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">
                    Rejesho ({frequency === 'weekly' ? 'Kwa Wiki' : 'Kwa Mwezi'})
                  </div>
                  <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                    {formatTZS(previewCalc.installmentAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Tarehe ya Kumaliza</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {formatDateSW(previewCalc.endDate)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {formError && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowRegisterForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving
                ? 'Inahifadhi...'
                : issueLoanNow
                  ? 'Sajili Mteja & Toa Mkopo'
                  : 'Sajili Mteja Pekee'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tafuta jina la mteja, simu, au mtaa..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'all' as const, label: 'Wote' },
            { id: 'active' as const, label: 'Wanaodaiwa' },
            { id: 'completed' as const, label: 'Waliomaliza' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterMode === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Directory Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {customerSummaries.length === 0 ? (
          <div className="p-10 text-center">
            <UserPlus className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Hakuna wateja waliopatikana kwa kigezo hiki.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bofya &ldquo;Sajili Mteja &amp; Mkopo Mpya&rdquo; kuanza kusajili wateja.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3">Mteja & Mdhamini</th>
                  <th className="text-left px-5 py-3">Mtaa / Dhamana</th>
                  <th className="text-right px-5 py-3">Jumla ya Mkopo</th>
                  <th className="text-right px-5 py-3">Aliyolipa</th>
                  <th className="text-right px-5 py-3">Anachodaiwa</th>
                  <th className="text-left px-5 py-3">Hali</th>
                  <th className="text-right px-5 py-3">Vitendo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerSummaries.map((row) => (
                  <tr key={row.customer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">
                        {row.customer.fullName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {row.customer.phone} · Shahidi: {row.customer.witnessName}
                      </div>
                      {row.customer.email && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {row.customer.email}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      <div>
                        {row.customer.street}, {row.customer.district}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Dhamana: {row.customer.collateral || '-'}
                      </div>
                      {(row.customer.bankAccountNumber || row.customer.checkNumber) && (
                        <div className="text-slate-700 font-mono-num mt-0.5">
                          {row.customer.bankName && row.customer.bankAccountNumber
                            ? `${row.customer.bankName}: ${row.customer.bankAccountNumber}`
                            : ''}
                          {row.customer.bankName && row.customer.bankAccountNumber && row.customer.checkNumber
                            ? ' · '
                            : ''}
                          {row.customer.checkNumber ? `Check #: ${row.customer.checkNumber}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-num text-slate-900">
                      {formatTZS(row.totalLoaned)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-num text-emerald-700">
                      {formatTZS(row.totalPaid)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-num font-bold text-slate-900">
                      {formatTZS(row.totalRemaining)}
                    </td>
                    <td className="px-5 py-3.5">
                      {row.loans.length === 0 ? (
                        <span className="text-xs text-slate-500">Hana Mkopo</span>
                      ) : row.allCompleted ? (
                        <span className="text-xs font-semibold text-emerald-700">
                          Amemaliza
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700">
                          Anaendelea
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {row.latestLoan && row.totalRemaining > 0 && (
                          <button
                            type="button"
                            onClick={() => onOpenRepay(row.latestLoan!)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Lipa
                          </button>
                        )}
                        {row.totalRemaining > 0 &&
                          (Boolean(row.customer.bankName && row.customer.bankAccountNumber) ||
                            Boolean(row.customer.isGovernmentEmployee && row.customer.checkNumber)) && (
                            <button
                              type="button"
                              onClick={() => onOpenBankDebit(row.customer.id)}
                              title="Kata Rejesho Moja kwa Moja Benki / Check Number"
                              className="p-1.5 text-sky-700 hover:text-sky-900 border border-sky-200 rounded-md hover:bg-sky-50"
                            >
                              <Landmark className="w-3.5 h-3.5" />
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => setAddingLoanCustomer(row.customer)}
                          title="Mpe Mkopo Mpya"
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        {row.latestLoan && (
                          <button
                            type="button"
                            onClick={() => onOpenContract(row.latestLoan!.id)}
                            title="Mkataba wa Mkopo"
                            className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setStatementCustomer(row.customer)}
                          title="Tazama Statement ya Mteja"
                          aria-label={`Tazama Statement ya ${row.customer.fullName}`}
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadCustomerStatementPdf({
                              customer: row.customer,
                              loans,
                              repayments,
                              company,
                            })
                          }
                          title="Pakua Customer Statement (PDF)"
                          aria-label={`Pakua PDF ya ${row.customer.fullName}`}
                          className="p-1.5 text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-md hover:bg-emerald-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenMessaging(row.customer.id)}
                          title="Tuma WhatsApp / SMS"
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!canEditDeleteCustomers}
                          onClick={() => {
                            if (canEditDeleteCustomers) {
                              setEditingCustomer(row.customer);
                            }
                          }}
                          title={
                            canEditDeleteCustomers
                              ? 'Hariri Taarifa za Mteja'
                              : 'Ngazi hii (Hariri Mteja) haijawa activated kwako'
                          }
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!canEditDeleteCustomers}
                          onClick={() => {
                            if (!canEditDeleteCustomers) return;
                            setDeleteCustomerError('');
                            setDeletingCustomer(row.customer);
                          }}
                          title={
                            canEditDeleteCustomers
                              ? 'Futa Mteja'
                              : 'Ngazi hii (Futa Mteja) haijawa activated kwako'
                          }
                          className="p-1.5 text-red-600 hover:text-red-800 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-35 disabled:cursor-not-allowed"
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

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={async (updated) => {
            await onUpdateCustomer(updated);
            setEditingCustomer(null);
          }}
        />
      )}

      {/* Delete Customer Confirmation Modal */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">
              Thibitisha Kufuta Mteja
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Unakaribia kufuta taarifa za <strong>{deletingCustomer.fullName}</strong> pamoja na kumbukumbu za mikopo na risiti zake zote. Hatua hii haiwezi kutenguliwa.
            </p>
            {deleteCustomerError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {deleteCustomerError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={deletingCustomerBusy}
                onClick={() => setDeletingCustomer(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={deletingCustomerBusy}
                onClick={async () => {
                  const id = deletingCustomer.id;
                  setDeletingCustomerBusy(true);
                  setDeleteCustomerError('');
                  try {
                    await onDeleteCustomer(id);
                    setDeletingCustomer(null);
                  } catch (err) {
                    setDeleteCustomerError(formatFirestoreErrorForUser(err));
                  } finally {
                    setDeletingCustomerBusy(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deletingCustomerBusy ? 'Inafuta...' : 'Ndiyo, Futa Mteja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Additional Loan Modal */}
      {addingLoanCustomer && (
        <AddLoanModal
          customer={addingLoanCustomer}
          loanTypes={loanTypes}
          company={company}
          onClose={() => setAddingLoanCustomer(null)}
          onSubmit={async (loanPayload) => {
            await onAddLoanToCustomer(addingLoanCustomer.id, loanPayload);
            setAddingLoanCustomer(null);
          }}
        />
      )}

      {/* Customer Statement Modal */}
      {statementCustomer && (
        <CustomerStatementModal
          customer={statementCustomer}
          loans={loans}
          repayments={repayments}
          company={company}
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  );
};

const EditCustomerModal: React.FC<{
  customer: Customer;
  onClose: () => void;
  onSave: (updated: Customer) => Promise<void>;
}> = ({ customer, onClose, onSave }) => {
  const [form, setForm] = useState<Customer>({ ...customer });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (
      form.fullName.trim().length < 2 ||
      form.street.trim().length < 2 ||
      form.district.trim().length < 2 ||
      form.witnessName.trim().length < 2
    ) {
      setFormError('Jina la mteja, mtaa, wilaya na jina la shahidi lazima viwe na angalau herufi 2.');
      return;
    }
    if (form.phone.trim().length < 5 || form.witnessPhone.trim().length < 5) {
      setFormError('Namba ya simu ya mteja na ya shahidi lazima ziwe na angalau tarakimu 5.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        street: form.street.trim(),
        district: form.district.trim(),
        witnessName: form.witnessName.trim(),
        witnessPhone: form.witnessPhone.trim(),
      });
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            Hariri Taarifa za Mteja
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Jina Kamili *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Namba ya Simu *</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Barua Pepe (Email)</label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="mteja@gmail.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kitambulisho (NIDA/Kura)</label>
            <input
              type="text"
              value={form.idNumber || ''}
              onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mtaa *</label>
            <input
              type="text"
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Wilaya *</label>
            <input
              type="text"
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kazi / Biashara</label>
            <input
              type="text"
              value={form.occupation || ''}
              onChange={(e) => setForm({ ...form, occupation: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Jina la Shahidi *</label>
            <input
              type="text"
              value={form.witnessName}
              onChange={(e) => setForm({ ...form, witnessName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Simu ya Shahidi *</label>
            <input
              type="text"
              value={form.witnessPhone}
              onChange={(e) => setForm({ ...form, witnessPhone: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Dhamana ya Mkopo</label>
            <input
              type="text"
              value={form.collateral || ''}
              onChange={(e) => setForm({ ...form, collateral: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Benki ya Mteja</label>
            <select
              value={form.bankName || ''}
              onChange={(e) => setForm({ ...form, bankName: e.target.value as BankCode | '' })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Chagua Benki --</option>
              {BANK_OPTIONS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Namba ya Akaunti ya Benki</label>
            <input
              type="text"
              value={form.bankAccountNumber || ''}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
              placeholder="Mfano: 20110045829"
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Check Number (Utumishi)</label>
            <input
              type="text"
              value={form.checkNumber || ''}
              onChange={(e) => setForm({ ...form, checkNumber: e.target.value })}
              placeholder="Mfano: 11204589"
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.isGovernmentEmployee)}
                onChange={(e) => setForm({ ...form, isGovernmentEmployee: e.target.checked })}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>Mtumishi wa Serikali</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.bankMandateActive ?? true}
                onChange={(e) => setForm({ ...form, bankMandateActive: e.target.checked })}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>Idhini ya Makato ya Moja kwa Moja</span>
            </label>
          </div>

          {formError && (
            <div className="sm:col-span-2 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {formError}
            </div>
          )}

          <div className="sm:col-span-2 pt-3 flex justify-end gap-3 border-t border-slate-100">
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
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Inahifadhi...' : 'Hifadhi Mabadiliko'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddLoanModal: React.FC<{
  customer: Customer;
  loanTypes: LoanType[];
  company: CompanySettings;
  onClose: () => void;
  onSubmit: (
    loanData: Omit<
      Loan,
      | 'id'
      | 'ownerId'
      | 'customerId'
      | 'totalPaidPrincipal'
      | 'totalPaidInterest'
      | 'totalPaidPenalty'
      | 'penaltyApplied'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) => Promise<void>;
}> = ({ customer, loanTypes, company, onClose, onSubmit }) => {
  const firstType = loanTypes[0];
  const [loanTypeName, setLoanTypeName] = useState(firstType?.name || 'Mkopo wa Biashara');
  const [principal, setPrincipal] = useState('150000');
  const [interestType, setInterestType] = useState<InterestType>(
    firstType?.defaultInterestType ?? 'flat',
  );
  const [interestValue, setInterestValue] = useState(
    String(firstType?.defaultInterestValue ?? 20),
  );
  const [frequency, setFrequency] = useState<RepaymentFrequency>(
    firstType?.defaultFrequency ?? 'monthly',
  );
  const [durationCount, setDurationCount] = useState(
    String(firstType?.defaultDuration ?? 3),
  );
  const [penaltyPercent, setPenaltyPercent] = useState(
    String(company.defaultPenaltyPercent ?? 5),
  );
  const [startDate, setStartDate] = useState(todayISO());
  const [collateral, setCollateral] = useState(customer.collateral || '');
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
    if (calc.principal <= 0) {
      setFormError('Kiasi cha mkopo lazima kiwe kikubwa kuliko sifuri.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        loanTypeName,
        principal: calc.principal,
        interestType,
        interestValue: Number(interestValue) || 0,
        totalInterest: calc.totalInterest,
        penaltyPercent: Math.min(100, Math.max(0, Number(penaltyPercent) || 0)),
        frequency,
        durationCount: Math.max(1, Math.round(Number(durationCount) || 1)),
        startDate,
        endDate: calc.endDate,
        totalDue: calc.totalPayable,
        collateral: collateral.trim(),
        notes: '',
      });
    } catch (err) {
      setFormError(formatFirestoreErrorForUser(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Toa Mkopo Mpya — {customer.fullName}
            </h3>
            <p className="text-xs text-slate-500">{customer.phone}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Aina ya Mkopo</label>
              <select
                value={loanTypeName}
                onChange={(e) => {
                  const name = e.target.value;
                  setLoanTypeName(name);
                  const found = loanTypes.find((lt) => lt.name === name);
                  if (found) {
                    setInterestType(found.defaultInterestType);
                    setInterestValue(String(found.defaultInterestValue));
                    setFrequency(found.defaultFrequency);
                    setDurationCount(String(found.defaultDuration));
                    setPenaltyPercent(String(found.defaultPenaltyPercent));
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {loanTypes.map((lt) => (
                  <option key={lt.id} value={lt.name}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kiasi (Tsh)</label>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Aina ya Riba</label>
              <select
                value={interestType}
                onChange={(e) => setInterestType(e.target.value as InterestType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="flat">{getInterestTypeLabel('flat')}</option>
                <option value="reducing">{getInterestTypeLabel('reducing')}</option>
                <option value="fixed_amount">{getInterestTypeLabel('fixed_amount')}</option>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Makato</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RepaymentFrequency)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="weekly">{getFrequencyLabel('weekly')}</option>
                <option value="monthly">{getFrequencyLabel('monthly')}</option>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Tarehe ya Kuanza</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Adhabu Ikichelewa (%)</label>
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Dhamana</label>
            <input
              type="text"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex flex-wrap justify-between gap-2">
            <span>Jumla ya Kurejesha: <strong>{formatTZS(calc.totalPayable)}</strong></span>
            <span>Rejesho: <strong>{formatTZS(calc.installmentAmount)}</strong></span>
            <span>Mwisho: <strong>{formatDateSW(calc.endDate)}</strong></span>
          </div>

          {formError && (
            <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
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
              {saving ? 'Inahifadhi...' : 'Thibitisha Mkopo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
