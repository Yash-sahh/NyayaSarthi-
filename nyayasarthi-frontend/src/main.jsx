import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";

// Check where your i18n file actually lives:
// If it's in src/locales/i18n.js:
// import "./locales/i18n.js"; 

// Or if it lacks an extension / uses .jsx:
import "./i18n"; 

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
