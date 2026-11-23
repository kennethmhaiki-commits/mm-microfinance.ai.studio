export type InterestType = 'flat' | 'reducing' | 'fixed_amount';
export type RepaymentFrequency = 'weekly' | 'monthly';
export type LoanStatus = 'active' | 'completed' | 'overdue';
export type PaymentMethod = 'cash' | 'bank' | 'mobile_money';
export type MessageChannel = 'whatsapp' | 'sms' | 'social' | 'email' | 'push';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type BankCode = 'NMB' | 'CRDB' | 'EXIM' | 'MWALIMU';
export type BankDebitCode = BankCode | 'GOV_PAYROLL';
export type BankDeductionType = 'bank_direct_debit' | 'gov_check_number';

export type ViewTab =
  | 'dashboard'
  | 'applications'
  | 'customers'
  | 'loans'
  | 'schedule'
  | 'collections'
  | 'revenue_report'
  | 'bank_debit'
  | 'slides'
  | 'google_forms'
  | 'messaging'
  | 'calculator'
  | 'contract'
  | 'loan_types'
  | 'staff'
  | 'company';

export type StaffAccountStatus = 'active' | 'locked';

export type StaffPermission =
  | 'view_dashboard'
  | 'manage_applications'
  | 'manage_customers'
  | 'edit_delete_customers'
  | 'view_loans_penalties'
  | 'apply_penalties'
  | 'view_schedule'
  | 'collect_repayments'
  | 'view_revenue_reports'
  | 'manage_bank_debit'
  | 'send_messages'
  | 'use_calculator'
  | 'view_contracts'
  | 'manage_loan_types'
  | 'manage_company_settings';

export interface StaffAccount {
  id: string;
  ownerId: string;
  fullName: string;
  phone?: string;
  roleTitle: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  accountStatus: StaffAccountStatus;
  lockReason?: string;
  permissions: StaffPermission[];
  lastLoginAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AuthActorType = 'admin' | 'staff';

export interface AuthSession {
  actorType: AuthActorType;
  staffId?: string;
  username: string;
  fullName: string;
  roleTitle: string;
  permissions: StaffPermission[];
}

export interface CompanySettings {
  id: string;
  ownerId: string;
  companyName: string;
  contractOrgName: string;
  district: string;
  region?: string;
  phone: string;
  email?: string;
  lenderName: string;
  lenderWitnessName: string;
  defaultPenaltyPercent: number;
  paymentChannelsNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoanType {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  defaultInterestType: InterestType;
  defaultInterestValue: number;
  defaultFrequency: RepaymentFrequency;
  defaultDuration: number;
  defaultPenaltyPercent: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  ownerId: string;
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  street: string;
  district: string;
  occupation?: string;
  witnessName: string;
  witnessPhone: string;
  witnessStreet?: string;
  witnessDistrict?: string;
  collateral?: string;
  bankName?: BankCode | '';
  bankAccountNumber?: string;
  isGovernmentEmployee?: boolean;
  checkNumber?: string;
  bankMandateActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Loan {
  id: string;
  ownerId: string;
  customerId: string;
  loanTypeName: string;
  principal: number;
  interestType: InterestType;
  interestValue: number;
  totalInterest: number;
  penaltyPercent: number;
  penaltyApplied: number;
  frequency: RepaymentFrequency;
  durationCount: number;
  startDate: string;
  endDate: string;
  totalDue: number;
  totalPaidPrincipal: number;
  totalPaidInterest: number;
  totalPaidPenalty: number;
  status: LoanStatus;
  collateral?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BankDebitTransaction {
  id: string;
  ownerId: string;
  customerId: string;
  loanId: string;
  repaymentId?: string;
  deductionType: BankDeductionType;
  bankCode: BankDebitCode;
  accountOrCheckNumber: string;
  amount: number;
  gatewayReference: string;
  gatewayMode: 'live_api' | 'sandbox_api';
  status: 'completed' | 'pending' | 'failed';
  statusMessage: string;
  processedDate: string;
  createdAt?: unknown;
}

export interface Repayment {
  id: string;
  ownerId: string;
  loanId: string;
  customerId: string;
  receiptNumber: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  penaltyPortion: number;
  paymentMethod: PaymentMethod;
  channelDetail?: string;
  paymentDate: string;
  balanceAfter: number;
  notes?: string;
  createdAt?: unknown;
}

export interface MessageLog {
  id: string;
  ownerId: string;
  customerId: string;
  channel: MessageChannel;
  recipientPhone: string;
  messageBody: string;
  amountPaidSnapshot: number;
  amountOwedSnapshot: number;
  sentDate: string;
  createdAt?: unknown;
}

export interface InstallmentItem {
  periodNumber: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  remainingPrincipalAfter: number;
}

export interface LoanCalculationResult {
  principal: number;
  totalInterest: number;
  totalPayable: number;
  installmentAmount: number;
  endDate: string;
  schedule: InstallmentItem[];
}

export interface LoanApplication {
  id: string;
  ownerId: string;
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  street: string;
  district: string;
  occupation?: string;
  witnessName: string;
  witnessPhone: string;
  collateral?: string;
  bankName?: BankCode | '';
  bankAccountNumber?: string;
  isGovernmentEmployee?: boolean;
  checkNumber?: string;
  loanTypeName: string;
  requestedAmount: number;
  interestType: InterestType;
  interestValue: number;
  frequency: RepaymentFrequency;
  durationCount: number;
  purpose?: string;
  status: ApplicationStatus;
  reviewNote?: string;
  approvedLoanId?: string;
  submittedDate: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TomorrowReminderItem {
  loan: Loan;
  customer: Customer;
  periodNumber: number;
  dueDate: string;
  installmentRemaining: number;
  totalPaid: number;
  totalOwed: number;
  alreadyPushedToday: boolean;
  alreadyEmailedToday: boolean;
  alreadySmsedToday: boolean;
  hasValidSmsPhone: boolean;
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskCategory = 'customer_call' | 'report' | 'collection' | 'general';

export interface DailyTask {
  id: string;
  ownerId: string;
  title: string;
  notes?: string;
  dueDate: string;
  dueTime?: string;
  priority: TaskPriority;
  category: TaskCategory;
  customerId?: string;
  customerName?: string;
  assignedToUsername?: string;
  assignedToName?: string;
  createdByUsername: string;
  createdByName: string;
  completed: boolean;
  completedAt?: string;
  completedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

