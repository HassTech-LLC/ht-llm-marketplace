import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Standalone mount point for local dashboard on Port 3000
const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Custom Web Component registration for easy drop-in embeddability
class LuminaMarketplace extends HTMLElement {
  connectedCallback() {
    // Light DOM mount to allow styled overlays and standard CSS parsing
    const mountPoint = document.createElement('div');
    this.appendChild(mountPoint);

    // Read attributes dynamically
    const backendUrl = this.getAttribute('backend-url') || 'http://localhost:3001';

    // Inject compiled stylesheet from backend host if not loaded
    const styleId = 'lumina-widget-stylesheet';
    if (!document.getElementById(styleId)) {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = `${backendUrl}/widget/lumina-widget.css`;
      document.head.appendChild(link);
    }

    const root = ReactDOM.createRoot(mountPoint);
    root.render(
      <React.StrictMode>
        <App isWidget={true} backendUrl={backendUrl} />
      </React.StrictMode>
    );
  }
}

if (!customElements.get('lumina-marketplace')) {
  customElements.define('lumina-marketplace', LuminaMarketplace);
}
