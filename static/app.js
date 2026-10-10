// MediCore Client Logic (Vanilla JS)
let sessions = JSON.parse(localStorage.getItem("medicore_sessions_v2") || "[]");
let activeSessionId = "sys-baseline";
let vitals = { heartRate: 80, spo2: 98, bpSystolic: 120, bpDiastolic: 80 };
let insights = [];
let suggestedActions = [];

if (sessions.length === 0) {
    sessions.push({
        id: "sys-baseline",
        title: "Alex Johnson - Primary Scan",
        timestamp: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
        messages: [{
            id: "init", sender: "ai", text: "Hello Alex, I am **MediCore AI**, your advanced clinical assistant. I have connected to your active monitoring feeds.\\n\\nPlease describe any symptoms you are feeling today. If you have measured recent vital readings (such as Blood Pressure, Heart Rate, or Oxygen saturation), type them in here and I will synchronize your diagnostic snapshots.", timestamp: "09:40 AM"
        }],
        vitals: { heartRate: 88, spo2: 98, bpSystolic: 120, bpDiastolic: 80 },
        insights: [{ type: "STANDBY STABLE", severity: "low", message: "Clinical metrics baseline initialized. Wearable snapshot synchronized." }],
        suggestedActions: ["Consult symptoms or seek physical assessment"]
    });
    localStorage.setItem("medicore_sessions_v2", JSON.stringify(sessions));
}

let activeSession = sessions[0];
let voiceReadOutEnabled = true;
let voiceActive = false;
let isSpeaking = false;
let language = "en";
let voiceLanguage = "en-US";
let attachedImagePreview = "";
let attachedImage = null;

let recognition = null;
let synth = window.speechSynthesis;
let playNode = null;

// DOM Elements
const chatInput = document.getElementById("chat-input");
const messagesList = document.getElementById("messages-list");
const sessionsList = document.getElementById("sessions-list");
const mobileSessionsList = document.getElementById("mobile-sessions-list");
const voiceBtn = document.getElementById("voice-btn");
const micIcon = document.getElementById("mic-icon");
const volumeIcon = document.getElementById("volume-icon");
const toggleReadout = document.getElementById("toggle-readout");
const sendBtn = document.getElementById("send-btn");
const loadingIndicator = document.getElementById("loading-indicator");
const newSessionBtn = document.getElementById("new-session-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachmentContainer = document.getElementById("attachment-preview-container");
const attachmentPreview = document.getElementById("attached-image-preview");
const removeAttachment = document.getElementById("remove-attachment");
const toggleCalibrator = document.getElementById("toggle-calibrator");
const calibratorForm = document.getElementById("calibrator-form");
const speakingOverlay = document.getElementById("speaking-overlay");
const stopVoice = document.getElementById("stop-voice");
const micErrorBanner = document.getElementById("mic-error-banner");
const micErrorText = document.getElementById("mic-error-text");

function initApp() {
    renderSessions();
    loadSession(sessions[0].id);
    setupSpeechRecognition();
    lucide.createIcons();
}

function saveSessions() {
    localStorage.setItem("medicore_sessions_v2", JSON.stringify(sessions));
}

function loadSession(id) {
    activeSessionId = id;
    activeSession = sessions.find(s => s.id === id) || sessions[0];
    vitals = activeSession.vitals;
    insights = activeSession.insights;
    suggestedActions = activeSession.suggestedActions;
    renderMessages();
    renderVitals();
    renderInsights();
    renderActions();
    renderSessions();
    if(calibratorForm && !calibratorForm.classList.contains("hidden")) {
        document.getElementById("calib-hr").value = vitals.heartRate;
        document.getElementById("calib-spo2").value = vitals.spo2;
        document.getElementById("calib-bpsys").value = vitals.bpSystolic;
        document.getElementById("calib-bpdia").value = vitals.bpDiastolic;
    }
}

function renderSessions() {
    const html = sessions.map(s => `
        <div onclick="loadSession('${s.id}')" class="p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${s.id === activeSessionId ? "bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold" : "bg-zinc-900/40 border-zinc-800/30 text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"}">
            <div class="flex items-center gap-2.5 min-w-0">
                <i data-lucide="stethoscope" class="w-4 h-4 text-amber-500 shrink-0"></i>
                <div class="truncate text-left">
                    <span class="block text-xs truncate leading-tight uppercase font-bold tracking-wide">${s.title}</span>
                    <span class="text-[9px] opacity-70 font-mono">${s.timestamp}</span>
                </div>
            </div>
            <button onclick="deleteSession(event, '${s.id}')" class="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
    `).join("");
    sessionsList.innerHTML = html;
    if(mobileSessionsList) mobileSessionsList.innerHTML = html;
    lucide.createIcons();
}

function deleteSession(e, id) {
    e.stopPropagation();
    if (sessions.length <= 1) return alert("At least one consultation session history must write active.");
    sessions = sessions.filter(s => s.id !== id);
    saveSessions();
    if (activeSessionId === id) loadSession(sessions[0].id);
    else renderSessions();
}

function renderMessages() {
    messagesList.innerHTML = activeSession.messages.map(m => `
        <div class="flex ${m.sender === "user" ? "justify-end" : "justify-start"} w-full">
            <div class="flex items-start max-w-[85%]">
                ${m.sender === "ai" ? `<div class="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mr-2.5 mt-0.5 shrink-0"><i data-lucide="cpu" class="w-3.5 h-3.5 text-amber-400 animate-pulse"></i></div>` : ""}
                <div class="p-4 rounded-xl border leading-relaxed text-[14px] ${m.sender === "user" ? "bg-amber-500 text-black rounded-tr-sm border-amber-600 font-medium" : "bg-zinc-900/40 border-zinc-800 rounded-tl-sm border-l-2 border-l-amber-500"}">
                    ${m.imageUrl ? `<div class="mb-3 max-w-sm overflow-hidden rounded-lg border border-white/20"><img src="${m.imageUrl}" class="w-full h-auto object-contain max-h-48" /></div>` : ""}
                    <div class="prose prose-invert max-w-none text-left ${m.sender === "user" ? "prose-zinc text-black" : "prose-amber text-zinc-100"}">
                        ${marked.parse(m.text)}
                    </div>
                    ${m.vitals ? `
                    <div class="mt-3.5 pt-2 border-t flex flex-wrap items-center gap-3.5 text-[10.5px] font-mono ${m.sender === "user" ? "border-black/10 text-black/70" : "border-zinc-800/80 text-zinc-400"}">
                        <span class="${m.sender === "user" ? "text-black/90 font-bold" : "text-amber-400 font-bold"}">✓ Metrics Sync:</span>
                        <span>HR: ${m.vitals.heartRate} BPM</span><span>•</span>
                        <span>SpO2: ${m.vitals.spo2}%</span><span>•</span>
                        <span>BP: ${m.vitals.bpSystolic}/${m.vitals.bpDiastolic} mmHg</span>
                    </div>` : ""}
                    <span class="block text-[8.5px] font-mono mt-2 text-right ${m.sender === "user" ? "text-black/60" : "text-zinc-500"}">${m.timestamp}</span>
                </div>
                ${m.sender === "user" ? `<div class="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ml-2.5 mt-0.5 shrink-0"><i data-lucide="user" class="w-3.5 h-3.5 text-zinc-400"></i></div>` : ""}
            </div>
        </div>
    `).join("");
    lucide.createIcons();
    scrollToBottom();
}

function renderVitals() {
    if (!document.getElementById("vital-hr")) return;
    document.getElementById("vital-hr").innerText = vitals.heartRate;
    document.getElementById("vital-spo2").innerText = vitals.spo2 + "%";
    document.getElementById("vital-bpsys").innerText = vitals.bpSystolic;
    document.getElementById("vital-bpdia").innerText = vitals.bpDiastolic;
    
    document.getElementById("box-hr").className = `p-2 bg-zinc-900 rounded-lg border-2 text-center transition-all ${vitals.heartRate > 100 ? "border-amber-500 text-amber-500" : "border-zinc-800 text-amber-400"}`;
    document.getElementById("box-spo2").className = `p-2 bg-zinc-900 rounded-lg border-2 text-center transition-all ${vitals.spo2 < 94 ? "border-red-500 text-red-555" : "border-zinc-800 text-emerald-400"}`;
}

function renderInsights() {
    if (!document.getElementById("insights-list")) return;
    document.getElementById("insights-list").innerHTML = insights.map(i => `
        <div class="p-3 rounded-lg border text-left flex gap-2.5 leading-snug ${i.severity === 'high' ? 'bg-red-500/5 border-red-500/20 text-red-200' : i.severity === 'medium' ? 'bg-amber-500/5 border-amber-500/20 text-amber-200' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'}">
            <i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0 mt-0.5 ${i.severity === 'high' ? 'text-red-400' : i.severity === 'medium' ? 'text-amber-400' : 'text-emerald-400'}"></i>
            <div>
                <span class="block text-[9px] font-mono font-bold uppercase tracking-wide leading-none ${i.severity === 'high' ? 'text-red-400' : i.severity === 'medium' ? 'text-amber-400' : 'text-emerald-400'}">${i.type}</span>
                <p class="text-[11.5px] mt-1 text-zinc-300">${i.message}</p>
            </div>
        </div>
    `).join("");
    lucide.createIcons();
}

function renderActions() {
    if (!document.getElementById("recommendations-list")) return;
    document.getElementById("recommendations-list").innerHTML = suggestedActions.map(a => `
        <button onclick="handleSendMessage('Guidelines: ${a}. Guide me step by step.')" class="w-full bg-zinc-100 font-bold uppercase text-[10px] font-sans text-black py-2.5 rounded-xl cursor-pointer hover:scale-[0.98] transition-transform text-center flex items-center justify-center gap-1.5">
            <i data-lucide="stethoscope" class="w-3.5 h-3.5"></i> ${a}
        </button>
    `).join("");
    lucide.createIcons();
}

function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Handlers
newSessionBtn.onclick = () => {
    const id = "session-" + Date.now();
    sessions.unshift({
        id,
        title: `Consultation - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        timestamp: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
        messages: [{
            id: "init", sender: "ai", 
            text: language === "ur" ? "ہیلو الیکس، میں **میڈی کور الیون** ہوں۔ براہ کرم اپنی علامات ریکارڈ کروائیں یا وائٹل ریڈنگز مہیا کریں۔" : "Hello Alex, I am **MediCore AI**, your advanced clinical assistant. I have connected to your active monitoring feeds. Please tell me your symptoms or input recent vitals values.", 
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }],
        vitals: { heartRate: 80, spo2: 98, bpSystolic: 120, bpDiastolic: 80 },
        insights: [{ type: "NEW SESSION", severity: "low", message: "A fresh diagnostic workspace is prepared. Please provide details securely." }],
        suggestedActions: ["Type symptoms or input vital parameters"]
    });
    saveSessions();
    loadSession(id);
    document.getElementById("mobile-history-drawer").classList.add("hidden");
};

document.getElementById("lang-en").onclick = (e) => { language = "en"; voiceLanguage = "en-US"; document.getElementById("voice-language").value="en-US"; e.target.classList.add("bg-amber-500", "text-white"); document.getElementById("lang-ur").classList.remove("bg-amber-500", "text-white"); document.getElementById("lang-ur").classList.add("text-zinc-400"); setupSpeechRecognition(); };
document.getElementById("lang-ur").onclick = (e) => { language = "ur"; voiceLanguage = "ur-PK"; document.getElementById("voice-language").value="ur-PK"; e.target.classList.add("bg-amber-500", "text-white"); document.getElementById("lang-en").classList.remove("bg-amber-500", "text-white"); document.getElementById("lang-en").classList.add("text-zinc-400"); setupSpeechRecognition(); };

document.getElementById("voice-language").onchange = (e) => { voiceLanguage = e.target.value; setupSpeechRecognition(); };

toggleReadout.onclick = () => {
    voiceReadOutEnabled = !voiceReadOutEnabled;
    toggleReadout.className = voiceReadOutEnabled ? "p-1.5 rounded-full border transition-all cursor-pointer bg-amber-500/10 border-amber-500/40 text-amber-400" : "p-1.5 rounded-full border transition-all cursor-pointer bg-zinc-900 border-zinc-800 text-zinc-500";
    volumeIcon.setAttribute("data-lucide", voiceReadOutEnabled ? "volume-2" : "volume-x");
    lucide.createIcons();
};

if (toggleCalibrator) {
    toggleCalibrator.onclick = () => {
        calibratorForm.classList.toggle("hidden");
        if(!calibratorForm.classList.contains("hidden")) {
            document.getElementById("calib-hr").value = vitals.heartRate;
            document.getElementById("calib-spo2").value = vitals.spo2;
            document.getElementById("calib-bpsys").value = vitals.bpSystolic;
            document.getElementById("calib-bpdia").value = vitals.bpDiastolic;
        }
        toggleCalibrator.innerText = calibratorForm.classList.contains("hidden") ? "Configure Vitals Manual" : "Close Calibrator";
    };
}

if (calibratorForm) {
    calibratorForm.onsubmit = (e) => {
        e.preventDefault();
        vitals = {
            heartRate: Math.max(30, Math.min(240, parseInt(document.getElementById("calib-hr").value) || 80)),
            spo2: Math.max(50, Math.min(100, parseInt(document.getElementById("calib-spo2").value) || 98)),
            bpSystolic: Math.max(70, Math.min(220, parseInt(document.getElementById("calib-bpsys").value) || 120)),
            bpDiastolic: Math.max(40, Math.min(140, parseInt(document.getElementById("calib-bpdia").value) || 80))
        };
        activeSession.vitals = vitals;
        saveSessions();
        renderVitals();
        calibratorForm.classList.add("hidden");
        toggleCalibrator.innerText = "Configure Vitals Manual";
        handleSendMessage(`[System notification: Alex Johnson calibrated his metrics dashboard explicitly to Heart Rate: ${vitals.heartRate} BPM, Oxygen saturation: ${vitals.spo2}%, Blood Pressure: ${vitals.bpSystolic}/${vitals.bpDiastolic} mmHg. Please interpret these new readings.]`);
    };
}

attachBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
            attachedImagePreview = reader.result;
            attachedImage = { mimeType: file.type, data: attachedImagePreview.split(",")[1] };
            attachmentPreview.src = attachedImagePreview;
            attachmentContainer.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    }
};

removeAttachment.onclick = () => {
    attachedImage = null;
    attachedImagePreview = "";
    attachmentContainer.classList.add("hidden");
    fileInput.value = "";
};

chatInput.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(chatInput.value);
    }
};

sendBtn.onclick = () => handleSendMessage(chatInput.value);

document.getElementById("prompt-1").onclick = () => handleSendMessage("How can I check my metrics manually and what are normal healthy blood pressure benchmarks?");
document.getElementById("prompt-2").onclick = () => handleSendMessage("Evaluate current diagnostics log snapshot.");

// Mobile history
document.getElementById("mobile-history-btn").onclick = () => document.getElementById("mobile-history-drawer").classList.remove("hidden");
document.getElementById("close-mobile-history").onclick = () => document.getElementById("mobile-history-drawer").classList.add("hidden");
document.getElementById("mobile-history-backdrop").onclick = () => document.getElementById("mobile-history-drawer").classList.add("hidden");
document.getElementById("mobile-new-btn").onclick = newSessionBtn.onclick;

// Chat Logic
async function handleSendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed && !attachedImage) return;

    if (recognition && voiceActive) { try { recognition.stop(); } catch(e){} }

    const userMsg = {
        id: Math.random().toString(),
        sender: "user",
        text: trimmed || "Attached diagnostic visual query.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        imageUrl: attachedImagePreview || undefined
    };

    activeSession.messages.push(userMsg);
    chatInput.value = "";
    loadingIndicator.classList.remove("hidden");
    scrollToBottom();
    renderMessages();

    const backupImg = attachedImage;
    attachedImage = null;
    attachedImagePreview = "";
    attachmentContainer.classList.add("hidden");
    fileInput.value = "";

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                history: activeSession.messages.slice(-10).map(m => ({
                    sender: m.sender, text: m.text,
                    image: m.imageUrl ? { mimeType: "image/jpeg", data: m.imageUrl.split(",")[1] } : undefined
                })),
                message: trimmed, vitals, language, image: backupImg
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Connection failed. Set GEMINI_API_KEY in Secrets.");
        }
        
        const data = await res.json();
        const aiMsg = {
            id: Math.random().toString(),
            sender: "ai",
            text: data.responseText || "Consultation telemetry did not compute clear guidelines.",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            vitals: data.suggestedVitals || vitals
        };

        activeSession.messages.push(aiMsg);
        vitals = data.suggestedVitals || vitals;
        insights = data.insights || insights;
        suggestedActions = data.suggestedActions || suggestedActions;
        activeSession.vitals = vitals;
        activeSession.insights = insights;
        activeSession.suggestedActions = suggestedActions;
        
        saveSessions();
        renderMessages();
        renderVitals();
        renderInsights();
        renderActions();

        if (voiceActive || voiceReadOutEnabled) speakAIOutput(data.responseText);
    } catch (err) {
        console.error(err);
        activeSession.messages.push({
            id: Math.random().toString(),
            sender: "ai",
            text: `⚠️ **Diagnostic Platform Warning:** ${err.message || "Network consultation failure."}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        saveSessions();
        renderMessages();
    } finally {
        loadingIndicator.classList.add("hidden");
        setTimeout(() => { if (voiceActive && !isSpeaking) try { recognition.start(); } catch(e){} }, 600);
    }
}

// Voice Logic
function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = voiceLanguage;
        
        recognition.onstart = () => { micErrorBanner.classList.add("hidden"); chatInput.placeholder = "Listening to voice consultation..."; };
        recognition.onerror = (e) => {
            if (e.error === "no-speech") return;
            micErrorText.innerText = e.error === 'not-allowed' ? "Microphone access is not authorized. Enable it in browser settings." : `Recognition engine error: ${e.error}`;
            micErrorBanner.classList.remove("hidden");
            voiceActive = false;
            updateVoiceBtn();
        };
        recognition.onend = () => {
            chatInput.placeholder = "Consult symptoms. Ask to scan an attached image report...";
            const isFetching = !loadingIndicator.classList.contains("hidden");
            if (voiceActive && !isSpeaking && !isFetching) setTimeout(() => { try { recognition.start(); } catch(e){} }, 300);
        };
        recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            if (text.trim()) handleSendMessage(text);
        };
    }
}

function updateVoiceBtn() {
    voiceBtn.className = voiceActive ? "p-2 rounded-full shrink-0 transition-all cursor-pointer bg-red-500/10 text-red-400 border border-red-500/20" : "p-2 rounded-full shrink-0 transition-all cursor-pointer text-zinc-400 hover:text-amber-400 hover:bg-zinc-800";
    micIcon.setAttribute("data-lucide", voiceActive ? "mic-off" : "mic");
    lucide.createIcons();
}

voiceBtn.onclick = () => {
    if (voiceActive) {
        try { recognition.stop(); } catch(e){}
        stopVoicePlay();
        voiceActive = false;
    } else {
        if (!recognition) {
            micErrorText.innerText = "Voice recognition is not supported in this browser.";
            micErrorBanner.classList.remove("hidden");
            return;
        }
        voiceActive = true;
        try {
            recognition.start();
        } catch(err) {
            console.error(err);
            micErrorText.innerText = "Failed to start microphone. Please check permissions.";
            micErrorBanner.classList.remove("hidden");
            voiceActive = false;
        }
    }
    updateVoiceBtn();
};

document.getElementById("close-mic-error").onclick = () => micErrorBanner.classList.add("hidden");
stopVoice.onclick = stopVoicePlay;

function stopVoicePlay() {
    if (synth) try { synth.cancel(); } catch(e){}
    if (playNode) { try { playNode.stop(); } catch(e){} playNode = null; }
    isSpeaking = false;
    speakingOverlay.classList.add("hidden");
}

async function speakAIOutput(text) {
    if (!voiceReadOutEnabled) return;
    const clean = text.replace(/[*#_~`\-]/g, '');
    
    // Cloud TTS Fallback via /api/tts
    try {
        isSpeaking = true;
        speakingOverlay.classList.remove("hidden");
        const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean, voice: "Zephyr" })
        });
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (body.audio) {
            const bytes = atob(body.audio);
            const buffer = new ArrayBuffer(bytes.length);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < bytes.length; i++) view[i] = bytes.charCodeAt(i);
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            const decoded = await ctx.decodeAudioData(buffer);
            const node = ctx.createBufferSource();
            playNode = node;
            node.buffer = decoded;
            node.connect(ctx.destination);
            node.onended = () => {
                stopVoicePlay();
                if (voiceActive && recognition) try { recognition.start(); } catch(e){}
            };
            node.start(0);
            return;
        }
    } catch(err) {
        // Fallback to local
        if (synth) {
            const utter = new SpeechSynthesisUtterance(clean);
            utter.lang = voiceLanguage;
            utter.onend = () => { stopVoicePlay(); if(voiceActive) try { recognition.start(); } catch(e){} };
            utter.onerror = stopVoicePlay;
            synth.speak(utter);
        } else {
            stopVoicePlay();
        }
    }
}

// Start
initApp();
