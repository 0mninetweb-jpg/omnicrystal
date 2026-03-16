import React, { useState, useEffect, useRef } from 'react';
import { User, MapPin, Briefcase, Tag, Save, Loader2, Lock, MessageSquare, Send } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { chatWithProfileBot } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [location, setLocation] = useState('');
  const [profession, setProfession] = useState('');
  const [interests, setInterests] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  // Chatbot state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showChat && chatMessages.length === 0) {
      // Initialize chat
      setChatMessages([
        { role: 'model', content: "Ciao! Sono l'assistente di Crystal. Per darti previsioni personalizzate, mi servirebbero alcune informazioni su di te. Per iniziare, in che città o nazione ti trovi?" }
      ]);
    }
  }, [showChat]);

  useEffect(() => {
    // Scroll to bottom of chat
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: userMessage }
    ];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    try {
      const response = await chatWithProfileBot(newMessages);
      
      // Check if response contains JSON block
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      let botText = response;
      
      if (jsonMatch) {
        try {
          const extractedData = JSON.parse(jsonMatch[1]);
          if (extractedData.location) setLocation(extractedData.location);
          if (extractedData.profession) setProfession(extractedData.profession);
          if (extractedData.interests) setInterests(extractedData.interests);
          
          // Remove JSON from the text shown to user
          botText = response.replace(/```json\n[\s\S]*?\n```/, '').trim();
          setMessage('Dati estratti dalla conversazione! Clicca "Salva Profilo" per confermare.');
        } catch (e) {
          console.error("Failed to parse JSON from bot", e);
        }
      }

      if (botText) {
        setChatMessages(prev => [...prev, { role: 'model', content: botText }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages(prev => [...prev, { role: 'model', content: "Scusa, ho avuto un problema di connessione. Puoi ripetere?" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const path = `users/${user.uid}`;
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLocation(data.location || '');
          setProfession(data.profession || '');
          setInterests((data.interests || []).join(', '));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setMessage('');

    const path = `users/${user.uid}`;
    try {
      const interestsArray = interests.split(',').map(i => i.trim()).filter(i => i !== '');
      await setDoc(doc(db, 'users', user.uid), {
        location,
        profession,
        interests: interestsArray
      }, { merge: true });
      setMessage('Profilo aggiornato con successo!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      setMessage('Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-display font-bold text-white mb-2">Il tuo Profilo</h2>
        <p className="text-slate-400 font-medium">
          Configura il tuo contesto. Crystal userà questi dati per personalizzare l'impatto delle previsioni globali su di te.
        </p>
      </div>

      {!showChat ? (
        <button
          onClick={() => setShowChat(true)}
          className="w-full p-6 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border border-white/10 rounded-[32px] flex items-center justify-between group hover:shadow-xl hover:shadow-sky-500/5 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-sky-500/20 text-sky-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-white">Configura con l'Assistente AI</h3>
              <p className="text-sm text-sky-400/80 font-medium">Rispondi a 3 semplici domande per creare il tuo profilo</p>
            </div>
          </div>
          <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center shadow-sm text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-colors">
            <Send className="w-5 h-5" />
          </div>
        </button>
      ) : (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl shadow-sky-500/10 flex flex-col h-[400px]">
          <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-500 text-white rounded-full flex items-center justify-center">
                <span className="font-display font-bold">C</span>
              </div>
              <span className="font-bold text-white">Assistente Crystal</span>
            </div>
            <button 
              onClick={() => setShowChat(false)}
              className="text-sm font-medium text-sky-400 hover:text-sky-300"
            >
              Chiudi
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-sky-500 text-white rounded-tr-sm' 
                    : 'bg-white/5 text-slate-200 rounded-tl-sm border border-white/5'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 p-4 rounded-2xl rounded-tl-sm">
                  <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-white/5 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Scrivi la tua risposta..."
              className="flex-1 px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-white"
              disabled={isChatLoading}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isChatLoading}
              className="px-4 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 disabled:opacity-50 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}

      <div className="flex items-center gap-4 py-2">
        <div className="h-px flex-1 bg-white/5"></div>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Oppure inserisci manualmente</span>
        <div className="h-px flex-1 bg-white/5"></div>
      </div>

      <form onSubmit={handleSave} className="bg-[#0a0a0a] p-8 rounded-[40px] border border-white/10 shadow-sm space-y-6">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <MapPin className="w-4 h-4 text-sky-400" />
            Posizione Geografica
          </label>
          <input 
            type="text" 
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Es: Milano, Italia"
            className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-white placeholder:text-slate-600"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Briefcase className="w-4 h-4 text-sky-400" />
            Professione / Settore
          </label>
          <input 
            type="text" 
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Es: Sviluppatore Freelance, Commerciante..."
            className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-white placeholder:text-slate-600"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Tag className="w-4 h-4 text-sky-400" />
            Interessi e Asset (separati da virgola)
          </label>
          <input 
            type="text" 
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Es: Mercato Immobiliare, Crypto, AI..."
            className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-white placeholder:text-slate-600"
          />
        </div>

        <div className="pt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-emerald-400">{message}</span>
          <button 
            type="submit"
            disabled={isSaving}
            className="px-8 py-4 bg-sky-500 text-white rounded-2xl font-bold hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2 disabled:opacity-70"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salva Profilo
          </button>
        </div>
      </form>
    </div>
  );
}
