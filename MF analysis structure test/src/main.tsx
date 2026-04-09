import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import App from "./App";
import { readDebugSnapshotFromSession } from "./debugSession";
import "./mfDebug";
import "./index.css";

if (typeof window !== "undefined") {
  (window as Window & { __MF_DEBUG_SNAPSHOT__?: () => ReturnType<typeof readDebugSnapshotFromSession> }).__MF_DEBUG_SNAPSHOT__ = () =>
    readDebugSnapshotFromSession();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
