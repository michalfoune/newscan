import { auth } from '../firebase';

export async function getAuthToken(): Promise<string | null> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
