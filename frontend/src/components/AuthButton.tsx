import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth } from '../firebase';

const provider = new GoogleAuthProvider();

export const triggerSignIn = () => signInWithPopup(auth, provider).catch(console.error);

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

interface Props {
  user: User | null;
}

export function AuthButton({ user }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleSignIn = () => signInWithPopup(auth, provider).catch(console.error);
  const handleSignOut = () => { signOut(auth).catch(console.error); setOpen(false); };

  if (user) {
    return (
      <div className="auth-avatar-wrap" ref={wrapRef}>
        <button className="auth-avatar-btn" onClick={() => setOpen(o => !o)} aria-label="Account menu">
          {user.photoURL
            ? <img className="auth-avatar-img" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            : <span className="auth-avatar-initials">{(user.email ?? 'U')[0].toUpperCase()}</span>
          }
        </button>
        {open && (
          <div className="auth-dropdown">
            <span className="auth-dropdown-email">{user.email}</span>
            <button className="auth-dropdown-signout" onClick={handleSignOut}>Sign out</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button className="auth-signin-btn" onClick={handleSignIn}>
      <GoogleIcon />
      Sign in
    </button>
  );
}
