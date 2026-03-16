import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Settings2, Plus, Search, MapPin, Activity, Sparkles, ChevronRight, Globe2, Lock, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './CrystalCard';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';

interface WatchlistProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
}

export function Watchlist({ user, isGuest, onLogin }: WatchlistProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newEntity, setNewEntity] = useState('');
  const [watchlistItems, setWatchlistItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      setWatchlistItems([
        { id: '1', entity: 'Roma', type: 'City', domains: ['Tourism', 'Mobility', 'Weather'], alerts: true, pulse: 'High Activity', trend: 'up' },
        { id: '2', entity: 'Italia', type: 'Country', domains: ['Inflation', 'Macro', 'Energy'], alerts: true, pulse: 'Stable', trend: 'flat' },
        { id: '3', entity: 'Tech Sector', type: 'Industry', domains: ['Jobs', 'Adoption'], alerts: false, pulse: 'Bullish', trend: 'up' },
        { id: '4', entity: 'Milano', type: 'City', domains: ['Real Estate', 'Events'], alerts: true, pulse: 'Overheating', trend: 'up' },
        { id: '5', entity: 'Eurozone', type: 'Region', domains: ['Interest Rates', 'GDP'], alerts: false, pulse: 'Cooling', trend: 'down' },
      ]);
      return;
    }
    
    const path = `users/${user.uid}/watchlist`;
    const q = query(
      collection(db, 'users', user.uid, 'watchlist'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setWatchlistItems(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const toggleAlerts = async (id: string, currentAlerts: boolean) => {
    if (!user) return;
    
    const path = `users/${user.uid}/watchlist/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'watchlist', id), {
        alerts: !currentAlerts
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleAddEntity = async () => {
    if (!newEntity.trim() || !user) return;
    
    const path = `users/${user.uid}/watchlist`;
    try {
      const newItemRef = doc(collection(db, 'users', user.uid, 'watchlist'));
      await setDoc(newItemRef, {
        entity: newEntity,
        type: 'Custom', // Default type for now
        domains: ['General'], // Default domain
        alerts: true,
        pulse: 'Monitoring',
        createdAt: serverTimestamp()
      });
      setNewEntity('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const removeEntity = async (id: string) => {
    if (!user) return;
    
    const path = `users/${user.uid}/watchlist/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'watchlist', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Add */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">La tua Watchlist</h2>
          <p className="text-slate-500 font-medium">Monitora entità e domini specifici per ricevere alert predittivi.</p>
        </div>
        {isGuest ? (
          <button 
            onClick={onLogin}
            className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 group"
          >
            <Lock className="w-5 h-5" />
            Accedi per gestire
          </button>
        ) : (
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 group"
          >
            Aggiungi Entità
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-8 bg-white rounded-[32px] border-2 border-indigo-100 shadow-xl shadow-indigo-50 mb-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                  <Search className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Nuovo Monitoraggio</h3>
                  <p className="text-sm text-slate-500 font-medium">Cerca una città, un paese o un settore industriale.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  type="text" 
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddEntity()}
                  placeholder="Es: Milano, Giappone, Semiconduttori..."
                  className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                />
                <div className="flex gap-2">
                  <button onClick={() => setIsAdding(false)} className="px-6 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors">
                    Annulla
                  </button>
                  <button 
                    onClick={handleAddEntity}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                  >
                    Aggiungi
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence>
          {watchlistItems.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-slate-100 shadow-sm text-center"
            >
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <EyeOff className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-2">Nessuna entità monitorata</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                Aggiungi città, paesi o settori industriali alla tua watchlist per ricevere alert predittivi e monitorare i trend in tempo reale.
              </p>
              {!isGuest && (
                <button 
                  onClick={() => setIsAdding(true)}
                  className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Aggiungi la tua prima entità
                </button>
              )}
            </motion.div>
          ) : (
            watchlistItems.map((item) => (
              <motion.div 
                key={item.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ x: 4 }}
                className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-8 group hover:border-indigo-200 transition-all"
              >
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-slate-50 rounded-[24px] flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all shadow-sm group-hover:shadow">
                    {item.type === 'City' ? <MapPin className="w-8 h-8" /> : item.type === 'Country' ? <Globe2 className="w-8 h-8" /> : <Activity className="w-8 h-8" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-display font-bold text-slate-900">{item.entity}</h3>
                      <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-widest">
                        {item.type}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.domains.map((d: string) => (
                        <span key={d} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100/50">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-10">
                  <div className="hidden md:block text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">PULSE STATUS</div>
                    <div className="flex items-center justify-end gap-2 font-bold text-slate-900">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      {item.pulse}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => toggleAlerts(item.id, item.alerts)}
                      className={cn(
                        "w-12 h-12 rounded-2xl border flex items-center justify-center transition-all",
                        item.alerts ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                      title={item.alerts ? "Disattiva Alert" : "Attiva Alert"}
                    >
                      {item.alerts ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => removeEntity(item.id)}
                      className="w-12 h-12 rounded-2xl border border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Rimuovi"
                    >
                      <Settings2 className="w-5 h-5" />
                    </button>
                    <button className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
