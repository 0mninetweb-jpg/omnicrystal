import React from 'react';
import { LayoutDashboard, Search as SearchIcon, Bookmark, Globe2, Bell, User, Gem, Mail } from 'lucide-react';
import { cn } from './CrystalCard';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setCurrentView: (view: any) => void;
  user?: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}

export function Layout({ children, currentView, setCurrentView, user, isGuest, onLogin, onLogout }: LayoutProps) {
  const navItems = [
    { id: 'dashboard', label: 'Per Te', icon: LayoutDashboard, description: 'Un feed decisionale con i segnali che meritano attenzione oggi.' },
    { id: 'search', label: 'Cerca', icon: SearchIcon, description: 'Interroga il motore predittivo con filtri e contesto chiari.' },
    { id: 'nextletter', label: 'Nextletter', icon: Mail, description: 'Una lettura editoriale che trasforma i segnali in scelte concrete.' },
    { id: 'watchlist', label: 'Seguiti', icon: Bookmark, description: 'Le entità che vuoi monitorare con alert, soglie e orizzonti.' },
    { id: 'global', label: 'Global', icon: Globe2, description: 'Dashboard tematiche per osservare i macro-trend più utili.' },
  ];
  const activeItem = navItems.find((item) => item.id === currentView) ?? {
    id: 'profile',
    label: 'Profilo',
    icon: User,
    description: isGuest
      ? 'Completa il profilo per ottenere insight più rilevanti.'
      : 'Gestisci account, contesto personale e preferenze.',
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col md:flex-row font-sans text-slate-100 selection:bg-sky-500/20 selection:text-sky-400">
      {/* Sidebar (Desktop) */}
      <nav className="hidden md:flex md:w-72 bg-[#050505] border-r border-white/5 flex-shrink-0 flex-col sticky top-0 h-screen z-10">
        <div className="p-10 flex items-center gap-3">
          <motion.div 
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            className="w-11 h-11 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20 relative overflow-hidden group"
          >
            <Gem className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer" />
          </motion.div>
          <span className="font-display font-bold text-2xl tracking-tight text-white">Crystal</span>
        </div>
        
        <div className="flex flex-col gap-1 p-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 rounded-2xl font-semibold transition-all duration-300 relative overflow-hidden",
                currentView === item.id 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-all duration-300", currentView === item.id ? "text-sky-400 scale-110" : "text-slate-500 group-hover:text-slate-300")} />
              <span className="text-[15px]">{item.label}</span>
              {currentView === item.id && (
                <motion.div 
                  layoutId="activeNav"
                  className="absolute left-0 w-1 h-6 bg-sky-500 rounded-full"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto p-6">
          <button 
            onClick={() => setCurrentView('profile')}
            className={cn(
              "flex items-center gap-3 w-full p-4 rounded-3xl transition-all duration-300 text-left border border-transparent",
              currentView === 'profile' ? "bg-white/5 border-white/10 shadow-lg" : "hover:bg-white/5"
            )}
          >
            <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10 shadow-inner">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-6 h-6 text-slate-500" />
              )}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-white truncate">
                {isGuest ? 'Ospite' : (user?.displayName || 'Utente')}
              </div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em]">
                {isGuest ? 'Accedi' : 'Account'}
              </div>
            </div>
          </button>
        </div>
      </nav>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 z-50 rounded-[32px] px-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="flex justify-between items-center h-20">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 px-2 py-1 transition-all relative",
                currentView === item.id 
                  ? "text-sky-400" 
                  : "text-slate-500"
              )}
            >
              <item.icon className={cn("w-6 h-6 transition-all duration-300", currentView === item.id ? "scale-110 translate-y-[-2px]" : "opacity-70")} />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{item.label}</span>
              {currentView === item.id && (
                <motion.div 
                  layoutId="activeNavMobile"
                  className="absolute -bottom-1 w-1 h-1 bg-sky-400 rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-screen flex flex-col">
        <div className="max-w-6xl mx-auto w-full p-4 md:p-10 pb-32 md:pb-10 flex-1">
          <header className="flex justify-between items-center mb-8 md:mb-12">
            <div className="flex items-center gap-3 md:hidden">
              <div className="w-9 h-9 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20 relative overflow-hidden">
                <Gem className="w-4 h-4 text-white" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-[shimmer_2s_infinite]" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-white">Crystal</span>
            </div>
            
            <div className="hidden md:block">
              <h1 className="text-3xl font-display font-bold text-white tracking-tight">
                {activeItem.label}
              </h1>
              <p className="text-slate-400 text-sm mt-1 font-medium">{activeItem.description}</p>
            </div>

            <div className="flex items-center gap-3">
              <button className="p-3 bg-[#0a0a0a] border border-white/10 rounded-2xl text-slate-400 hover:bg-white/5 hover:border-white/20 transition-all relative shadow-sm group">
                <Bell className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                <span className="absolute top-3 right-3.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-[#0a0a0a] animate-pulse" />
              </button>
              {isGuest ? (
                <button 
                  onClick={onLogin}
                  className="hidden md:block px-4 py-2 bg-sky-500 text-white rounded-xl font-bold hover:bg-sky-600 transition-all text-sm"
                >
                  Accedi
                </button>
              ) : user && (
                <button onClick={onLogout} className="p-1.5 bg-white/5 rounded-full hover:bg-white/10 transition-colors" title="Logout">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-white/10">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                </button>
              )}
            </div>
          </header>

          <div className="md:hidden mb-8">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">
              {activeItem.label}
            </h1>
            <p className="text-slate-400 text-sm mt-1 font-medium">{activeItem.description}</p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
