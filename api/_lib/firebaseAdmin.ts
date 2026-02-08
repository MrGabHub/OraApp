import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountLike = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function readServiceAccount(): ServiceAccountLike | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountLike;
    return {
      projectId: parsed.projectId,
      clientEmail: parsed.clientEmail,
      privateKey: parsed.privateKey?.replace(/\\n/g, "\n"),
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
      credential: cert(serviceAccount),
    });
  }
  return initializeApp({
    credential: applicationDefault(),
  });
}

const app = getOrInitApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
