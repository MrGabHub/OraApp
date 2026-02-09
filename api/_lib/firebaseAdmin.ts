import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountLike = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function readServiceAccount(): ServiceAccountLike | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountLike;
    const projectId = parsed.projectId ?? parsed.project_id;
    const clientEmail = parsed.clientEmail ?? parsed.client_email;
    const privateKey = parsed.privateKey ?? parsed.private_key;
    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function getOrInitApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = readServiceAccount();
  if (serviceAccount) {
    return initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId!,
        clientEmail: serviceAccount.clientEmail!,
        privateKey: serviceAccount.privateKey!,
      }),
    });
  }
  return initializeApp({
    credential: applicationDefault(),
  });
}

const app = getOrInitApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
