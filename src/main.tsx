import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { convex } from "@/lib/convex";
import { ManifestSync } from "@/components/ManifestSync";
import Home from "@/routes/Home";
import Join from "@/routes/Join";
import Personal from "@/routes/Personal";
import Admin from "@/routes/Admin";
import Mundial from "@/routes/Mundial";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <ManifestSync />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/q/:id/join/:token" element={<Join />} />
          <Route path="/q/:id/me/:token" element={<Personal />} />
          <Route path="/q/:id/admin/:token" element={<Admin />} />
          <Route path="/q/:id/mundial" element={<Mundial />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ConvexProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* push opcional: si falla el registro, la app sigue funcionando in-app */
    });
  });
}
