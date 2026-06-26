import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./theme.js"; // applies the saved light/dark/system theme before render
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
