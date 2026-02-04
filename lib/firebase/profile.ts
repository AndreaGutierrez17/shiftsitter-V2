// lib/firebase/profile.ts
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function getOnboardingStatus(uid: string) {
  const ref = doc(db, "profiles", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { onboardingCompleted: false as const };
  }

  const data = snap.data() as any;
  return { onboardingCompleted: !!data?.onboardingCompleted };
}