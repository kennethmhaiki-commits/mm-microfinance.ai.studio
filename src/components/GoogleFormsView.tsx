import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Inbox,
  Link2,
  LogOut,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { CompanySettings, LoanApplication, LoanType } from '../types';
import { formatDateSW, formatTZS } from '../utils/finance';
import {
  clearWorkspaceAccessToken,
  getWorkspaceAccessToken,
  googleWorkspaceDisconnect,
  googleWorkspaceSignIn,
  initWorkspaceAuth,
} from '../services/googleWorkspaceAuth';
import { WorkspaceAuthExpiredError } from '../services/googleSlidesApi';
import {
  createLoanApplicationGoogleForm,
  DriveFormItem,
  extractFormIdFromInput,
  extractFormQuestions,
  extractResponseAnswerRows,
  getGoogleForm,
  GoogleFormDetail,
  GoogleFormResponseItem,
  listGoogleFormResponses,
  listGoogleForms,
  mapGoogleFormResponseToApplication,
  trashGoogleForm,
} from '../services/googleFormsApi';

interface GoogleFormsViewProps {
  company: CompanySettings;
  loanTypes: LoanType[];
  existingApplications: LoanApplication[];
  onImportApplications: (apps: LoanApplication[]) => Promise<number>;
  onOpenOnlineCustomers: () => void;
}

type PendingFormsAction =
  | {
      kind: 'create';
      title: string;
      description: string;
    }
  | {
      kind: 'trash';
      formId: string;
      formTitle: string;
    };

export const GoogleFormsView: React.FC<GoogleFormsViewProps> = ({
  company,
  loanTypes,
  existingApplications,
  onImportApplications,
  onOpenOnlineCustomers,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(() => getWorkspaceAccessToken());
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getWorkspaceAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [formsList, setFormsList] = useState<DriveFormItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [directFormInput, setDirectFormInput] = useState('');

  const [selectedForm, setSelectedForm] = useState<GoogleFormDetail | null>(null);
  const [responses, setResponses] = useState<GoogleFormResponseItem[]>([]);
  const [loadingFormDetail, setLoadingFormDetail] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'responses' | 'questions'>('responses');

  const [newFormTitle, setNewFormTitle] = useState(
    `Maombi ya Mkopo Mtandaoni — ${company.companyName}`,
  );
  const [newFormDescription, setNewFormDescription] = useState(
    `Jaza fomu hii kuomba mkopo kutoka ${company.companyName} (${company.district}). Baada ya kutuma maombi, piga simu ${company.phone} kwa marejeo ya haraka.`,
  );

  const [pendingAction, setPendingAction] = useState<PendingFormsAction | null>(null);
  const [executingAction, setExecutingAction] = useState(false);
  const [importingResponses, setImportingResponses] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const existingAppIds = useMemo(
    () => new Set(existingApplications.map((a) => a.id)),
    [existingApplications],
  );

  const handleAuthExpired = useCallback(() => {
    clearWorkspaceAccessToken();
    setAccessToken(null);
    setNeedsAuth(true);
    setErrorMsg('Muda wa kikao cha Google Forms umeisha. Tafadhali ingia tena na Google.');
  }, []);

  const loadForms = useCallback(
    async (tokenOverride?: string, queryText?: string) => {
      const tok = tokenOverride || accessToken;
      if (!tok) return;
      setLoadingList(true);
      setErrorMsg('');
      try {
        const files = await listGoogleForms(tok, queryText ?? searchTerm);
        setFormsList(files);
      } catch (err) {
        if (err instanceof WorkspaceAuthExpiredError) {
          handleAuthExpired();
        } else {
          setErrorMsg(
            err instanceof Error ? err.message : 'Imeshindwa kupakia orodha ya Google Forms.',
          );
        }
      } finally {
        setLoadingList(false);
      }
    },
    [accessToken, searchTerm, handleAuthExpired],
  );

  useEffect(() => {
    const unsub = initWorkspaceAuth(
      (user, token) => {
        setWorkspaceUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setAccessToken(null);
        setNeedsAuth(true);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (accessToken) {
      void loadForms(accessToken, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg('');
    setNotice('');
    try {
      const { user, accessToken: freshToken } = await googleWorkspaceSignIn();
      setWorkspaceUser(user);
      setAccessToken(freshToken);
      setNeedsAuth(false);
      setNotice(`Umeunganishwa na Google Forms kupitia ${user.email || 'akaunti ya Google'}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Imeshindwa kuingia kwa Google Workspace.',
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDisconnect = async () => {
    await googleWorkspaceDisconnect();
    setAccessToken(null);
    setWorkspaceUser(null);
    setFormsList([]);
    setSelectedForm(null);
    setResponses([]);
    setNeedsAuth(true);
    setNotice('Umetoka kwenye akaunti ya Google Forms.');
  };

  const handleInspectForm = async (rawIdOrUrl: string, tokenOverride?: string) => {
    const tok = tokenOverride || accessToken;
    if (!tok) {
      setNeedsAuth(true);
      return;
    }
    const formId = extractFormIdFromInput(rawIdOrUrl);
    if (!formId) {
      setErrorMsg('Weka ID au link sahihi ya Google Form.');
      return;
    }

    setLoadingFormDetail(true);
    setErrorMsg('');
    try {
      const [detail, formResponses] = await Promise.all([
        getGoogleForm(tok, formId),
        listGoogleFormResponses(tok, formId),
      ]);
      setSelectedForm(detail);
      setResponses(formResponses);
    } catch (err) {
      if (err instanceof WorkspaceAuthExpiredError) {
        handleAuthExpired();
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Imeshindwa kusoma Google Form na majibu yake.',
        );
      }
    } finally {
      setLoadingFormDetail(false);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingAction || !accessToken) return;
    setExecutingAction(true);
    setErrorMsg('');
    setNotice('');

    try {
      if (pendingAction.kind === 'create') {
        const created = await createLoanApplicationGoogleForm(accessToken, {
          title: pendingAction.title,
          description: pendingAction.description,
          loanTypes,
        });
        setNotice(
          `Google Form mpya "${created.info?.title || pendingAction.title}" imeundwa yenye maswali ya maombi ya mkopo.`,
        );
        await loadForms(accessToken);
        await handleInspectForm(created.formId, accessToken);
      } else if (pendingAction.kind === 'trash') {
        await trashGoogleForm(accessToken, pendingAction.formId);
        setNotice(
          `Fomu "${pendingAction.formTitle}" imehamishiwa kwenye Trash ya Google Drive.`,
        );
        if (selectedForm?.formId === pendingAction.formId) {
          setSelectedForm(null);
          setResponses([]);
        }
        await loadForms(accessToken);
      }
      setPendingAction(null);
    } catch (err) {
      if (err instanceof WorkspaceAuthExpiredError) {
        setPendingAction(null);
        handleAuthExpired();
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Hatua imeshindikana.');
      }
    } finally {
      setExecutingAction(false);
    }
  };

  const handleCopyResponderUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleImportResponses = async (targetResponses: GoogleFormResponseItem[]) => {
    if (!selectedForm || targetResponses.length === 0) return;
    setImportingResponses(true);
    setErrorMsg('');
    setNotice('');

    try {
      const mapped = targetResponses.map((resp) =>
        mapGoogleFormResponseToApplication({
          form: selectedForm,
          response: resp,
          defaultDistrict: company.district,
          loanTypes,
        }),
      );
      const freshApps = mapped.filter((app) => !existingAppIds.has(app.id));
      if (freshApps.length === 0) {
        setNotice('Majibu yote yaliyochaguliwa tayari yapo kwenye orodha ya Wateja wa Mtandaoni.');
        return;
      }
      const importedCount = await onImportApplications(freshApps);
      setNotice(
        `Maombi ${importedCount} kutoka Google Form yameingizwa kwenye sehemu ya "Wateja wa Mtandaoni" tayari kwa kupitishwa.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Imeshindwa kuingiza majibu ya Google Form.',
      );
    } finally {
      setImportingResponses(false);
    }
  };

  const extractedQuestions = useMemo(
    () => (selectedForm ? extractFormQuestions(selectedForm) : []),
    [selectedForm],
  );

  const unimportedResponses = useMemo(() => {
    if (!selectedForm) return [];
    return responses.filter((r) => {
      const safeId = `app_gf_${r.responseId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
      return !existingAppIds.has(safeId);
    });
  }, [responses, existingAppIds, selectedForm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Google Forms — Fomu za Maombi ya Mikopo na Majibu
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unda Google Form ya maombi ya mkopo, sambaza link kwa wateja, kagua majibu, na yaingize moja kwa moja kwenye Wateja wa Mtandaoni
          </p>
        </div>

        {!needsAuth && accessToken && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-slate-600">
              Imeunganishwa:{' '}
              <strong className="text-slate-900">{workspaceUser?.email || 'Google'}</strong>
            </span>
            <button
              type="button"
              onClick={() => void loadForms()}
              disabled={loadingList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              <span>Onyesha Upya</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ondoa Google</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={onOpenOnlineCustomers}
            className="font-semibold text-emerald-900 underline hover:text-emerald-700 whitespace-nowrap"
          >
            Fungua Wateja wa Mtandaoni
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Auth Gate */}
      {needsAuth || !accessToken ? (
        <section className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
            <ClipboardList className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Unganisha Akaunti ya Google Forms
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ingia na akaunti yako ya Google ili kuunda fomu mpya za maombi ya mkopo, kusoma fomu zako za Google Drive, na kukusanya majibu ya waombaji moja kwa moja kwenye mfumo.
            </p>
          </div>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={isLoggingIn}
              onClick={() => void handleGoogleLogin()}
              className="gsi-material-button inline-flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-300 rounded-md shadow-xs hover:bg-slate-50 text-sm font-medium text-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper flex items-center gap-3">
                <div className="gsi-material-button-icon w-5 h-5 shrink-0">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="block w-5 h-5"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isLoggingIn ? 'Inaunganisha...' : 'Sign in with Google'}
                </span>
              </div>
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Create Form + Direct Link + Forms List */}
          <div className="lg:col-span-5 space-y-6">
            {/* Create New Loan Application Form */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-emerald-600" />
                  <span>Unda Google Form ya Maombi ya Mkopo</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Itaunda fomu kamili yenye maswali 9 ya mkopaji, mdhamini, kiasi, aina ya mkopo, na dhamana
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jina la Fomu (Google Form Title)
                </label>
                <input
                  type="text"
                  value={newFormTitle}
                  onChange={(e) => setNewFormTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Maelezo ya Utangulizi kwa Mwombaji
                </label>
                <textarea
                  rows={2}
                  value={newFormDescription}
                  onChange={(e) => setNewFormDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="button"
                disabled={!newFormTitle.trim()}
                onClick={() =>
                  setPendingAction({
                    kind: 'create',
                    title: newFormTitle.trim(),
                    description: newFormDescription.trim(),
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Unda Fomu Kwenye Google Forms</span>
              </button>
            </section>

            {/* Open Form Directly by URL or Form ID */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-700" />
                <span>Fungua Fomu kwa Link au Form ID</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleInspectForm(directFormInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={directFormInput}
                  onChange={(e) => setDirectFormInput(e.target.value)}
                  placeholder="Bandika link ya Google Form au ID..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={!directFormInput.trim() || loadingFormDetail}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                >
                  Fungua
                </button>
              </form>
            </section>

            {/* Existing Google Forms in Drive */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-slate-700" />
                    <span>Fomu Zako za Google ({formsList.length})</span>
                  </h3>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadForms(undefined, searchTerm);
                  }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tafuta jina la fomu..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200"
                  >
                    Tafuta
                  </button>
                </form>
              </div>

              {loadingList ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Inapakia Google Forms kutoka Drive...
                </div>
              ) : formsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Hakuna Google Form iliyopatikana kwenye Drive yako. Unda fomu mpya hapo juu.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {formsList.map((item) => {
                    const isActive = selectedForm?.formId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 ${
                          isActive ? 'bg-emerald-50/60' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleInspectForm(item.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {item.name}
                          </div>
                          {item.modifiedTime && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Imesasishwa: {formatDateSW(item.modifiedTime.slice(0, 10))}
                            </div>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.webViewLink && (
                            <a
                              href={item.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Fungua Google Form"
                              className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-white"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({
                                kind: 'trash',
                                formId: item.id,
                                formTitle: item.name,
                              })
                            }
                            title="Hamishia Trash"
                            className="p-1.5 text-red-600 hover:text-red-700 border border-slate-200 rounded-md hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Form Details, Shareable Link & Responses */}
          <div className="lg:col-span-7">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {selectedForm
                      ? selectedForm.info?.title || 'Google Form'
                      : 'Kagua Fomu & Majibu ya Waombaji'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {selectedForm
                      ? `Maswali ${extractedQuestions.length} · Majibu ${responses.length} · ID: ${selectedForm.formId}`
                      : 'Chagua fomu upande wa kushoto kuona link ya kushiriki, maswali yake, na majibu yaliyotumwa'}
                  </p>
                </div>

                {selectedForm && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {selectedForm.responderUri && (
                      <button
                        type="button"
                        onClick={() => void handleCopyResponderUrl(selectedForm.responderUri!)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                      >
                        {copiedUri ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedUri ? 'Imenakiliwa' : 'Nakili Link ya Kujaza'}</span>
                      </button>
                    )}
                    <a
                      href={`https://docs.google.com/forms/d/${encodeURIComponent(selectedForm.formId)}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Hariri Google Form</span>
                    </a>
                  </div>
                )}
              </div>

              {loadingFormDetail ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  Inasoma fomu na majibu kutoka Google Forms API...
                </div>
              ) : !selectedForm ? (
                <div className="p-12 text-center space-y-2">
                  <ClipboardList className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-sm font-medium text-slate-700">
                    Hakuna Google Form iliyochaguliwa
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Bonyeza fomu yoyote upande wa kushoto au unda fomu mpya ya maombi ya mkopo ili uanze kukusanya taarifa za wateja.
                  </p>
                </div>
              ) : (
                <div className="p-6 space-y-5">
                  {/* Shareable Responder Link Box */}
                  {selectedForm.responderUri && (
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-emerald-950">
                          Link ya Wateja Kujaza Fomu (Responder URL)
                        </div>
                        <div className="text-xs text-emerald-800 font-mono-num truncate mt-0.5">
                          {selectedForm.responderUri}
                        </div>
                      </div>
                      <a
                        href={selectedForm.responderUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Fungua Fomu</span>
                      </a>
                    </div>
                  )}

                  {/* Sub-tabs: Responses vs Questions */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setInspectorTab('responses')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                          inspectorTab === 'responses'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Majibu Yaliyotumwa ({responses.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorTab('questions')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                          inspectorTab === 'questions'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Maswali ya Fomu ({extractedQuestions.length})
                      </button>
                    </div>

                    {inspectorTab === 'responses' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleInspectForm(selectedForm.formId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Vuta Majibu Mapya</span>
                        </button>
                        {unimportedResponses.length > 0 && (
                          <button
                            type="button"
                            disabled={importingResponses}
                            onClick={() => void handleImportResponses(unimportedResponses)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              {importingResponses
                                ? 'Inaingiza...'
                                : `Ingiza Mapya (${unimportedResponses.length})`}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {inspectorTab === 'responses' ? (
                    responses.length === 0 ? (
                      <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
                        <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-medium text-slate-700">
                          Bado hakuna majibu yaliyotumwa kwenye fomu hii.
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Nakili link ya fomu hapo juu na utume kwa wateja. Mara watakapojaza, bonyeza "Vuta Majibu Mapya" kuona na kuingiza maombi yao.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {responses.map((resp) => {
                          const answerRows = extractResponseAnswerRows(selectedForm, resp);
                          const previewApp = mapGoogleFormResponseToApplication({
                            form: selectedForm,
                            response: resp,
                            defaultDistrict: company.district,
                            loanTypes,
                          });
                          const alreadyImported = existingAppIds.has(previewApp.id);
                          const submittedDate = (
                            resp.lastSubmittedTime ||
                            resp.createTime ||
                            ''
                          ).slice(0, 10);

                          return (
                            <div
                              key={resp.responseId}
                              className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">
                                    {previewApp.fullName}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono-num">
                                    {previewApp.phone} · Kiasi: {formatTZS(previewApp.requestedAmount)} · Tarehe:{' '}
                                    {submittedDate ? formatDateSW(submittedDate) : '-'}
                                  </div>
                                </div>

                                {alreadyImported ? (
                                  <span className="text-xs font-semibold text-emerald-700">
                                    Tayari Kwenye Maombi
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={importingResponses}
                                    onClick={() => void handleImportResponses([resp])}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Ingiza Kwenye Maombi</span>
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                {answerRows.map((row) => (
                                  <div
                                    key={`${resp.responseId}_${row.questionId}`}
                                    className="p-2.5 bg-slate-50 rounded-lg"
                                  >
                                    <div className="text-slate-500">{row.questionTitle}</div>
                                    <div className="font-medium text-slate-900 mt-0.5 break-words">
                                      {row.answerText || '—'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {extractedQuestions.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Fomu hii bado haina maswali yoyote.
                        </div>
                      ) : (
                        extractedQuestions.map((q, idx) => (
                          <div key={q.questionId} className="px-4 py-3 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {idx + 1}. {q.title}
                              </span>
                              <span className="text-slate-500">
                                {q.required ? 'Lazima' : 'Si lazima'} ·{' '}
                                {q.kind === 'choice'
                                  ? 'Chaguo'
                                  : q.kind === 'paragraph'
                                    ? 'Maelezo Marefu'
                                    : 'Maandishi'}
                              </span>
                            </div>
                            {q.options.length > 0 && (
                              <div className="mt-1 text-slate-500">
                                Chaguo: {q.options.join(' · ')}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Modal for Mutating/Destructive Google Workspace Operations */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    pendingAction.kind === 'trash'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  {pendingAction.kind === 'create'
                    ? 'Thibitisha Kuunda Google Form'
                    : 'Thibitisha Kuhamisha Fomu Kwenye Trash'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={executingAction}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                aria-label="Funga"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              {pendingAction.kind === 'create' ? (
                <>
                  <p>
                    Je, unathibitisha kuunda Google Form mpya yenye jina{' '}
                    <strong className="text-slate-900">"{pendingAction.title}"</strong>?
                  </p>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    Fomu itahifadhiwa kwenye Google Drive yako ({workspaceUser?.email || 'Google'}) ikiwa na maswali 9 ya maombi ya mkopo wa {company.companyName}.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Je, una uhakika unataka kuhamisha Google Form{' '}
                    <strong className="text-slate-900">"{pendingAction.formTitle}"</strong> kwenda kwenye{' '}
                    <strong>Trash</strong> ya Google Drive?
                  </p>
                  <p className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    Fomu hii itaondolewa kwenye orodha ya fomu zinazotumika (ID: {pendingAction.formId}).
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={executingAction}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPendingAction()}
                disabled={executingAction}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-60 ${
                  pendingAction.kind === 'trash'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {executingAction
                  ? 'Inatekeleza...'
                  : pendingAction.kind === 'trash'
                    ? 'Ndiyo, Hamishia Trash'
                    : 'Thibitisha na Unda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
