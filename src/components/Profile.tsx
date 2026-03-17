import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Loader2, MapPin, MessageSquare, Save, Send, Sparkles, Tag, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { chatWithProfileBot, withServerRequestContext } from '../services/geminiService';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { ACTION_CATALOG, formatCredits, getPlanLabel } from '../lib/crystalPlans';
import { cn } from './CrystalCard';

interface ProfileProps {
  user: any;
  isGuest: boolean;
  onLogin: () => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export function Profile({ user, isGuest, onLogin }: ProfileProps) {
  const { entitlements, runMeteredAction } = useCrystalPlan();
  const [location, setLocation] = useState('');
  const [profession, setProfession] = useState('');
  const [interests, setInterests] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const profileProgress = useMemo(() => {
    const fields = [location.trim(), profession.trim(), interests.trim()];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [interests, location, profession]);

  useEffect(() => {
    if (showChat && chatMessages.length === 0) {
      setChatMessages([
        {
          role: 'model',
          content:
            "Ciao, sono l'assistente di Crystal. Per partire bene mi bastano tre cose: dove ti trovi, cosa fai e quali temi o asset segui di piu.",
        },
      ]);
    }
  }, [chatMessages.length, showChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setLocation(data.location || '');
          setProfession(data.profession || '');
          setInterests(Array.isArray(data.interests) ? data.interests.join(', ') : '');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchProfile();
  }, [user?.uid]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMessage }];
    setChatMessages(nextMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response =
        entitlements.profileAiFreeMessagesRemaining > 0
          ? await withServerRequestContext(
              { sourceView: 'profile', meteredAction: ACTION_CATALOG.profile_ai_message.action },
              () => chatWithProfileBot(nextMessages)
            )
          : await runMeteredAction(ACTION_CATALOG.profile_ai_message, () => chatWithProfileBot(nextMessages), {
              sourceView: 'profile',
              insufficientCreditsMessage:
                'Dopo i primi messaggi gratuiti, il profilo AI usa 1 credito per messaggio. Passa a Plus o Pro per continuare.',
            });

      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      let botText = response;

      if (jsonMatch) {
        try {
          const extractedData = JSON.parse(jsonMatch[1]);
          if (typeof extractedData.location === 'string') setLocation(extractedData.location);
          if (typeof extractedData.profession === 'string') setProfession(extractedData.profession);
          if (typeof extractedData.interests === 'string') setInterests(extractedData.interests);
          if (Array.isArray(extractedData.interests)) setInterests(extractedData.interests.join(', '));
          botText = response.replace(/```json\n[\s\S]*?\n```/, '').trim();
          setMessage('Ho estratto i dati dalla conversazione. Puoi salvarli subito o rifinirli a mano.');
        } catch (parseError) {
          console.error('Failed to parse JSON from bot', parseError);
        }
      }

      if (botText) {
        setChatMessages((current) => [...current, { role: 'model', content: botText }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages((current) => [
        ...current,
        { role: 'model', content: 'Ho perso il filo per un attimo. Ripeti pure la tua risposta e riprendiamo da li.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.uid) {
      onLogin();
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          location,
          profession,
          interests: interests
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        },
        { merge: true }
      );
      setMessage('Profilo aggiornato: Crystal usera questo contesto nei forecast e nella Nextletter personale.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setMessage('Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#1453e8]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="editorial-panel rounded-[32px] p-6 md:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="section-kicker">Profile Setup</div>
            <h2 className="mt-3 text-4xl font-display font-semibold tracking-tight text-slate-950 md:text-5xl">
              Dai a Crystal il tuo contesto, non la tua vita intera.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              Bastano posizione, lavoro e interessi per trasformare un forecast generico in una previsione che parla di
              te, della tua citta e delle tue decisioni.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="section-kicker">Profile Progress</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
              </span>
              <span className="text-sm font-semibold text-slate-700">{profileProgress}% completato</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#1453e8] transition-all" style={{ width: `${profileProgress}%` }} />
            </div>
            <div className="mt-4 text-sm leading-7 text-slate-500">
              {isGuest
                ? 'Accedi per attivare il profilo intelligente e i primi messaggi gratuiti.'
                : entitlements.profileAiFreeMessagesRemaining > 0
                  ? `${entitlements.profileAiFreeMessagesRemaining} messaggi AI gratuiti rimasti.`
                  : `Messaggi AI a ${formatCredits(ACTION_CATALOG.profile_ai_message.cost)}.`}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="editorial-panel rounded-[32px] p-6">
          <div className="section-kicker">Why This Matters</div>
          <div className="mt-5 space-y-3">
            {[
              {
                title: 'Location',
                text: 'Crystal capisce quando un segnale globale ha un impatto locale sul tuo contesto.',
              },
              {
                title: 'Profession',
                text: 'Le azioni consigliate cambiano se lavori in energia, marketing, immobiliare o prodotto.',
              },
              {
                title: 'Interests / Assets',
                text: 'Nextletter e watchlist diventano piu rilevanti e meno generiche.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="text-lg font-display font-semibold text-slate-950">{item.title}</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>

          {!showChat ? (
            <button
              onClick={() => (isGuest ? onLogin() : setShowChat(true))}
              className="mt-5 flex w-full items-center justify-between rounded-[28px] border border-slate-200 bg-slate-950 px-5 py-5 text-left text-white transition hover:bg-slate-900"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/10">
                  <MessageSquare className="h-6 w-6 text-rose-200" />
                </div>
                <div>
                  <div className="text-lg font-semibold">
                    {isGuest ? 'Accedi per usare l assistente AI' : 'Configura con l assistente AI'}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {isGuest ? 'I primi 10 messaggi sono inclusi nel profilo.' : 'Ti guida passo dopo passo e riempie il profilo per te.'}
                  </div>
                </div>
              </div>
              <Sparkles className="h-5 w-5 text-rose-200" />
            </button>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold text-slate-950">Assistente Crystal</div>
                </div>
                <button onClick={() => setShowChat(false)} className="text-sm font-semibold text-slate-500 transition hover:text-slate-950">
                  Chiudi
                </button>
              </div>

              <div className="max-h-[380px] overflow-y-auto p-5">
                <div className="space-y-4">
                  {chatMessages.map((chatMessage, index) => (
                    <div key={`${chatMessage.role}-${index}`} className={`flex ${chatMessage.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-7',
                          chatMessage.role === 'user' ? 'bg-[#1453e8] text-white' : 'bg-slate-100 text-slate-700'
                        )}
                      >
                        {chatMessage.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-[22px] bg-slate-100 px-4 py-3 text-slate-600">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <form onSubmit={handleSendMessage} className="border-t border-slate-200 bg-slate-50 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Scrivi la tua risposta..."
                    className="flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="inline-flex items-center gap-2 rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="editorial-panel rounded-[32px] p-6">
          <div className="section-kicker">Manual Setup</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Rifinisci il profilo in modo semplice.</h3>

          <div className="mt-6 space-y-5">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4 text-[#1453e8]" />
                Posizione geografica
              </label>
              <p className="mt-2 text-xs leading-6 text-slate-500">Serve per pesare meglio impatto locale, segnali di citta e watchlist.</p>
              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Es: Milano, Italia"
                className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8] focus:bg-white"
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Briefcase className="h-4 w-4 text-[#1453e8]" />
                Professione o settore
              </label>
              <p className="mt-2 text-xs leading-6 text-slate-500">Aiuta Crystal a trasformare un segnale generale in una decisione utile per il tuo lavoro.</p>
              <input
                type="text"
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
                placeholder="Es: Founder, analista, freelance, retail..."
                className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8] focus:bg-white"
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Tag className="h-4 w-4 text-[#1453e8]" />
                Interessi e asset
              </label>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Inserisci temi, mercati o asset separati da virgola. Servono per briefing, watchlist e personal output.
              </p>
              <input
                type="text"
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                placeholder="Es: energia, AI, immobiliare, crypto..."
                className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8] focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <AnimatePresence initial={false}>
              {message && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-sm leading-7 text-slate-500"
                >
                  {message}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8] disabled:opacity-70"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salva profilo
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
