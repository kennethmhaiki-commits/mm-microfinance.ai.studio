import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-def5f753-30a4-45be-ab3e-ee2c5b8679c7';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
] as const;

export const workspaceGoogleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  workspaceGoogleProvider.addScope(scope);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function verifyFirestoreConnection(contextLabel: string): Promise<{
  connected: boolean;
  databaseId: string;
  projectId: string;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.info('[Firestore Connection Confirmed]', {
      context: contextLabel,
      projectId: firebaseConfig.projectId,
      databaseId: FIRESTORE_DATABASE_ID,
      checkedAt,
    });
    return {
      connected: true,
      databaseId: FIRESTORE_DATABASE_ID,
      projectId: firebaseConfig.projectId,
      checkedAt,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    // Firestore denies read on /test/connection via security rules, which proves the server is reachable.
    if (msg.includes('permission-denied') || msg.includes('missing or insufficient permissions')) {
      console.info('[Firestore Connection Confirmed]', {
        context: contextLabel,
        projectId: firebaseConfig.projectId,
        databaseId: FIRESTORE_DATABASE_ID,
        serverReachable: true,
        checkedAt,
      });
      return {
        connected: true,
        databaseId: FIRESTORE_DATABASE_ID,
        projectId: firebaseConfig.projectId,
        checkedAt,
      };
    }

    console.error('[Firestore Connection Failed]', {
      context: contextLabel,
      projectId: firebaseConfig.projectId,
      databaseId: FIRESTORE_DATABASE_ID,
      error: error instanceof Error ? error.message : String(error),
      checkedAt,
    });
    return {
      connected: false,
      databaseId: FIRESTORE_DATABASE_ID,
      projectId: firebaseConfig.projectId,
      checkedAt,
    };
  }
}

export async function testConnection(): Promise<void> {
  const result = await verifyFirestoreConnection('app_boot');
  if (!result.connected) {
    console.error('Please check your Firebase configuration or network connection.');
  }
}

void testConnection();
