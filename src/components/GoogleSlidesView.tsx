import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  LogOut,
  PlusSquare,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { CompanySettings, Customer, Loan, Repayment } from '../types';
import {
  formatDateSW,
  formatTZS,
  getLoanPaidTotal,
  getLoanRemainingBalance,
  todayISO,
} from '../utils/finance';
import {
  clearWorkspaceAccessToken,
  getWorkspaceAccessToken,
  googleWorkspaceDisconnect,
  googleWorkspaceSignIn,
  initWorkspaceAuth,
} from '../services/googleWorkspaceAuth';
import {
  appendSummarySlideToPresentation,
  createPortfolioSlideDeck,
  DrivePresentationItem,
  ExtractedSlidePreview,
  extractSlidesSummary,
  getGoogleSlidesPresentation,
  GooglePresentationDetail,
  listGoogleSlidesPresentations,
  trashGoogleSlidesPresentation,
  WorkspaceAuthExpiredError,
} from '../services/googleSlidesApi';

interface GoogleSlidesViewProps {
  customers: Customer[];
  loans: Loan[];
  repayments: Repayment[];
  company: CompanySettings;
}

type PendingWorkspaceAction =
  | {
      kind: 'create';
      title: string;
      slideCount: number;
    }
  | {
      kind: 'append';
      presentationId: string;
      presentationTitle: string;
      slideTitle: string;
      bodyText: string;
    }
  | {
      kind: 'trash';
      presentationId: string;
      presentationTitle: string;
    };

export const GoogleSlidesView: React.FC<GoogleSlidesViewProps> = ({
  customers,
  loans,
  repayments,
  company,
}) => {
  const today = todayISO();

  const [accessToken, setAccessToken] = useState<string | null>(() => getWorkspaceAccessToken());
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getWorkspaceAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [presentations, setPresentations] = useState<DrivePresentationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedDetail, setSelectedDetail] = useState<GooglePresentationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [deckTitle, setDeckTitle] = useState(
    `Ripoti ya ${company.companyName} - ${formatDateSW(today)}`,
  );
  const [appendSlideTitle, setAppendSlideTitle] = useState(
    `Muhtasari wa Makusanyo (${formatDateSW(today)})`,
  );

  const [pendingAction, setPendingAction] = useState<PendingWorkspaceAction | null>(null);
  const [executingAction, setExecutingAction] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Live financial report lines generated from Firestore records
  const reportContent = useMemo(() => {
    const totalPrincipal = loans.reduce((s, l) => s + (l.principal || 0), 0);
    const totalInterest = loans.reduce((s, l) => s + (l.totalInterest || 0), 0);
    const totalPenalty = loans.reduce((s, l) => s + (l.penaltyApplied || 0), 0);
    const totalDue = loans.reduce((s, l) => s + (l.totalDue || 0), 0);
    const totalCollected = loans.reduce((s, l) => s + getLoanPaidTotal(l), 0);
    const totalRemaining = loans.reduce((s, l) => s + getLoanRemainingBalance(l), 0);
    const activeLoans = loans.filter(
      (l) => l.status !== 'completed' && getLoanRemainingBalance(l) > 0,
    );
    const overdueCount = activeLoans.filter(
      (l) => l.status === 'overdue' || l.endDate < today,
    ).length;

    const coverSubtitle = [
      `Taasisi: ${company.companyName}`,
      `Wilaya / Eneo: ${company.district}${company.region ? `, ${company.region}` : ''}`,
      `Mawasiliano: ${company.phone}`,
      `Tarehe ya Ripoti: ${formatDateSW(today)}`,
    ].join('\n');

    const summaryBody = [
      `• Jumla ya Wateja Waliosajiliwa: ${customers.length}`,
      `• Mikopo Inayoendelea: ${activeLoans.length} (Iliyochelewa: ${overdueCount})`,
      `• Jumla ya Mtaji Uliokopeshwa: ${formatTZS(totalPrincipal)}`,
      `• Jumla ya Riba Tarajiwa: ${formatTZS(totalInterest)}`,
      `• Jumla ya Adhabu Zilizotozwa: ${formatTZS(totalPenalty)}`,
      `• Jumla ya Deni Lote (Principal + Riba + Adhabu): ${formatTZS(totalDue)}`,
      `• Jumla ya Marejesho Yaliyokusanywa (${repayments.length} risiti): ${formatTZS(totalCollected)}`,
      `• Salio Linalodaiwa Hadi Leo: ${formatTZS(totalRemaining)}`,
    ].join('\n');

    const topActiveLines =
      activeLoans.length === 0
        ? 'Hakuna mikopo inayoendelea yenye salio kwa sasa.'
        : activeLoans
            .slice(0, 10)
            .map((loan, i) => {
              const cust = customers.find((c) => c.id === loan.customerId);
              const rem = getLoanRemainingBalance(loan);
              return `${i + 1}. ${cust?.fullName || 'Mteja'} — ${loan.loanTypeName} | Deni: ${formatTZS(loan.totalDue)} | Salio: ${formatTZS(rem)} (Mwisho: ${formatDateSW(loan.endDate)})`;
            })
            .join('\n');

    return {
      coverSubtitle,
      summaryTitle: `Muhtasari wa Mtaji, Riba & Makusanyo (${formatDateSW(today)})`,
      summaryBody,
      loansTitle: `Mikopo Inayoendelea (${Math.min(10, activeLoans.length)} kati ya ${activeLoans.length})`,
      loansBody: topActiveLines,
    };
  }, [customers, loans, repayments, company, today]);

  const handleAuthExpired = useCallback(() => {
    clearWorkspaceAccessToken();
    setAccessToken(null);
    setNeedsAuth(true);
    setErrorMsg('Muda wa kikao cha Google Slides umeisha. Tafadhali ingia tena na Google.');
  }, []);

  const loadPresentations = useCallback(
    async (tokenOverride?: string, queryText?: string) => {
      const tok = tokenOverride || accessToken;
      if (!tok) return;
      setLoadingList(true);
      setErrorMsg('');
      try {
        const files = await listGoogleSlidesPresentations(tok, queryText ?? searchTerm);
        setPresentations(files);
      } catch (err) {
        if (err instanceof WorkspaceAuthExpiredError) {
          handleAuthExpired();
        } else {
          setErrorMsg(
            err instanceof Error ? err.message : 'Imeshindwa kupakia orodha ya Google Slides.',
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
      void loadPresentations(accessToken, '');
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
      setNotice(`Umeunganishwa na Google Slides kupitia ${user.email || 'akaunti ya Google'}.`);
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
    setPresentations([]);
    setSelectedDetail(null);
    setNeedsAuth(true);
    setNotice('Umetoka kwenye akaunti ya Google Slides.');
  };

  const handleInspectPresentation = async (presentationId: string) => {
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setLoadingDetail(true);
    setErrorMsg('');
    try {
      const detail = await getGoogleSlidesPresentation(accessToken, presentationId);
      setSelectedDetail(detail);
    } catch (err) {
      if (err instanceof WorkspaceAuthExpiredError) {
        handleAuthExpired();
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Imeshindwa kufungua maudhui ya wasilisho.',
        );
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingAction || !accessToken) return;
    setExecutingAction(true);
    setErrorMsg('');
    setNotice('');

    try {
      if (pendingAction.kind === 'create') {
        const created = await createPortfolioSlideDeck(accessToken, {
          title: pendingAction.title,
          coverSubtitle: reportContent.coverSubtitle,
          summaryTitle: reportContent.summaryTitle,
          summaryBody: reportContent.summaryBody,
          loansTitle: reportContent.loansTitle,
          loansBody: reportContent.loansBody,
        });
        setNotice(
          `Wasilisho jipya "${created.title}" lenye slaidi 3 limeundwa kwenye Google Slides.`,
        );
        await loadPresentations(accessToken);
        await handleInspectPresentation(created.presentationId);
      } else if (pendingAction.kind === 'append') {
        await appendSummarySlideToPresentation(accessToken, pendingAction.presentationId, {
          slideTitle: pendingAction.slideTitle,
          bodyText: pendingAction.bodyText,
        });
        setNotice(
          `Slaidi mpya "${pendingAction.slideTitle}" imeongezwa kwenye wasilisho "${pendingAction.presentationTitle}".`,
        );
        await handleInspectPresentation(pendingAction.presentationId);
      } else if (pendingAction.kind === 'trash') {
        await trashGoogleSlidesPresentation(accessToken, pendingAction.presentationId);
        setNotice(
          `Wasilisho "${pendingAction.presentationTitle}" limehamishiwa kwenye Trash ya Google Drive.`,
        );
        if (selectedDetail?.presentationId === pendingAction.presentationId) {
          setSelectedDetail(null);
        }
        await loadPresentations(accessToken);
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

  const slidePreviews: ExtractedSlidePreview[] = useMemo(
    () => (selectedDetail ? extractSlidesSummary(selectedDetail) : []),
    [selectedDetail],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Ripoti za Utendaji Kwenye Google Slides
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unda mawasilisho ya ripoti za mikopo na makusanyo moja kwa moja kwenye Google Slides, kagua slaidi, na ongeza muhtasari wa kila siku
          </p>
        </div>

        {!needsAuth && accessToken && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-600">
              Imeunganishwa:{' '}
              <strong className="text-slate-900">{workspaceUser?.email || 'Google'}</strong>
            </span>
            <button
              type="button"
              onClick={() => void loadPresentations()}
              disabled={loadingList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              <span>Onyesha Upya</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ondoa Google</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Auth Gate when token is unavailable */}
      {needsAuth || !accessToken ? (
        <section className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
            <Presentation className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Unganisha Akaunti ya Google Slides
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ingia kwa akaunti yako ya Google ili kuunda ripoti mpya za slaidi za mikopo, kusoma mawasilisho yako ya Google Drive, na kuongeza slaidi za muhtasari.
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
          {/* Left Column: Create New Portfolio Deck + Existing List */}
          <div className="lg:col-span-5 space-y-6">
            {/* Create New Slide Deck */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-emerald-600" />
                  <span>Unda Wasilisho Jipya la Ripoti (Slaidi 3)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Huchukua takwimu za sasa za mtaji, riba, adhabu na mikopo inayoendelea na kuunda wasilisho la Google Slides
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kichwa cha Wasilisho (Google Slides Title)
                </label>
                <input
                  type="text"
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Muundo wa Slaidi Zitakazoundwa:</div>
                <div>1. Jalada: {company.companyName} ({company.district})</div>
                <div>2. {reportContent.summaryTitle}</div>
                <div>3. {reportContent.loansTitle}</div>
              </div>

              <button
                type="button"
                disabled={!deckTitle.trim()}
                onClick={() =>
                  setPendingAction({
                    kind: 'create',
                    title: deckTitle.trim(),
                    slideCount: 3,
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Unda Wasilisho Kwenye Google Slides</span>
              </button>
            </section>

            {/* Presentations List */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-slate-700" />
                    <span>Mawasilisho Yako ({presentations.length})</span>
                  </h3>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadPresentations(undefined, searchTerm);
                  }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tafuta jina la wasilisho..."
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
                  Inapakia mawasilisho kutoka Google Drive...
                </div>
              ) : presentations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Hakuna faili la Google Slides lililopatikana. Unda wasilisho jipya hapo juu.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {presentations.map((item) => {
                    const isActive = selectedDetail?.presentationId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 ${
                          isActive ? 'bg-emerald-50/60' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleInspectPresentation(item.id)}
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
                              title="Fungua Google Slides"
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
                                presentationId: item.id,
                                presentationTitle: item.name,
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

          {/* Right Column: Slide Preview & Append Summary Slide */}
          <div className="lg:col-span-7">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {selectedDetail ? selectedDetail.title : 'Kagua Maudhui ya Google Slides'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedDetail
                      ? `Jumla ya Slaidi: ${slidePreviews.length} · ID: ${selectedDetail.presentationId}`
                      : 'Chagua wasilisho upande wa kushoto ili kuona slaidi zake au kuongeza slaidi ya muhtasari wa leo'}
                  </p>
                </div>

                {selectedDetail && (
                  <a
                    href={`https://docs.google.com/presentation/d/${encodeURIComponent(selectedDetail.presentationId)}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Hariri Kwenye Google Slides</span>
                  </a>
                )}
              </div>

              {loadingDetail ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Inasoma slaidi kutoka Google Slides API...
                </div>
              ) : !selectedDetail ? (
                <div className="p-12 text-center space-y-2">
                  <Presentation className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-sm font-medium text-slate-700">
                    Hakuna wasilisho lililochaguliwa
                  </p>
                  <p className="text-xs text-slate-500">
                    Bonyeza wasilisho lolote kwenye orodha au unda wasilisho jipya la ripoti ya MM-MICROFINANCE.
                  </p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* Append New Summary Slide Action */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="text-xs font-semibold text-slate-900">
                      Ongeza Slaidi Mpya ya Muhtasari wa Leo Kwenye Wasilisho Hili
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={appendSlideTitle}
                        onChange={(e) => setAppendSlideTitle(e.target.value)}
                        className="flex-1 min-w-[200px] px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        disabled={!appendSlideTitle.trim()}
                        onClick={() =>
                          setPendingAction({
                            kind: 'append',
                            presentationId: selectedDetail.presentationId,
                            presentationTitle: selectedDetail.title,
                            slideTitle: appendSlideTitle.trim(),
                            bodyText: reportContent.summaryBody,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        <PlusSquare className="w-3.5 h-3.5" />
                        <span>Ongeza Slaidi</span>
                      </button>
                    </div>
                  </div>

                  {/* Slides List Preview */}
                  <div className="space-y-3">
                    {slidePreviews.map((sl) => (
                      <div
                        key={sl.objectId}
                        className="border border-slate-200 rounded-xl p-4 bg-white space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-900">
                            Slaidi #{sl.slideNumber}
                          </span>
                          <span className="font-mono-num text-[11px] text-slate-400">
                            {sl.objectId}
                          </span>
                        </div>
                        {sl.lines.length === 0 ? (
                          <div className="text-xs text-slate-400 italic">
                            (Slaidi haina maandishi au ina maumbo/picha)
                          </div>
                        ) : (
                          <div className="space-y-1 text-xs text-slate-700">
                            {sl.lines.map((line, i) => (
                              <div
                                key={i}
                                className={i === 0 ? 'font-semibold text-slate-900 text-sm' : ''}
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Modal for All Mutating/Destructive Google Workspace Operations */}
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
                    ? 'Thibitisha Kuunda Google Slides'
                    : pendingAction.kind === 'append'
                      ? 'Thibitisha Kubadilisha Google Slides'
                      : 'Thibitisha Kuhamisha Kwenye Trash'}
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
              {pendingAction.kind === 'create' && (
                <>
                  <p>
                    Je, unathibitisha kuunda wasilisho jipya la Google Slides lenye kichwa{' '}
                    <strong className="text-slate-900">"{pendingAction.title}"</strong>?
                  </p>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    Wasilisho litakuwa na slaidi {pendingAction.slideCount} zenye takwimu za fedha na mikopo ya {company.companyName} na litahifadhiwa kwenye Google Drive yako ({workspaceUser?.email || 'Google'}).
                  </p>
                </>
              )}

              {pendingAction.kind === 'append' && (
                <>
                  <p>
                    Je, unathibitisha kuongeza slaidi mpya{' '}
                    <strong className="text-slate-900">"{pendingAction.slideTitle}"</strong>{' '}
                    kwenye wasilisho{' '}
                    <strong className="text-slate-900">"{pendingAction.presentationTitle}"</strong>?
                  </p>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-num text-[11px]">
                    ID: {pendingAction.presentationId}
                  </p>
                </>
              )}

              {pendingAction.kind === 'trash' && (
                <>
                  <p>
                    Je, una uhakika unataka kuhamisha wasilisho{' '}
                    <strong className="text-slate-900">"{pendingAction.presentationTitle}"</strong>{' '}
                    kwenda kwenye <strong>Trash</strong> ya Google Drive?
                  </p>
                  <p className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    Faili hili litaondolewa kwenye orodha ya mawasilisho yanayotumika (ID: {pendingAction.presentationId}).
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
                    : 'Thibitisha na Endelea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
