import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper function to interact with python core_logic.py via stdin/stdout
async function runPythonLogic(action: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      reject(new Error("GEMINI_API_KEY is not configured. Please configure it in Settings > Secrets."));
      return;
    }

    const pythonInput = JSON.stringify({
      action,
      apiKey,
      ...payload
    });

    // Spawn python3 process
    const py = spawn("python3", ["core_logic.py"]);

    let stdoutData = "";
    let stderrData = "";

    py.stdin.write(pythonInput);
    py.stdin.end();

    py.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    py.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}. Error Output: ${stderrData || "None"}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        if (parsed.error) {
          reject(new Error(parsed.error));
        } else {
          resolve(parsed);
        }
      } catch (err) {
        reject(new Error(`Failed to parse Python structure: "${stdoutData}". Channel error: ${stderrData || "None"}`));
      }
    });

    py.on("error", (err) => {
      reject(new Error(`Failed to initialize Python core runner: ${err.message}`));
    });
  });
}

// REST API endpoint: Chat with diagnostic updates (Proxied entirely to Python Core Engine)
app.post("/api/chat", async (req, res) => {
  try {
    const { history, message, vitals, language = "en", image } = req.body;
    
    // Call the Python Core Engine
    const result = await runPythonLogic("chat", {
      history,
      message,
      vitals,
      language,
      image
    });
    
    res.json(result);
  } catch (error: any) {
    console.error("Express Chat route error: redirecting from python engine: ", error);
    res.status(500).json({ error: error.message || "Failed during symptom logic consultation." });
  }
});

// REST API endpoint: Text-to-Speech synthesis (Proxied entirely to Python Core Engine)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = 'Zephyr' } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required for TTS synthesis" });
    }

    // Call the Python Core Engine
    const result = await runPythonLogic("tts", {
      text,
      voice
    });

    res.json(result);
  } catch (error: any) {
    console.error("Express TTS route error redirecting from python tts engine: ", error);
    res.status(500).json({ error: error.message || "Speech synthesis engine failure." });
  }
});

// Setup dev server with Vite or static paths
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    // Serve static files in dev mode
    app.use('/static', express.static(path.join(process.cwd(), 'static')));
    // Handle favicon requests
    app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('/static', express.static(path.join(process.cwd(), 'static')));
    // Handle favicon requests
    app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MediCore AI Node/Python hybrid bridge active over http://localhost:${PORT}`);
  });
}

startServer();
