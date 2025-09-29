const express = require("express");
const path = require("path");
const app = express();

// =========================
// Security Headers Middleware
// =========================
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    
    // Scripts - Add missing CDNs
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://cdn.tailwindcss.com " +
    "https://unpkg.com " +
    "https://cdn.jsdelivr.net " +  // ADDED - for Chart.js
    "https://www.gstatic.com " +
    "https://cdnjs.cloudflare.com; " +
    
    // Styles - Add Google Fonts
    "style-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://fonts.googleapis.com " +  // ADDED - for Google Fonts
    "https://cdnjs.cloudflare.com; " +
    
    // Images
    "img-src 'self' data: https: blob:; " +
    
    // Fonts - Add Google Fonts
    "font-src 'self' data: " +
    "https://fonts.gstatic.com " +  // ADDED - for Google Fonts files
    "https://cdnjs.cloudflare.com; " +
    
    // Connect - Firebase WebSockets
    "connect-src 'self' " +
    "https://*.firebaseio.com " +
    "https://*.firebasedatabase.app " +
    "wss://*.firebasedatabase.app " +
    "https://*.googleapis.com " +
    "https://www.gstatic.com; " +
    
    // Frames
    "frame-src 'self' https://www.google.com; " +
    
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none';"
  );

  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  
  app.disable('x-powered-by');
  
  next();
});

// =========================
// Serve Static Files
// =========================
app.use(express.static(path.join(__dirname, "public")));

// =========================
// Routes
// =========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
