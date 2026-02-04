"use client";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./client";

export function requireAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) return reject(new Error("NOT_AUTH"));
      resolve(user.uid);
    });
  });
}