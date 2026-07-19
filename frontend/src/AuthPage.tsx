import React, { useState, useEffect } from 'react';
import { Shield, User, Lock, Eye, EyeOff, UserPlus, LogIn, Layers, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredUser {
  username: string;
  passwordHash: string; // hex-encoded SHA-256
  createdAt: number;
}

interface AuthPageProps {
  onAuthSuccess: (username: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USERS_KEY = 'docregistry_users';

const loadUsers = (): StoredUser[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const saveUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const hashPassword = async (password: string): Promise<string> => {
  const encoded = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const getPasswordStrength = (password: string): { score: number; label: string; color: string } => {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 2) return { score, label: 'Fair', color: '#f59e0b' };
  if (score <= 3) return { score, label: 'Good', color: '#3b82f6' };
  return { score, label: 'Strong', color: '#10b981' };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [shake, setShake] = useState(false);

  const strength = getPasswordStrength(regPassword);

  // Clear errors when switching tabs
  useEffect(() => {
    setLoginError(null);
    setRegError(null);
    setRegSuccess(null);
    setLoginSuccess(false);
  }, [tab]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  // ── Login ──────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Please fill in all fields.');
      triggerShake();
      return;
    }

    setIsLoggingIn(true);
    try {
      const users = loadUsers();
      const user = users.find(
        (u) => u.username.toLowerCase() === loginUsername.trim().toLowerCase()
      );

      if (!user) {
        setLoginError('Account not found. Please check your username or create an account.');
        triggerShake();
        return;
      }

      const inputHash = await hashPassword(loginPassword);
      if (inputHash !== user.passwordHash) {
        setLoginError('Incorrect password. Please try again.');
        triggerShake();
        return;
      }

      // Success!
      setLoginSuccess(true);
      setTimeout(() => {
        onAuthSuccess(user.username);
      }, 700);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ── Register ───────────────────────────────────────────────────────────────

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    const username = regUsername.trim();

    // Validation
    if (!username || !regPassword || !regConfirm) {
      setRegError('Please fill in all fields.');
      triggerShake();
      return;
    }
    if (username.length < 3 || username.length > 20) {
      setRegError('Username must be between 3 and 20 characters.');
      triggerShake();
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setRegError('Username can only contain letters, numbers, and underscores.');
      triggerShake();
      return;
    }
    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters.');
      triggerShake();
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError('Passwords do not match.');
      triggerShake();
      return;
    }

    setIsRegistering(true);
    try {
      const users = loadUsers();
      const exists = users.some(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );
      if (exists) {
        setRegError('That username is already taken. Please choose another.');
        triggerShake();
        return;
      }

      const passwordHash = await hashPassword(regPassword);
      const newUser: StoredUser = { username, passwordHash, createdAt: Date.now() };
      saveUsers([...users, newUser]);

      setRegSuccess(`Account "${username}" created! You can now sign in.`);
      setRegUsername('');
      setRegPassword('');
      setRegConfirm('');

      // Auto-switch to login after a moment
      setTimeout(() => {
        setTab('login');
        setLoginUsername(username);
      }, 1800);
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="auth-screen">
      {/* Ambient orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      <div className={`auth-card ${shake ? 'auth-shake' : ''} ${loginSuccess ? 'auth-success-flash' : ''}`}>

        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Layers size={26} />
          </div>
          <div>
            <h1 className="auth-brand-title">Document Registry</h1>
            <p className="auth-brand-sub">Decentralized Document Verification</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            id="tab-login"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => setTab('login')}
            type="button"
          >
            <LogIn size={15} />
            Sign In
          </button>
          <button
            id="tab-register"
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => setTab('register')}
            type="button"
          >
            <UserPlus size={15} />
            Create Account
          </button>
          <div
            className="auth-tab-slider"
            style={{ transform: tab === 'register' ? 'translateX(100%)' : 'translateX(0)' }}
          />
        </div>

        {/* ── Login Form ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="auth-form" noValidate>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="login-username">Username</label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  id="login-username"
                  type="text"
                  className="auth-input"
                  placeholder="Enter your username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label className="auth-label" htmlFor="login-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-eye-toggle"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="auth-alert auth-alert-error" role="alert">
                <AlertTriangle size={15} />
                <span>{loginError}</span>
              </div>
            )}

            {loginSuccess && (
              <div className="auth-alert auth-alert-success" role="status">
                <CheckCircle size={15} />
                <span>Welcome back! Loading your workspace…</span>
              </div>
            )}

            <button
              id="btn-login-submit"
              type="submit"
              className="auth-submit-btn"
              disabled={isLoggingIn || loginSuccess}
            >
              {isLoggingIn ? (
                <span className="spinner" />
              ) : loginSuccess ? (
                <CheckCircle size={18} />
              ) : (
                <>Sign In <ChevronRight size={18} /></>
              )}
            </button>

            <p className="auth-footer-text">
              Don't have an account?{' '}
              <button type="button" className="auth-link" onClick={() => setTab('register')}>
                Create one now
              </button>
            </p>
          </form>
        )}

        {/* ── Register Form ── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="auth-form" noValidate>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="reg-username">Username</label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  id="reg-username"
                  type="text"
                  className="auth-input"
                  placeholder="3–20 chars, letters/numbers/_"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  maxLength={20}
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label className="auth-label" htmlFor="reg-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="reg-password"
                  type={showRegPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="At least 8 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-eye-toggle"
                  onClick={() => setShowRegPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Strength bar */}
              {regPassword.length > 0 && (
                <div className="auth-strength">
                  <div className="auth-strength-bar">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="auth-strength-segment"
                        style={{
                          background: i <= strength.score ? strength.color : 'rgba(255,255,255,0.08)',
                          transition: 'background 0.3s ease'
                        }}
                      />
                    ))}
                  </div>
                  <span className="auth-strength-label" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="auth-field-group">
              <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
              <div className="auth-input-wrap">
                <Shield size={16} className="auth-input-icon" />
                <input
                  id="reg-confirm"
                  type={showRegConfirm ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Re-enter your password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-eye-toggle"
                  onClick={() => setShowRegConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showRegConfirm ? 'Hide password' : 'Show password'}
                >
                  {showRegConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Match indicator */}
              {regConfirm.length > 0 && (
                <div
                  className="auth-match-hint"
                  style={{ color: regPassword === regConfirm ? '#10b981' : '#f87171' }}
                >
                  {regPassword === regConfirm ? (
                    <><CheckCircle size={12} /> Passwords match</>
                  ) : (
                    <><AlertTriangle size={12} /> Passwords do not match</>
                  )}
                </div>
              )}
            </div>

            {regError && (
              <div className="auth-alert auth-alert-error" role="alert">
                <AlertTriangle size={15} />
                <span>{regError}</span>
              </div>
            )}

            {regSuccess && (
              <div className="auth-alert auth-alert-success" role="status">
                <CheckCircle size={15} />
                <span>{regSuccess}</span>
              </div>
            )}

            <button
              id="btn-register-submit"
              type="submit"
              className="auth-submit-btn auth-submit-btn-register"
              disabled={isRegistering || !!regSuccess}
            >
              {isRegistering ? (
                <span className="spinner" />
              ) : (
                <>Create Account <ChevronRight size={18} /></>
              )}
            </button>

            <p className="auth-footer-text">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => setTab('login')}>
                Sign in here
              </button>
            </p>
          </form>
        )}

        {/* Security note */}
        <div className="auth-security-note">
          <Shield size={12} />
          <span>Credentials are stored securely in your browser. Your password is never sent to any server.</span>
        </div>
      </div>
    </div>
  );
}
