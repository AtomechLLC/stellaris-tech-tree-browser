import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "@react-sigma/core/lib/style.css";
import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}
rootElement.style.height = "100vh";

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
