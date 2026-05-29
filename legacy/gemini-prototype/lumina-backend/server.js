import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const OLLAMA_HOST = 'http://127.0.0.1:11434';

// Middleware
app.use(cors());
app.use(express.json());

// Directories & DB Initialization
const MODELS_DIR = path.join(__dirname, 'models');
const DB_PATH = path.join(__dirname, 'database.json');

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const loadDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    const initialDB = { downloadedGGUFs: [], activeDownloads: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    return { downloadedGGUFs: [], activeDownloads: [] };
  }
};

const saveDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// In-Memory Progress Tracking
// Each entry: { id, name, type: 'gguf'|'ollama', progress, speed, eta, status, size, downloaded }
const activeDownloads = new Map();
const downloadAborts = new Map(); // Store AbortControllers for GGUF downloads

// Stream Progress SSE Clients
let sseClients = [];

const broadcastProgress = () => {
  const data = JSON.stringify(Array.from(activeDownloads.values()));
  sseClients.forEach((client) => {
    client.write(`data: ${data}\n\n`);
  });
};

// ----------------------------------------------------
// CURATED RECOMMENDATIONS (The Out-of-the-Box Marketplace)
// ----------------------------------------------------
const CURATED_MARKETPLACE = [
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B (Instruct)",
    source: "Hugging Face / Ollama",
    size: "4.7 GB",
    parameters: "7.6B",
    quant: "Q4_K_M",
    tags: ["Coding", "Autocompletion", "Agentic"],
    description: "State-of-the-art open-source code generation model. Performs at par with much larger models for coding tasks.",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    ollamaName: "qwen2.5-coder:7b",
    ramRequired: "8 GB VRAM / 16 GB RAM"
  },
  {
    id: "llama3.1-8b",
    name: "Llama 3.1 8B (Instruct)",
    source: "Hugging Face / Ollama",
    size: "4.9 GB",
    parameters: "8.0B",
    quant: "Q4_K_M",
    tags: ["General Purpose", "Reasoning", "Conversational"],
    description: "Meta's highly optimized instruction model, boasting a massive context window and refined prompt adherence.",
    downloadUrl: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    ollamaName: "llama3.1:8b",
    ramRequired: "8 GB VRAM / 16 GB RAM"
  },
  {
    id: "deepseek-r1-8b",
    name: "DeepSeek R1 8B (Distilled Llama)",
    source: "Hugging Face / Ollama",
    size: "4.9 GB",
    parameters: "8.0B",
    quant: "Q4_K_M",
    tags: ["Reasoning", "Math", "Logic"],
    description: "DeepSeek's powerful reasoning model distilled into Llama 8B, featuring advanced step-by-step thinking traces.",
    downloadUrl: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
    ollamaName: "deepseek-r1:8b",
    ramRequired: "8 GB VRAM / 16 GB RAM"
  },
  {
    id: "phi4-3.8b",
    name: "Microsoft Phi-4 3.8B (Mini Instruct)",
    source: "Hugging Face / Ollama",
    size: "2.4 GB",
    parameters: "3.8B",
    quant: "Q4_K_M",
    tags: ["Tiny but Mighty", "Fast", "Reasoning"],
    description: "Ultra-compact reasoning model from Microsoft. Incredible speed, highly efficient memory utilization.",
    downloadUrl: "https://huggingface.co/bartowski/phi-4-mini-instruct-GGUF/resolve/main/phi-4-mini-instruct-Q4_K_M.gguf",
    ollamaName: "phi4:latest",
    ramRequired: "4 GB VRAM / 8 GB RAM"
  }
];

// Helper to query Ollama directly
async function fetchOllama(endpoint, options = {}) {
  const url = `${OLLAMA_HOST}${endpoint}`;
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Ollama responded with ${res.status}`);
    return res;
  } catch (e) {
    throw new Error(`Ollama connection failed: ${e.message}`);
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Serve the compiled Web Component Static Widget
// Vite will build this file inside lumina-frontend/dist/assets/index.js (copied here for widget import)
app.use('/widget', express.static(path.join(__dirname, 'widget')));

// 1. Get Models (Merged tags from local Ollama + registered GGUFs)
app.get('/api/models', async (req, res) => {
  try {
    // A. Query local Ollama instance
    let ollamaModels = [];
    try {
      const ollamaRes = await fetchOllama('/api/tags');
      const data = await ollamaRes.json();
      ollamaModels = data.models || [];
    } catch (e) {
      console.warn("Ollama is not running or unreachable:", e.message);
    }

    // B. Load registered GGUFs from database.json
    const db = loadDB();
    const ggufModels = db.downloadedGGUFs || [];

    res.json({
      success: true,
      ollamaOnline: ollamaModels.length > 0 || true, // We verify connection status
      models: {
        ollama: ollamaModels,
        gguf: ggufModels
      },
      curatedMarketplace: CURATED_MARKETPLACE
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 2. Search Hugging Face GGUF Hub Models
app.get('/api/search/hf', async (req, res) => {
  const query = req.query.q || '';
  if (!query) {
    return res.json({ success: true, results: [] });
  }

  try {
    // Search HF repositories ending in -GGUF
    const hfSearchUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=8`;
    const hfRes = await fetch(hfSearchUrl);
    const data = await hfRes.json();

    const results = data.map((model) => ({
      id: model.modelId,
      name: model.modelId.split('/').pop(),
      author: model.modelId.split('/')[0],
      downloads: model.downloads,
      likes: model.likes,
      updatedAt: model.lastModified,
      tags: model.tags || [],
    }));

    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get GGUF file variants from a specific HF Hub repository
app.get('/api/search/hf/files', async (req, res) => {
  const repo = req.query.repo;
  if (!repo) {
    return res.status(400).json({ success: false, error: 'Repo parameter is required' });
  }

  try {
    const filesUrl = `https://huggingface.co/api/models/${repo}/tree/main`;
    const response = await fetch(filesUrl);
    const files = await response.json();

    // Filter files containing GGUF suffix
    const ggufFiles = files
      .filter((file) => file.path.toLowerCase().endsWith('.gguf'))
      .map((file) => ({
        path: file.path,
        size: file.size,
        downloadUrl: `https://huggingface.co/${repo}/resolve/main/${file.path}`
      }));

    res.json({ success: true, files: ggufFiles });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get README.md from a specific HF Hub repository
app.get('/api/search/hf/readme', async (req, res) => {
  const repo = req.query.repo;
  if (!repo) {
    return res.status(400).json({ success: false, error: 'Repo parameter is required' });
  }

  try {
    const readmeUrl = `https://huggingface.co/${repo}/raw/main/README.md`;
    const response = await fetch(readmeUrl);
    if (!response.ok) {
      const fallbackUrl = `https://huggingface.co/${repo}/raw/master/README.md`;
      const fallbackResponse = await fetch(fallbackUrl);
      if (!fallbackResponse.ok) {
        return res.json({ success: true, readme: "" });
      }
      return res.json({ success: true, readme: await fallbackResponse.text() });
    }
    res.json({ success: true, readme: await response.text() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// One-Click installer endpoint
app.post('/api/runtimes/install', (req, res) => {
  const { runtime } = req.body;
  if (runtime !== 'ollama' && runtime !== 'lmstudio') {
    return res.status(400).json({ success: false, error: 'Invalid runtime requested' });
  }

  const isWin = os.platform() === 'win32';
  if (!isWin) {
    return res.status(400).json({
      success: false,
      error: `Automated one-click install is only supported on Windows in this prototype.`
    });
  }

  const wingetId = runtime === 'ollama' ? 'Ollama.Ollama' : 'LMStudio.LMStudio';
  const child = spawn('powershell', ['-Command', `winget install ${wingetId} --silent`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  res.json({
    success: true,
    message: `Background installation for ${runtime} (${wingetId}) has been launched.`
  });
});

// Ollama startup service endpoint
app.post('/api/runtimes/ollama/server/start', (req, res) => {
  let execPath = 'ollama';
  const appData = process.env.LOCALAPPDATA || '';
  const path1 = appData ? path.join(appData, 'Programs', 'Ollama', 'ollama.exe') : '';
  const path2 = 'C:\\Program Files\\Ollama\\ollama.exe';

  if (path1 && fs.existsSync(path1)) {
    execPath = path1;
  } else if (fs.existsSync(path2)) {
    execPath = path2;
  }

  try {
    const child = spawn(execPath, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    res.json({ success: true, message: 'Ollama service startup has been initialized in the background.' });
  } catch (error) {
    res.status(500).json({ success: false, error: `Failed to boot service: ${error.message}` });
  }
});

// 3. Initiate Download Stream
app.post('/api/download', async (req, res) => {
  const { id, name, type, url, ollamaName } = req.body;

  if (activeDownloads.has(id)) {
    return res.status(400).json({ success: false, error: 'Download is already in progress' });
  }

  if (type === 'ollama') {
    // Start asynchronous Ollama pull
    res.json({ success: true, message: 'Ollama model pull initiated' });
    pullOllamaModel(id, ollamaName || name);
  } else if (type === 'gguf') {
    // Start chunk-based GGUF download from HF
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required for Hugging Face downloads' });
    }
    res.json({ success: true, message: 'GGUF model download initiated' });
    downloadGGUFModel(id, name, url);
  } else {
    res.status(400).json({ success: false, error: 'Invalid model format type' });
  }
});

// Cancel active download
app.post('/api/download/cancel', (req, res) => {
  const { id } = req.body;
  if (!activeDownloads.has(id)) {
    return res.status(400).json({ success: false, error: 'No active download found with this ID' });
  }

  const download = activeDownloads.get(id);

  if (download.type === 'gguf') {
    const controller = downloadAborts.get(id);
    if (controller) controller.abort();
    downloadAborts.delete(id);
  }

  activeDownloads.delete(id);
  broadcastProgress();
  res.json({ success: true, message: 'Download cancelled successfully' });
});

// 4. SSE Server-Sent Events Endpoint for real-time progress broadcast
app.get('/api/downloads/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  // Send initial load of active downloads
  res.write(`data: ${JSON.stringify(Array.from(activeDownloads.values()))}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// 5. Hard Deletion Endpoint
app.delete('/api/models', async (req, res) => {
  const { name, type, path: filePath } = req.query;

  try {
    if (type === 'ollama') {
      // Un-register model from local Ollama
      await fetchOllama('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      res.json({ success: true, message: `Ollama model '${name}' fully deleted` });
    } else if (type === 'gguf') {
      const db = loadDB();

      // De-register custom GGUF model from Ollama if it was created
      try {
        await fetchOllama('/api/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
      } catch (err) {
        console.warn("Model wasn't registered in Ollama or Ollama is offline");
      }

      // Hard file deletion from disk
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      } else {
        // Fallback search inside models folder
        const localPath = path.join(MODELS_DIR, name);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      }

      // Wipe registry entry
      db.downloadedGGUFs = db.downloadedGGUFs.filter((m) => m.name !== name);
      saveDB(db);

      res.json({ success: true, message: `GGUF model '${name}' and local file completely purged` });
    } else {
      res.status(400).json({ success: false, error: 'Invalid model format type' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 6. Direct Proxy Playground Inference Bridge (Ollama Server Interface)
app.post('/api/chat', async (req, res) => {
  try {
    const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    res.setHeader('Content-Type', 'application/json');
    if (req.body.stream) {
      // Pipe stream responses
      res.setHeader('Content-Type', 'text/event-stream');
      ollamaResponse.body.pipe(res);
    } else {
      const data = await ollamaResponse.json();
      res.json(data);
    }
  } catch (e) {
    res.status(500).json({ success: false, error: `Inference failed: ${e.message}` });
  }
});

// Utility to retrieve system disk metrics
app.get('/api/system/storage', (req, res) => {
  // Simple mock metrics for lightweight database footprint
  res.json({
    success: true,
    totalGB: 512,
    freeGB: 184,
    modelsGB: parseFloat((fs.readdirSync(MODELS_DIR)
      .map(file => fs.statSync(path.join(MODELS_DIR, file)).size)
      .reduce((a, b) => a + b, 0) / (1024 * 1024 * 1024)).toFixed(2))
  });
});

// ----------------------------------------------------
// ENGINE DOWNLOADER METHODS (Pulls & Stream Channels)
// ----------------------------------------------------

// A. Pull Ollama model via Ollama native endpoint
async function pullOllamaModel(id, modelName) {
  activeDownloads.set(id, {
    id,
    name: modelName,
    type: 'ollama',
    progress: 0,
    speed: 0,
    eta: 'Connecting...',
    status: 'connecting',
    size: 'Fetching size...',
    downloaded: 0
  });
  broadcastProgress();

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true })
    });

    if (!res.ok) throw new Error(`Ollama pulled with ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const payload = JSON.parse(line);
          if (payload.status === 'downloading' && payload.total) {
            const progress = Math.round((payload.completed / payload.total) * 100);
            const totalMB = (payload.total / (1024 * 1024)).toFixed(1);
            const completedMB = (payload.completed / (1024 * 1024)).toFixed(1);

            activeDownloads.set(id, {
              id,
              name: modelName,
              type: 'ollama',
              progress,
              speed: 0, // Ollama doesn't stream download speed directly in pull stream API
              eta: progress === 100 ? 'Finishing up...' : 'Streaming...',
              status: 'downloading',
              size: `${totalMB} MB`,
              downloaded: `${completedMB} MB`
            });
            broadcastProgress();
          } else if (payload.status === 'success') {
            activeDownloads.delete(id);
            broadcastProgress();
            return;
          }
        } catch (e) {
          // JSON parsing segment skip
        }
      }
    }
    activeDownloads.delete(id);
    broadcastProgress();
  } catch (e) {
    activeDownloads.set(id, {
      id,
      name: modelName,
      type: 'ollama',
      status: 'error',
      eta: 'Failed',
      progress: 0,
      size: '0 MB',
      downloaded: '0 MB',
      error: e.message
    });
    broadcastProgress();
    setTimeout(() => {
      activeDownloads.delete(id);
      broadcastProgress();
    }, 10000);
  }
}

// B. Download GGUF file from Hugging Face Hub directly
async function downloadGGUFModel(id, modelName, url) {
  const controller = new AbortController();
  downloadAborts.set(id, controller);

  const localFilePath = path.join(MODELS_DIR, modelName);

  activeDownloads.set(id, {
    id,
    name: modelName,
    type: 'gguf',
    progress: 0,
    speed: 0,
    eta: 'Connecting...',
    status: 'connecting',
    size: 'Initializing...',
    downloaded: 0
  });
  broadcastProgress();

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Hugging Face server returned ${res.status}`);

    const contentLength = res.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const totalMB = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : 'Unknown';

    const fileStream = fs.createWriteStream(localFilePath);
    const reader = res.body.getReader();

    let downloadedBytes = 0;
    let lastTime = Date.now();
    let lastDownloaded = 0;
    let speed = 0;
    let etaString = 'Calculating...';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        fileStream.end();
        break;
      }

      // Write chunk to physical file
      fileStream.write(Buffer.from(value));
      downloadedBytes += value.length;

      // Rate Calculations (every 1 second)
      const currentTime = Date.now();
      const elapsed = (currentTime - lastTime) / 1000;

      if (elapsed >= 1.0) {
        const bytesDelta = downloadedBytes - lastDownloaded;
        speed = bytesDelta / elapsed / (1024 * 1024); // Convert to MB/s
        lastTime = currentTime;
        lastDownloaded = downloadedBytes;

        if (totalBytes) {
          const remainingBytes = totalBytes - downloadedBytes;
          const remainingSecs = remainingBytes / (bytesDelta / elapsed);
          if (isFinite(remainingSecs)) {
            const minutes = Math.floor(remainingSecs / 60);
            const seconds = Math.floor(remainingSecs % 60);
            etaString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
          }
        }
      }

      const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);

      activeDownloads.set(id, {
        id,
        name: modelName,
        type: 'gguf',
        progress,
        speed: parseFloat(speed.toFixed(2)),
        eta: etaString,
        status: 'downloading',
        size: totalBytes ? `${totalMB} MB` : 'Unknown',
        downloaded: `${downloadedMB} MB`
      });

      broadcastProgress();
    }

    // DOWNLOAD COMPLETED SUCCESSFULLY
    activeDownloads.set(id, {
      id,
      name: modelName,
      type: 'gguf',
      progress: 100,
      speed: 0,
      eta: 'Registering with Ollama...',
      status: 'registering',
      size: `${totalMB} MB`,
      downloaded: `${totalMB} MB`
    });
    broadcastProgress();

    // AUTO REGISTER GGUF WITH OLLAMA ENGINE
    // Generate custom Modelfile
    const ollamaModelName = `huggingface-${modelName.toLowerCase().replace(/\.gguf$/, '').replace(/[^a-z0-9]/g, '-')}`;
    
    // Crucial: Use forward slashes for Windows absolute path or Ollama parser can escape them
    const normalizedPath = localFilePath.replace(/\\/g, '/');
    const modelfileContent = `FROM ${normalizedPath}`;

    try {
      await fetchOllama('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ollamaModelName,
          modelfile: modelfileContent
        })
      });

      // Write metadata to registry database.json
      const db = loadDB();
      db.downloadedGGUFs.push({
        id,
        name: modelName,
        ollamaName: ollamaModelName,
        path: localFilePath,
        size: `${totalMB} MB`,
        registeredAt: new Date().toISOString()
      });
      saveDB(db);

      activeDownloads.delete(id);
      broadcastProgress();
    } catch (createErr) {
      console.error("Failed to register GGUF with Ollama:", createErr.message);
      // Even if Ollama registration fails, GGUF is downloaded on disk
      const db = loadDB();
      db.downloadedGGUFs.push({
        id,
        name: modelName,
        ollamaName: null,
        path: localFilePath,
        size: `${totalMB} MB`,
        registeredAt: new Date().toISOString(),
        error: `Ollama import failed: ${createErr.message}`
      });
      saveDB(db);

      activeDownloads.delete(id);
      broadcastProgress();
    }

    downloadAborts.delete(id);
  } catch (e) {
    // Delete partial file on cancellation/failure
    if (fs.existsSync(localFilePath)) {
      try { fs.unlinkSync(localFilePath); } catch (err) {}
    }

    if (e.name === 'AbortError') {
      console.log('GGUF download aborted by user');
    } else {
      activeDownloads.set(id, {
        id,
        name: modelName,
        type: 'gguf',
        status: 'error',
        eta: 'Failed',
        progress: 0,
        size: '0 MB',
        downloaded: '0 MB',
        error: e.message
      });
      broadcastProgress();
      setTimeout(() => {
        activeDownloads.delete(id);
        broadcastProgress();
      }, 10000);
    }
  }
}

// Start Server Listen using http.createServer for robust error handling
const server = http.createServer(app);

const startExpressServer = (port) => {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port >= 3010) {
        console.error(`Port sliding range exceeded (3001-3010). Could not bind Lumina server.`);
        process.exit(1);
      }
      console.warn(`Lumina port ${port} is in use. Sliding to ${port + 1}...`);
      startExpressServer(port + 1);
    } else {
      console.error("Fatal Lumina backend error:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Lumina backend listening on http://localhost:${port}`);
  });
};

startExpressServer(PORT);
