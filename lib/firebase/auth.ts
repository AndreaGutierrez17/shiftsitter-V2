import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from "firebase/auth";
import { auth } from "./client";

/** Email + Password */
export async function fbSignUp(email: string, password: string, displayName?: string) {
  const res = await createUserWithEmailAndPassword(auth, email, password);

  // Opcional: guardar nombre visible
  if (displayName?.trim()) {
    await updateProfile(res.user, { displayName: displayName.trim() });
  }

  return res.user;
}

export async function fbLogin(email: string, password: string) {
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

/** Google */
export async function fbLoginGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const res = await signInWithPopup(auth, provider);
  return res.user;
}

/** Facebook */
export async function fbLoginFacebook(): Promise<User> {
  const provider = new FacebookAuthProvider();

  provider.addScope("email");

  const res = await signInWithPopup(auth, provider);
  return res.user;
}

/** Reset password */
export async function fbResetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

/** Logout */
export async function fbLogout() {
  await signOut(auth);
}