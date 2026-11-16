import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/push";
import { captureInstallPrompt } from "./lib/install";

captureInstallPrompt();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
