import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { FloatingWindow } from "./pages/FloatingWindow";

import "./index.css";

// Simple routing based on URL path
function Router() {
  const path = window.location.pathname;

  // Floating window route
  if (path === '/floating') {
    // Add class to html for transparent background (needed for rounded corners)
    document.documentElement.classList.add('floating-window');
    return <FloatingWindow />;
  }

  // Default: main app
  return (
    <>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
        }}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
