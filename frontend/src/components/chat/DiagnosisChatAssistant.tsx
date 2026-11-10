import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  X,
  Send,
  Bot,
  User as UserIcon,
  Sparkles,
  AlertCircle,
  Globe2,
  ShieldCheck,
  Mic,
  MicOff,
  History,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { Button } from '../Button';
import {
  PredictionResponse,
  ChatLanguage,
  ChatMessage,
  ChatRequest,
  ChatSessionResponse,
  ChatMessageResponse,
} from '../../types';
import { sendChatMessage, getChatSessions, getChatSessionMessages } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface DiagnosisChatAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  result: PredictionResponse;
  cropType?: string;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Browser Web Speech Recognition type declarations
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: {
      new (): ISpeechRecognition;
    };
    webkitSpeechRecognition?: {
      new (): ISpeechRecognition;
    };
  }
}

interface QuickPrompt {
  label: string;
  prompt: string;
}

const QUICK_PROMPTS_BY_LANG: Record<ChatLanguage, QuickPrompt[]> = {
  en: [
    { label: 'Recommended Treatments', prompt: 'What specific treatments or sprays are recommended for this condition?' },
    { label: 'Preventative Measures', prompt: 'What sanitation or preventative practices should I follow to stop the spread?' },
    { label: 'Contagion Risk', prompt: 'How easily does this disease spread to neighboring plants or crops?' },
  ],
  hi: [
    { label: 'उपचार और दवा', prompt: 'इस बीमारी के लिए कौन से उपचार या छिड़काव की सिफारिश की जाती है?' },
    { label: 'रोकथाम के उपाय', prompt: 'इस रोग को अन्य पौधों में फैलने से रोकने के लिए क्या सावधानियां बरतनी चाहिए?' },
  ],
  gu: [
    { label: 'ઉપચાર અને દવા', prompt: 'આ રોગના નિયંત્રણ માટે કઈ દવા કે છંટકાવ કરવો જોઈએ?' },
    { label: 'સાવચેતી અને બચાવ', prompt: 'આ રોગને અન્ય છોડમાં ફેલાતો અટકાવવા શું કરવું જોઈએ?' },
  ],
  mr: [
    { label: 'उपचार आणि औषधे', prompt: 'या रोगासाठी कोणते उपचार किंवा फवारणी करावी?' },
    { label: 'प्रतिबंधात्मक उपाय', prompt: 'हा रोग इतर झाडांमध्ये पसरू नये यासाठी काय करावे?' },
  ],
  ta: [
    { label: 'சிகிச்சை மற்றும் மருந்து', prompt: 'இந்த நோய்க்கு என்ன சிகிச்சை அல்லது தெளிப்பு செய்ய வேண்டும்?' },
    { label: 'தடுப்பு நடவடிக்கைகள்', prompt: 'இந்த நோய் மற்ற செடிகளுக்குப் பரவாமல் தடுக்க என்ன செய்ய வேண்டும்?' },
  ],
  pa: [
    { label: 'ਇਲਾਜ ਅਤੇ ਦਵਾਈ', prompt: 'ਇਸ ਬਿਮਾਰੀ ਲਈ ਕਿਹੜਾ ਇਲਾਜ ਜਾਂ ਛਿੜਕਾਅ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?' },
    { label: 'ਬਚਾਅ ਦੇ ਤਰੀਕੇ', prompt: 'ਇਸ ਬਿਮਾਰੀ ਨੂੰ ਹੋਰ ਪੌਦਿਆਂ ਵਿੱਚ ਫੈਲਣ ਤੋਂ ਰੋਕਣ ਲਈ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?' },
  ],
};

function getGreeting(language: ChatLanguage, displayName: string): string {
  if (language === 'hi') {
    return `नमस्ते! मैं आपका कृषि AI सहायक हूँ। आपकी फसल का निदान "${displayName}" किया गया है। आप इसके लक्षण, रोकथाम या उपचार से संबंधित कोई भी प्रश्न पूछ सकते हैं।`;
  }
  if (language === 'gu') {
    return `નમસ્તે! હું તમારો કૃષિ AI સહાયક છું. તમારા પાકનું નિદાન "${displayName}" થયેલ છે. તમે આ રોગના લક્ષણો, સારવાર અથવા નિવારણ વિશે પ્રશ્નો પૂછી શકો છો.`;
  }
  if (language === 'mr') {
    return `नमस्कार! मी तुमचा कृषी AI सहाय्यक आहे. तुमच्या पिकाचे निदान "${displayName}" असे झाले आहे. लक्षणे, प्रतिबंध किंवा उपचारांबद्दल तुम्ही प्रश्न विचारू शकता.`;
  }
  if (language === 'ta') {
    return `வணக்கம்! நான் உங்கள் வேளாண்மை AI உதவியாளர். உங்கள் பயிருக்கு "${displayName}" என்று கண்டறியப்பட்டுள்ளது. அறிகுறிகள், தடுப்பு அல்லது சிகிச்சை பற்றி கேளுங்கள்.`;
  }
  if (language === 'pa') {
    return `ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡਾ ਖੇਤੀਬਾੜੀ AI ਸਹਾਇਕ ਹਾਂ। ਤੁਹਾਡੀ ਫ਼ਸਲ ਦੀ ਜਾਂਚ "${displayName}" ਵਜੋਂ ਹੋਈ ਹੈ। ਲੱਛਣਾਂ, ਰੋਕਥਾਮ ਜਾਂ ਇਲਾਜ ਬਾਰੇ ਪੁੱਛੋ।`;
  }
  return `Hello! I am your AI Agronomist assistant. Your diagnosis is "${displayName}". Ask me anything about symptoms, chemical/organic treatments, or prevention practices.`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function DiagnosisChatAssistant({
  isOpen,
  onClose,
  result,
  cropType,
}: DiagnosisChatAssistantProps) {
  const { status } = useAuth();
  const [sessionId, setSessionId] = useState<string>(() => generateUUID());
  const [language, setLanguage] = useState<ChatLanguage>('en');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authenticated history state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionResponse[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionMessages, setSelectedSessionMessages] = useState<ChatMessageResponse[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Speech-to-text states
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = result.display_name?.trim() || result.predicted_class || 'Crop Condition';

  // Check speech recognition capability on mount
  useEffect(() => {
    const hasSpeech = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    setSpeechSupported(hasSpeech);
  }, []);

  // Initialize brand new session and reset when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        setIsListening(false);
      }
      return;
    }

    setSessionId(generateUUID());
    setError(null);
    setInputQuery('');
    setSpeechNotice(null);
    setHistoryOpen(false);
    setSelectedSessionId(null);
    setSelectedSessionMessages([]);
    setSessionsError(null);
    setMessagesError(null);

    const initialGreeting: ChatMessage = {
      id: 'greeting',
      role: 'assistant',
      content: getGreeting(language, displayName),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([initialGreeting]);

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, result.predicted_class]);

  // When language changes mid-conversation, update the initial greeting without wiping session or user message history
  const handleLanguageChange = (newLang: ChatLanguage) => {
    setLanguage(newLang);
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'greeting') {
        return [
          {
            ...prev[0],
            content: getGreeting(newLang, displayName),
          },
        ];
      }
      return prev;
    });
  };

  // Toggle browser speech-to-text
  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setSpeechNotice('Speech recognition is not supported in this browser. Please type your question.');
      setTimeout(() => setSpeechNotice(null), 4000);
      return;
    }

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;

      // Match recognition language to current chat selection
      if (language === 'hi') {
        recognition.lang = 'hi-IN';
      } else if (language === 'gu') {
        recognition.lang = 'gu-IN';
      } else if (language === 'mr') {
        recognition.lang = 'mr-IN';
      } else if (language === 'ta') {
        recognition.lang = 'ta-IN';
      } else if (language === 'pa') {
        recognition.lang = 'pa-IN';
      } else {
        recognition.lang = 'en-US';
      }

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechNotice(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          // Insert recognized speech into the chat input, appending if content already exists
          setInputQuery((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setSpeechNotice(`Microphone recognition notice: ${event.error}.`);
          setTimeout(() => setSpeechNotice(null), 4000);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechNotice('Unable to access microphone. Please type your message.');
      setTimeout(() => setSpeechNotice(null), 4000);
    }
  };

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    setError(null);
    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    // Build strictly conformant ChatRequest payload
    const chatPayload: ChatRequest = {
      predicted_class: result.predicted_class,
      confidence: result.confidence,
      probabilities: result.probabilities && Object.keys(result.probabilities).length > 0
        ? result.probabilities
        : { [result.predicted_class]: result.confidence },
      model_version: result.model_version || 'v1.0.0',
      leaf_detected: result.leaf_detected ?? true,
      fallback_used: result.fallback_used ?? false,
      question: textToSend,
      session_id: sessionId,
      language,
    };

    try {
      const response = await sendChatMessage(chatPayload);
      const assistantMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to AI assistant. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const fetchSessions = async () => {
    if (status !== 'authenticated') {
      return;
    }
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await getChatSessions();
      setSessions(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load chat sessions.';
      setSessionsError(msg);
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleToggleHistory = () => {
    if (!historyOpen) {
      setHistoryOpen(true);
      fetchSessions();
    } else {
      setHistoryOpen(false);
    }
  };

  const handleSelectSession = async (sessionIdToLoad: string) => {
    setSelectedSessionId(sessionIdToLoad);
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const msgs = await getChatSessionMessages(sessionIdToLoad);
      setSelectedSessionMessages(msgs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load session messages.';
      setMessagesError(msg);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleResumeSession = () => {
    if (!selectedSessionId) return;
    setSessionId(selectedSessionId);
    const mapped: ChatMessage[] = selectedSessionMessages.map((m) => ({
      id: String(m.id),
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: formatTime(m.created_at),
    }));
    setMessages(mapped);
    setHistoryOpen(false);
  };

  const handleNewChat = () => {
    setSessionId(generateUUID());
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        content: getGreeting(language, displayName),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setSelectedSessionId(null);
    setSelectedSessionMessages([]);
    setHistoryOpen(false);
  };

  const quickPrompts = QUICK_PROMPTS_BY_LANG[language] || QUICK_PROMPTS_BY_LANG.en;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`AI Chat Assistant — ${displayName}`}
        onClick={onClose}
        className="fixed inset-x-0 bottom-0 top-16 sm:top-20 z-40 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs"
      >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-2xl h-[92vh] max-h-[780px] rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs">
              <Bot size={22} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  Agro AI Agronomist
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <Sparkles size={11} />
                  Grounded AI
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate max-w-xs sm:max-w-md">
                Context: <span className="text-slate-700 font-semibold">{displayName}</span>
                {cropType && ` • ${cropType}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex flex-wrap items-center justify-center rounded-xl bg-white border border-slate-200 p-0.5 shadow-2xs max-w-[min(52vw,360px)]">
              <Globe2 size={13} className="ml-2 text-slate-400" aria-hidden="true" />
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'en' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('hi')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'hi' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to Hindi"
              >
                हिंदी
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('gu')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'gu' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to Gujarati"
              >
                ગુજરાતી
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('mr')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'mr' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to Marathi"
              >
                मराठी
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('ta')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'ta' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to Tamil"
              >
                தமிழ்
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('pa')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'pa' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-label="Switch language to Punjabi"
              >
                ਪੰਜਾਬੀ
              </button>
            </div>

            {/* Authenticated History Button */}
            {status === 'authenticated' && (
              <button
                type="button"
                onClick={handleToggleHistory}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  historyOpen
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label={historyOpen ? 'Back to chat' : 'View chat history'}
              >
                <History size={13} className="text-emerald-600" />
                <span className="hidden sm:inline">{historyOpen ? 'Back to Chat' : 'History'}</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors cursor-pointer"
              aria-label="Close AI chat assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Subtitle context notification ── */}
        <div className="px-5 py-2 bg-emerald-50/70 border-b border-emerald-100/60 flex items-center justify-between text-xs text-emerald-800">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            Answers strictly grounded in authoritative plant pathology records.
          </span>
          <span className="text-[11px] text-emerald-600 font-semibold hidden sm:inline">
            Confidence: {(result.confidence * 100).toFixed(1)}%
          </span>
        </div>

        {historyOpen ? (
          status !== 'authenticated' ? (
            <div
              className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50"
              role="region"
              aria-label="Chat history viewer"
            >
              <History size={36} className="text-emerald-600 mb-3" />
              <h3 className="text-sm font-bold text-slate-800 mb-1">Persistent History Requires Sign In</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                Chat history is saved securely to your account. Sign in to view past conversations or continue asking questions as a guest.
              </p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
              >
                Return to Current Chat
              </button>
            </div>
          ) : (
          /* ── Authenticated History Drawer / Viewer ── */
          <div
            className="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50"
            role="region"
            aria-label="Chat history viewer"
          >
            {/* Sessions Sidebar */}
            <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-slate-200 overflow-y-auto p-3 space-y-2 bg-white shrink-0">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Past Sessions</h3>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  aria-label="Start new conversation"
                >
                  + New Chat
                </button>
              </div>

              {sessionsLoading && (
                <div className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500">
                  <Loader2 className="animate-spin h-4 w-4 text-emerald-600" />
                  <span>Loading sessions...</span>
                </div>
              )}

              {sessionsError && (
                <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
                  <p>{sessionsError}</p>
                  <button
                    type="button"
                    onClick={fetchSessions}
                    className="mt-1.5 font-semibold text-rose-800 underline cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No previous chat sessions found.
                </div>
              )}

              {!sessionsLoading &&
                !sessionsError &&
                sessions.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSession(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors cursor-pointer block ${
                      selectedSessionId === s.id
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                        : 'hover:bg-slate-100 border border-transparent text-slate-700'
                    }`}
                    aria-label={`Session ${sessions.length - idx} from ${formatDate(s.created_at)}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Session #{sessions.length - idx}</span>
                      <span className="text-[10px] text-slate-400">{formatTime(s.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{formatDate(s.created_at)}</div>
                  </button>
                ))}
            </div>

            {/* Messages Display */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  {selectedSessionId ? 'Viewing Selected Session' : 'Select a Session'}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  aria-label="Return to current conversation"
                >
                  <ArrowLeft size={13} />
                  <span>Return to Current Chat</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading && (
                  <div className="flex items-center justify-center p-12 text-xs text-slate-500 gap-2">
                    <Loader2 className="animate-spin h-4 w-4 text-emerald-600" />
                    <span>Loading conversation...</span>
                  </div>
                )}

                {messagesError && (
                  <div role="alert" className="p-4 text-xs text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
                    {messagesError}
                  </div>
                )}

                {!messagesLoading && !messagesError && !selectedSessionId && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-400 text-xs">
                    <History size={32} className="text-slate-300 mb-2" />
                    <p className="font-medium text-slate-600">No session selected</p>
                    <p className="text-slate-400 mt-0.5">Pick a past session from the list to view its message history.</p>
                  </div>
                )}

                {!messagesLoading && !messagesError && selectedSessionId && selectedSessionMessages.length === 0 && (
                  <div className="text-center text-xs text-slate-400 p-8">
                    No messages found in this session.
                  </div>
                )}

                {!messagesLoading &&
                  !messagesError &&
                  selectedSessionMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {msg.role === 'user' ? <UserIcon size={13} /> : <Bot size={13} />}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <span
                          className={`block text-[10px] mt-1 ${
                            msg.role === 'user' ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              {selectedSessionId && !messagesLoading && selectedSessionMessages.length > 0 && (
                <div className="p-3 border-t border-slate-200 bg-white flex justify-end">
                  <button
                    type="button"
                    onClick={handleResumeSession}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-xs"
                    aria-label="Continue this conversation"
                  >
                    Resume This Conversation
                  </button>
                </div>
              )}
            </div>
          </div>
        )) : (
          <>
            {/* ── Message History Stream ── */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar Icon */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                    aria-hidden="true"
                  >
                    {msg.role === 'user' ? <UserIcon size={14} /> : <Bot size={16} />}
                  </div>

                  {/* Bubble Content */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-800 border border-slate-200/60'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span
                      className={`block text-[10px] mt-1 ${
                        msg.role === 'user' ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                    aria-hidden="true"
                  >
                    <Bot size={16} />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-800 shadow-xs flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-emerald-600" />
                    <span className="font-medium">Consulting agricultural knowledge base...</span>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSend(messages[messages.length - 1]?.role === 'user' ? messages[messages.length - 1].content : undefined)}
                    className="font-bold underline text-red-900 hover:text-red-700 cursor-pointer ml-3"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Speech Error / Status Notice */}
              {speechNotice && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2"
                >
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="leading-relaxed">{speechNotice}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick Prompts Ribbon (Shown when fewer than 3 user messages) ── */}
            {messages.filter((m) => m.role === 'user').length < 3 && (
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 overflow-x-auto">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mr-1">
                    Quick Prompts:
                  </span>
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSend(qp.prompt)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Query Input Form ── */}
            <form
              onSubmit={handleSubmit}
              className="p-3 sm:p-4 border-t border-slate-200/80 bg-white flex items-center gap-2"
            >
              <div className="relative flex-1 flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  disabled={isLoading}
                  maxLength={500}
                  placeholder={
                    isListening
                      ? 'Listening to your voice...'
                      : language === 'hi'
                      ? 'इस रोग के बारे में प्रश्न पूछें...'
                      : language === 'gu'
                      ? 'આ રોગ વિશે પ્રશ્ન પૂછો...'
                      : language === 'mr'
                      ? 'या रोगाबद्दल प्रश्न विचारा...'
                      : language === 'ta'
                      ? 'இந்த நோயைப் பற்றி கேளுங்கள்...'
                      : language === 'pa'
                      ? 'ਇਸ ਬਿਮਾਰੀ ਬਾਰੇ ਸਵਾਲ ਪੁੱਛੋ...'
                      : 'Ask about symptoms, treatments, or prevention...'
                  }
                  className={`w-full rounded-xl border bg-slate-50/50 pl-4 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 disabled:bg-slate-100 transition-all ${
                    isListening
                      ? 'border-red-400 ring-2 ring-red-400/20'
                      : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                  }`}
                  aria-label="Type your agricultural question"
                />

                {/* Voice Speech-to-Text Button */}
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  disabled={isLoading}
                  aria-label={isListening ? 'Stop voice recording' : 'Speak your question'}
                  title={speechSupported ? (isListening ? 'Stop listening' : 'Voice input') : 'Voice input not supported'}
                  className={`absolute right-2.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-slate-100'
                  }`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isLoading || !inputQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs shrink-0"
                aria-label="Send message to Agro AI"
              >
                <Send size={15} />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
