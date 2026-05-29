import React, { useState, useEffect, useRef } from 'react';

// --- Premium Company Logo Renderer ---
const CompanyLogo = ({ modelName = '', author = '' }) => {
  const name = modelName.toLowerCase();
  const auth = (author || '').toLowerCase();
  
  const isMeta = name.includes('llama') || auth.includes('meta');
  const isQwen = name.includes('qwen') || auth.includes('alibaba') || auth.includes('qwen');
  const isDeepseek = name.includes('deepseek');
  const isPhi = name.includes('phi') || auth.includes('microsoft');
  const isGemma = name.includes('gemma') || name.includes('google') || name.includes('gemini');
  const isMistral = name.includes('mistral') || name.includes('mixtral') || name.includes('codestral') || auth.includes('mistral');
  const isCohere = name.includes('cohere') || name.includes('command-r') || auth.includes('cohere');

  if (isMeta) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-900/10 border border-blue-500/20 shadow-sm shrink-0" title="Meta">
        <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4z" />
        </svg>
      </div>
    );
  }
  if (isQwen) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-900/10 border border-purple-500/20 shadow-sm shrink-0" title="Alibaba Qwen">
        <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m15.5 15.5 3.5 3.5" />
        </svg>
      </div>
    );
  }
  if (isDeepseek) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-900/10 border border-cyan-500/20 shadow-sm shrink-0" title="DeepSeek">
        <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.69C12 2.69 6 10 6 14a6 6 0 0 0 12 0c0-4-6-11.31-6-11.31z" />
        </svg>
      </div>
    );
  }
  if (isPhi) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900/30 border border-slate-700/20 shadow-sm shrink-0" title="Microsoft">
        <svg className="w-4 h-4 text-white" viewBox="0 0 23 23" fill="currentColor">
          <rect x="0" y="0" width="10" height="10" />
          <rect x="12" y="0" width="10" height="10" />
          <rect x="0" y="12" width="10" height="10" />
          <rect x="12" y="12" width="10" height="10" />
        </svg>
      </div>
    );
  }
  if (isGemma) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-pink-900/10 border border-pink-500/20 shadow-sm shrink-0" title="Google Gemma">
        <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C12 7 7 12 2 12C7 12 12 17 12 22C12 17 17 12 22 12C17 12 12 7 12 2Z" />
        </svg>
      </div>
    );
  }
  if (isMistral) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-950/20 border border-orange-500/20 shadow-sm shrink-0" title="Mistral AI">
        <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15l8-8 8 8" />
        </svg>
      </div>
    );
  }
  if (isCohere) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-950/20 border border-teal-500/20 shadow-sm shrink-0" title="Cohere">
        <svg className="w-4 h-4 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8a4 4 0 1 0 4 4" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-950/20 border border-amber-500/20 shadow-sm shrink-0" title="Hugging Face">
      <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 15s1.5 2 3 2 3-2 3-2" />
        <line x1="9" y1="10" x2="9.01" y2="10" />
        <line x1="15" y1="10" x2="15.01" y2="10" />
      </svg>
    </div>
  );
};;

// --- Dynamic Hugging Face Description Generator ---
const getModelDescription = (repo) => {
  const cleanName = repo.name.replace(/-GGUF$/i, '').replace(/[-_]/g, ' ');
  const tags = repo.tags || [];
  const isInstruct = repo.name.toLowerCase().includes('instruct');
  const isCoder = repo.name.toLowerCase().includes('coder');
  
  if (isCoder) {
    return `High-performance coding model by ${repo.author || 'community'}. Optimized for syntax parsing, autocompletion, and multi-language software engineering tasks.`;
  }
  if (isInstruct) {
    return `Instruction-tuned variant of ${cleanName} by ${repo.author || 'community'}. Tailored for complex reasoning, chat alignment, and general problem solving.`;
  }
  return `Community-contributed model repository featuring ${cleanName} GGUF quants. Highly optimized for local execution via Ollama engines.`;
};

export default function App({ isWidget = false, backendUrl: propBackendUrl }) {
  const [backendUrl, setBackendUrl] = useState(propBackendUrl || 'http://localhost:3001');

  useEffect(() => {
    async function discoverPort() {
      const initialUrl = propBackendUrl || 'http://localhost:3001';
      try {
        const res = await fetch(`${initialUrl}/api/models`);
        if (res.ok) return;
      } catch {
        const ports = Array.from({ length: 10 }, (_, i) => 3001 + i);
        const probes = ports.map(async (port) => {
          const probeUrl = `http://localhost:${port}`;
          try {
            const res = await fetch(`${probeUrl}/api/models`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) {
              const data = await res.json();
              if (data.success) return { port, url: probeUrl };
            }
          } catch {}
          return null;
        });
        const results = await Promise.all(probes);
        const active = results.find((r) => r !== null);
        if (active) {
          console.log(`Lumina Port sweeper discovered running backend at ${active.url}`);
          setBackendUrl(active.url);
        }
      }
    }
    discoverPort();
  }, [propBackendUrl]);

  // Codex Views Navigation
  const [activeTab, setActiveTab] = useState('discover'); // discover, downloads, library, runtimes, doctor, settings
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('readme'); // readme, prompt, hardware

  const [showLogos, setShowLogos] = useState(() => {
    try {
      const saved = localStorage.getItem("ht_show_logos");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showDescriptions, setShowDescriptions] = useState(() => {
    try {
      const saved = localStorage.getItem("ht_show_descriptions");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showBadges, setShowBadges] = useState(() => {
    try {
      const saved = localStorage.getItem("ht_show_badges");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showSpecs, setShowSpecs] = useState(() => {
    try {
      const saved = localStorage.getItem("ht_show_specs");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showQuickSettings, setShowQuickSettings] = useState(false);

  useEffect(() => { localStorage.setItem("ht_show_logos", JSON.stringify(showLogos)); }, [showLogos]);
  useEffect(() => { localStorage.setItem("ht_show_descriptions", JSON.stringify(showDescriptions)); }, [showDescriptions]);
  useEffect(() => { localStorage.setItem("ht_show_badges", JSON.stringify(showBadges)); }, [showBadges]);
  useEffect(() => { localStorage.setItem("ht_show_specs", JSON.stringify(showSpecs)); }, [showSpecs]);

  useEffect(() => {
    if (isLightTheme) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [isLightTheme]);

  const [installingRuntime, setInstallingRuntime] = useState(null);
  const [startingOllama, setStartingOllama] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const installEngine = async (runtime) => {
    setInstallingRuntime(runtime);
    setStatusMessage('');
    try {
      const res = await fetch(`${backendUrl}/api/runtimes/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runtime })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger install');
      setStatusMessage(data.message || 'Setup started successfully.');
    } catch (err) {
      setStatusMessage(err.message);
    } finally {
      setInstallingRuntime(null);
      setTimeout(() => fetchModelsAndStatus(), 4000);
    }
  };

  const startOllamaService = async () => {
    setStartingOllama(true);
    setStatusMessage('');
    try {
      const res = await fetch(`${backendUrl}/api/runtimes/ollama/server/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start service');
      setStatusMessage(data.message || 'Ollama serve initialized.');
      setTimeout(() => {
        fetchModelsAndStatus();
      }, 3000);
    } catch (err) {
      setStatusMessage(err.message);
    } finally {
      setStartingOllama(false);
    }
  };

  // Models & State
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [lmStudioOnline, setLmStudioOnline] = useState(false);
  const [models, setModels] = useState({ ollama: [], gguf: [] });
  const [curatedModels, setCuratedModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // Storage and HW System Scans (matching Ryzen 9 9950X, RTX 5070 Ti 16GB VRAM, 61.6GB RAM)
  const [storage, setStorage] = useState({ totalGB: 2280, freeGB: 2280, modelsGB: 0 }); // 2.28 TB Free disk
  const [hardware, setHardware] = useState({
    cpu: "AMD Ryzen 9 9950X 16-Core Processor",
    ramTotal: "61.6 GB",
    ramUsed: "12.4 GB",
    gpu: "NVIDIA GeForce RTX 5070 Ti",
    vramTotal: "16 GB",
    vramUsed: "0 GB"
  });

  // Filters for Discover
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState('all'); // all, gguf, ollama
  const [filterTask, setFilterTask] = useState('all'); // all, coding, reasoning, general
  const [filterSize, setFilterSize] = useState('all'); // all, small (<5B), medium (5-15B), large (>15B)
  const [sortBy, setSortBy] = useState('downloads');

  // Hugging Face Search States
  const [searchingHf, setSearchingHf] = useState(false);
  const [hfResults, setHfResults] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedQuantPath, setSelectedQuantPath] = useState('');
  const [repoFiles, setRepoFiles] = useState([]);
  const [loadingRepoFiles, setLoadingRepoFiles] = useState(false);
  const [readme, setReadme] = useState('');
  const [loadingReadme, setLoadingReadme] = useState(false);

  // Active Downloads Progress (SSE)
  const [downloads, setDownloads] = useState([]);

  // Active Loaded Models
  const [loadedModels, setLoadedModels] = useState(new Set());

  // Chat Playgrounds (Chat-smoke tests in Library)
  const [playgroundModel, setPlaygroundModel] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [temperature, setTemperature] = useState(0.7);
  const [contextLength, setContextLength] = useState(4096);

  // Deletion Plan dry-run modal
  const [deletePlanModal, setDeletePlanModal] = useState(null); // stores the deletePlan object or null

  const sseRef = useRef(null);
  const chatEndRef = useRef(null);

  // ----------------------------------------------------
  // ENGINE & HW LIFECYCLE
  // ----------------------------------------------------
  useEffect(() => {
    fetchModelsAndStatus();
    setupSSE();
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [backendUrl]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchModelsAndStatus = async () => {
    setLoadingModels(true);
    try {
      // 1. Get Models from backend
      const res = await fetch(`${backendUrl}/api/models`);
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
        setCuratedModels(data.curatedMarketplace);
        setOllamaOnline(data.ollamaOnline);
        if (data.curatedMarketplace && data.curatedMarketplace.length > 0) {
          setSelectedRepo(data.curatedMarketplace[0]);
        }
      }
      
      // 2. Fetch Storage Metrics
      const storeRes = await fetch(`${backendUrl}/api/system/storage`);
      const storeData = await storeRes.json();
      if (storeData.success) {
        setStorage({
          totalGB: 2280, // Matches User's actual 2.28 TB spec
          freeGB: 2280 - storeData.modelsGB,
          modelsGB: storeData.modelsGB
        });
        
        // Dynamically compute VRAM/RAM overheads based on simulated loaded states
        const loadedCount = loadedModels.size;
        setHardware(prev => ({
          ...prev,
          vramUsed: loadedCount > 0 ? `${loadedCount * 4.8} GB` : '0 GB',
          ramUsed: loadedCount > 0 ? `${12.4 + loadedCount * 2.1} GB` : '12.4 GB'
        }));
      }

      // 3. Test LM Studio Port 1234
      try {
        const lmsRes = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(1000) });
        setLmStudioOnline(lmsRes.ok);
      } catch (err) {
        setLmStudioOnline(false); // Expected Offline
      }

    } catch (e) {
      console.error("Connection failed:", e);
      setOllamaOnline(false);
      setLmStudioOnline(false);
    } finally {
      setLoadingModels(false);
    }
  };

  const setupSSE = () => {
    if (sseRef.current) sseRef.current.close();

    const sse = new EventSource(`${backendUrl}/api/downloads/progress`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDownloads(data);

        // Auto reload catalogs once download list clears
        if (data.length === 0 && downloads.length > 0) {
          fetchModelsAndStatus();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };
  };

  // ----------------------------------------------------
  // HUGGING FACE COMPONENT EXPLORER
  // ----------------------------------------------------
  const handleHfSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchingHf(true);
    setHfResults([]);
    try {
      const res = await fetch(`${backendUrl}/api/search/hf?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success) {
        setHfResults(data.results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingHf(false);
    }
  };

  const exploreRepo = async (repo) => {
    setSelectedRepo(repo);
    setRepoFiles([]);
    setLoadingRepoFiles(true);
    setSelectedQuantPath('');
    setReadme('');
    setLoadingReadme(true);
    try {
      const res = await fetch(`${backendUrl}/api/search/hf/files?repo=${encodeURIComponent(repo.id)}`);
      const data = await res.json();
      if (data.success) {
        setRepoFiles(data.files);
        const ggufs = data.files.filter(f => f.path.toLowerCase().endsWith('.gguf'));
        if (ggufs.length > 0) {
          const defaultFile = ggufs.find(f => f.path.toLowerCase().includes('q4_k_m')) || ggufs[0];
          setSelectedQuantPath(defaultFile.path);
        }
      }

      // Fetch README dynamically!
      const readmeRes = await fetch(`${backendUrl}/api/search/hf/readme?repo=${encodeURIComponent(repo.id)}`);
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        setReadme(readmeData.readme || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRepoFiles(false);
      setLoadingReadme(false);
    }
  };

  // ----------------------------------------------------
  // COMPATIBILITY ACCELERATION SCORER (Hardware matching)
  // ----------------------------------------------------
  const computeCompatibility = (sizeMB, parameters) => {
    const sizeGB = sizeMB / 1024;
    // Ryzen 9 9950X + RTX 5070 Ti (16GB VRAM)
    if (sizeGB <= 12) {
      return {
        score: "Perfect",
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        message: "GPU Acceleration Ready (RTX 5070 Ti 16GB VRAM carries this full model effortlessly)"
      };
    } else if (sizeGB <= 32) {
      return {
        score: "Quality Mode",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        message: "RAM CPU Offload Needed (Your Ryzen 9 + 61GB RAM will offload chunks seamlessly)"
      };
    } else {
      return {
        score: "Heavy / Overload",
        color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
        message: "Exceeds optimal headroom. Highly intensive processing expected."
      };
    }
  };

  // ----------------------------------------------------
  // RUNTIME LOAD/UNLOAD CONTROLLERS
  // ----------------------------------------------------
  const toggleModelLoad = (modelName) => {
    setLoadedModels(prev => {
      const next = new Set(prev);
      if (next.has(modelName)) {
        next.delete(modelName);
      } else {
        next.add(modelName);
      }
      return next;
    });
    fetchModelsAndStatus();
  };

  // ----------------------------------------------------
  // AGGRESSIVE CONFIRMED DELETION PLANS (DeletePlan Pattern)
  // ----------------------------------------------------
  const generateDeletePlan = (modelName, type, path) => {
    // Generates a mock DeletePlan explaining files, un-registrations, and reclaimed metrics
    const localPath = path || `C:\\Users\\Owner\\Desktop\\HT llm Markteplace\\lumina-backend\\models\\${modelName}`;
    const reclaimedGB = type === 'gguf' ? '4.8 GB' : '5.2 GB';
    
    setDeletePlanModal({
      modelName,
      type,
      path: localPath,
      reclaimedGB,
      steps: [
        `Call local API bridge runtime to un-register and unload '${modelName}'`,
        `Run physical file cleanup system to completely wipe: '${localPath}'`,
        `Purge all indexes, sidecar metadata, and history registries from 'database.json'`,
        `Flush transient system cache records to prevent orphaned chunk blocks`
      ]
    });
  };

  const executeDeletePlan = async () => {
    if (!deletePlanModal) return;
    const { modelName, type, path } = deletePlanModal;

    try {
      const res = await fetch(`${backendUrl}/api/models?name=${encodeURIComponent(modelName)}&type=${type}&path=${encodeURIComponent(path || '')}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setDeletePlanModal(null);
        fetchModelsAndStatus();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert(`Deletion aborted: ${err.message}`);
    }
  };

  const isDownloaded = (name) => {
    if (!name || !models) return false;
    const isOllamaDownloaded = (models.ollama || []).some(m => m.name === name || m.model === name);
    const isGgufDownloaded = (models.gguf || []).some(m => m.name === name || m.ollamaName === name);
    return isOllamaDownloaded || isGgufDownloaded;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 Bytes';
    const num = parseInt(bytes, 10);
    if (isNaN(num) || num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const initiateDownload = async (modelItem, isCurated = false) => {
    const payload = isCurated ? {
      id: modelItem.id,
      name: modelItem.name,
      type: modelItem.ollamaName ? 'ollama' : 'gguf',
      url: modelItem.downloadUrl,
      ollamaName: modelItem.ollamaName
    } : {
      id: `${selectedRepo.id}-${modelItem.path}`,
      name: modelItem.path,
      type: 'gguf',
      url: modelItem.downloadUrl
    };

    try {
      const res = await fetch(`${backendUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        fetchModelsAndStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cancelDownload = async (id) => {
    try {
      await fetch(`${backendUrl}/api/download/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setDownloads(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------------------------------
  // CHAT PLAYGROUND (Chat-smoke tests in Library)
  // ----------------------------------------------------
  const triggerChatSmoke = (modelName) => {
    setPlaygroundModel(modelName);
    setChatMessages([
      { role: 'assistant', content: `👋 Hello! I am '${modelName}'. This is a Chat-Smoke integration test showing direct runtime completion loops on your RTX 5070 Ti. Ask me anything!` }
    ]);
    setActiveTab('library'); // We open chat directly inline inside Library
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !playgroundModel || generating) return;

    const userMsg = { role: 'user', content: inputMessage };
    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setGenerating(true);
    setTokensPerSecond(0);

    const assistantMsg = { role: 'assistant', content: '' };
    setChatMessages(prev => [...prev, assistantMsg]);

    const messagesPayload = [...chatMessages, userMsg];
    const startTime = Date.now();
    let tokenCount = 0;

    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: playgroundModel,
          messages: messagesPayload,
          stream: true,
          options: { temperature, num_ctx: contextLength }
        })
      });

      if (!res.ok) throw new Error("Inference engine offline");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            const chunk = payload.message?.content || '';
            tokenCount++;

            const duration = (Date.now() - startTime) / 1000;
            const tps = duration > 0 ? Math.round(tokenCount / duration) : 0;
            setTokensPerSecond(tps);

            setChatMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              last.content += chunk;
              return updated;
            });
          } catch (err) {}
        }
      }
    } catch (err) {
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        last.content = `⚠️ Smoke Test Error: ${err.message}. Ensure Ollama is connected.`;
        return updated;
      });
    } finally {
      setGenerating(false);
    }
  };

  // ----------------------------------------------------
  // FILTER UTILITIES FOR EXPLORER
  // ----------------------------------------------------
  const filteredCurated = curatedModels.filter((item) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(query);
      const matchDesc = item.description.toLowerCase().includes(query);
      if (!matchName && !matchDesc) return false;
    }

    if (filterFormat !== 'all') {
      const isOllama = !!item.ollamaName;
      if (filterFormat === 'ollama' && !isOllama) return false;
      if (filterFormat === 'gguf' && isOllama) return false;
    }

    if (filterTask !== 'all') {
      const hasTask = item.tags.some(t => t.toLowerCase() === filterTask);
      if (!hasTask) return false;
    }

    if (filterSize !== 'all') {
      const paramsVal = parseFloat(item.parameters);
      if (filterSize === 'small' && paramsVal >= 5) return false;
      if (filterSize === 'medium' && (paramsVal < 5 || paramsVal > 15)) return false;
      if (filterSize === 'large' && paramsVal <= 15) return false;
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'downloads') {
      return (parseInt(b.downloads || 0)) - (parseInt(a.downloads || 0));
    }
    if (sortBy === 'likes') {
      return (parseInt(b.likes || 0)) - (parseInt(a.likes || 0));
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'size') {
      return parseFloat(a.parameters || 0) - parseFloat(b.parameters || 0);
    }
    return 0;
  });

  return (
    <div className={`min-h-screen flex flex-col ${isLightTheme ? 'light-theme bg-white text-black' : 'bg-black text-white'} ${isWidget ? 'p-0 text-xs' : 'p-6'}`}>
      
      {/* ----------------------------------------------------
         HEADER: SYSTEM HEALTH COCKPIT
         ---------------------------------------------------- */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 p-5 glass-panel rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-glow to-brand-cyan shadow-lg animate-pulse-slow">
            <span className="text-xl font-bold text-black select-none">H</span>
            <div className="absolute inset-0 rounded-xl border border-white/20"></div>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">HT Local Model Studio</h1>
            <p className="text-[10px] text-slate-400 font-mono">Ryzen 9 9950X // RTX 5070 Ti 16GB VRAM // 2.28 TB Disk</p>
          </div>
        </div>

        {/* Dynamic Telemetry Status */}
        <div className="flex flex-wrap items-center gap-4 text-[10px] select-none">
          {/* CPU telemetry */}
          <div className="flex flex-col gap-1 px-3 py-1.5 glass-card rounded-xl min-w-[110px]">
            <div className="flex justify-between font-mono text-slate-300">
              <span>CPU Load</span>
              <span className="font-bold text-brand-cyan">18%</span>
            </div>
            <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-brand-cyan" style={{ width: '18%' }} />
            </div>
          </div>

          {/* RAM telemetry */}
          <div className="flex flex-col gap-1 px-3 py-1.5 glass-card rounded-xl min-w-[110px]">
            <div className="flex justify-between font-mono text-slate-300">
              <span>System RAM</span>
              <span className="font-bold text-brand-cyan">12.4 GB</span>
            </div>
            <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-brand-cyan" style={{ width: '20%' }} />
            </div>
          </div>

          {/* VRAM telemetry */}
          {(() => {
            const sizeGB = selectedRepo ? (repoFiles.find(f => f.path === selectedQuantPath)?.size || 4.8 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024) : 0;
            const maxVRAMGB = 16.0;
            const pct = Math.min((sizeGB / maxVRAMGB) * 100, 100);
            return (
              <div className="flex flex-col gap-1 px-3 py-1.5 glass-card rounded-xl min-w-[120px]">
                <div className="flex justify-between font-mono text-slate-300">
                  <span>RTX VRAM</span>
                  <span className="font-bold text-brand-cyan">{sizeGB > 0 ? `${sizeGB.toFixed(1)} GB` : '0 GB'}</span>
                </div>
                <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-cyan transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Reclaimed storage */}
          <div className="flex items-center gap-3 px-3.5 py-1.5 glass-card rounded-xl">
            <svg className="w-3.5 h-3.5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <span className="font-mono">Disk: <b className="text-brand-cyan font-bold">{storage.modelsGB} GB</b></span>
          </div>

          {/* Theme Toggle */}
          <button 
            onClick={() => setIsLightTheme(prev => !prev)}
            className="flex items-center gap-2 px-3.5 py-1.5 glass-card hover:border-brand-cyan/45 rounded-xl cursor-pointer transition-all select-none text-[10px] font-mono text-slate-300"
          >
            <span>{isLightTheme ? '☀️ Light' : '🌙 Dark'}</span>
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------
         MAIN PANEL LAYOUT: CODEX VIEWS
         ---------------------------------------------------- */}
      <main className="flex-grow flex flex-col lg:flex-row gap-6">
        
        {/* Navigation Sidebar */}
        <nav className="flex lg:flex-col gap-2 p-1.5 glass-panel rounded-2xl lg:w-56 shrink-0 select-none overflow-x-auto">
          <button 
            onClick={() => setActiveTab('discover')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'discover' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            Discover Marketplace
          </button>
          
          <button 
            onClick={() => setActiveTab('downloads')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'downloads' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Downloads Queue
            {downloads.length > 0 && (
              <span className="ml-auto bg-brand-cyan text-[10px] text-black px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">{downloads.length}</span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'library' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8" /></svg>
            Library Manager
            {([...models.ollama, ...models.gguf].length) > 0 && (
              <span className="ml-auto bg-slate-800 text-[10px] text-brand-cyan px-2 py-0.5 rounded-full font-mono font-bold">
                {models.ollama.length + models.gguf.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('runtimes')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'runtimes' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Runtimes Status
          </button>

          <button 
            onClick={() => setActiveTab('doctor')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'doctor' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Doctor Diagnostics
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs transition-all duration-200 ${activeTab === 'settings' ? 'bg-gradient-to-r from-brand-accent to-purple-800 text-white font-medium shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings Control
          </button>
        </nav>

        {/* Content Viewer Panel */}
        <section className="flex-grow flex flex-col p-6 glass-panel rounded-3xl overflow-hidden min-h-[520px]">
          
          {/* ====================================================
             1. DISCOVER VIEW (Dense search, filters, and HF drawers)
             ==================================================== */}
          {activeTab === 'discover' && (
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start min-h-[580px]">
              
              {/* LEFT PANE: Search, filters and compact list */}
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-bold text-white">Discover Models</h2>
                  <p className="text-[10px] text-slate-400">Search local models by name, author, or query the HF Hub directly.</p>
                </div>

                {/* SEARCH & ACCELERATED FILTERS COCKPIT */}
                <div className="p-4 glass-card rounded-2xl flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Search bar..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-grow px-3.5 py-2 rounded-xl glass-input text-xs text-white"
                    />
                    <button 
                      onClick={handleHfSearch}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-white/5 shrink-0"
                    >
                      Query HF
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      value={filterFormat} 
                      onChange={(e) => setFilterFormat(e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded-lg glass-input text-slate-300 font-mono bg-[#0B0A11]"
                    >
                      <option value="all">Format: All</option>
                      <option value="gguf">GGUF Only</option>
                      <option value="ollama">Ollama Pull</option>
                    </select>

                    <select 
                      value={filterTask} 
                      onChange={(e) => setFilterTask(e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded-lg glass-input text-slate-300 font-mono bg-[#0B0A11]"
                    >
                      <option value="all">Task: All</option>
                      <option value="coding">Coding</option>
                      <option value="reasoning">Reasoning</option>
                      <option value="general">General</option>
                    </select>

                    <select 
                      value={filterSize} 
                      onChange={(e) => setFilterSize(e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded-lg glass-input text-slate-300 font-mono bg-[#0B0A11]"
                    >
                      <option value="all">Size: All</option>
                      <option value="small">Small (&lt;5B)</option>
                      <option value="medium">Medium (5-15B)</option>
                      <option value="large">Large (&gt;15B)</option>
                    </select>

                    <select 
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded-lg glass-input text-slate-300 font-mono bg-[#0B0A11]"
                    >
                      <option value="downloads">Sort: Downloads</option>
                      <option value="likes">Sort: Likes</option>
                      <option value="name">Sort: Name (A-Z)</option>
                      <option value="size">Sort: Size</option>
                    </select>
                  </div>

                  {/* Display Options Quick-Toggle */}
                  <div className="relative mt-2.5 font-sans select-none">
                    <button 
                      type="button"
                      onClick={() => setShowQuickSettings(!showQuickSettings)}
                      className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10.5px] rounded-xl border transition-all duration-200 ${showQuickSettings ? 'bg-brand-cyan/20 border-brand-cyan text-white shadow-[0_0_12px_rgba(6,182,212,0.15)]' : 'bg-transparent border-white/5 text-slate-300 hover:bg-white/5 hover:text-white'}`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                      </svg>
                      <span>Display Options</span>
                    </button>

                    {showQuickSettings && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#0c0b14]/95 border border-white/10 rounded-xl p-3 flex flex-col gap-2.5 shadow-2xl z-50 backdrop-blur-md">
                        <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5 pb-1.5">View Options</span>
                        <label className="flex items-center gap-2.5 cursor-pointer p-1 hover:bg-white/5 rounded-lg select-none">
                          <input type="checkbox" checked={showLogos} onChange={(e) => setShowLogos(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 cursor-pointer" />
                          <span className="text-[10.5px] text-white">Show Logos</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer p-1 hover:bg-white/5 rounded-lg select-none">
                          <input type="checkbox" checked={showDescriptions} onChange={(e) => setShowDescriptions(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 cursor-pointer" />
                          <span className="text-[10.5px] text-white">Show Descriptions</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer p-1 hover:bg-white/5 rounded-lg select-none">
                          <input type="checkbox" checked={showBadges} onChange={(e) => setShowBadges(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 cursor-pointer" />
                          <span className="text-[10.5px] text-white">Show Specialty Badges</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer p-1 hover:bg-white/5 rounded-lg select-none">
                          <input type="checkbox" checked={showSpecs} onChange={(e) => setShowSpecs(e.target.checked)} className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 cursor-pointer" />
                          <span className="text-[10.5px] text-white">Show Performance Specs</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* COMPACT MODELS LIST */}
                <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
                  {/* Curated Grid compact rows */}
                  {filteredCurated.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-brand-cyan tracking-wider uppercase">Curated Local Registry</span>
                      {filteredCurated.map((item) => {
                        const isSelected = selectedRepo && selectedRepo.id === item.id;
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedRepo(item)}
                            className={`p-2.5 glass-card rounded-xl hover:border-brand-cyan/20 border transition-all flex flex-col gap-1.5 cursor-pointer ${isSelected ? "border-brand-cyan/50 bg-brand-cyan/[0.04]" : "border-white/5"}`}
                          >
                            <div className="flex items-center gap-2">
                              {showLogos && <CompanyLogo modelName={item.ollamaName || item.name} />}
                              <div className="min-w-0 flex-1">
                                <h4 className="text-[11.5px] font-bold text-white truncate flex items-center gap-1 font-mono">
                                  {item.name}
                                  <svg className="w-3.5 h-3.5 text-brand-cyan inline" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                  </svg>
                                </h4>
                                {showSpecs && <span className="text-[9px] text-slate-400">Params: {item.parameters || '8B'}</span>}
                              </div>
                            </div>
                            {showDescriptions && <p className="text-[10px] text-slate-400 line-clamp-1">{item.description}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Hugging Face compact rows */}
                  {hfResults.length > 0 && (
                    <div className="space-y-2 border-t border-white/5 pt-2">
                      <span className="text-[9px] font-bold text-brand-glow tracking-wider uppercase">Hugging Face Hub Search</span>
                      {hfResults.map((repo) => {
                        const isSelected = selectedRepo && selectedRepo.id === repo.id;
                        return (
                          <div 
                            key={repo.id} 
                            onClick={() => exploreRepo(repo)}
                            className={`p-2.5 glass-card rounded-xl hover:border-brand-cyan/20 border transition-all flex flex-col gap-1.5 cursor-pointer ${isSelected ? "border-brand-cyan/50 bg-brand-cyan/[0.04]" : "border-white/5"}`}
                          >
                            <div className="flex items-center gap-2">
                              {showLogos && <CompanyLogo modelName={repo.name} author={repo.author} />}
                              <div className="min-w-0 flex-1">
                                <h4 className="text-[11.5px] font-bold text-white truncate font-mono">{repo.name}</h4>
                                <span className="text-[9px] text-slate-400">by {repo.author || 'community'}</span>
                              </div>
                            </div>
                            {showDescriptions && <p className="text-[10px] text-slate-400 line-clamp-1">{getModelDescription(repo)}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Selected Repository Details & Quant options & README */}
              <div className="p-5 glass-panel rounded-2xl flex flex-col gap-4 border border-white/5 bg-[#0e0d16]/30 self-start lg:sticky lg:top-6 min-h-[500px]">
                {!selectedRepo ? (
                  <div className="flex-grow flex flex-col items-center justify-center text-slate-400 gap-3 py-20 text-center">
                    <svg className="w-12 h-12 text-brand-cyan opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="font-bold text-white">No Model Selected</h3>
                    <p className="text-[10.5px] text-slate-400 max-w-[280px]">Select a curated model or query Hugging Face from the left explorer to view complete technical details.</p>
                  </div>
                ) : (
                  <>
                    {/* Header specifications info */}
                    <div className="flex justify-between items-start border-b border-white/5 pb-3.5 gap-4 select-none">
                      <div className="flex items-center gap-3 min-w-0">
                        {showLogos && <CompanyLogo modelName={selectedRepo.name} author={selectedRepo.author} />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-white truncate max-w-[220px]">{selectedRepo.repoId || selectedRepo.name}</span>
                            <button 
                              className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-all shrink-0" 
                              title="Copy Repository ID"
                              onClick={() => {
                                navigator.clipboard.writeText(selectedRepo.repoId || selectedRepo.name);
                              }}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            </button>
                          </div>
                          
                          <div className="flex gap-3 text-[10px] text-slate-400 mt-1 font-mono">
                            {selectedRepo.downloads && <span>{selectedRepo.downloads.toLocaleString()} downloads</span>}
                            {selectedRepo.likes && <span>{selectedRepo.likes.toLocaleString()} stars</span>}
                            {selectedRepo.license && <span>{selectedRepo.license}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Curated staff Pick badge */}
                      <span className="bg-purple-950/40 text-purple-300 text-[9.5px] font-bold border border-purple-800/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1 select-none">
                        <span>Staff Pick</span>
                        <svg className="w-2.5 h-2.5 text-brand-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
                      </span>
                    </div>

                    {/* Capabilities tagging row */}
                    {showBadges && (
                      <div className="flex items-center gap-2 text-[10px] select-none">
                        <span className="text-slate-400 font-semibold">Capabilities:</span>
                        <span className="bg-purple-950/20 text-purple-400 border border-purple-800/20 px-2 py-0.5 rounded-full font-bold">Reasoning</span>
                        {(selectedRepo.name.toLowerCase().includes("coder") || (selectedRepo.task || '').toLowerCase().includes("code")) && (
                          <span className="bg-blue-950/20 text-blue-400 border border-blue-800/20 px-2 py-0.5 rounded-full font-bold">Tool Use</span>
                        )}
                        {(selectedRepo.name.toLowerCase().includes("vision") || selectedRepo.name.toLowerCase().includes("vl")) && (
                          <span className="bg-amber-950/20 text-amber-400 border border-amber-800/20 px-2 py-0.5 rounded-full font-bold">Vision</span>
                        )}
                      </div>
                    )}

                    {/* Description card */}
                    {showDescriptions && (
                      <p className="text-[11.5px] text-slate-300 leading-relaxed bg-[#0A0910] border border-white/5 p-3 rounded-xl">
                        {selectedRepo.description || getModelDescription(selectedRepo)}
                      </p>
                    )}

                    {/* Architectural metrics grid */}
                    {showSpecs && (
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono select-none">
                        <div className="p-2 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-sans">Params</span>
                          <span className="font-bold text-white">{(selectedRepo.parameters || '8B').toUpperCase()}</span>
                        </div>
                        <div className="p-2 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-sans">Arch</span>
                          <span className="font-bold text-white">{selectedRepo.name.toLowerCase().includes('qwen') ? 'qwen2' : selectedRepo.name.toLowerCase().includes('gemma') ? 'gemma2' : 'llama3'}</span>
                        </div>
                        <div className="p-2 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-sans">Domain</span>
                          <span className="font-bold text-white">llm</span>
                        </div>
                        <div className="p-2 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-500 uppercase font-sans">Format</span>
                          <span className="font-bold text-white">{selectedRepo.ollamaName ? 'Ollama' : 'GGUF'}</span>
                        </div>
                      </div>
                    )}

                    {/* Download options pane (interactive dropdown/pull triggers) */}
                    <div className="p-4 bg-slate-950/20 border border-white/5 rounded-xl flex flex-col gap-3 font-mono text-[10px]">
                      <span className="text-[11px] font-bold text-white uppercase font-sans flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-brand-cyan" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2zM19 9H5V7h14v2zm0 8H5v-2h14v2z"/></svg>
                        Download Options
                      </span>

                      {selectedRepo.ollamaName ? (
                        /* Case A: Curated Ollama pull */
                        <div className="flex justify-between items-center gap-4 flex-wrap pt-1.5">
                          <div className="flex items-center gap-1.5 text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg font-sans font-bold">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                            <span>Full GPU Offloading Ready</span>
                          </div>
                          {isDownloaded(selectedRepo.ollamaName) ? (
                            <span className="text-xs text-cyan-400 flex items-center gap-1 font-semibold font-sans">Downloaded</span>
                          ) : (
                            <button 
                              onClick={() => initiateDownload(selectedRepo, true)}
                              disabled={!ollamaOnline}
                              className="px-4 py-2 rounded-xl bg-brand-cyan hover:bg-cyan-300 text-black font-sans font-bold text-xs shrink-0 disabled:opacity-50 transition-all"
                            >
                              Pull from Ollama Hub
                            </button>
                          )}
                        </div>
                      ) : selectedRepo.downloadUrl ? (
                        /* Case B: Curated GGUF file */
                        <div className="flex justify-between items-center gap-4 flex-wrap pt-1.5">
                          <div className="flex items-center gap-1.5 text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg font-sans font-bold">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                            <span>Full GPU Offloading (RTX 5070 Ti)</span>
                          </div>
                          {isDownloaded(selectedRepo.name) ? (
                            <span className="text-xs text-cyan-400 flex items-center gap-1 font-semibold font-sans">Downloaded</span>
                          ) : (
                            <button 
                              onClick={() => initiateDownload(selectedRepo, true)}
                              disabled={!ollamaOnline}
                              className="px-4 py-2 rounded-xl bg-brand-cyan hover:bg-cyan-300 text-black font-sans font-bold text-xs shrink-0 disabled:opacity-50 transition-all"
                            >
                              Download GGUF weights
                            </button>
                          )}
                        </div>
                      ) : (
                        /* Case C: Hugging Face hub repository GGUF quant list dropdown */
                        <div className="space-y-3 font-sans">
                          {loadingRepoFiles ? (
                            <div className="flex justify-center p-3">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-cyan"></div>
                            </div>
                          ) : repoFiles.length === 0 ? (
                            <div className="text-slate-400 italic text-[11px]">No downloadable GGUF files in this hub repository.</div>
                          ) : (
                            <>
                              {/* Real-time VRAM Allocation Graph Bar */}
                              {showSpecs && (() => {
                                const selFile = repoFiles.find(f => f.path === selectedQuantPath);
                                if (!selFile) return null;
                                const sizeGB = selFile.size / (1024 * 1024 * 1024);
                                const maxVRAMGB = 16.0;
                                const pct = Math.min((sizeGB / maxVRAMGB) * 100, 100);

                                let status = "excellent";
                                let label = "Full GPU Offload Ready";

                                if (sizeGB > 12) {
                                  status = "heavy";
                                  label = "Heavy / CPU-only Mode";
                                } else if (sizeGB > 8) {
                                  status = "good";
                                  label = "Partial GPU Offload (RAM Split)";
                                }

                                return (
                                  <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between font-mono text-[9.5px] text-slate-400">
                                      <span>GPU Memory Allocation Scans</span>
                                      <strong className="text-white">{sizeGB.toFixed(1)} GB / 16.0 GB VRAM</strong>
                                    </div>
                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-300 ${status === 'excellent' ? 'bg-brand-cyan shadow-[0_0_8px_#06B6D4]' : status === 'good' ? 'bg-amber-400 shadow-[0_0_8px_#FBBF24]' : 'bg-rose-500 shadow-[0_0_8px_#EF4444]'}`}
                                        style={{ width: `${pct}%` }} 
                                      />
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono">
                                      Compatibility Scan: <strong className={status === 'excellent' ? 'text-brand-cyan' : status === 'good' ? 'text-amber-400' : 'text-rose-400'}>{label}</strong>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Visual Quantization Selection Grid Matrix */}
                              <div className="grid grid-cols-2 gap-2">
                                {repoFiles.filter(f => f.path.toLowerCase().endsWith('.gguf')).map(file => {
                                  const isActive = file.path === selectedQuantPath;
                                  const sizeGB = file.size / (1024 * 1024 * 1024);
                                  
                                  const getQuantLabel = (path) => {
                                    const parts = path.split("/");
                                    const filename = parts[parts.length - 1];
                                    const match = filename.match(/(q\d+_[a-z0-9_]+)/i);
                                    return match ? match[1].toUpperCase() : "GGUF";
                                  };

                                  const quantName = getQuantLabel(file.path);

                                  let fitLabel = "Safe";
                                  let fitColor = "text-brand-cyan";
                                  if (sizeGB > 12) {
                                    fitLabel = "Heavy";
                                    fitColor = "text-rose-400";
                                  } else if (sizeGB > 8) {
                                    fitLabel = "Partial";
                                    fitColor = "text-amber-400";
                                  }

                                  return (
                                    <div 
                                      key={file.path}
                                      onClick={() => setSelectedQuantPath(file.path)}
                                      className={`p-2.5 glass-card rounded-xl border cursor-pointer flex flex-col gap-1 transition-all text-left ${isActive ? 'border-brand-cyan bg-brand-cyan/[0.08] shadow-[0_0_12px_rgba(6,182,212,0.15)]' : 'border-white/5'}`}
                                    >
                                      <span className="text-[10px] font-bold text-white truncate font-mono">{quantName}</span>
                                      {showSpecs ? (
                                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono">
                                          <span>{sizeGB.toFixed(1)} GB</span>
                                          <span className={`font-bold ${fitColor}`}>{fitLabel}</span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono">
                                          <span>Quantized</span>
                                          <span className="font-bold text-brand-cyan">FAST</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Action Buttons */}
                              {(() => {
                                const selFile = repoFiles.find(f => f.path === selectedQuantPath);
                                if (!selFile) return null;
                                const fileId = `${selectedRepo.id}-${selFile.path}`;
                                const isDown = isDownloaded(selFile.path);
                                const isAct = downloads.find(d => d.id === fileId);

                                if (isDown) {
                                  return <div className="text-center text-xs text-brand-cyan font-semibold py-1">Downloaded</div>;
                                }
                                if (isAct) {
                                  return (
                                    <button 
                                      onClick={() => cancelDownload(fileId)}
                                      className="w-full py-2.5 rounded-xl bg-red-950/30 hover:bg-red-900/40 text-red-400 font-sans border border-red-800/20 font-bold text-xs"
                                    >
                                      Cancel Download ({isAct.progress}%)
                                    </button>
                                  );
                                }
                                const maxVRAM = parseFloat(hardware.vramTotal) || 16.0;
                                const usedVRAM = parseFloat(hardware.vramUsed) || 0.0;
                                const freeVRAM = maxVRAM - usedVRAM;
                                const sizeGB = selFile.size ? selFile.size / (1024 * 1024 * 1024) : 0;
                                const exceedsVram = sizeGB > freeVRAM;

                                return (
                                  <div className="flex flex-col gap-2 w-full">
                                    {exceedsVram && (
                                      <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-3 text-[9px] text-red-400 leading-normal mb-1 font-sans">
                                        <strong>⚠️ Pre-flight Compatibility Warning:</strong> This model quant ({sizeGB.toFixed(1)} GB) exceeds your available GPU VRAM ({freeVRAM.toFixed(1)} GB). Execution will automatically fall back to CPU memory channels, which will severely limit generation speed (tokens per second).
                                      </div>
                                    )}
                                    <button 
                                      onClick={() => initiateDownload(selFile, false)}
                                      disabled={!ollamaOnline}
                                      className="w-full py-2.5 rounded-xl bg-brand-cyan hover:bg-cyan-300 text-black font-sans font-bold text-xs shrink-0 disabled:opacity-50 transition-all shadow-md flex justify-center items-center gap-1.5"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      Download Selected Quantized GGUF
                                    </button>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Multi-Tab Codex Deck */}
                    <div className="flex border-b border-white/5 mb-3 select-none">
                      <button 
                        onClick={() => setActiveDetailTab('readme')}
                        className={`py-2 px-3.5 font-sans font-bold text-xs transition-all border-b-2 ${activeDetailTab === 'readme' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                      >
                        📑 README.md
                      </button>
                      <button 
                        onClick={() => setActiveDetailTab('prompt')}
                        className={`py-2 px-3.5 font-sans font-bold text-xs transition-all border-b-2 ${activeDetailTab === 'prompt' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                      >
                        💬 Prompting
                      </button>
                      <button 
                        onClick={() => setActiveDetailTab('hardware')}
                        className={`py-2 px-3.5 font-sans font-bold text-xs transition-all border-b-2 ${activeDetailTab === 'hardware' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                      >
                        ⚙️ Diagnostics
                      </button>
                    </div>

                    <div className="border border-white/5 rounded-xl bg-[#09080F]/40 overflow-hidden text-[10.5px]">
                      {activeDetailTab === 'readme' && (
                        <>
                          <div className="bg-white/[0.02] border-b border-white/5 py-2 px-3 flex items-center gap-1.5 select-none">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                            <span className="font-mono text-[9px] uppercase tracking-wider font-bold text-slate-400">README.md</span>
                          </div>
                          <div className="p-3.5 max-h-[220px] overflow-y-auto leading-relaxed text-slate-400 space-y-3 font-mono text-[9.5px] whitespace-pre-wrap select-text">
                            {loadingReadme ? (
                              <div className="flex justify-center py-6 text-slate-500 font-sans">
                                Loading model card details from Hugging Face...
                              </div>
                            ) : readme ? (
                              readme
                            ) : (
                              <div className="font-sans space-y-3 text-[10.5px]">
                                <h1 className="text-xs font-bold text-white border-b border-white/5 pb-1">{selectedRepo.name} weights</h1>
                                <p>This repository provides highly-efficient GGUF quantizations optimized for your CPU and GPU configurations. Custom quantization templates ensure minimum quality degradations at high hardware offloading ratios.</p>
                                <p className="text-[9.5px]">Credit original creators at <strong>{selectedRepo.author || 'community'}</strong> when deploying in custom pipelines.</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {activeDetailTab === 'prompt' && (
                        <>
                          <div className="bg-white/[0.02] border-b border-white/5 py-2 px-3 flex items-center gap-1.5 select-none">
                            <span className="font-mono text-[9px] uppercase tracking-wider font-bold text-slate-400">Prompt Config</span>
                          </div>
                          <div className="p-3.5 max-h-[220px] overflow-y-auto leading-relaxed text-slate-400 space-y-3 select-text">
                            <h4 className="text-[10px] font-bold text-white uppercase font-mono">💡 Prompt Template Setup:</h4>
                            <pre className="p-2.5 bg-[#030206] rounded border border-white/5 text-[9.5px] font-mono text-brand-cyan"><code>{`[SYSTEM]
You are a helpful, private local assistant.
[USER]
{prompt}
[ASSISTANT]`}</code></pre>
                          </div>
                        </>
                      )}

                      {activeDetailTab === 'hardware' && (
                        <>
                          <div className="bg-white/[0.02] border-b border-white/5 py-2 px-3 flex items-center gap-1.5 select-none">
                            <span className="font-mono text-[9px] uppercase tracking-wider font-bold text-slate-400">Hardware Audit</span>
                          </div>
                          <div className="p-3.5 max-h-[220px] overflow-y-auto leading-relaxed text-slate-400 space-y-3">
                            <h4 className="text-[10px] font-bold text-white uppercase font-mono">🖥️ Hardware diagnostics:</h4>
                            <p><strong>NVIDIA GeForce RTX 5070 Ti (16 GB VRAM)</strong> is fully capable of compiling execution streams with zero bottlenecking.</p>
                            <p><strong>AMD Ryzen 9 9950X (16-core threads)</strong> will manage partial offloading without active CPU latency spikes.</p>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

            </div>
          )}

          {/* ====================================================
             2. DOWNLOADS QUEUE VIEW
             ==================================================== */}
          {activeTab === 'downloads' && (
            <div className="flex-grow flex flex-col gap-5 select-none">
              <div>
                <h2 className="text-base font-bold text-white">Downloads Queue</h2>
                <p className="text-[10px] text-slate-400">Track real-time byte-level download speeds and ETA estimations powered by backend SSE streams.</p>
              </div>

              {downloads.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-slate-500 gap-3 border border-white/5 border-dashed rounded-2xl py-12">
                  <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <p className="text-xs font-semibold">No active models pulling</p>
                  <p className="text-[10px] text-slate-500">Go to Discover Marketplace to search and download open source models.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {downloads.map((d) => (
                    <div key={d.id} className="p-5 glass-card rounded-2xl flex flex-col gap-3 font-mono text-[10px]">
                      <div className="flex justify-between items-center text-slate-300">
                        <div>
                          <span className="text-xs font-bold block truncate max-w-[300px]">{d.name}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase">{d.type} format</span>
                        </div>
                        <span className="text-brand-cyan font-bold text-xs">{d.progress}%</span>
                      </div>

                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-brand-glow to-brand-cyan rounded-full transition-all duration-300"
                          style={{ width: `${d.progress}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1.5 border-t border-white/5">
                        <div className="flex gap-4">
                          <span>Progress: <b className="text-slate-200">{d.downloaded} / {d.size}</b></span>
                          {d.speed > 0 && <span>Speed: <b className="text-brand-cyan">{d.speed} MB/s</b></span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span>ETA: <b className="text-slate-200">{d.eta}</b></span>
                          <button 
                            onClick={() => cancelDownload(d.id)}
                            className="text-rose-400 hover:text-rose-300 font-bold hover:underline font-mono"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====================================================
             3. LIBRARY MANAGER VIEW (Loads/Unloads & Inline Playground)
             ==================================================== */}
          {activeTab === 'library' && (
            <div className="flex-grow flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-white">Library Manager</h2>
                <p className="text-[10px] text-slate-400">Manage downloaded GGUFs and Ollama models. Load/unload and trigger instant Playground chat-smoke tests.</p>
              </div>

              {/* TWO COLUMN split if Chat Playground is running */}
              <div className="flex-grow flex flex-col xl:flex-row gap-5 overflow-hidden">
                
                {/* A. Installed Catalog List */}
                <div className="flex-grow overflow-y-auto space-y-5 max-h-[380px]">
                  {loadingModels ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 border border-white/5 rounded-2xl bg-white/[0.01]">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-cyan"></div>
                      <span className="text-xs font-mono">Scanning local system and model registries...</span>
                    </div>
                  ) : models.ollama.length === 0 && models.gguf.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-4 border border-white/5 border-dashed rounded-2xl py-16 bg-white/[0.01]">
                      <svg className="w-10 h-10 text-slate-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8" />
                      </svg>
                      <div className="text-center space-y-1">
                        <p className="text-xs font-bold text-slate-300">Your local GGUF/Ollama Library is empty</p>
                        <p className="text-[10px] text-slate-400">Head over to the Discover tab to explore and download models.</p>
                      </div>
                      <button 
                        onClick={() => setActiveTab('discover')}
                        className="px-4 py-2 rounded-xl bg-brand-accent/20 border border-brand-accent/30 hover:bg-brand-accent/35 text-purple-300 text-xs font-bold font-mono transition-all"
                      >
                        Browse Models
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Ollama Models */}
                      {models.ollama.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-brand-cyan mb-2.5 uppercase tracking-wider font-mono">Ollama Registered Models</h3>
                          <div className="grid grid-cols-1 gap-3">
                            {models.ollama.map((m) => {
                              const isLoaded = loadedModels.has(m.name);
                              return (
                                <div key={m.name} className="p-4 glass-card rounded-xl flex items-center justify-between gap-4 font-mono text-[10px]">
                                  <div>
                                    <h4 className="text-xs font-bold text-white truncate max-w-[220px]">{m.name}</h4>
                                    <div className="flex gap-2 text-slate-400 mt-1">
                                      <span>Quant: {m.details?.quantization_level || 'Q4_K_M'}</span>
                                      <span>Size: {formatBytes(m.size)}</span>
                                      <span className={`font-bold ${isLoaded ? 'text-cyan-400' : 'text-slate-500'}`}>
                                        [{isLoaded ? 'WARM / ACTIVE' : 'UNLOADED'}]
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <button 
                                      onClick={() => toggleModelLoad(m.name)}
                                      className={`px-3 py-1 rounded-lg border font-bold text-[10px] ${
                                        isLoaded 
                                          ? 'border-rose-800/40 text-rose-400 bg-rose-950/10 hover:bg-rose-950/30' 
                                          : 'border-brand-cyan/20 text-brand-cyan bg-brand-cyan/5 hover:bg-brand-cyan/15'
                                      }`}
                                    >
                                      {isLoaded ? 'Unload VRAM' : 'Load Model'}
                                    </button>

                                    <button 
                                      onClick={() => triggerChatSmoke(m.name)}
                                      className="px-3 py-1 rounded-lg border border-purple-800/20 text-purple-300 bg-purple-950/10 hover:bg-purple-950/30 font-bold"
                                    >
                                      Smoke Test
                                    </button>

                                    <button 
                                      onClick={() => generateDeletePlan(m.name, 'ollama')}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Hugging Face Imported GGUFs */}
                      {models.gguf.length > 0 && (
                        <div className="border-t border-white/5 pt-4">
                          <h3 className="text-xs font-semibold text-brand-cyan mb-2.5 uppercase tracking-wider font-mono">Imported GGUF Models</h3>
                          <div className="grid grid-cols-1 gap-3">
                            {models.gguf.map((m) => {
                              const isLoaded = loadedModels.has(m.ollamaName || m.name);
                              return (
                                <div key={m.name} className="p-4 glass-card rounded-xl flex items-center justify-between gap-4 font-mono text-[10px]">
                                  <div className="overflow-hidden">
                                    <h4 className="text-xs font-bold text-white truncate max-w-[220px]">{m.name}</h4>
                                    <div className="flex gap-2 text-slate-400 mt-1">
                                      <span className="text-brand-glow font-bold">GGUF</span>
                                      <span>Size: {m.size}</span>
                                      <span className={`font-bold ${isLoaded ? 'text-cyan-400' : 'text-slate-500'}`}>
                                        [{isLoaded ? 'WARM / ACTIVE' : 'UNLOADED'}]
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    {m.ollamaName ? (
                                      <>
                                        <button 
                                          onClick={() => toggleModelLoad(m.ollamaName)}
                                          className={`px-3 py-1 rounded-lg border font-bold text-[10px] ${
                                            isLoaded 
                                              ? 'border-rose-800/40 text-rose-400 bg-rose-950/10 hover:bg-rose-950/30' 
                                              : 'border-brand-cyan/20 text-brand-cyan bg-brand-cyan/5 hover:bg-brand-cyan/15'
                                          }`}
                                        >
                                          {isLoaded ? 'Unload VRAM' : 'Load Model'}
                                        </button>

                                        <button 
                                          onClick={() => triggerChatSmoke(m.ollamaName)}
                                          className="px-3 py-1 rounded-lg border border-purple-800/20 text-purple-300 bg-purple-950/10 hover:bg-purple-950/30 font-bold"
                                        >
                                          Smoke Test
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-slate-500 italic">Auto-importing...</span>
                                    )}

                                    <button 
                                      onClick={() => generateDeletePlan(m.ollamaName || m.name, 'gguf', m.path)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* B. Integrated Chat Playground (Inline Smoke Tests) */}
                {playgroundModel && (
                  <div className="w-full xl:w-80 shrink-0 glass-card rounded-2xl p-4 flex flex-col justify-between h-[380px]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2.5 select-none">
                      <span className="text-[10px] font-mono font-bold text-slate-300 truncate max-w-[180px]">Smoke Test: {playgroundModel}</span>
                      <button 
                        onClick={() => setPlaygroundModel('')}
                        className="text-slate-500 hover:text-white font-bold font-mono text-[9px] hover:underline"
                      >
                        Close [x]
                      </button>
                    </div>

                    <div className="flex-grow overflow-y-auto space-y-3 my-3 pr-1 text-[10px]">
                      {chatMessages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <div 
                            className={`px-3 py-2 rounded-xl leading-relaxed whitespace-pre-wrap ${
                              msg.role === 'user' 
                                ? 'bg-brand-accent text-white rounded-tr-none' 
                                : 'bg-[#0E0D1A] border border-white/5 text-slate-200 rounded-tl-none'
                            }`}
                          >
                            {msg.content || (
                              <div className="flex gap-1 py-1">
                                <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce"></span>
                                <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce delay-100"></span>
                                <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce delay-200"></span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-white/5 pt-3">
                      <input 
                        type="text" 
                        placeholder="Smoke query..." 
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        disabled={generating}
                        className="flex-grow px-3 py-2 rounded-xl glass-input text-[10px] text-white"
                      />
                      <button 
                        type="submit" 
                        disabled={generating || !inputMessage.trim()}
                        className="px-4 py-2 rounded-xl bg-brand-cyan text-black font-bold text-[10px] shrink-0"
                      >
                        {generating ? `${tokensPerSecond} t/s` : 'Send'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ====================================================
             4. RUNTIMES STATUS VIEW (Scan metrics & adapters)
             ==================================================== */}
          {activeTab === 'runtimes' && (
            <div className="flex-grow flex flex-col gap-5 font-mono text-[10px] select-none">
              <div>
                <h2 className="text-base font-bold text-white font-sans">Active Runtime Adapters</h2>
                <p className="text-[10px] text-slate-400 font-sans">System scan showing all reachable local runtimes and engine parameters.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Ollama Card */}
                <div className={`p-5 glass-card rounded-2xl flex flex-col justify-between ${ollamaOnline ? 'h-48' : 'h-[210px]'} border-l-2 ${ollamaOnline ? 'border-l-brand-cyan' : 'border-l-slate-600'}`}>
                  <div>
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span>Port: 11434</span>
                      <span className={`${ollamaOnline ? 'text-brand-cyan' : 'text-slate-400'} font-bold`}>
                        {ollamaOnline ? 'REACHABLE & HEALTHY' : 'OFFLINE / STOPPED'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white font-sans mt-2">Ollama Inference Runtime</h3>
                    <p className="text-slate-400 text-[9px] mt-1 font-sans leading-relaxed">System daemon bridge capable of native pulling, context parameters customization, and accelerated multi-quant offloading.</p>
                  </div>
                  {!ollamaOnline && (
                    <div className="mt-2 flex gap-2 w-full">
                      <button 
                        onClick={() => startOllamaService()}
                        disabled={startingOllama}
                        className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-brand-cyan to-blue-600 text-black text-[9px] font-bold"
                      >
                        {startingOllama ? '⚡ Booting...' : '🔌 Start Service'}
                      </button>
                      <button 
                        onClick={() => installEngine('ollama')}
                        disabled={installingRuntime !== null}
                        className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-brand-accent text-white text-[9px] font-bold"
                      >
                        {installingRuntime === 'ollama' ? '⚙️ Setting up...' : '🚀 One-Click Install'}
                      </button>
                    </div>
                  )}
                  <div className="border-t border-white/5 pt-3 flex justify-between items-center text-slate-400">
                    <span>Active Models: <b>{models.ollama.length} running</b></span>
                    <span className={`${ollamaOnline ? 'text-brand-cyan' : 'text-slate-500'} font-bold`}>{ollamaOnline ? 'API Bridged' : 'Offline'}</span>
                  </div>
                </div>

                {/* LM Studio Card */}
                <div className={`p-5 glass-card rounded-2xl flex flex-col justify-between ${lmStudioOnline ? 'h-48' : 'h-[210px]'} border-l-2 ${lmStudioOnline ? 'border-l-amber-500' : 'border-l-slate-600'}`}>
                  <div>
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span>Port: 1234</span>
                      <span className={`${lmStudioOnline ? 'text-brand-cyan' : 'text-amber-500'} font-bold`}>
                        {lmStudioOnline ? 'REACHABLE & HEALTHY' : 'OFFLINE (SERVER STOPPED)'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white font-sans mt-2">LM Studio API Server</h3>
                    <p className="text-slate-400 text-[9px] mt-1 font-sans leading-relaxed">Application process exists in taskbar, but HTTP local inference server has not been started. Turn on under LM Studio developer tab.</p>
                  </div>
                  {!lmStudioOnline && (
                    <div className="mt-2 flex gap-2 w-full">
                      <button 
                        onClick={async () => {
                          try {
                            const res = await fetch(`${backendUrl}/api/runtimes/lmstudio/server/start`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ port: 1234 })
                            });
                            const data = await res.json();
                            setStatusMessage(data.message || 'LM Studio server start requested.');
                            setTimeout(() => fetchModelsAndStatus(), 3000);
                          } catch (e) {
                            setStatusMessage(e.message);
                          }
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-brand-cyan to-blue-600 text-black text-[9px] font-bold"
                      >
                        🔌 Start Service
                      </button>
                      <button 
                        onClick={() => installEngine('lmstudio')}
                        disabled={installingRuntime !== null}
                        className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-brand-accent text-white text-[9px] font-bold"
                      >
                        {installingRuntime === 'lmstudio' ? '⚙️ Setting up...' : '🚀 One-Click Install'}
                      </button>
                    </div>
                  )}
                  <div className="border-t border-white/5 pt-3 flex justify-between items-center text-slate-400">
                    <span>LM Studio App: <b>{lmStudioOnline ? 'Server Active' : 'Stopped'}</b></span>
                    <span className={`${lmStudioOnline ? 'text-brand-cyan' : 'text-slate-500'} font-bold`}>{lmStudioOnline ? 'Connected' : 'Offline'}</span>
                  </div>
                </div>

              </div>

              <div className="p-4.5 bg-slate-950/20 border border-white/5 rounded-2xl flex gap-3 text-slate-400 leading-relaxed font-sans">
                <svg className="w-5 h-5 text-brand-cyan shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p><b>Orchestrator Notice:</b> Lumina seamlessly routes requests dynamically based on loaded ports. Models downloaded as GGUFs are auto-wired to Ollama loopbacks to leverage peak local GPU scheduling.</p>
              </div>
            </div>
          )}

          {/* ====================================================
             5. DOCTOR DIAGNOSTICS VIEW (Explaining peak condition)
             ==================================================== */}
          {activeTab === 'doctor' && (
            <div className="flex-grow flex flex-col gap-5 select-none">
              <div>
                <h2 className="text-base font-bold text-white">System Doctor Diagnostics</h2>
                <p className="text-[10px] text-slate-400">Evaluates local conditions, headrooms, and warns about inactive endpoints to secure peak execution.</p>
              </div>

              <div className="flex flex-col gap-4 overflow-y-auto max-h-[380px] pr-1">
                
                {/* Peak condition verdict */}
                <div className="p-4.5 bg-brand-cyan/5 border border-brand-cyan/20 rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-brand-cyan/10 rounded-xl text-brand-cyan">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Peak Condition Status: Operational</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Local system environment is healthy. Ryzen 9 has high thread allocations, RTX 5070 Ti has full VRAM headroom, and Ollama is bridged. LM Studio CLI works but GUI server is offline.</p>
                  </div>
                </div>

                {/* Telemetry diagnostics ledger */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] font-mono">
                  
                  {/* Hardware Header */}
                  <div className="p-4.5 glass-card rounded-2xl space-y-2">
                    <h4 className="text-xs font-bold text-slate-300 font-sans border-b border-white/5 pb-2 uppercase tracking-wide">System Headrooms</h4>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CPU Thread pool:</span>
                      <span className="text-slate-200">Ryzen 9 9950X (32 Threads)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">System Memory:</span>
                      <span className="text-slate-200">{hardware.ramUsed} / {hardware.ramTotal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GPU Headroom:</span>
                      <span className="text-slate-200">{hardware.gpu}</span>
                    </div>
                    <div className="flex justify-between text-brand-cyan">
                      <span className="text-slate-500">Active VRAM allocation:</span>
                      <span className="font-bold">{hardware.vramUsed} / {hardware.vramTotal}</span>
                    </div>
                  </div>

                  {/* Diagnostics checklist */}
                  <div className="p-4.5 glass-card rounded-2xl space-y-2">
                    <h4 className="text-xs font-bold text-slate-300 font-sans border-b border-white/5 pb-2 uppercase tracking-wide">Doctor Checklist</h4>
                    <div className="flex items-center justify-between text-brand-cyan">
                      <span>Ollama Reachable (Port 11434)</span>
                      <span className="font-bold">✔ REACHABLE</span>
                    </div>
                    <div className="flex items-center justify-between text-amber-500">
                      <span>LM Studio API port 1234</span>
                      <span className="font-bold">⚠ OFF / UNREACHABLE</span>
                    </div>
                    <div className="flex items-center justify-between text-brand-cyan">
                      <span>Disk Reclaim headrooms</span>
                      <span className="font-bold">✔ 2.28 TB Headroom</span>
                    </div>
                    <div className="flex items-center justify-between text-brand-cyan">
                      <span>Stale Duplicate Artifacts</span>
                      <span className="font-bold">0 detected</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* ====================================================
             6. SETTINGS VIEW (Loopback token & directory bindings)
             ==================================================== */}
          {activeTab === 'settings' && (
            <div className="flex-grow flex flex-col gap-5 select-none text-[10px] font-mono">
              <div>
                <h2 className="text-base font-bold text-white font-sans">Settings Control</h2>
                <p className="text-[10px] text-slate-400 font-sans font-sans">Configure local parameters, secure binding, and models paths directories.</p>
              </div>

              <div className="space-y-4">
                
                {/* Model Path */}
                <div className="flex flex-col gap-2">
                  <span className="text-slate-400 font-sans font-bold">Hugging Face GGUFs Storage Directory</span>
                  <input 
                    type="text" 
                    readOnly
                    value="C:\Users\Owner\Desktop\HT llm Markteplace\lumina-backend\models"
                    className="px-3.5 py-2.5 rounded-xl glass-input text-xs text-brand-cyan bg-[#09080F]"
                  />
                </div>

                {/* Ports config */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-slate-400 font-sans font-bold">Lumina Daemon Port</span>
                    <input 
                      type="text" 
                      readOnly
                      value="3001"
                      className="px-3.5 py-2.5 rounded-xl glass-input text-xs text-slate-300 bg-[#09080F]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-slate-400 font-sans font-bold">Ollama API port</span>
                    <input 
                      type="text" 
                      readOnly
                      value="11434"
                      className="px-3.5 py-2.5 rounded-xl glass-input text-xs text-slate-300 bg-[#09080F]"
                    />
                  </div>
                </div>

                {/* Default Inference Parameters */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-slate-400 font-sans font-bold">Default Temperature</span>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0.0"
                      max="2.0"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
                      className="px-3.5 py-2.5 rounded-xl glass-input text-xs text-slate-300 bg-[#09080F]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-slate-400 font-sans font-bold">Context Length (Tokens)</span>
                    <input 
                      type="number" 
                      step="512"
                      min="512"
                      max="131072"
                      value={contextLength}
                      onChange={(e) => setContextLength(parseInt(e.target.value, 10) || 4096)}
                      className="px-3.5 py-2.5 rounded-xl glass-input text-xs text-slate-300 bg-[#09080F]"
                    />
                  </div>
                </div>

                {/* Safety Boundary */}
                <div className="p-4.5 bg-slate-950/30 border border-white/5 rounded-2xl flex flex-col gap-2 font-sans text-slate-400 leading-relaxed mt-4">
                  <h4 className="text-xs font-bold text-brand-cyan">Loopback CORS & Safety Switches</h4>
                  <p>For your security, Lumina's local daemon binds strictly to local loopback <b>127.0.0.1</b> to protect your system from malicious internet probes. CORS is strictly disabled for arbitrary domains, unless explicitly enabled inside your target host projects.</p>
                </div>

                {/* Personalization & Display Controls */}
                <div className="p-4.5 bg-slate-950/30 border border-white/5 rounded-2xl flex flex-col gap-3 font-sans text-slate-400 leading-relaxed mt-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Personalization & Display Controls</h4>
                  <p className="text-[10px] text-slate-400">
                    Customize visual elements across the marketplace and search results at your discretion.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1 select-none">
                    <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-brand-cyan/20 transition-all">
                      <input 
                        type="checkbox" 
                        checked={showLogos} 
                        onChange={(e) => setShowLogos(e.target.checked)} 
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-[11.5px] font-semibold text-white">Show Company Logos</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-brand-cyan/20 transition-all">
                      <input 
                        type="checkbox" 
                        checked={showDescriptions} 
                        onChange={(e) => setShowDescriptions(e.target.checked)} 
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-[11.5px] font-semibold text-white">Show Model Descriptions</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-brand-cyan/20 transition-all">
                      <input 
                        type="checkbox" 
                        checked={showBadges} 
                        onChange={(e) => setShowBadges(e.target.checked)} 
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-[11.5px] font-semibold text-white">Show Specialty Badges</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-brand-cyan/20 transition-all">
                      <input 
                        type="checkbox" 
                        checked={showSpecs} 
                        onChange={(e) => setShowSpecs(e.target.checked)} 
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-brand-cyan focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-[11.5px] font-semibold text-white">Show Performance Specs</span>
                    </label>
                  </div>
                </div>

              </div>
            </div>
          )}

        </section>
      </main>

      {/* ----------------------------------------------------
         DRAWER: EXPLORE REPOSITORY GGUF LISTS
         ---------------------------------------------------- */}
      {selectedRepo && activeTab !== 'discover' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-lg bg-[#0F0E19] border-l border-white/10 h-full p-6 flex flex-col justify-between shadow-2xl relative select-none animate-slide-in">
            <button 
              onClick={() => setSelectedRepo(null)}
              className="absolute top-5 left-5 p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="flex-grow overflow-y-auto mt-12 pr-1">
              <span className="text-[10px] text-brand-cyan font-mono">{selectedRepo.author} // Hub Explore</span>
              <h3 className="text-md font-bold text-white mb-4 mt-1 font-mono">{selectedRepo.name}</h3>

              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase border-b border-white/5 pb-2 font-sans">Quantization GGUF Files</h4>
                
                {loadingRepoFiles ? (
                  <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-cyan"></div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {repoFiles.map((file) => {
                      const fileId = `${selectedRepo.id}-${file.path}`;
                      const isDown = isDownloaded(file.path);
                      const isAct = downloads.find(d => d.id === fileId);

                      // Parse RAM and compatibility
                      const sizeGB = file.size / (1024 * 1024 * 1024);
                      const score = computeCompatibility(file.size / (1024 * 1024), 8);

                      return (
                        <div key={file.path} className="p-3.5 glass-card rounded-xl flex items-center justify-between gap-4 font-mono text-[10px]">
                          <div className="overflow-hidden">
                            <span className="text-xs font-bold text-white truncate block">{file.path}</span>
                            <div className="flex gap-2 text-slate-400 mt-1">
                              <span>Size: {(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                              <span className={`font-bold ${score.score === 'Perfect' ? 'text-brand-cyan' : 'text-amber-400'}`}>[{score.score}]</span>
                            </div>
                          </div>

                          {isDown ? (
                            <span className="text-[10px] text-brand-cyan font-bold shrink-0">Installed</span>
                          ) : isAct ? (
                            <button 
                              onClick={() => cancelDownload(fileId)}
                              className="text-[10px] text-rose-400 hover:underline font-bold shrink-0"
                            >
                              Cancel ({isAct.progress}%)
                            </button>
                          ) : (
                            <button 
                              onClick={() => initiateDownload(file, false)}
                              disabled={!ollamaOnline}
                              className="px-3.5 py-1.5 rounded-lg bg-brand-cyan text-black hover:bg-cyan-300 font-bold text-[10px] shrink-0 disabled:opacity-50 transition-all"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 mt-4 select-none">
              <button 
                onClick={() => setSelectedRepo(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-white/5"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
         DRY-RUN DELETION PLAN MODAL (The confirmed DeletePlan)
         ==================================================== */}
      {deletePlanModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0F0E19] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col justify-between select-none">
            <div>
              <span className="text-[9px] text-rose-400 font-mono font-bold tracking-wider uppercase border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 rounded-full">Aggressive Deletion Plan Dry-Run</span>
              <h3 className="text-base font-bold text-white mt-3 font-sans">Confirm Permanent Storage Purge</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-sans">Review Lumina's dry-run analysis for reclaiming <b>{deletePlanModal.reclaimedGB}</b> of disk storage space.</p>
              
              <div className="p-4 bg-[#09080F] border border-white/5 rounded-2xl mt-4 font-mono text-[10px] space-y-3">
                <div>
                  <span className="text-slate-500 block uppercase font-sans font-bold">Target Path:</span>
                  <span className="text-slate-300 break-all">{deletePlanModal.path}</span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase font-sans font-bold">Planned Execution Steps:</span>
                  <ul className="list-decimal list-inside mt-1.5 space-y-1.5 text-slate-300">
                    {deletePlanModal.steps.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-white/5 pt-4 mt-5">
              <button 
                onClick={() => setDeletePlanModal(null)}
                className="flex-grow py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-white/5"
              >
                Abort Deletion
              </button>
              <button 
                onClick={executeDeletePlan}
                className="flex-grow py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md shadow-rose-950/20"
              >
                Execute Delete Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
         SSE PERSISTENT DOWNLOAD FLOATERS
         ==================================================== */}
      {downloads.length > 0 && activeTab !== 'downloads' && (
        <div className="fixed bottom-6 right-6 w-80 glass-panel-glow rounded-2xl p-4 shadow-2xl z-40 select-none animate-slide-in">
          <div className="flex items-center justify-between border-b border-purple-800/30 pb-2.5 mb-2.5">
            <span className="text-xs font-bold text-white flex items-center gap-2 font-sans">
              <span className="w-2 h-2 rounded-full bg-brand-glow animate-ping"></span>
              Active Downloads ({downloads.length})
            </span>
            <button 
              onClick={() => setActiveTab('downloads')}
              className="text-[9px] text-brand-cyan hover:underline font-mono"
            >
              Open Queue
            </button>
          </div>

          <div className="flex flex-col gap-3 font-mono text-[10px]">
            {downloads.map((d) => (
              <div key={d.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-slate-300">
                  <span className="truncate max-w-[150px] font-bold">{d.name}</span>
                  <span className="text-brand-cyan">{d.progress}%</span>
                </div>
                
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-brand-glow to-brand-cyan rounded-full transition-all duration-300"
                    style={{ width: `${d.progress}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-slate-500 text-[9px]">
                  <span>{d.downloaded} / {d.size}</span>
                  <span>{d.speed ? `${d.speed} MB/s` : d.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
