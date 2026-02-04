import { db } from "./client";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

export type Profile = {
  uid: string;
  displayName: string;
  age: number;
  bio: string;
  locationCity: string;
  locationState: string; // "Maryland"
  radiusMiles: number;
  childrenCount: number;
  childrenAges: number[]; // [3,7]
  scheduleType: "rotating" | "fixed" | "weekends";
  availability: string[]; // ["Mon AM", "Wed PM"]
  languages: string[]; // ["English","Spanish"]
  needs: string[]; // ["overnight","school pickup"]
  values: string[]; // ["reliability","safety first"]
  verified: boolean;
  photos: string[]; // URLs, luego
  createdAt?: any;
  updatedAt?: any;
};

export async function getProfile(uid: string) {
  const ref = doc(db, "profiles", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Profile) : null;
}

export async function createProfile(profile: Profile) {
  const ref = doc(db, "profiles", profile.uid);
  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProfile(uid: string, patch: Partial<Profile>) {
  const ref = doc(db, "profiles", uid);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}