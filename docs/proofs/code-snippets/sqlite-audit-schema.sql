-- HassTech Local LLM Marketplace
-- Local SQLite Audit & Telemetry Schema (WAL Concurrency Configured)
-- 
-- Persistent local data structures used to audit model life cycles, downloads,
-- process scheduling, and live system doctor telemetry logs.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Artifacts Index (Downloaded weight configurations & signatures)
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL,
    quant_method TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    download_job_id TEXT,
    engine_preference TEXT DEFAULT 'llama-server',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Download Jobs Ledger (SSEdebounced dynamic progress tracking)
CREATE TABLE IF NOT EXISTS download_jobs (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    bytes_total INTEGER DEFAULT 0,
    bytes_downloaded INTEGER DEFAULT 0,
    progress_percentage REAL DEFAULT 0.0,
    speed_bytes_sec REAL DEFAULT 0.0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. System Hardware Doctor Scan (GPU/VRAM Vulkan telemetry snapshots)
CREATE TABLE IF NOT EXISTS doctor_telemetry_logs (
    id TEXT PRIMARY KEY,
    os_platform TEXT NOT NULL,
    cpu_cores INTEGER NOT NULL,
    memory_total_bytes INTEGER NOT NULL,
    memory_free_bytes INTEGER NOT NULL,
    gpu_count INTEGER DEFAULT 0,
    gpu_telemetry_json TEXT, -- Serialized JSON array of Vulkan/CUDA capabilities
    sqlite_journal_mode TEXT DEFAULT 'WAL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Process Scheduling & Runtime Residency Pool
CREATE TABLE IF NOT EXISTS active_runtimes (
    id TEXT PRIMARY KEY,
    engine_type TEXT CHECK(engine_type IN ('llama-server', 'ollama', 'lm-studio')) NOT NULL,
    model_id TEXT NOT NULL,
    port INTEGER NOT NULL UNIQUE,
    pid INTEGER NOT NULL,
    vram_allocated_bytes INTEGER DEFAULT 0,
    offload_ratio REAL DEFAULT 1.0, -- 1.0 = Full GPU Offload, <1.0 = CPU offloaded layers
    status TEXT CHECK(status IN ('starting', 'online', 'unloading', 'offline')) DEFAULT 'starting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unloaded_at TIMESTAMP
);

-- 5. Chat Generation Auditing & Performance Telemetry
CREATE TABLE IF NOT EXISTS chat_performance_telemetry (
    id TEXT PRIMARY KEY,
    request_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model_id TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    time_to_first_token_ms INTEGER NOT NULL,
    generation_time_ms INTEGER NOT NULL,
    tokens_per_second REAL GENERATED ALWAYS AS (completion_tokens / (generation_time_ms / 1000.0)) STORED
);
