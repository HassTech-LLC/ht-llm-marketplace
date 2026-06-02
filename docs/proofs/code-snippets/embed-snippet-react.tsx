import React from "react";
import { ModelMarketplace } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/dist/styles.css";

/**
 * HassTech LLM Marketplace Integration Example
 * 
 * Demonstrates clean glassmorphic embedding of our offline-first
 * model selection interface into any external third-party dashboard.
 */
export function App() {
  const handleModelSelect = (model: any) => {
    console.log("Selected local model for active session:", model);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-6xl rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-8 shadow-2xl">
        <header className="mb-8 border-b border-white/5 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-200">
            HassTech Local AI Node
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Standard enterprise dashboard model control plane
          </p>
        </header>

        <main className="w-full">
          <ModelMarketplace
            apiUrl="http://127.0.0.1:3001"
            theme="dark"
            compact={false}
            onSelect={handleModelSelect}
          />
        </main>
      </div>
    </div>
  );
}
