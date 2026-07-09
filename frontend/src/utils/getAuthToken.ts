import { auth } from '../firebase';

/** Returns the current user's Firebase ID token, or null if not signed in. */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
