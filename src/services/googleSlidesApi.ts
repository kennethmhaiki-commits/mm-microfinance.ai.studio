export class WorkspaceAuthExpiredError extends Error {
  constructor(message = 'Muda wa ruhusa ya Google umeisha. Tafadhali ingia tena na Google.') {
    super(message);
    this.name = 'WorkspaceAuthExpiredError';
  }
}

export interface DrivePresentationItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SlideTextElement {
  text?: {
    textElements?: {
      textRun?: {
        content?: string;
      };
    }[];
  };
}

export interface SlidePage {
  objectId: string;
  pageElements?: SlideTextElement[];
}

export interface GooglePresentationDetail {
  presentationId: string;
  title: string;
  slides?: SlidePage[];
}

export interface ExtractedSlidePreview {
  slideNumber: number;
  objectId: string;
  lines: string[];
}

function makeSlideObjectId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_]/g, '');
}

async function workspaceFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
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
        'Huna ruhusa ya kufikia faili hili la Google Slides/Drive. Tafadhali ingia tena na Google.',
    );
  }
  return res;
}

export async function listGoogleSlidesPresentations(
  accessToken: string,
  searchQuery?: string,
): Promise<DrivePresentationItem[]> {
  const safeSearch = (searchQuery || '').trim().replace(/'/g, "\\'");
  const qParts = [
    "mimeType='application/vnd.google-apps.presentation'",
    'trashed=false',
  ];
  if (safeSearch) {
    qParts.push(`name contains '${safeSearch}'`);
  }
  const params = new URLSearchParams({
    q: qParts.join(' and '),
    fields: 'files(id,name,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '25',
  });

  const res = await workspaceFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    accessToken,
  );
  const data = (await res.json()) as {
    files?: DrivePresentationItem[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || 'Imeshindwa kupata orodha ya Google Slides.');
  }
  return data.files || [];
}

export async function getGoogleSlidesPresentation(
  accessToken: string,
  presentationId: string,
): Promise<GooglePresentationDetail> {
  const res = await workspaceFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`,
    accessToken,
  );
  const data = (await res.json()) as GooglePresentationDetail & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || 'Imeshindwa kusoma maudhui ya wasilisho la Slides.');
  }
  return data;
}

export function extractSlidesSummary(detail: GooglePresentationDetail): ExtractedSlidePreview[] {
  const slides = detail.slides || [];
  return slides.map((slide, idx) => {
    const lines: string[] = [];
    for (const el of slide.pageElements || []) {
      const textEls = el.text?.textElements || [];
      const joined = textEls
        .map((te) => te.textRun?.content || '')
        .join('')
        .trim();
      if (joined) {
        for (const line of joined.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) lines.push(trimmed);
        }
      }
    }
    return {
      slideNumber: idx + 1,
      objectId: slide.objectId,
      lines,
    };
  });
}

function buildTextBoxRequests(params: {
  slideId: string;
  insertionIndex?: number;
  titleText: string;
  bodyText: string;
}) {
  const titleBoxId = makeSlideObjectId('title');
  const bodyBoxId = makeSlideObjectId('body');
  const requests: Record<string, unknown>[] = [
    {
      createSlide: {
        objectId: params.slideId,
        ...(typeof params.insertionIndex === 'number'
          ? { insertionIndex: params.insertionIndex }
          : {}),
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createShape: {
        objectId: titleBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: params.slideId,
          size: {
            width: { magnitude: 620, unit: 'PT' },
            height: { magnitude: 56, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 48,
            translateY: 32,
            unit: 'PT',
          },
        },
      },
    },
    {
      insertText: {
        objectId: titleBoxId,
        text: params.titleText,
      },
    },
    {
      updateTextStyle: {
        objectId: titleBoxId,
        style: {
          bold: true,
          fontSize: { magnitude: 22, unit: 'PT' },
          foregroundColor: {
            opaqueColor: {
              rgbColor: { red: 0.06, green: 0.09, blue: 0.16 },
            },
          },
        },
        fields: 'bold,fontSize,foregroundColor',
      },
    },
    {
      createShape: {
        objectId: bodyBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: params.slideId,
          size: {
            width: { magnitude: 620, unit: 'PT' },
            height: { magnitude: 290, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 48,
            translateY: 102,
            unit: 'PT',
          },
        },
      },
    },
    {
      insertText: {
        objectId: bodyBoxId,
        text: params.bodyText,
      },
    },
    {
      updateTextStyle: {
        objectId: bodyBoxId,
        style: {
          fontSize: { magnitude: 13, unit: 'PT' },
          foregroundColor: {
            opaqueColor: {
              rgbColor: { red: 0.2, green: 0.25, blue: 0.33 },
            },
          },
        },
        fields: 'fontSize,foregroundColor',
      },
    },
  ];
  return requests;
}

export async function createPortfolioSlideDeck(
  accessToken: string,
  params: {
    title: string;
    coverSubtitle: string;
    summaryTitle: string;
    summaryBody: string;
    loansTitle: string;
    loansBody: string;
  },
): Promise<{ presentationId: string; title: string }> {
  const createRes = await workspaceFetch(
    'https://slides.googleapis.com/v1/presentations',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: params.title }),
    },
  );
  const created = (await createRes.json()) as GooglePresentationDetail & {
    error?: { message?: string };
  };
  if (!createRes.ok || !created.presentationId) {
    throw new Error(created.error?.message || 'Imeshindwa kuunda wasilisho la Google Slides.');
  }

  const defaultFirstSlideId = created.slides?.[0]?.objectId;
  const coverSlideId = makeSlideObjectId('cover');
  const summarySlideId = makeSlideObjectId('summary');
  const loansSlideId = makeSlideObjectId('loans');

  const requests: Record<string, unknown>[] = [
    ...buildTextBoxRequests({
      slideId: coverSlideId,
      insertionIndex: 0,
      titleText: params.title,
      bodyText: params.coverSubtitle,
    }),
    ...buildTextBoxRequests({
      slideId: summarySlideId,
      insertionIndex: 1,
      titleText: params.summaryTitle,
      bodyText: params.summaryBody,
    }),
    ...buildTextBoxRequests({
      slideId: loansSlideId,
      insertionIndex: 2,
      titleText: params.loansTitle,
      bodyText: params.loansBody,
    }),
  ];

  if (defaultFirstSlideId) {
    requests.push({ deleteObject: { objectId: defaultFirstSlideId } });
  }

  const batchRes = await workspaceFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(created.presentationId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
  );

  if (!batchRes.ok) {
    const errJson = (await batchRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errJson.error?.message || 'Wasilisho limeundwa lakini slaidi zimeshindwa kuongezwa.');
  }

  return {
    presentationId: created.presentationId,
    title: created.title || params.title,
  };
}

export async function appendSummarySlideToPresentation(
  accessToken: string,
  presentationId: string,
  params: {
    slideTitle: string;
    bodyText: string;
  },
): Promise<void> {
  const slideId = makeSlideObjectId('append');
  const requests = buildTextBoxRequests({
    slideId,
    titleText: params.slideTitle,
    bodyText: params.bodyText,
  });

  const res = await workspaceFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
  );

  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errJson.error?.message || 'Imeshindwa kuongeza slaidi kwenye wasilisho.');
  }
}

export async function trashGoogleSlidesPresentation(
  accessToken: string,
  presentationId: string,
): Promise<void> {
  const res = await workspaceFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(presentationId)}`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errJson.error?.message || 'Imeshindwa kuhamisha wasilisho kwenda Trash.');
  }
}
