from fasthtml.common import *
from starlette.responses import JSONResponse
from core_logic import handle_chat, handle_tts
import os
import json
from dotenv import load_dotenv

load_dotenv()

# Setup Tailwind, Lucide, and Markdown via CDN
hdrs = (
    Script(src="https://cdn.tailwindcss.com"),
    Script(src="https://unpkg.com/lucide@latest"),
    Script(src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"),
    Link(rel="stylesheet", href="/static/style.css"),
    Script(src="/static/app.js", defer=True)
)

app, rt = fast_app(hdrs=hdrs)

# Serve static files
@rt("/static/{fname:path}")
def serve_static(fname: str):
    return FileResponse(f"static/{fname}")

# API Endpoints exactly like Express
@rt("/api/chat", methods=["POST"])
async def api_chat(req):
    data = await req.json()
    data['apiKey'] = os.environ.get("GEMINI_API_KEY", "")
    result = handle_chat(data)
    if "error" in result:
        print(f"BACKEND ERROR: {result['error']}")
        return JSONResponse({"error": result["error"]}, status_code=500)
    return JSONResponse(result)

@rt("/api/tts", methods=["POST"])
async def api_tts(req):
    data = await req.json()
    data['apiKey'] = os.environ.get("GEMINI_API_KEY", "")
    result = handle_tts(data)
    if "error" in result:
        return JSONResponse({"error": result["error"]}, status_code=500)
    return JSONResponse(result)


# Main UI Construction
def LeftSidebar():
    return Aside(
        Div(
            I(data_lucide="heart", cls="w-6 h-6 text-amber-500 fill-amber-500/25 animate-pulse"),
            Div(
                H1("MediCore", cls="text-xl font-black tracking-tighter text-amber-500 uppercase"),
                P("Diagnostic Logs", cls="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1")
            ),
            cls="mb-6 px-2 flex items-center gap-2"
        ),
        Button(
            I(data_lucide="plus", cls="w-4 h-4"),
            "New Consult",
            id="new-session-btn",
            cls="mb-5 w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider text-[11px] rounded-xl cursor-pointer transition-all"
        ),
        Div(
            P("Clinical Consultation History", cls="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2 px-2"),
            Div(id="sessions-list"), # Populated by app.js
            cls="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 hide-scrollbar"
        ),
        Div(
            Div(
                H5(
                    Span(cls="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"),
                    "Gemini Pro Multimodal",
                    cls="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5"
                ),
                P("Secure diagnostic scans with image inputs active.", cls="text-[10.5px] text-zinc-400 leading-snug"),
                cls="p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/5 text-center"
            ),
            cls="mt-auto pt-4 border-t border-zinc-900"
        ),
        cls="hidden md:flex flex-col h-screen py-6 px-4 bg-zinc-950 border-r border-zinc-800/80 w-64 shrink-0 overflow-hidden relative z-20"
    )

def MobileNav():
    return Nav(
        Div(
            I(data_lucide="heart", cls="w-5 h-5 text-amber-500 fill-amber-500/25 animate-pulse"),
            H1("MediCore", cls="text-md font-black tracking-tighter text-amber-500 uppercase"),
            cls="flex items-center gap-2"
        ),
        Div(
            Button("History Links", id="mobile-history-btn", cls="p-1 px-3 text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full cursor-pointer"),
            Button("New", id="mobile-new-btn", cls="p-1 px-2 text-[10px] uppercase font-bold text-white bg-amber-500 rounded-full cursor-pointer"),
            cls="flex gap-2"
        ),
        cls="md:hidden fixed top-0 w-full z-40 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 py-3 h-14"
    )

def MobileHistoryDrawer():
    return Div(
        Div(
            Div(
                H4("Saved consultations", cls="text-sm font-black text-white uppercase tracking-wider"),
                Button(I(data_lucide="x", cls="w-5 h-5"), id="close-mobile-history", cls="text-zinc-400 hover:text-white"),
                cls="flex justify-between items-center mb-6"
            ),
            Div(id="mobile-sessions-list", cls="flex-1 overflow-y-auto space-y-2 pr-1"),
            cls="w-72 bg-zinc-950 p-6 flex flex-col h-full border-r border-zinc-800"
        ),
        Div(id="mobile-history-backdrop", cls="flex-1"),
        id="mobile-history-drawer",
        cls="hidden md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-start"
    )

def ChatHeader():
    return Header(
        Div(
            Span(cls="w-2.5 h-2.5 rounded-full bg-amber-500 pulse-dot relative shrink-0"),
            Div(
                H2("Consultation Workspace", cls="text-md font-bold text-white uppercase tracking-tight"),
                P("Patient Alex Johnson • Verified Diagnostics Encrypted", cls="text-[10px] text-zinc-400 leading-none mt-1")
            ),
            cls="flex items-center gap-2.5"
        ),
        Div(
            Div(
                Button("English", id="lang-en", cls="px-3 py-1 text-[10px] font-bold uppercase rounded-full transition-all cursor-pointer bg-amber-500 text-white"),
                Button("اردو", id="lang-ur", cls="px-3 py-1 text-[10px] font-bold uppercase rounded-full transition-all cursor-pointer text-zinc-400"),
                cls="flex bg-zinc-900 border border-zinc-800 rounded-full p-0.5", title="Switch Input Language"
            ),
            Select(
                Option("US (Female)", value="en-US"),
                Option("UK (Male)", value="en-GB"),
                Option("Urdu (Zoya)", value="ur-PK"),
                id="voice-language",
                cls="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold py-1 px-2.5 rounded-full outline-none focus:ring-0 cursor-pointer"
            ),
            Button(
                I(data_lucide="volume-2", cls="w-3.5 h-3.5", id="volume-icon"),
                id="toggle-readout",
                cls="p-1.5 rounded-full border transition-all cursor-pointer bg-amber-500/10 border-amber-500/40 text-amber-400",
                title="Speakback Voice Sync Toggle"
            ),
            cls="flex flex-wrap items-center gap-1.5"
        ),
        cls="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/40 backdrop-blur flex flex-wrap items-center justify-between gap-3"
    )

def ChatArea():
    return Section(
        ChatHeader(),
        Div(
            I(data_lucide="alert-circle", cls="w-4 h-4 text-red-400 shrink-0 mt-0.5"),
            P(id="mic-error-text", cls="text-[12px] font-medium leading-relaxed"),
            Button(I(data_lucide="x", cls="w-4 h-4"), id="close-mic-error", cls="ml-auto text-red-400 hover:text-white"),
            id="mic-error-banner",
            cls="hidden bg-red-500/10 border-b border-red-500/25 px-5 py-2.5 flex items-start gap-2.5 text-red-200"
        ),
        Div(id="messages-list", cls="flex-1 overflow-y-auto p-5 space-y-4 shadow-inner hide-scrollbar"),
        
        # Loading indicator
        Div(
            Div(I(data_lucide="refresh-cw", cls="w-3.5 h-3.5 text-amber-400 animate-spin"), cls="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0"),
            Div(Span("Analyzing clinical symptoms trend...", cls="text-xs font-mono uppercase tracking-wider text-amber-400"), cls="bg-zinc-900/30 border border-zinc-800 p-3.5 rounded-xl rounded-tl-sm"),
            id="loading-indicator",
            cls="hidden flex items-start gap-2 text-zinc-400 animate-pulse mt-4"
        ),
        
        # Speaking Overlay
        Div(
            Span(
                Span(cls="w-2 h-2 rounded-full bg-amber-500 animate-ping"),
                "MediCore Clinical audio playback active",
                cls="text-[11px] font-mono font-bold tracking-wide flex items-center gap-1.5 uppercase"
            ),
            Button("Stop Voice", id="stop-voice", cls="px-3 py-1 font-mono text-[10px] font-bold uppercase rounded-full border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"),
            id="speaking-overlay",
            cls="hidden px-5 py-2.5 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between text-amber-200"
        ),
        
        # Footer
        Div(
            # Image Preview
            Div(
                Img(id="attached-image-preview", cls="w-12 h-12 object-cover rounded border border-zinc-700 pointer-events-none"),
                Div(
                    Span("ATTACHED SCAN IMAGE", cls="block text-[9px] text-zinc-500 font-mono font-bold uppercase"),
                    Span("Ready to read with AI...", cls="block text-xs text-zinc-300 truncate font-sans"),
                    cls="flex-1 min-w-0 pr-6"
                ),
                Button(I(data_lucide="x", cls="w-3 h-3"), id="remove-attachment", cls="absolute top-2 right-2 p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400"),
                id="attachment-preview-container",
                cls="hidden flex items-center gap-2 mb-3 p-2 bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm relative animate-fade-in"
            ),
            
            # Prompts
            Div(
                Button(I(data_lucide="sparkles", cls="w-3 h-3 text-amber-500"), "How to check BP?", id="prompt-1", cls="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-805 text-zinc-400 hover:text-amber-400 text-xs rounded-full cursor-pointer shrink-0 transition-colors uppercase font-bold tracking-wide"),
                Button(I(data_lucide="activity", cls="w-3 h-3 text-amber-500"), "Review Wearable Snap", id="prompt-2", cls="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-805 text-zinc-400 hover:text-amber-400 text-xs rounded-full cursor-pointer shrink-0 transition-colors uppercase font-bold tracking-wide"),
                cls="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3 py-0.5"
            ),
            
            # Input Area
            Div(
                Input(type="file", id="file-input", accept="image/*", cls="hidden"),
                Button(I(data_lucide="paperclip", cls="w-4.5 h-4.5"), id="attach-btn", cls="p-2 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors shrink-0 text-zinc-400 hover:text-white", title="Attach diagnostic scan photos"),
                Textarea(id="chat-input", rows="1", placeholder="Consult symptoms. Ask to scan an attached image report...", cls="flex-1 bg-transparent border-none focus:ring-0 text-white font-sans resize-none py-1.5 px-1 outline-none text-[14px] placeholder:text-zinc-500 max-h-24 hide-scrollbar"),

                Button(I(data_lucide="send", cls="w-3.5 h-3.5"), id="send-btn", cls="p-2.5 bg-amber-500 hover:bg-amber-600 border border-amber-500 hover:border-amber-600 text-black font-semibold rounded-xl flex items-center justify-center cursor-pointer transition-colors"),
                cls="flex items-end gap-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 focus-within:border-amber-500/40 transition-all"
            ),
            P("Wearable telemetry insights are advisory. Consult qualified medical personnel for diagnostics instruction.", cls="text-center text-[10px] text-zinc-600 font-sans tracking-wide mt-2.5"),
            cls="p-4 bg-[#09090b] border-t border-zinc-800/80"
        ),
        cls="flex-1 flex flex-col h-screen min-w-0 w-full relative z-10 pt-14 md:pt-0"
    )


@rt("/")
def get():
    return Body(
        Div(
            Input(type="file", id="file-input-global", accept="image/*", cls="hidden"),
            LeftSidebar(),
            MobileNav(),
            MobileHistoryDrawer(),
            ChatArea(),
            cls="bg-gradient-mesh text-[#dde4e1] font-sans min-h-screen flex flex-col md:flex-row h-screen overflow-hidden select-none"
        ),
        Script("lucide.createIcons();")
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="localhost", port=3000, reload=True)
