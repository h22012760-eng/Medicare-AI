import React, { useState, useEffect, useRef } from "react";
import { 
  Heart, 
  Activity, 
  Stethoscope, 
  Send, 
  Paperclip, 
  Mic, 
  MicOff, 
  AlertCircle, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  User, 
  Cpu, 
  RefreshCw, 
  Square,
  Plus,
  Trash2,
  X,
  FileImage
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  vitals?: Vitals;
  imageUrl?: string;
}

interface Vitals {
  heartRate: number;
  spo2: number;
  bpSystolic: number;
  bpDiastolic: number;
}

interface Insight {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messages: Message[];
  vitals: Vitals;
  insights: Insight[];
  suggestedActions: string[];
}

export default function App() {
  // Chat History / Sessions Management State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("medicore_sessions_v2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load saved consultation diagnostics sessions:", e);
      }
    }
    return [
      {
        id: "sys-baseline",
        title: "Alex Johnson - Primary Scan",
        timestamp: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
        messages: [
          {
            id: "init",
            sender: "ai",
            text: "Hello Alex, I am **MediCore AI**, your advanced clinical assistant. I have connected to your active monitoring feeds.\n\nPlease describe any symptoms you are feeling today. If you have measured recent vital readings (such as Blood Pressure, Heart Rate, or Oxygen saturation), type them in here and I will synchronize your diagnostic snapshots.",
            timestamp: "09:40 AM"
          }
        ],
        vitals: { heartRate: 88, spo2: 98, bpSystolic: 120, bpDiastolic: 80 },
        insights: [
          {
            type: "STANDBY STABLE",
            severity: "low",
            message: "Clinical metrics baseline initialized. Wearable snapshot synchronized."
          }
        ],
        suggestedActions: ["Consult symptoms or seek physical assessment"]
      }
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>("sys-baseline");
  
  // Active consultation specific states synced with the active sessions list
  const [messages, setMessages] = useState<Message[]>([]);
  const [vitals, setVitals] = useState<Vitals>({ heartRate: 80, spo2: 98, bpSystolic: 120, bpDiastolic: 80 });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);

  // System Settings
  const [inputVal, setInputVal] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [voiceLanguage, setVoiceLanguage] = useState<string>("en-US");
  const [selectedVoice, setSelectedVoice] = useState<string>("US Female");
  const [voiceReadOutEnabled, setVoiceReadOutEnabled] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1.0);
  
  // Multimodal Image upload states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ mimeType: string; data: string } | null>(null);
  const [attachedImagePreview, setAttachedImagePreview] = useState<string>("");

  // Voice engine states
  const [voiceActive, setVoiceActive] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState<boolean>(false);

  // Refs to prevent closure stale states in speech recognition event callbacks
  const voiceActiveRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    voiceActiveRef.current = voiceActive;
  }, [voiceActive]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Manual sensor calibrations modal trigger inputs
  const [showCalibrator, setShowCalibrator] = useState<boolean>(false);
  const [calibHr, setCalibHr] = useState<string>("88");
  const [calibSpO2, setCalibSpO2] = useState<string>("98");
  const [calibBpDys, setCalibBpDys] = useState<string>("120");
  const [calibBpDia, setCalibBpDia] = useState<string>("80");

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Synchronize state when switching consultation sessions
  useEffect(() => {
    const active = sessions.find(s => s.id === activeSessionId) || sessions[0];
    if (active) {
      setMessages(active.messages);
      setVitals(active.vitals);
      setInsights(active.insights);
      setSuggestedActions(active.suggestedActions);
      
      // Seed manual calibrator forms
      setCalibHr(active.vitals.heartRate.toString());
      setCalibSpO2(active.vitals.spo2.toString());
      setCalibBpDys(active.vitals.bpSystolic.toString());
      setCalibBpDia(active.vitals.bpDiastolic.toString());
    }
  }, [activeSessionId]);

  // Save active parameters directly to persistent localStorage on any changes
  const updateActiveSessionData = (
    newMsgs: Message[], 
    newVits?: Vitals, 
    newInsg?: Insight[], 
    newActions?: string[]
  ) => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: newMsgs,
            vitals: newVits !== undefined ? newVits : s.vitals,
            insights: newInsg !== undefined ? newInsg : s.insights,
            suggestedActions: newActions !== undefined ? newActions : s.suggestedActions
          };
        }
        return s;
      });
      localStorage.setItem("medicore_sessions_v2", JSON.stringify(updated));
      return updated;
    });
  };

  // Start a fresh diagnostic consult session
  const startNewSession = () => {
    const newId = "session-" + Date.now();
    const friendlyTitle = `Consultation - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const freshSession: ChatSession = {
      id: newId,
      title: friendlyTitle,
      timestamp: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
      messages: [
        {
          id: "init-" + newId,
          sender: "ai",
          text: language === "ur" 
            ? "ہیلو الیکس، میں **میڈی کور الیون** ہوں۔ براہ کرم اپنی علامات ریکارڈ کروائیں یا وائٹل ریڈنگز مہیا کریں۔"
            : "Hello Alex, I am **MediCore AI**, your advanced clinical assistant. I have connected to your active monitoring feeds. Please tell me your symptoms or input recent vitals values.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ],
      vitals: { heartRate: 80, spo2: 98, bpSystolic: 120, bpDiastolic: 80 },
      insights: [
        {
          type: "NEW SESSION",
          severity: "low",
          message: "A fresh diagnostic workspace is prepared. Please provide details securely."
        }
      ],
      suggestedActions: ["Type symptoms or input vital parameters"]
    };

    setSessions(prev => {
      const updated = [freshSession, ...prev];
      localStorage.setItem("medicore_sessions_v2", JSON.stringify(updated));
      return updated;
    });
    setActiveSessionId(newId);
    setMobileHistoryOpen(false);
  };

  // Delete specific log consult
  const deleteSession = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      alert("At least one consultation session history must write active.");
      return;
    }
    const cleanSessions = sessions.filter(s => s.id !== idToDelete);
    setSessions(cleanSessions);
    localStorage.setItem("medicore_sessions_v2", JSON.stringify(cleanSessions));
    
    if (activeSessionId === idToDelete) {
      setActiveSessionId(cleanSessions[0].id);
    }
  };

  // Handle auto scrolling to footer
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Synchronous Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = voiceLanguage;

      rec.onstart = () => {
        setIsListening(true);
        setMicError(null);
      };
      
      rec.onerror = (e: any) => {
        setIsListening(false);
        if (e.error === "no-speech") {
          // Momentary silence on microphone, skip reporting error dialog
          return;
        }
        console.error("Speech Recognition Engine issue: ", e.error);
        if (e.error === 'not-allowed') {
          setMicError("Microphone access is not authorized in this viewing frame. Click 'Open in a new tab' at top-right to authorize direct mic consultation!");
          setVoiceActive(false);
        } else {
          setMicError(`Recognition engine feedback: ${e.error}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
        // Automatically restart speech capture loops when user wants hands-free, except if AI is playing audio or loading
        if (voiceActiveRef.current && !isSpeakingRef.current && !loadingRef.current) {
          try {
            setTimeout(() => {
              if (voiceActiveRef.current && !isSpeakingRef.current && !loadingRef.current) {
                rec.start();
              }
            }, 300);
          } catch(err) {}
        }
      };

      rec.onresult = (event: any) => {
        const textGot = event.results[0][0].transcript;
        if (textGot && textGot.trim() !== "") {
          handleSendMessage(textGot);
        }
      };

      recognitionRef.current = rec;
    }
  }, [voiceLanguage]);

  // Voice consult triggers
  const toggleVoiceMode = async () => {
    setMicError(null);
    if (voiceActive) {
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch(e){}
      stopSpeaking();
      setVoiceActive(false);
      setIsListening(false);
    } else {
      setVoiceActive(true);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      } catch (err: any) {
        console.error("Mic access block: ", err);
        setMicError("Microphone device is blocked inside the sandboxed preview. Please click the 'Open in a new tab' button at the top right of the browser screen.");
        setVoiceActive(false);
      }
    }
  };

  // Mute speakback
  const stopSpeaking = () => {
    // Cancel Web Speech synthesis
    if (synthRef.current) {
      try {
        synthRef.current.cancel();
      } catch (e) {}
    }
    // Clear utterance reference
    if (utteranceRef.current) {
      utteranceRef.current = null;
    }
    // Stop audio playback
    if (playNodeRef.current) {
      try {
        playNodeRef.current.stop();
      } catch (e) {}
      playNodeRef.current = null;
    }
    // Close audio context if needed
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
  };

  // Speaks output text generated from AI
  const speakAIOutput = async (rawText: string) => {
    if (!voiceReadOutEnabled) return;
    const cleanToSpeak = rawText.replace(/[*#_~`\-]/g, '');

    // Web speech synthesis standard offline engine
    if (synthRef.current) {
      try {
        synthRef.current.cancel();
        const utter = new SpeechSynthesisUtterance(cleanToSpeak);
        utter.lang = voiceLanguage;
        utter.rate = speed;

        const voices = synthRef.current.getVoices();
        let regionalVoice = voices.find(v => v.lang.toLowerCase() === voiceLanguage.toLowerCase());
        if (!regionalVoice) {
          const prefix = voiceLanguage.split("-")[0].toLowerCase();
          regionalVoice = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
        }
        if (regionalVoice) utter.voice = regionalVoice;

        utter.onstart = () => setIsSpeaking(true);
        utter.onend = () => {
          setIsSpeaking(false);
          utteranceRef.current = null;
          if (voiceActive && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch(e){}
          }
        };
        utter.onerror = () => {
          setIsSpeaking(false);
          utteranceRef.current = null;
        };

        utteranceRef.current = utter;
        synthRef.current.speak(utter);
        return;
      } catch(e) {
        console.warn("Client synthesis fallback to backend cloud:", e);
      }
    }

    // Cloud backup
    try {
      setIsSpeaking(true);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanToSpeak, voice: selectedVoice })
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (body.audio) {
        const bytes = atob(body.audio);
        const buffer = new ArrayBuffer(bytes.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) {
          view[i] = bytes.charCodeAt(i);
        }
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const decoded = await ctx.decodeAudioData(buffer);
        const node = ctx.createBufferSource();
        playNodeRef.current = node;
        node.buffer = decoded;
        node.connect(ctx.destination);
        node.onended = () => {
          setIsSpeaking(false);
          playNodeRef.current = null;
          if (voiceActive && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch(e){}
          }
        };
        node.start(0);
      }
    } catch(err) {
      setIsSpeaking(false);
    }
  };

  // Handle attachments
  const handleAttachmentClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Attached documents/reports must be visual image captures (PNG/JPG) for diagnostic scan compatibility.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const fullBase64 = reader.result as string;
        setAttachedImagePreview(fullBase64);
        const strippedBase64 = fullBase64.split(",")[1];
        setAttachedImage({
          mimeType: file.type,
          data: strippedBase64
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Primary API Consultation pipeline call (Core Python back-end)
  const handleSendMessage = async (userText: string) => {
    const trimmedInput = userText.trim();
    if (!trimmedInput && !attachedImage) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch(e){}
    }

    const tstamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: trimmedInput || "Attached diagnostic visual query.",
      timestamp: tstamp,
      imageUrl: attachedImagePreview || undefined
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputVal("");
    setLoading(true);

    const backupImage = attachedImage;
    // Clear attachment state visually instantly
    setAttachedImage(null);
    setAttachedImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: messages.slice(-10).map(m => ({
            sender: m.sender,
            text: m.text,
            image: m.imageUrl ? {
              mimeType: "image/jpeg",
              data: m.imageUrl.split(",")[1]
            } : undefined
          })),
          message: trimmedInput,
          vitals: vitals,
          language: language,
          image: backupImage
        })
      });

      if (!response.ok) throw new Error("Connection failed. Set GEMINI_API_KEY in Secrets.");

      const rawResult = await response.json();
      
      const nextVitals = rawResult.suggestedVitals || vitals;
      const nextInsights = rawResult.insights || insights;
      const nextActions = rawResult.suggestedActions || suggestedActions;

      const aiResponseMsg: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: rawResult.responseText || "Consultation telemetry did not compute clear guidelines.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        vitals: nextVitals
      };

      const finalMessages = [...nextMessages, aiResponseMsg];
      setMessages(finalMessages);
      setVitals(nextVitals);
      setInsights(nextInsights);
      setSuggestedActions(nextActions);

      // Seed manual calibrator form to synchronize widget edits
      setCalibHr(nextVitals.heartRate.toString());
      setCalibSpO2(nextVitals.spo2.toString());
      setCalibBpDys(nextVitals.bpSystolic.toString());
      setCalibBpDia(nextVitals.bpDiastolic.toString());

      updateActiveSessionData(finalMessages, nextVitals, nextInsights, nextActions);

      if (voiceActive || voiceReadOutEnabled) {
        speakAIOutput(rawResult.responseText);
      }
    } catch (e: any) {
      console.error(e);
      const errMsgs = [...nextMessages, {
        id: Math.random().toString(),
        sender: "ai" as const,
        text: `⚠️ **Diagnostic Platform Warning:** ${e.message || "Network consultation failure."}\n\nPlease click **Settings > Secrets** at top-right to register a valid \`GEMINI_API_KEY\` to authorize real-time diagnostics scans.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }];
      setMessages(errMsgs);
      updateActiveSessionData(errMsgs);
    } finally {
      setLoading(false);
      // Cleanly restore mic recognition if voice-mode is active and we aren't currently speaking or loading
      setTimeout(() => {
        if (voiceActiveRef.current && !isSpeakingRef.current && !loadingRef.current) {
          try {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          } catch(e){}
        }
      }, 600);
    }
  };

  // Submit on enter key
  const handleAreaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputVal);
    }
  };

  // Manually update the patient metrics directly
  const handleCalibrateVitals = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHr = Math.max(30, Math.min(240, parseInt(calibHr) || 80));
    const cleanSp = Math.max(50, Math.min(100, parseInt(calibSpO2) || 98));
    const cleanSys = Math.max(70, Math.min(220, parseInt(calibBpDys) || 120));
    const cleanDia = Math.max(40, Math.min(140, parseInt(calibBpDia) || 80));

    const updatedVits: Vitals = {
      heartRate: cleanHr,
      spo2: cleanSp,
      bpSystolic: cleanSys,
      bpDiastolic: cleanDia
    };

    setVitals(updatedVits);
    updateActiveSessionData(messages, updatedVits);
    setShowCalibrator(false);

    // Notify chat system that patient manually calibrated vitals
    handleSendMessage(`[System notification: Alex Johnson calibrated his metrics dashboard explicitly to Heart Rate: ${cleanHr} BPM, Oxygen saturation: ${cleanSp}%, Blood Pressure: ${cleanSys}/${cleanDia} mmHg. Please interpret these new readings.]`);
  };

  return (
    <div className="bg-gradient-mesh text-[#dde4e1] font-sans min-h-screen flex flex-col md:flex-row h-screen overflow-hidden select-none">
      
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      {/* 1. Left Sidebar - Interactive Consult History */}
      <aside className="hidden md:flex flex-col h-screen py-6 px-4 bg-zinc-950 border-r border-zinc-800/80 w-64 shrink-0 overflow-hidden relative z-20">
        <div className="mb-6 px-2 flex items-center gap-2">
          <Heart className="w-6 h-6 text-amber-500 fill-amber-500/25 animate-pulse" />
          <div>
            <h1 className="text-xl font-black tracking-tighter text-amber-500 uppercase">MediCore</h1>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Diagnostic Logs</p>
          </div>
        </div>

        {/* New Session activator */}
        <button 
          onClick={startNewSession}
          className="mb-5 w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider text-[11px] rounded-xl cursor-pointer transition-all"
        >
          <Plus className="w-4 h-4" />
          New Consult
        </button>

        {/* Sessions history items */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 hide-scrollbar">
          <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2 px-2">Clinical Consultation History</p>
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                s.id === activeSessionId
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold"
                  : "bg-zinc-900/40 border-zinc-800/30 text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Stethoscope className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="truncate text-left">
                  <span className="block text-xs truncate leading-tight uppercase font-bold tracking-wide">{s.title}</span>
                  <span className="text-[9px] opacity-70 font-mono">{s.timestamp}</span>
                </div>
              </div>
              <button
                onClick={(e) => deleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-opacity"
                title="Remove medical log"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-900">
          <div className="p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/5 text-center">
            <h5 className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Gemini Pro Multimodal
            </h5>
            <p className="text-[10.5px] text-zinc-400 leading-snug">
              Secure diagnostic scans with image inputs active.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Top Navigation */}
      <nav className="md:hidden fixed top-0 w-full z-40 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 py-3 h-14">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-amber-500 fill-amber-500/25 animate-pulse" />
          <h1 className="text-md font-black tracking-tighter text-amber-500 uppercase">MediCore</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMobileHistoryOpen(!mobileHistoryOpen)}
            className="p-1 px-3 text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full cursor-pointer"
          >
            History Links ({sessions.length})
          </button>
          <button
            onClick={startNewSession}
            className="p-1 px-2 text-[10px] uppercase font-bold text-white bg-amber-500 rounded-full cursor-pointer"
          >
            New
          </button>
        </div>
      </nav>

      {/* Mobile History Slider Drawer */}
      {mobileHistoryOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-start">
          <div className="w-72 bg-zinc-950 p-6 flex flex-col h-full border-r border-zinc-800">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-sm font-black text-white uppercase tracking-wider">Saved consultations</h4>
              <button onClick={() => setMobileHistoryOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setMobileHistoryOpen(false);
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                    s.id === activeSessionId ? "bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold" : "bg-zinc-900 border-zinc-800 text-zinc-400"
                  }`}
                >
                  <div className="truncate text-left">
                    <span className="block text-xs uppercase font-bold truncate">{s.title}</span>
                    <span className="text-[9px] opacity-70 block font-mono mt-0.5">{s.timestamp}</span>
                  </div>
                  <button onClick={(e) => deleteSession(e, s.id)} className="text-zinc-500 hover:text-red-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileHistoryOpen(false)} />
        </div>
      )}

      {/* 2. Chat Area Container (Vertical Flex Stack - Eliminates Overlap) */}
      <section className="flex-1 flex flex-col h-screen min-w-0 max-w-4xl mx-auto w-full relative z-10 pt-14 md:pt-0">
        
        {/* Workspace Clinical Header */}
        <header className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/40 backdrop-blur flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 pulse-dot relative shrink-0"></span>
            <div>
              <h2 className="text-md font-bold text-white uppercase tracking-tight">Consultation Workspace</h2>
              <p className="text-[10px] text-zinc-400 leading-none mt-1">Patient Alex Johnson • Verified Diagnostics Encrypted</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Bilingual Option */}
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-full p-0.5" title="Switch Input Language">
              <button 
                onClick={() => {
                  setLanguage("en");
                  setVoiceLanguage("en-US");
                }}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full transition-all cursor-pointer ${
                  language === "en" ? "bg-amber-500 text-white" : "text-zinc-400"
                }`}
              >
                English
              </button>
              <button 
                onClick={() => {
                  setLanguage("ur");
                  setVoiceLanguage("ur-PK");
                }}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full transition-all cursor-pointer ${
                  language === "ur" ? "bg-amber-500 text-white" : "text-zinc-400"
                }`}
              >
                اردو
              </button>
            </div>

            {/* Accent selection */}
            <select 
              value={voiceLanguage}
              onChange={(e) => {
                setVoiceLanguage(e.target.value);
                // Map language to voice name
                const voiceMap: { [key: string]: string } = {
                  "en-US": "US Female",
                  "en-GB": "UK Male",
                  "ur-PK": "Zoya"
                };
                setSelectedVoice(voiceMap[e.target.value] || "US Female");
              }}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold py-1 px-2.5 rounded-full outline-none focus:ring-0 cursor-pointer"
            >
              <option value="en-US">US (Female)</option>
              <option value="en-GB">UK (Male)</option>
              <option value="ur-PK">Urdu (Zoya)</option>
            </select>

            {/* Readout toggle */}
            <button 
              onClick={() => setVoiceReadOutEnabled(!voiceReadOutEnabled)}
              className={`p-1.5 rounded-full border transition-all cursor-pointer ${
                voiceReadOutEnabled ? "bg-amber-500/10 border-amber-500/40 text-amber-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}
              title="Speakback Voice Sync Toggle"
            >
              {voiceReadOutEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Diagnostic Mic / File Error Banner */}
        {micError && (
          <div className="bg-red-500/10 border-b border-red-500/25 px-5 py-2.5 flex items-start gap-2.5 text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[12px] font-medium leading-relaxed">{micError}</p>
            <button onClick={() => setMicError(null)} className="ml-auto text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable Consultation Messages Flow */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 shadow-inner hide-scrollbar">
          {messages.map((m, idx) => (
            <div 
              key={m.id || idx}
              className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"} w-full`}
            >
              <div className="flex items-start max-w-[85%]">
                {m.sender === "ai" && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mr-2.5 mt-0.5 shrink-0">
                    <Cpu className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  </div>
                )}
                
                <div className={`p-4 rounded-xl border leading-relaxed text-[14px] ${
                  m.sender === "user"
                    ? "bg-amber-500 text-black rounded-tr-sm border-amber-600 font-medium"
                    : "bg-zinc-900/40 border-zinc-800 rounded-tl-sm border-l-2 border-l-amber-500"
                }`}>
                  {/* Inline attached picture bubble */}
                  {m.imageUrl && (
                    <div className="mb-3 max-w-sm overflow-hidden rounded-lg border border-white/20">
                      <img src={m.imageUrl} alt="Uploaded snapshot document" className="w-full h-auto object-contain max-h-48" />
                    </div>
                  )}

                  <div className={`prose prose-invert max-w-none text-left ${m.sender === "user" ? "prose-zinc text-black" : "prose-amber text-zinc-100"}`}>
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>

                  {m.vitals && (
                    <div className={`mt-3.5 pt-2 border-t flex flex-wrap items-center gap-3.5 text-[10.5px] font-mono ${
                      m.sender === "user" ? "border-black/10 text-black/70" : "border-zinc-800/80 text-zinc-400"
                    }`}>
                      <span className={`${m.sender === "user" ? "text-black/90 font-bold" : "text-amber-400 font-bold"}`}>✓ Metrics Sync:</span>
                      <span>HR: {m.vitals.heartRate} BPM</span>
                      <span>•</span>
                      <span>SpO2: {m.vitals.spo2}%</span>
                      <span>•</span>
                      <span>BP: {m.vitals.bpSystolic}/{m.vitals.bpDiastolic} mmHg</span>
                    </div>
                  )}

                  <span className={`block text-[8.5px] font-mono mt-2 text-right ${
                    m.sender === "user" ? "text-black/60" : "text-zinc-500"
                  }`}>
                    {m.timestamp}
                  </span>
                </div>

                {m.sender === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ml-2.5 mt-0.5 shrink-0">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2 text-zinc-400 animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              </div>
              <div className="bg-zinc-900/30 border border-zinc-800 p-3.5 rounded-xl rounded-tl-sm">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400">Analyzing clinical symptoms trend...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Speaking Overlay Panel */}
        {isSpeaking && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between text-amber-200">
            <span className="text-[11px] font-mono font-bold tracking-wide flex items-center gap-1.5 uppercase">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              MediCore Clinical audio playback active
            </span>
            <button 
              onClick={stopSpeaking}
              className="px-3 py-1 font-mono text-[10px] font-bold uppercase rounded-full border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
            >
              Stop Voice
            </button>
          </div>
        )}

        {/* Footer input form wrapper (Locked inline - Zero overlapping) */}
        <div className="p-4 bg-[#09090b] border-t border-zinc-800/80">
          
          {/* Document / Photo Upload indicator */}
          {attachedImagePreview && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm relative animate-fade-in">
              <img src={attachedImagePreview} alt="Diagnostic scan preview" className="w-12 h-12 object-cover rounded border border-zinc-700 pointer-events-none" />
              <div className="flex-1 min-w-0 pr-6">
                <span className="block text-[9px] text-zinc-500 font-mono font-bold uppercase">ATTACHED SCAN IMAGE</span>
                <span className="block text-xs text-zinc-300 truncate font-sans">Ready to read with AI...</span>
              </div>
              <button 
                onClick={() => {
                  setAttachedImage(null);
                  setAttachedImagePreview("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-2 right-2 p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Prompt Suggestion Pill */}
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3 py-0.5">
            <button 
              onClick={() => handleSendMessage("How can I check my metrics manually and what are normal healthy blood pressure benchmarks?")}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-805 text-zinc-400 hover:text-amber-400 text-xs rounded-full cursor-pointer shrink-0 transition-colors uppercase font-bold tracking-wide"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              How to check BP?
            </button>
            <button 
              onClick={() => handleSendMessage("Evaluate current diagnostics log snapshot.")}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-805 text-zinc-400 hover:text-amber-400 text-xs rounded-full cursor-pointer shrink-0 transition-colors uppercase font-bold tracking-wide"
            >
              <Activity className="w-3 h-3 text-amber-500" />
              Review Wearable Snap
            </button>
          </div>

          <div className="flex items-end gap-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 focus-within:border-amber-500/40 transition-all">
            
            {/* Paperclip attachment triggers */}
            <button 
              onClick={handleAttachmentClick}
              className={`p-2 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors shrink-0 ${
                attachedImagePreview ? "text-amber-400 bg-amber-500/10" : "text-zinc-400 hover:text-white"
              }`}
              title="Attach diagnostic scan photos"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>

            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleAreaKeyDown}
              className="flex-1 bg-transparent border-none focus:ring-0 text-white font-sans resize-none py-1.5 px-1 outline-none text-[14px] placeholder:text-zinc-500 max-h-24 hide-scrollbar"
              placeholder={isListening ? "Listening to voice consultation..." : "Consult symptoms. Ask to scan an attached image report..."}
              rows={1}
            />

            {/* Mic voice chat toggle */}
            <button 
              onClick={toggleVoiceMode}
              className={`p-2 rounded-full shrink-0 transition-all cursor-pointer ${
                voiceActive 
                  ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                  : "text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
              }`}
              title="Register real-time voice consultations"
            >
              {voiceActive ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>

            {/* Send */}
            <button 
              onClick={() => handleSendMessage(inputVal)}
              className="p-2.5 bg-amber-500 hover:bg-amber-600 border border-amber-500 hover:border-amber-600 text-black font-semibold rounded-xl flex items-center justify-center cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-center text-[10px] text-zinc-600 font-sans tracking-wide mt-2.5">
            Wearable telemetry insights are advisory. Consult qualified medical personnel for diagnostics instruction.
          </p>
        </div>
      </section>

      {/* 3. Right Sidebar - Patient Biometrics Core Status (Calibrated Widgets) */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l border-zinc-800 bg-zinc-950 p-6 overflow-y-auto hide-scrollbar z-20">
        
        {/* SNAPSHOT TITLE Header */}
        <h3 className="text-xs font-black tracking-widest text-zinc-500 uppercase mb-4 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-amber-500" />
          Clinical Snapshot
        </h3>

        {/* Profile Card */}
        <div className="glass-border-gradient rounded-xl p-4.5 mb-5 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-amber-500 font-bold text-[16px] shrink-0">
              AJ
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-white text-[15px] truncate uppercase leading-none">Alex Johnson</h4>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-1.5">Age 34 • Blood O+</p>
            </div>
          </div>

          {/* Calibrated Diagnostics Widget boxes */}
          <div className="grid grid-cols-3 gap-1.5 mt-4">
            
            {/* HR Box */}
            <div className={`p-2 bg-zinc-900 rounded-lg border-2 text-center transition-all ${
              vitals.heartRate > 100 ? "border-amber-500 text-amber-500" : "border-zinc-800 text-amber-400"
            }`}>
              <span className="block text-[8px] font-bold uppercase text-zinc-500 mb-0.5">Pulse</span>
              <span className="font-mono font-black text-md text-white">{vitals.heartRate}</span>
              <span className="block text-[8px] font-mono text-zinc-500 leading-none">BPM</span>
            </div>

            {/* SpO2 Box */}
            <div className={`p-2 bg-zinc-900 rounded-lg border-2 text-center transition-all ${
              vitals.spo2 < 94 ? "border-red-500 text-red-555" : "border-zinc-800 text-emerald-400"
            }`}>
              <span className="block text-[8px] font-bold uppercase text-zinc-500 mb-0.5">Oxygen</span>
              <span className="font-mono font-black text-md text-white">{vitals.spo2}%</span>
              <span className="block text-[8px] font-mono text-zinc-500 leading-none">SpO2</span>
            </div>

            {/* Blood Pressure */}
            <div className="p-2 bg-zinc-900 border-2 border-zinc-800 rounded-lg text-center text-indigo-400">
              <span className="block text-[8px] font-bold uppercase text-zinc-500 mb-0.5">BP</span>
              <span className="font-mono font-black text-xs text-white leading-tight block mt-0.5">{vitals.bpSystolic}</span>
              <div className="w-4 h-[1px] bg-zinc-800 mx-auto my-0.5"></div>
              <span className="font-mono font-black text-xs text-white leading-tight block">{vitals.bpDiastolic}</span>
            </div>
          </div>

          {/* Manual Sensor Overrides activator button */}
          <button 
            onClick={() => setShowCalibrator(!showCalibrator)}
            className="w-full mt-3.5 py-1.5 text-[10px] uppercase font-bold text-center border border-zinc-800 hover:border-amber-500/40 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer block"
          >
            {showCalibrator ? "Close Calibrator" : "Configure Vitals Manual"}
          </button>
        </div>

        {/* Inline Modal forms for Calibrations */}
        {showCalibrator && (
          <form onSubmit={handleCalibrateVitals} className="bg-zinc-905 border border-zinc-800 rounded-xl p-4 mb-5 space-y-3 animate-fade-in text-left">
            <span className="text-[8.5px] font-black text-amber-400 uppercase tracking-widest block">Manual Calibrate Controls</span>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold">HR (BPM)</label>
                <input 
                  type="number" 
                  value={calibHr} 
                  onChange={(e) => setCalibHr(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-1.5 rounded text-xs focus:outline-none text-white font-mono mt-1" 
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold">SpO2 (%)</label>
                <input 
                  type="number" 
                  value={calibSpO2} 
                  onChange={(e) => setCalibSpO2(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-1.5 rounded text-xs focus:outline-none text-white font-mono mt-1" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold">Systolic BP</label>
                <input 
                  type="number" 
                  value={calibBpDys} 
                  onChange={(e) => setCalibBpDys(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-1.5 rounded text-xs focus:outline-none text-white font-mono mt-1" 
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold">Diastolic BP</label>
                <input 
                  type="number" 
                  value={calibBpDia} 
                  onChange={(e) => setCalibBpDia(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-1.5 rounded text-xs focus:outline-none text-white font-mono mt-1" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full text-center py-1.5 bg-amber-500 hover:bg-amber-600 rounded text-black font-bold text-[10.5px] uppercase tracking-wider cursor-pointer transition-colors mt-2"
            >
              Verify Calibration
            </button>
          </form>
        )}

        {/* Neural alerts log */}
        <div className="glass-panel border-zinc-800 rounded-xl p-4.5 mb-5 flex-1 flex flex-col min-h-0">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            Neural Health Warnings
          </h4>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 hide-scrollbar">
            {insights.map((insight, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg border text-left flex gap-2.5 leading-snug ${
                  insight.severity === "high" 
                    ? "bg-red-500/5 border-red-500/20 text-red-200" 
                    : insight.severity === "medium" 
                      ? "bg-amber-500/5 border-amber-500/20 text-amber-200" 
                      : "bg-emerald-500/5 border-emerald-500/20 text-emerald-200"
                }`}
              >
                <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                  insight.severity === "high" ? "text-red-400" : insight.severity === "medium" ? "text-amber-400" : "text-emerald-400"
                }`} />
                <div>
                  <span className={`block text-[9px] font-mono font-bold uppercase tracking-wide leading-none ${
                    insight.severity === "high" ? "text-red-400" : insight.severity === "medium" ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {insight.type}
                  </span>
                  <p className="text-[11.5px] mt-1 text-zinc-300">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggestive clinical steps shortcuts */}
        <div className="shrink-0">
          <h4 className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1 text-left">Clinical Recommendations</h4>
          <div className="space-y-1.5">
            {suggestedActions.map((act, i) => (
              <button 
                key={i}
                onClick={() => handleSendMessage(`Guidelines: ${act}. Guide me step by step.`)}
                className="w-full bg-zinc-100 font-bold uppercase text-[10px] font-sans text-black py-2.5 rounded-xl cursor-pointer hover:scale-[0.98] transition-transform text-center flex items-center justify-center gap-1.5"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                {act}
              </button>
            ))}
          </div>
        </div>
      </aside>

    </div>
  );
}
