import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "n1k-12d03";
const APP_NAME = "3n1k-server";

export function getAdminFirestore() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT Vercel ortam değişkeninde tanımlı değil.");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  if (serviceAccount.project_id !== PROJECT_ID) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT ${PROJECT_ID} projesine ait değil.`);
  }

  const existingApp = getApps().find(app => app.name === APP_NAME);
  const app = existingApp || initializeApp({
    credential: cert(serviceAccount)
  }, APP_NAME);
  return getFirestore(app);
}
