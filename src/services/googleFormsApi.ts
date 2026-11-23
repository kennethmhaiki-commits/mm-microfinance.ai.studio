import { InterestType, LoanApplication, LoanType, RepaymentFrequency } from '../types';
import { WorkspaceAuthExpiredError } from './googleSlidesApi';

export interface DriveFormItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleFormQuestionOption {
  value: string;
}

export interface GoogleFormItem {
  itemId?: string;
  title?: string;
  description?: string;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      textQuestion?: { paragraph?: boolean };
      choiceQuestion?: {
        type?: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN';
        options?: GoogleFormQuestionOption[];
      };
    };
  };
}

export interface GoogleFormDetail {
  formId: string;
  info?: {
    title?: string;
    description?: string;
    documentTitle?: string;
  };
  responderUri?: string;
  linkedSheetId?: string;
  items?: GoogleFormItem[];
}

export interface GoogleFormAnswerValue {
  questionId?: string;
  textAnswers?: {
    answers?: { value?: string }[];
  };
}

export interface GoogleFormResponseItem {
  responseId: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers?: Record<string, GoogleFormAnswerValue>;
}

export interface ExtractedFormQuestion {
  questionId: string;
  title: string;
  required: boolean;
  kind: 'text' | 'paragraph' | 'choice' | 'other';
  options: string[];
}

export interface ParsedFormAnswerRow {
  questionId: string;
  questionTitle: string;
  answerText: string;
}

async function formsWorkspaceFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401 || res.status === 403) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.status === 401) {
      throw new WorkspaceAuthExpiredError();
    }
    throw new Error(
      errBody.error?.message ||
        'Huna ruhusa ya kufikia Google Forms / Drive. Tafadhali ingia tena na Google na ukubali ruhusa za Forms.',
    );
  }
  return res;
}

export function extractFormIdFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export async function listGoogleForms(
  accessToken: string,
  searchQuery?: string,
): Promise<DriveFormItem[]> {
  const safeSearch = (searchQuery || '').trim().replace(/'/g, "\\'");
  const qParts = ["mimeType='application/vnd.google-apps.form'", 'trashed=false'];
  if (safeSearch) {
    qParts.push(`name contains '${safeSearch}'`);
  }
  const params = new URLSearchParams({
    q: qParts.join(' and '),
    fields: 'files(id,name,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '25',
  });

  const res = await formsWorkspaceFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    accessToken,
  );
  const data = (await res.json()) as {
    files?: DriveFormItem[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || 'Imeshindwa kupata orodha ya Google Forms kutoka Drive.');
  }
  return data.files || [];
}

export async function getGoogleForm(
  accessToken: string,
  formId: string,
): Promise<GoogleFormDetail> {
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await formsWorkspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}`,
    accessToken,
  );
  const data = (await res.json()) as GoogleFormDetail & {
    error?: { message?: string };
  };
  if (!res.ok || !data.formId) {
    throw new Error(data.error?.message || 'Imeshindwa kusoma maelezo ya Google Form.');
  }
  return data;
}

export async function listGoogleFormResponses(
  accessToken: string,
  formId: string,
): Promise<GoogleFormResponseItem[]> {
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await formsWorkspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}/responses?pageSize=100`,
    accessToken,
  );
  const data = (await res.json()) as {
    responses?: GoogleFormResponseItem[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || 'Imeshindwa kupata majibu ya Google Form.');
  }
  return (data.responses || []).sort((a, b) =>
    (b.lastSubmittedTime || b.createTime || '').localeCompare(
      a.lastSubmittedTime || a.createTime || '',
    ),
  );
}

export async function createLoanApplicationGoogleForm(
  accessToken: string,
  params: {
    title: string;
    description: string;
    loanTypes: LoanType[];
  },
): Promise<GoogleFormDetail> {
  const createRes = await formsWorkspaceFetch(
    'https://forms.googleapis.com/v1/forms',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        info: {
          title: params.title,
          documentTitle: params.title,
        },
      }),
    },
  );
  const created = (await createRes.json()) as GoogleFormDetail & {
    error?: { message?: string };
  };
  if (!createRes.ok || !created.formId) {
    throw new Error(created.error?.message || 'Imeshindwa kuunda Google Form mpya.');
  }

  const loanTypeOptions =
    params.loanTypes.length > 0
      ? params.loanTypes.map((lt) => ({ value: lt.name }))
      : [{ value: 'Mkopo wa Biashara' }, { value: 'Mkopo wa Dharura' }];

  const requests: Record<string, unknown>[] = [
    {
      updateFormInfo: {
        info: {
          description: params.description,
        },
        updateMask: 'description',
      },
    },
    {
      createItem: {
        item: {
          title: 'Jina Kamili la Mwombaji',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 0 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Namba ya Simu (Mfano: 07XXXXXXXX)',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 1 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Anwani / Mtaa na Wilaya',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 2 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Aina ya Mkopo Unaopenda',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: loanTypeOptions,
              },
            },
          },
        },
        location: { index: 3 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Kiasi cha Mkopo Unachoomba (TZS)',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 4 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Mtindo na Muda wa Marejesho',
          description: 'Mfano: Kila Wiki (Wiki 4) au Kila Mwezi (Miezi 3)',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: 'Kila Wiki (Wiki 4)' },
                  { value: 'Kila Wiki (Wiki 8)' },
                  { value: 'Kila Mwezi (Miezi 1)' },
                  { value: 'Kila Mwezi (Miezi 3)' },
                  { value: 'Kila Mwezi (Miezi 6)' },
                ],
              },
            },
          },
        },
        location: { index: 5 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Jina la Mdhamini / Shahidi',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 6 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Namba ya Simu ya Mdhamini',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 7 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Dhamana ya Mkopo & Sababu ya Mkopo',
          questionItem: {
            question: {
              required: false,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 8 },
      },
    },
  ];

  const safeFormId = encodeURIComponent(created.formId.trim());
  const batchRes = await formsWorkspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeFormInResponse: true,
        requests,
      }),
    },
  );

  if (!batchRes.ok) {
    const errJson = (await batchRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(
      errJson.error?.message || 'Fomu imeundwa lakini maswali yameshindwa kuongezwa.',
    );
  }

  const batchData = (await batchRes.json()) as { form?: GoogleFormDetail };
  return batchData.form || (await getGoogleForm(accessToken, created.formId));
}

export async function trashGoogleForm(accessToken: string, formId: string): Promise<void> {
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await formsWorkspaceFetch(
    `https://www.googleapis.com/drive/v3/files/${safeFormId}`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errJson.error?.message || 'Imeshindwa kuhamisha fomu kwenda Trash.');
  }
}

export function extractFormQuestions(form: GoogleFormDetail): ExtractedFormQuestion[] {
  const out: ExtractedFormQuestion[] = [];
  for (const item of form.items || []) {
    const q = item.questionItem?.question;
    if (!q || !q.questionId) continue;
    let kind: ExtractedFormQuestion['kind'] = 'other';
    let options: string[] = [];
    if (q.textQuestion) {
      kind = q.textQuestion.paragraph ? 'paragraph' : 'text';
    } else if (q.choiceQuestion) {
      kind = 'choice';
      options = (q.choiceQuestion.options || []).map((o) => o.value).filter(Boolean);
    }
    out.push({
      questionId: q.questionId,
      title: item.title || `Swali ${out.length + 1}`,
      required: Boolean(q.required),
      kind,
      options,
    });
  }
  return out;
}

export function extractResponseAnswerRows(
  form: GoogleFormDetail,
  response: GoogleFormResponseItem,
): ParsedFormAnswerRow[] {
  const questions = extractFormQuestions(form);
  const titleById = new Map(questions.map((q) => [q.questionId, q.title]));
  const rows: ParsedFormAnswerRow[] = [];

  for (const q of questions) {
    const ans = response.answers?.[q.questionId];
    const text = (ans?.textAnswers?.answers || [])
      .map((a) => a.value || '')
      .filter(Boolean)
      .join(', ');
    rows.push({
      questionId: q.questionId,
      questionTitle: q.title,
      answerText: text,
    });
  }

  for (const [qId, ans] of Object.entries(response.answers || {})) {
    if (titleById.has(qId)) continue;
    const text = (ans?.textAnswers?.answers || [])
      .map((a) => a.value || '')
      .filter(Boolean)
      .join(', ');
    if (text) {
      rows.push({
        questionId: qId,
        questionTitle: qId,
        answerText: text,
      });
    }
  }

  return rows;
}

export function mapGoogleFormResponseToApplication(params: {
  form: GoogleFormDetail;
  response: GoogleFormResponseItem;
  defaultDistrict: string;
  loanTypes: LoanType[];
}): LoanApplication {
  const rows = extractResponseAnswerRows(params.form, params.response);
  const findAnswer = (keywords: string[]): string => {
    const found = rows.find((r) => {
      const lower = r.questionTitle.toLowerCase();
      return keywords.some((kw) => lower.includes(kw)) && r.answerText.trim();
    });
    return found ? found.answerText.trim() : '';
  };

  const fullName =
    findAnswer(['jina kamili', 'full name', 'mwombaji', 'name', 'jina']) ||
    params.response.respondentEmail?.split('@')[0] ||
    'Mwombaji wa Google Form';
  const phone = findAnswer(['simu ya mwombaji', 'namba ya simu', 'phone', 'simu']) || '0700000000';
  const addressRaw = findAnswer(['anwani', 'mtaa', 'wilaya', 'address', 'district']);
  const [streetPart, districtPart] = addressRaw.split(',').map((s) => s.trim());

  const amountRaw = findAnswer(['kiasi', 'amount', 'mkopo', 'tzs']);
  const parsedAmount = Number(amountRaw.replace(/[^\d]/g, ''));
  const requestedAmount = parsedAmount >= 1000 ? parsedAmount : 100000;

  const loanTypeAnswer = findAnswer(['aina ya mkopo', 'loan type']);
  const matchedLoanType =
    params.loanTypes.find(
      (lt) => lt.name.toLowerCase() === loanTypeAnswer.toLowerCase(),
    ) || params.loanTypes[0];

  const scheduleAnswer = findAnswer(['muda', 'mtindo', 'marejesho', 'duration', 'wiki', 'miezi']);
  const frequency: RepaymentFrequency = scheduleAnswer.toLowerCase().includes('wiki')
    ? 'weekly'
    : matchedLoanType?.defaultFrequency || 'monthly';
  const durationMatch = scheduleAnswer.match(/\d+/);
  const durationCount = durationMatch
    ? Math.max(1, Number(durationMatch[0]))
    : matchedLoanType?.defaultDuration || 4;

  const witnessName =
    findAnswer(['mdhamini', 'shahidi', 'guarantor', 'witness']) || 'Mdhamini (Google Form)';
  const witnessPhone =
    findAnswer(['simu ya mdhamini', 'simu ya shahidi', 'witness phone']) || phone;
  const collateralAndPurpose = findAnswer(['dhamana', 'sababu', 'maelezo', 'collateral', 'purpose']);

  const interestType: InterestType = matchedLoanType?.defaultInterestType || 'flat';
  const interestValue = matchedLoanType?.defaultInterestValue ?? 20;
  const submittedDate = (
    params.response.lastSubmittedTime ||
    params.response.createTime ||
    new Date().toISOString()
  ).slice(0, 10);

  const safeResponseSuffix = params.response.responseId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);

  return {
    id: `app_gf_${safeResponseSuffix}`,
    ownerId: 'public_portal',
    fullName,
    phone,
    email: params.response.respondentEmail || '',
    street: streetPart || addressRaw || 'Mtaa (Google Form)',
    district: districtPart || params.defaultDistrict || 'Tandahimba',
    witnessName,
    witnessPhone,
    collateral: collateralAndPurpose || '',
    loanTypeName: loanTypeAnswer || matchedLoanType?.name || 'Mkopo wa Biashara',
    requestedAmount,
    interestType,
    interestValue,
    frequency,
    durationCount,
    purpose: `Kutoka Google Form: ${params.form.info?.title || params.form.formId}${
      collateralAndPurpose ? ` · ${collateralAndPurpose}` : ''
    }`,
    status: 'pending',
    reviewNote: `Imeingizwa kutoka Google Forms (${params.response.responseId.slice(0, 10)})`,
    submittedDate,
  };
}
