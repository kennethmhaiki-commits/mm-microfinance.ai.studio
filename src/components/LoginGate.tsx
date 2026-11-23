import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FilePlus2,
  Globe,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  AuthSession,
  BankCode,
  CompanySettings,
  InterestType,
  LoanApplication,
  LoanType,
  RepaymentFrequency,
} from '../types';
import {
  bootstrapAdminAccount,
  fetchAuthStatus,
  loginWithCredentials,
} from '../services/authApi';
import { BANK_OPTIONS } from '../services/bankDebitApi';
import {
  calculateLoan,
  formatDateSW,
  formatTZS,
  normalizeTzPhone,
  OFFICIAL_DOMAIN,
  todayISO,
} from '../utils/finance';

interface LoginGateProps {
  company: CompanySettings;
  loanTypes: LoanType[];
  authNotice?: string;
  onUnlock: (token: string, session: AuthSession) => void;
  onSubmitApplication: (
    appData: Omit<
      LoanApplication,
      'id' | 'ownerId' | 'status' | 'submittedDate' | 'createdAt' | 'updatedAt'
    >,
  ) => Promise<string>;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  company,
  loanTypes,
  authNotice,
  onUnlock,
  onSubmitApplication,
}) => {
  const initialApplyMode =
    typeof window !== 'undefined' &&
    (window.location.search.includes('omba=1') || window.location.hash === '#omba');

  const [portalMode, setPortalMode] = useState<'login' | 'apply'>(
    initialApplyMode ? 'apply' : 'login',
  );
  const [tick, setTick] = useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const BG_PALETTES = [
    { bg: 'bg-slate-900', accent: 'bg-emerald-600', textAccent: 'text-emerald-200' },
    { bg: 'bg-emerald-950', accent: 'bg-teal-600', textAccent: 'text-teal-200' },
    { bg: 'bg-blue-950', accent: 'bg-sky-600', textAccent: 'text-sky-200' },
    { bg: 'bg-teal-950', accent: 'bg-emerald-500', textAccent: 'text-emerald-100' },
    { bg: 'bg-indigo-950', accent: 'bg-indigo-600', textAccent: 'text-indigo-200' },
  ];
  const currentPalette = BG_PALETTES[tick % BG_PALETTES.length];
  const textVisible = tick % 2 === 0;

  // Staff / Admin Login State
  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isAccountLockedError, setIsAccountLockedError] = useState(false);

  // First-Run Admin Setup State (only shown when no admin password is configured)
  const [setupFullName, setSetupFullName] = useState('Msimamizi Mkuu');
  const [setupUsername, setSetupUsername] = useState('admin');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');

  React.useEffect(() => {
    let active = true;
    void fetchAuthStatus()
      .then((status) => {
        if (!active) return;
        setAdminConfigured(status.adminConfigured);
      })
      .catch(() => {
        if (!active) return;
        setAdminConfigured(true);
      })
      .finally(() => {
        if (active) setAuthStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Public Online Loan Application State
  const firstType = loanTypes[0];
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [street, setStreet] = useState('');
  const [district, setDistrict] = useState(company.district || 'TANDAHIMBA');
  const [occupation, setOccupation] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [witnessPhone, setWitnessPhone] = useState('');
  const [collateral, setCollateral] = useState('');
  const [bankName, setBankName] = useState<BankCode | ''>('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [isGovernmentEmployee, setIsGovernmentEmployee] = useState(false);
  const [checkNumber, setCheckNumber] = useState('');

  const [loanTypeName, setLoanTypeName] = useState(
    firstType?.name || 'Mkopo wa Biashara (Mwezi)',
  );
  const [requestedAmount, setRequestedAmount] = useState('200000');
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
  const [purpose, setPurpose] = useState('');

  const [submittingApp, setSubmittingApp] = useState(false);
  const [appError, setAppError] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const previewCalc = useMemo(
    () =>
      calculateLoan(
        Number(requestedAmount) || 0,
        interestType,
        Number(interestValue) || 0,
        frequency,
        Number(durationCount) || 1,
        todayISO(),
      ),
    [requestedAmount, interestType, interestValue, frequency, durationCount],
  );

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsAccountLockedError(false);
    setAuthBusy(true);
    try {
      const result = await loginWithCredentials(username.trim(), password);
      onUnlock(result.token, result.session);
    } catch (err) {
      const locked = Boolean((err as { locked?: boolean })?.locked);
      setIsAccountLockedError(locked);
      setLoginError(
        err instanceof Error
          ? err.message
          : 'Imeshindwa kuthibitisha taarifa za kuingia. Tafadhali jaribu tena.',
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleBootstrapAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsAccountLockedError(false);

    if (setupUsername.trim().length < 3) {
      setLoginError('Jina la mtumiaji (username) lazima liwe na angalau herufi 3.');
      return;
    }
    if (setupPassword.length < 6) {
      setLoginError('Nenosiri la Msimamizi lazima liwe na angalau herufi 6.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setLoginError('Nenosiri ulizoingiza hazilingani. Hakikisha zinafanana.');
      return;
    }

    setAuthBusy(true);
    try {
      const result = await bootstrapAdminAccount({
        fullName: setupFullName.trim() || 'Msimamizi Mkuu',
        username: setupUsername.trim(),
        password: setupPassword,
      });
      setAdminConfigured(true);
      onUnlock(result.token, result.session);
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? err.message
          : 'Imeshindwa kusajili akaunti ya Msimamizi Mkuu.',
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLoanTypeChange = (name: string) => {
    setLoanTypeName(name);
    const matched = loanTypes.find((lt) => lt.name === name);
    if (matched) {
      setInterestType(matched.defaultInterestType);
      setInterestValue(String(matched.defaultInterestValue));
      setFrequency(matched.defaultFrequency);
      setDurationCount(String(matched.defaultDuration));
    }
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppError('');
    const amt = Math.round(Number(requestedAmount) || 0);
    const fName = fullName.trim();
    const fPhone = phone.trim();
    const fStreet = street.trim();
    const fDistrict = (district.trim() || company.district || 'TANDAHIMBA').trim();
    const fWitnessName = witnessName.trim();
    const fWitnessPhone = witnessPhone.trim();

    if (!fName || !fPhone || !fStreet || !fWitnessName || !fWitnessPhone) {
      setAppError('Tafadhali jaza taarifa zote za lazima za mwombaji na mdhamini.');
      return;
    }
    if (fName.length < 2 || fStreet.length < 2 || fDistrict.length < 2 || fWitnessName.length < 2) {
      setAppError('Jina la mwombaji, mtaa, wilaya na mdhamini lazima viwe na angalau herufi 2.');
      return;
    }
    if (fPhone.length < 5 || fWitnessPhone.length < 5) {
      setAppError('Namba ya simu ya mwombaji na ya mdhamini lazima ziwe na angalau tarakimu 5.');
      return;
    }
    if (amt < 1000) {
      setAppError('Kiasi unachoomba lazima kiwe angalau Tsh 1,000.');
      return;
    }

    setSubmittingApp(true);
    try {
      const refId = await onSubmitApplication({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: appEmail.trim(),
        idNumber: idNumber.trim(),
        street: street.trim(),
        district: district.trim() || company.district || 'TANDAHIMBA',
        occupation: occupation.trim(),
        witnessName: witnessName.trim(),
        witnessPhone: witnessPhone.trim(),
        collateral: collateral.trim(),
        bankName,
        bankAccountNumber: bankAccountNumber.trim(),
        isGovernmentEmployee,
        checkNumber: checkNumber.trim(),
        loanTypeName,
        requestedAmount: amt,
        interestType,
        interestValue: Number(interestValue) || 0,
        frequency,
        durationCount: Math.max(1, Math.round(Number(durationCount) || 1)),
        purpose: purpose.trim(),
      });
      setSubmittedRef(refId);
    } catch (err) {
      setAppError(
        err instanceof Error ? err.message : 'Imeshindwa kutuma ombi. Jaribu tena.',
      );
    } finally {
      setSubmittingApp(false);
    }
  };

  const resetApplicationForm = () => {
    setFullName('');
    setPhone('');
    setAppEmail('');
    setIdNumber('');
    setStreet('');
    setOccupation('');
    setWitnessName('');
    setWitnessPhone('');
    setCollateral('');
    setBankName('');
    setBankAccountNumber('');
    setIsGovernmentEmployee(false);
    setCheckNumber('');
    setPurpose('');
    setSubmittedRef(null);
    setAppError('');
  };

  const fullCompanyLocation = `${company.companyName || 'MM-MICROFINANCE'} ${(company.district || 'TANDAHIMBA').toUpperCase()}-${(company.region || 'MTAA WA AMANI-MTWARA').toUpperCase()}`;
  const displayAddress = [
    fullCompanyLocation,
    company.contractOrgName || 'MHAIKI_ONLINE_MICRO-CREDIT',
  ]
    .filter(Boolean)
    .join(' · ');

  const primaryPhone =
    (company.phone || '0627583847')
      .split('/')[0]
      .trim() || '0627583847';
  const primaryWaPhone = normalizeTzPhone(primaryPhone) || '255627583847';
  const generalFollowUpWaHref = `https://wa.me/${primaryWaPhone}?text=${encodeURIComponent(
    `Habari ${company.companyName}, nimetuma maombi ya mkopo kupitia mtandao (${OFFICIAL_DOMAIN}) na ninawasiliana kwa ajili ya marejeo.`,
  )}`;

  return (
    <div
      className={`min-h-screen ${currentPalette.bg} transition-colors duration-700 flex flex-col items-center justify-center p-4 sm:p-6`}
    >
      {/* Dynamic 1-second fade-in/out welcome banner */}
      <div className="mb-5 text-center max-w-xl px-4">
        <div
          className={`transition-all duration-700 ${
            textVisible ? 'opacity-100 translate-y-0' : 'opacity-10 translate-y-1.5'
          }`}
        >
          <div className={`text-xl sm:text-2xl font-bold tracking-tight text-white`}>
            KARIBU {company.companyName || 'MM-MICROFINANCE'}
          </div>
          <div className={`text-xs sm:text-sm mt-1 ${currentPalette.textAccent}`}>
            Huduma Bora za Mikopo ya Haraka, Salama na Marejesho Rahisi
          </div>
          <div className="text-[11px] sm:text-xs font-semibold tracking-wide text-white/90 mt-1">
            {fullCompanyLocation}
          </div>
        </div>
      </div>

      <div
        className={`w-full ${
          portalMode === 'apply' ? 'max-w-3xl' : 'max-w-md'
        } bg-white border border-slate-200 rounded-xl overflow-hidden transition-all shadow-lg`}
      >
        {/* Brand Header + Mode Switcher */}
        <div className="p-6 pb-5 border-b border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg ${currentPalette.accent} transition-colors duration-700 text-white flex items-center justify-center shrink-0`}
              >
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1
                  className={`text-lg font-bold tracking-tight text-slate-900 transition-opacity duration-700 ${
                    textVisible ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  {company.companyName || 'MM-MICROFINANCE'}
                </h1>
                <p
                  className={`text-xs text-slate-500 transition-opacity duration-700 ${
                    textVisible ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  {(company.district || 'TANDAHIMBA').toUpperCase()}-{(company.region || 'MTAA WA AMANI-MTWARA').toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPortalMode('login')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                portalMode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Ingia Mfumo</span>
            </button>
            <button
              type="button"
              onClick={() => setPortalMode('apply')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                portalMode === 'apply'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Wateja wa Mtandaoni (Omba)</span>
            </button>
          </div>
        </div>

        {/* Mode 1: Staff / Admin Login or First-Run Admin Setup */}
        {portalMode === 'login' && (
          <div className="p-6 space-y-5">
            {authNotice && (
              <div
                role="status"
                className="p-3 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg"
              >
                {authNotice}
              </div>
            )}

            {authStatusLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Inakagua usalama wa mfumo...
              </div>
            ) : !adminConfigured ? (
              <form onSubmit={handleBootstrapAdminSubmit} className="space-y-4">
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>Mpangilio wa Kwanza: Unda Akaunti ya Msimamizi Mkuu</span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Weka username na nenosiri la Msimamizi Mkuu. Baada ya kuingia utaweza kufungua akaunti za wafanyakazi, kuzifunga, na kupanga ngazi za ruhusa.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="setup-fullname"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Jina Kamili la Msimamizi
                  </label>
                  <input
                    id="setup-fullname"
                    type="text"
                    value={setupFullName}
                    onChange={(e) => setSetupFullName(e.target.value)}
                    placeholder="Mfano: Kenneth Mhaiki"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="setup-username"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Username ya Msimamizi *
                  </label>
                  <input
                    id="setup-username"
                    type="text"
                    autoComplete="username"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="Mfano: admin"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="setup-password"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Nenosiri Jipya (angalau herufi 6) *
                  </label>
                  <div className="relative">
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Ingiza nenosiri imara"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-confirm-password"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Thibitisha Nenosiri *
                  </label>
                  <input
                    id="setup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Rudia nenosiri"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                  />
                </div>

                {loginError && (
                  <div
                    role="alert"
                    className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg"
                  >
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{authBusy ? 'Inahifadhi...' : 'Hifadhi & Ingia Mfumo'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Jina la Mtumiaji (Username)
                  </label>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ingiza username yako"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Nenosiri (Password)
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingiza nenosiri"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div
                    role="alert"
                    className={`p-3 text-xs font-medium rounded-lg border ${
                      isAccountLockedError
                        ? 'text-amber-900 bg-amber-50 border-amber-300'
                        : 'text-red-700 bg-red-50 border-red-200'
                    }`}
                  >
                    {isAccountLockedError && (
                      <div className="font-bold text-amber-950 mb-0.5">
                        Akaunti Imefungwa
                      </div>
                    )}
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  <span>{authBusy ? 'Inathibitisha...' : 'Ingia Kwenye Mfumo'}</span>
                </button>
              </form>
            )}

            {/* Notice for Online Applicants on Login Screen */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5">
              <div className="flex items-start gap-2">
                <Megaphone className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-950 leading-relaxed">
                  <strong className="block text-amber-900 mb-0.5">
                    TANGAZO KWA WAOMBAJI WA MTANDAONI:
                  </strong>
                  Baada ya kutuma maombi ya mkopo kwenye mtandao, tafadhali usisahau kuwasiliana
                  nasi kwa <strong>kupiga simu</strong> au <strong>kubonyeza kitufe cha WhatsApp</strong>{' '}
                  hapa chini kwa ajili ya <strong>marejeo</strong> na ufuatiliaji wa haraka.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${primaryPhone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Piga Simu ({primaryPhone})</span>
                </a>
                <a
                  href={generalFollowUpWaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Bonyeza WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Mode 2: Public Online Loan Application */}
        {portalMode === 'apply' && (
          <div className="p-6">
            {submittedRef ? (
              <div className="py-6 text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Ombi Lako la Mkopo Limepokelewa!
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Namba ya Kumbukumbu:{' '}
                    <strong className="font-mono-num text-slate-900">{submittedRef}</strong>
                  </p>
                  <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Maombi yako ya <strong>{formatTZS(previewCalc.principal)}</strong> yamewasilishwa kwa{' '}
                    <strong>{company.companyName}</strong> kwa uhakiki na kupitishwa. Tutawasiliana nawe kupitia simu{' '}
                    <span className="font-mono-num">{phone}</span>.
                  </p>
                </div>

                <div className="max-w-lg mx-auto p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 text-left flex items-start gap-2">
                  <Megaphone className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                  <span>
                    <strong>KUMBUKA KWA MAREJEO:</strong> Tafadhali usisahau kuwasiliana na ofisi
                    baada ya kutuma maombi haya kwa <strong>kupiga simu</strong> au{' '}
                    <strong>kubonyeza kitufe cha WhatsApp</strong> hapa chini ili kukamilisha
                    uhakiki wa ombi lako.
                  </span>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={`tel:${primaryPhone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Piga Simu ({primaryPhone})</span>
                  </a>
                  <a
                    href={`https://wa.me/${primaryWaPhone}?text=${encodeURIComponent(
                      `Habari ${company.companyName}, nimeomba mkopo online (${submittedRef}) wa kiasi cha ${formatTZS(previewCalc.principal)} kupitia ${OFFICIAL_DOMAIN}. Jina langu ni ${fullName}, Simu: ${phone}. Nawasiliana kwa ajili ya marejeo.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Wasiliana WhatsApp (Marejeo)</span>
                  </a>
                  <button
                    type="button"
                    onClick={resetApplicationForm}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Tuma Ombi Lingine
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApplicationSubmit} className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Fomu ya Wateja wa Mtandaoni (Omba Mkopo)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Jaza taarifa zako kwa usahihi ili ombi lako liweze kupitiwa na kupitishwa kwenye mfumo
                  </p>
                </div>

                {/* Mandatory Follow-up Notice before/during online application */}
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
                    <Megaphone className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-950 leading-relaxed">
                      <strong>TANGAZO MUHIMU:</strong> Baada ya kutuma maombi kwenye mtandao,
                      usisahau kuwasiliana nasi kwa <strong>kupiga simu</strong> au{' '}
                      <strong>kubonyeza kitufe cha WhatsApp</strong> kwa ajili ya{' '}
                      <strong>marejeo</strong>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={`tel:${primaryPhone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Piga Simu</span>
                    </a>
                    <a
                      href={generalFollowUpWaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Jina Kamili *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jina la mwombaji"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Namba ya Simu (WhatsApp) *
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="07... au 06..."
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Barua Pepe (Email kwa Arifa)
                    </label>
                    <input
                      type="email"
                      value={appEmail}
                      onChange={(e) => setAppEmail(e.target.value)}
                      placeholder="jina@gmail.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Namba ya Kitambulisho (NIDA/Kura)
                    </label>
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="NIDA / Mpiga Kura"
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mtaa Unapoishi *
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Mfano: Majengo"
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
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Shughuli / Biashara Yako
                    </label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="Mfano: Biashara ya Duka"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Jina la Mdhamini / Shahidi *
                    </label>
                    <input
                      type="text"
                      value={witnessName}
                      onChange={(e) => setWitnessName(e.target.value)}
                      placeholder="Jina kamili la mdhamini"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Simu ya Mdhamini *
                    </label>
                    <input
                      type="text"
                      value={witnessPhone}
                      onChange={(e) => setWitnessPhone(e.target.value)}
                      placeholder="07... au 06..."
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mali ya Dhamana
                    </label>
                    <input
                      type="text"
                      value={collateral}
                      onChange={(e) => setCollateral(e.target.value)}
                      placeholder="Mfano: Pikipiki / Friji / TV"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Benki Yako (Kwa Makato ya Rejesho)
                    </label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value as BankCode | '')}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Check Number (Ikiwa Mtumishi wa Serikali)
                    </label>
                    <input
                      type="text"
                      value={checkNumber}
                      onChange={(e) => {
                        setCheckNumber(e.target.value);
                        if (e.target.value.trim()) setIsGovernmentEmployee(true);
                      }}
                      placeholder="Mfano: 11204589"
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Aina ya Mkopo
                    </label>
                    <select
                      value={loanTypeName}
                      onChange={(e) => handleLoanTypeChange(e.target.value)}
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kiasi Unachoomba (Tsh) *
                    </label>
                    <input
                      type="number"
                      min={1000}
                      value={requestedAmount}
                      onChange={(e) => setRequestedAmount(e.target.value)}
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
                      onChange={(e) =>
                        setFrequency(e.target.value as RepaymentFrequency)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="weekly">Kila Wiki</option>
                      <option value="monthly">Kila Mwezi</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Idadi ya {frequency === 'weekly' ? 'Wiki' : 'Miezi'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={durationCount}
                      onChange={(e) => setDurationCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Madhumuni ya Mkopo / Maelezo ya Ziada
                  </label>
                  <input
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Mfano: Kuongeza mtaji wa biashara"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Live Loan Estimate */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Kiasi Kinachoombwa</div>
                    <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                      {formatTZS(previewCalc.principal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Kadirio la Riba</div>
                    <div className="font-mono-num font-semibold text-emerald-700 mt-0.5">
                      {formatTZS(previewCalc.totalInterest)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">
                      Rejesho ({frequency === 'weekly' ? 'Wiki' : 'Mwezi'})
                    </div>
                    <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                      {formatTZS(previewCalc.installmentAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Kadirio la Mwisho</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {formatDateSW(previewCalc.endDate)}
                    </div>
                  </div>
                </div>

                {appError && (
                  <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                    {appError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingApp}
                  className="w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {submittingApp ? 'Inatuma Ombi...' : 'Tuma Ombi la Mkopo Online'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Company Address, Phones & Email Footer on Login Gate */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 space-y-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">
            Mawasiliano na Anuani ya Kampuni ({company.companyName})
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
            <span>{displayAddress}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <a
                href="tel:0627583847"
                className="font-mono-num font-medium text-slate-900 hover:text-emerald-700"
              >
                0627583847
              </a>
              <span aria-hidden="true">/</span>
              <a
                href="tel:0628007659"
                className="font-mono-num font-medium text-slate-900 hover:text-emerald-700"
              >
                0628007659
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <a
                href={`mailto:${company.email || 'kennethmhaiki8@gmail.com'}`}
                className="font-medium text-slate-900 hover:text-emerald-700"
              >
                {company.email || 'kennethmhaiki8@gmail.com'}
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <a
                href={`https://${OFFICIAL_DOMAIN}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 hover:underline"
              >
                {OFFICIAL_DOMAIN}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
