import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ModelMarketplace } from "@ht-llm-marketplace/react";
import styles from "@ht-llm-marketplace/react/styles.css?inline";
import { configFromAttributes, WEB_COMPONENT_ATTRIBUTES } from "./config.js";

class HTModelMarketplace extends HTMLElement {
  static observedAttributes = WEB_COMPONENT_ATTRIBUTES;

  private root?: Root;
  private mount?: HTMLDivElement;

  connectedCallback() {
    this.setupShadow();
    this.renderMarketplace();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this.renderMarketplace();
    }
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = undefined;
  }

  private setupShadow() {
    if (this.mount) return;
    const shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    this.mount = mount;
    this.root = createRoot(mount);
  }

  private renderMarketplace() {
    if (!this.root) return;
    this.root.render(<ModelMarketplace config={configFromAttributes(this)} />);
  }
}

if (!customElements.get("ht-model-marketplace")) {
  customElements.define("ht-model-marketplace", HTModelMarketplace);
}

if (!customElements.get("lumina-marketplace")) {
  customElements.define("lumina-marketplace", HTModelMarketplace);
}
