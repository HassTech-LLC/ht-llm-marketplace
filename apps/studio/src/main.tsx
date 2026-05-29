import React from "react";
import { createRoot } from "react-dom/client";
import "@ht-llm-marketplace/react/styles.css";
import { App } from "./App";
import "./page.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
