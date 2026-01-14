// Utility functions to ensure the Admin SDK is only initialised once

import * as admin from "firebase-admin";

let hasInit = false;

export function initialiseDatabase(): void {
  if (!hasInit) {
    admin.initializeApp();
    hasInit = true;
  }
}

let _db: admin.firestore.Firestore;

export function getDatabase(): admin.firestore.Firestore {
  initialiseDatabase();
  return _db ?? (_db = admin.firestore());
}

let _messaging: admin.messaging.Messaging;

export function getMessaging(): admin.messaging.Messaging {
  initialiseDatabase();
  return _messaging ?? (_messaging = admin.messaging());
}
