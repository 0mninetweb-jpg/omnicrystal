import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { BarChart3, FolderArchive, LayoutGrid, LogOut, Sparkles } from 'lucide-react';
import { useAppShell } from '../../context/AppShellContext';
import { useAppRuntime } from '../../context/AppRuntimeContext';
import { cn } from '../../lib/ui';

const PRIMARY_ITEMS = [
  { to: '/forecast', label: 'Forecast', icon: Sparkles },
  { to: '/forecast-gallery', label: 'Forecast Gallery', icon: LayoutGrid },
  { to: '/gallery', label: 'Gallery', icon: FolderArchive },
] as const;

type PrimaryNavProps = {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

function NavPill({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
          isActive
            ? 'bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]'
            : 'text-slate-600 hover:bg-white hover:text-slate-950'
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export function PrimaryNav({ isAuthenticated, onLogin, onLogout }: PrimaryNavProps) {
  const { isPhone } = useAppShell();
  const runtime = useAppRuntime();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[rgba(248,250,252,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/forecast" className="inline-flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Crystal</div>
                <div className="truncate text-sm font-medium text-slate-700">{runtime.statusLabel}</div>
              </div>
            </Link>
          </div>

          {!isPhone && (
            <nav className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/90 p-1">
              {PRIMARY_ITEMS.map((item) => (
                <NavPill key={item.to} {...item} />
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <Link
              to="/about"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 md:inline-flex"
            >
              About
            </Link>
            <Link
              to="/pricing"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 md:inline-flex"
            >
              Pricing
            </Link>
            {isAuthenticated ? (
              <>
                <Link
                  to="/settings"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onLogin}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {isPhone && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-[rgba(248,250,252,0.96)] px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
            {PRIMARY_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-3 py-2 text-[11px] font-semibold leading-tight transition',
                    isActive ? 'bg-slate-950 text-white' : 'text-slate-600'
                  )
                }
              >
                <Icon className="mb-1 h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
