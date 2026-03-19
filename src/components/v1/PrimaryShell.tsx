import React from 'react';
import type { User } from 'firebase/auth';
import { useAppShell } from '../../context/AppShellContext';
import { cn } from '../../lib/ui';
import { PrimaryNav } from './PrimaryNav';

type PrimaryShellProps = {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  children: React.ReactNode;
};

export function PrimaryShell({ user, onLogin, onLogout, children }: PrimaryShellProps) {
  const { isPhone } = useAppShell();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.12),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eff6ff_45%,#f8fafc_100%)] text-slate-950">
      <PrimaryNav isAuthenticated={Boolean(user)} onLogin={onLogin} onLogout={onLogout} />
      <main className={cn('mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10', isPhone && 'pb-28')}>
        {children}
      </main>
    </div>
  );
}
