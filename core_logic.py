import sys
import json
import urllib.request
import urllib.error
import time

def handle_chat(data):
    api_key = data.get("apiKey")
    if not api_key:
        return {"error": "GEMINI_API_KEY is not configured in Python backend."}
    
    vitals = data.get("vitals", {})
    history = data.get("history", [])
    message = data.get("message", "")
    language = data.get("language", "en")
    
    # 1. Structure the clinical context prompt
    user_vitals_text = f"The active patient is Alex Johnson (Age 34, Blood Type O+). His current vitals are:\n" \
                       f"- Heart Rate (HR): {vitals.get('heartRate', 88)} BPM\n" \
                       f"- Oxygen Level (SpO2): {vitals.get('spo2', 98)}%\n" \
                       f"- Blood Pressure (BP): {vitals.get('bpSystolic', 120)}/{vitals.get('bpDiastolic', 80)} mmHg"
    
    contents = [
        {
            "role": "user",
            "parts": [{"text": user_vitals_text}]
        },
        {
            "role": "model",
            "parts": [{"text": "Understood. I will evaluate the patient based on these current vitals and maintain continuity during the diagnostics dialogue."}]
        }
    ]
    
    # Append conversation history
    if history and isinstance(history, list):
        for h in history:
            role = "user" if h.get("sender") == "user" else "model"
            # Support images if history item had one
            parts = [{"text": h.get("text", "")}]
            if h.get("image"):
                img_info = h.get("image")
                parts.append({
                    "inlineData": {
                        "mimeType": img_info.get("mimeType", "image/jpeg"),
                        "data": img_info.get("data")
                    }
                })
            contents.append({
                "role": role,
                "parts": parts
            })
            
    # Append latest message and optional base64 image payload
    latest_parts = [{"text": message}]
    if data.get("image"):
        img_info = data.get("image")
        latest_parts.append({
            "inlineData": {
                "mimeType": img_info.get("mimeType", "image/jpeg"),
                "data": img_info.get("data")
            }
        })
        
    contents.append({
        "role": "user",
        "parts": latest_parts
    })
    
    # 2. Structure setup instructions and language localization
    base_instruction = "You are MediCore AI, a state-of-the-art Clinical Assistant Chatbot.\n" \
                       "Your goal is to evaluate symptoms, provide compassionate medical reasoning, interpret uploaded medical photos/logs, and output diagnostic metrics.\n" \
                       "Always maintain a helpful and clinical tone.\n" \
                       "Always include a compassionate warning that suggestions are for educational context and they should seek physical doctor advice.\n" \
                       "CRITICAL MANDATE FOR VITALS MONITORING: The app features an interactive patient diagnostics dashboard on the right side. You must actively monitor if there is any clinical need to inspect the patient's Blood Pressure (BP), Heart Rate, or Oxygen saturation (SpO2). If needed (e.g., they complain of dizziness, headaches, racing heart, or respiratory feelings), please prompt the user in your responseText to check their vitals and write them in the chat. If the user reports vitals in natural language (e.g., 'my bp is 135/85 and heartbeat is 90 BPM', or 'SpO2 is 94'), you MUST extract these numbers and update them in the 'suggestedVitals' JSON field block of your response so the client-side dashboard updates in real-time. If they do not mention new numbers, keep the vitals consistent with the current client ones.\n" \
                       "MULTIMODAL IMAGE INTERPRETATION MANDATE: When the user attaches or uploads an image, analyze it clinical significance (e.g. pills, medical charts, ECG graph paper, skin photos). Answer diagnostic or descriptive queries based on the image content with clear steps, keeping your tone medically professional.\n" \
                       "You must return your response inside the requested JSON Schema."
                       
    if language == "ur":
        base_instruction += "\nCRITICAL REQUIREMENT: The user has selected URDU (اردو) language. You MUST write the entire 'responseText' in beautifully written Urdu script (Urdu font-friendly and naturally readable). Maintain compassionate medical phrasing in Urdu. Translating diagnostic alerts and health indicators is recommended so the user can easily understand them in Urdu. Include the safety advisory in medical Urdu script."
        
    # 3. Request payload for Gemini REST API /generateContent
    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": base_instruction}]
        },
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "responseText": {
                        "type": "STRING",
                        "description": "The detailed medical consultation text. Use clear paragraphs, lists, bold concepts, or key safety headings."
                    },
                    "suggestedVitals": {
                        "type": "OBJECT",
                        "description": "Suggest any updates/adjustments to client side vitals to mirror the medical symptoms described (e.g. higher heart rate for panic/fever, lower oxygen for respiratory symptoms), otherwise keep them consistent.",
                        "properties": {
                            "heartRate": {"type": "INTEGER", "description": "Heart rate in Beats Per Minute (BPM)"},
                            "spo2": {"type": "INTEGER", "description": "Oxygen level percentage (0 to 100)"},
                            "bpSystolic": {"type": "INTEGER", "description": "Systolic Blood Pressure"},
                            "bpDiastolic": {"type": "INTEGER", "description": "Diastolic Blood Pressure"}
                        },
                        "required": ["heartRate", "spo2", "bpSystolic", "bpDiastolic"]
                    },
                    "insights": {
                        "type": "ARRAY",
                        "description": "Provide up to 3 diagnostic alert cards summarizing findings.",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "type": {"type": "STRING", "description": "Label, e.g. 'ELEVATED HR', 'CRITICAL SPO2', 'PRE-HYPERTENSION', 'HYDRATION OPTIMAL'"},
                                "severity": {"type": "STRING", "description": "Severity level: low, medium, high"},
                                "message": {"type": "STRING", "description": "1-sentence visual correlation details."}
                            },
                            "required": ["type", "severity", "message"]
                        }
                    },
                    "suggestedActions": {
                        "type": "ARRAY",
                        "description": "Up to 2 action recommendation links for the user.",
                        "items": {
                            "type": "STRING",
                            "description": "Immediate direct recommendation phrase, e.g. 'Schedule follow-up cardiology appointment'."
                        }
                    }
                },
                "required": ["responseText", "suggestedVitals", "insights", "suggestedActions"]
            }
        }
    }
    
    models = ["gemini-2.5-flash"]
    last_error = None
    
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
        }
        
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        text = text.strip()
                        if text.startswith("```json"):
                            text = text[7:]
                        elif text.startswith("```"):
                            text = text[3:]
                        if text.endswith("```"):
                            text = text[:-3]
                        return json.loads(text.strip())
                    else:
                        return {"error": "No candidates returned from Gemini API."}
            except urllib.error.HTTPError as e:
                error_msg = e.read().decode("utf-8")
                last_error = f"API HTTP Error: {e.code} - {error_msg}"
                if e.code in [503, 429]:
                    time.sleep(2 ** attempt)
                    continue
                elif e.code == 404:
                    break
                else:
                    return {"error": last_error}
            except Exception as e:
                return {"error": f"Internal Python error: {str(e)}"}
                
    return {"error": f"Failed after trying all models. Last error: {last_error}"}

def handle_tts(data):
    api_key = data.get("apiKey")
    if not api_key:
        return {"error": "GEMINI_API_KEY is not configured in Python backend."}
        
    text = data.get("text", "")
    voice = data.get("voice", "Zephyr")
    
    clean_text = text[:300].replace("*", "").replace("#", "").replace("_", "").replace("~", "")
    
    payload = {
        "contents": [{"parts": [{"text": f"Say warmly and clearly: {clean_text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice}
                }
            }
        }
    }
    
    models = ["gemini-2.5-flash"]
    last_error = None
    
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
        }
        
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    candidates = res_data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            inline_data = parts[0].get("inlineData", {})
                            base64_audio = inline_data.get("data")
                            if base64_audio:
                                return {"audio": base64_audio}
                    return {"error": "TTS model did not return any audio data."}
            except urllib.error.HTTPError as e:
                error_msg = e.read().decode("utf-8")
                last_error = f"API HTTP Error: {e.code} - {error_msg}"
                if e.code in [503, 429]:
                    time.sleep(2 ** attempt)
                    continue
                elif e.code == 404:
                    break
                else:
                    return {"error": last_error}
            except Exception as e:
                return {"error": f"Internal Python error: {str(e)}"}
                
    return {"error": f"Failed after trying all models. Last error: {last_error}"}

def main():
    try:
        # Guarantee robust UTF-8 stream handling for localized Urdu translation inputs
        try:
            sys.stdin.reconfigure(encoding='utf-8')
            sys.stdout.reconfigure(encoding='utf-8')
        except AttributeError:
            pass

        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "Empty input"}))
            return
            
        data = json.loads(input_data)
        action = data.get("action")
        
        if action == "chat":
            print(json.dumps(handle_chat(data)))
        elif action == "tts":
            print(json.dumps(handle_tts(data)))
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))
    except Exception as e:
        print(json.dumps({"error": f"Unhandled parser error: {str(e)}"}))

if __name__ == "__main__":
    main()
