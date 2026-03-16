import React, { useState, useEffect } from 'react';
import { CrystalCard, cn } from './CrystalCard';
import { CrystalLoader } from './CrystalLoader';
import { mockCards } from '../data/mockData';
import { TrendingUp, AlertCircle, Plus, X, Search, Loader2, Sparkles, Activity, Gem, Lock } from 'lucide-react';
import { CardData } from '../types/crystal';
import { compileQuery, predict } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, serverTimestamp, getDoc, getDocs, limit } from 'firebase/firestore';

interface DashboardProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
}

export function Dashboard({ user, isGuest, onLogin }: DashboardProps) {
  const [cards, setCards] = useState<CardData[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newQuery, setNewQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analisi in corso...');
  const [error, setError] = useState<string | null>(null);
  const [feedCards, setFeedCards] = useState<CardData[]>([]);
  const [userCity, setUserCity] = useState<string | null>(null);

  // Fetch user profile to get city
  useEffect(() => {
    if (!user) return;
    const fetchUser = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.location) {
            const city = data.location.split(',')[0].trim();
            setUserCity(city);
          }
        }
      } catch (e) {
        console.error("Failed to fetch user profile", e);
      }
    };
    fetchUser();
  }, [user]);

  // Fetch cached cards for user's city
  useEffect(() => {
    if (!userCity) return;
    
    const fetchFeed = async () => {
      const domains = ['guts', 'weather', 'city_pulse'];
      const allCards: CardData[] = [];
      
      for (const domain of domains) {
        try {
          const q = query(
            collection(db, 'cached_cards', domain, userCity),
            orderBy('generated_at', 'desc'),
            limit(2)
          );
          const snapshot = await getDocs(q);
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.card_data) {
              allCards.push({ ...data.card_data, _source: 'cache' });
            }
          });
        } catch (e) {
          console.error(`Failed to fetch feed for ${domain}`, e);
        }
      }
      
      setFeedCards(allCards);
    };
    
    fetchFeed();
  }, [userCity]);

  const loadingMessages = [
    "Analizzando il passato per prevedere il futuro...",
    "Crystal in azione: calibrazione dati...",
    "Consulto 20 anni di storia per te...",
    "Connessione ai nodi di intelligenza globale...",
    "Sintetizzando il verdetto deterministico...",
    "Quasi pronto: sto scrivendo il tuo futuro...",
    "Analisi dei driver in corso..."
  ];

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMessage(prev => {
          const currentIndex = loadingMessages.indexOf(prev);
          const nextIndex = (currentIndex + 1) % loadingMessages.length;
          return loadingMessages[nextIndex];
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Load cards from Firestore
  useEffect(() => {
    if (!user) {
      setCards(mockCards);
      return;
    }
    
    const path = `users/${user.uid}/cards`;
    const q = query(
      collection(db, 'users', user.uid, 'cards'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedCards: CardData[] = [];
      snapshot.forEach((doc) => {
        loadedCards.push(doc.data() as CardData);
      });
      setCards(loadedCards);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuery.trim() || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch user context
      const userPath = `users/${user.uid}`;
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userContext = userDocSnap.exists() ? userDocSnap.data() : undefined;

      const plan = await compileQuery(newQuery);
      const card = await predict(newQuery, plan, userContext);
      
      // Save to Firestore
      const cardPath = `users/${user.uid}/cards/${card.card_id}`;
      const cardRef = doc(db, 'users', user.uid, 'cards', card.card_id);
      await setDoc(cardRef, {
        ...card,
        createdAt: serverTimestamp()
      });

      setNewQuery('');
      setIsAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella generazione della scheda");
    } finally {
      setIsLoading(false);
    }
  };

  const removeCard = async (id: string) => {
    if (!user || isGuest) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'cards', id));
    } catch (err) {
      console.error("Error removing card:", err);
    }
  };

  return (
    <div className="space-y-16">
      {/* Welcome Hero */}
      <section className="relative overflow-hidden rounded-[40px] premium-gradient p-10 md:p-16 text-white shadow-2xl shadow-sky-500/10 border border-white/10">
        <div className="relative z-10 max-w-3xl">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-md border border-white/20">
              <Sparkles className="w-4 h-4 text-sky-300" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-200/80">Crystal Intelligence</span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-display font-bold mb-8 leading-[1.1] tracking-tight"
          >
            Prevedi il futuro con <br /> <span className="text-sky-400">precisione cristallina.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-300 text-lg md:text-xl mb-10 leading-relaxed font-medium max-w-2xl"
          >
            Monitora mercati, eventi e trend globali. Aggiungi i tuoi argomenti di interesse e ricevi analisi predittive in tempo reale basate su dati storici e segnali attuali.
          </motion.p>
          
          <div className="flex flex-wrap gap-4">
            {isGuest ? (
              <motion.button 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                onClick={onLogin}
                className="px-10 py-4 bg-white text-black rounded-2xl font-bold text-lg hover:bg-sky-50 transition-all shadow-xl flex items-center gap-3 group"
              >
                <Lock className="w-5 h-5" />
                Accedi per iniziare
              </motion.button>
            ) : (
              <motion.button 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setIsAdding(true)}
                className="px-10 py-4 bg-white text-black rounded-2xl font-bold text-lg hover:bg-sky-50 transition-all shadow-xl flex items-center gap-3 group"
              >
                Monitora nuovo tema
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Abstract background shapes */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-30 pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[120%] h-[140%] bg-gradient-to-br from-sky-500/20 to-transparent rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] left-[20%] w-[80%] h-[80%] bg-indigo-500/20 rounded-full blur-[100px]" />
        </div>
      </section>

      {/* Watchlist Pulse */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">WATCHLIST PULSE</h2>
          <div className="h-px flex-1 bg-white/5 mx-8" />
        </div>

        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-10 bg-[#0a0a0a] rounded-[32px] border border-white/10 shadow-2xl shadow-sky-500/5 relative overflow-hidden"
          >
            <div className="absolute inset-0 premium-gradient opacity-20 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-display font-bold text-3xl text-white flex items-center gap-4">
                  <div className="w-12 h-12 bg-sky-500/10 rounded-2xl flex items-center justify-center border border-sky-500/20">
                    <Search className="w-6 h-6 text-sky-400" />
                  </div>
                  Cosa vuoi monitorare?
                </h3>
                <button onClick={() => setIsAdding(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                  <X className="w-7 h-7" />
                </button>
              </div>
              <form onSubmit={handleAddCard} className="space-y-8">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CrystalLoader />
                    <p className="font-display font-bold text-2xl text-white text-center px-4 mt-8 tracking-tight">{loadingMessage}</p>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <input 
                        type="text"
                        autoFocus
                        placeholder="Es: Prezzi case a Milano, Trend AI 2024, Meteo Roma..."
                        className="w-full px-8 py-6 bg-white/5 border border-white/10 rounded-3xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-white font-semibold text-xl placeholder:text-slate-600 transition-all shadow-inner"
                        value={newQuery}
                        onChange={(e) => setNewQuery(e.target.value)}
                      />
                    </div>
                    {error && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm text-rose-400 font-bold flex items-center gap-2 px-2"
                      >
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </motion.p>
                    )}
                    <div className="flex justify-end gap-6">
                      <button 
                        type="button"
                        onClick={() => setIsAdding(false)}
                        className="px-8 py-4 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                      >
                        Annulla
                      </button>
                      <button 
                        type="submit"
                        disabled={isLoading || !newQuery.trim()}
                        className="px-10 py-4 bg-sky-500 text-white rounded-2xl text-sm font-bold hover:bg-sky-600 transition-all shadow-xl shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                      >
                        {isLoading ? loadingMessage : 'Crea Previsione'}
                        {!isLoading && <Sparkles className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: '1', domain: 'A.12 COST OF LIVING', title: 'Inflation IT 30d', status: 'Spike Risk', color: 'rose', icon: TrendingUp },
            { id: '2', domain: 'A.9 TRAVEL', title: 'Rome Tourism 14d', status: 'Stable', color: 'emerald', icon: TrendingUp },
            { id: '3', domain: 'B.4 TECH', title: 'AI Hardware Trend', status: 'Bullish', color: 'sky', icon: Sparkles },
            { id: '4', domain: 'C.1 ENERGY', title: 'Gas Prices EU', status: 'Volatile', color: 'amber', icon: Activity }
          ].map((item) => (
            <motion.div 
              key={item.id}
              whileHover={{ y: -6, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
              className="bg-[#0a0a0a] p-8 rounded-[32px] border border-white/10 shadow-sm flex flex-col justify-between cursor-pointer transition-all group hover:border-white/20"
            >
              <div className="mb-6">
                <div className="text-[10px] font-bold text-slate-400 mb-3 tracking-[0.25em] uppercase">{item.domain}</div>
                <div className="font-display font-bold text-white text-xl group-hover:text-sky-400 transition-colors leading-tight">{item.title}</div>
              </div>
              <div className={cn(
                "flex items-center gap-2.5 px-4 py-2 rounded-xl text-[11px] font-bold w-fit border",
                item.color === 'rose' ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
                item.color === 'emerald' ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                item.color === 'sky' ? "text-sky-400 bg-sky-500/10 border-sky-500/20" :
                "text-amber-400 bg-amber-500/10 border-amber-500/20"
              )}>
                <item.icon className="w-4 h-4" />
                <span>{item.status}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feed Intelligence */}
      {feedCards.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">FEED INTELLIGENCE ({userCity})</h2>
            <div className="h-px flex-1 bg-white/5 mx-8" />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {feedCards.map((card, idx) => (
              <motion.div 
                key={`feed-${card.card_id}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <CrystalCard 
                  card={card} 
                  isSaved={false}
                  onSave={(savedCard) => {
                    // Save to user's watchlist
                    const cardRef = doc(db, 'users', user.uid, 'cards', savedCard.card_id);
                    setDoc(cardRef, {
                      ...savedCard,
                      createdAt: serverTimestamp()
                    }).catch(console.error);
                  }}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Your Dashboard */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">LA TUA DASHBOARD</h2>
          <div className="h-px flex-1 bg-white/5 mx-8" />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <AnimatePresence mode="popLayout">
            {cards.map((card) => (
              <motion.div 
                key={card.card_id} 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative group"
              >
                <CrystalCard 
                  card={card} 
                  isSaved={true}
                  onSave={() => removeCard(card.card_id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          
          {cards.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-2 py-24 border-2 border-dashed border-white/10 rounded-[40px] flex flex-col items-center justify-center text-slate-400 bg-white/5 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-24 h-24 bg-[#0a0a0a] rounded-full shadow-2xl flex items-center justify-center mb-8 border border-white/10 relative z-10 group-hover:scale-110 transition-transform duration-500">
                <Sparkles className="w-10 h-10 text-sky-400" />
              </div>
              <h3 className="font-display font-bold text-3xl text-white tracking-tight mb-3 relative z-10">Nessuna scheda personalizzata</h3>
              <p className="text-lg text-slate-400 font-medium max-w-md text-center relative z-10">
                Inizia a monitorare un tema per generare la tua prima previsione e sbloccare insight esclusivi.
              </p>
              {!isGuest && (
                <button 
                  onClick={() => setIsAdding(true)}
                  className="mt-8 px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all flex items-center gap-3 relative z-10 backdrop-blur-md border border-white/10"
                >
                  <Plus className="w-5 h-5" />
                  Crea la tua prima scheda
                </button>
              )}
            </motion.div>
          )}
        </div>
      </section>

      {/* Alerts Digest */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">ALERTS DIGEST</h2>
          <div className="h-px flex-1 bg-white/5 mx-8" />
        </div>
        <div className="grid grid-cols-1 gap-6">
          {[
            { id: 'a1', title: 'Regime Change: Energy Prices', time: '2h ago', desc: 'Probability of spike > 3.0% increased from 15% to 28%. Driver: Geopolitics escalation.', type: 'warning' },
            { id: 'a2', title: 'New Driver Detected: Tourism Rome', time: '5h ago', desc: 'Social sentiment for "Rome Easter" is trending 40% higher than 2023 baseline.', type: 'info' }
          ].map((alert) => (
            <motion.div 
              key={alert.id}
              whileHover={{ x: 6 }}
              className="bg-[#0a0a0a] rounded-[32px] border border-white/10 shadow-sm overflow-hidden p-8 flex items-start gap-6 hover:bg-white/5 cursor-pointer transition-all group hover:border-white/20"
            >
              <div className={cn(
                "mt-1 p-4 rounded-2xl transition-transform group-hover:scale-110 shadow-lg",
                alert.type === 'warning' ? "bg-amber-500/10 text-amber-400 shadow-amber-500/5" : "bg-sky-500/10 text-sky-400 shadow-sky-500/5"
              )}>
                {alert.type === 'warning' ? <AlertCircle className="w-7 h-7" /> : <Sparkles className="w-7 h-7" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-bold text-white text-xl tracking-tight">{alert.title}</span>
                  <span className="text-[10px] font-bold text-slate-400 bg-white/5 px-3 py-1.5 rounded-xl uppercase tracking-[0.2em]">{alert.time}</span>
                </div>
                <p className="text-slate-400 leading-relaxed font-medium text-[15px] opacity-80">{alert.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
