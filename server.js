const express = require("express");
const path = require("path");
const app = express();

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    
    // Scripts: Firebase SDK modules + CDNs + Firebase database JSONP callbacks
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://cdn.tailwindcss.com " +
    "https://unpkg.com " +
    "https://cdn.jsdelivr.net " +
    "https://www.gstatic.com " +
    "https://cdnjs.cloudflare.com " +
    "https://*.asia-southeast1.firebasedatabase.app; " +
    
    // Styles: Tailwind + Google Fonts + Font Awesome
    "style-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://fonts.googleapis.com " +
    "https://cdnjs.cloudflare.com; " +
    
    // Images: Museum logo + any uploaded content
    "img-src 'self' data: https: blob:; " +
    
    // Fonts: Google Fonts + Font Awesome
    "font-src 'self' data: " +
    "https://fonts.gstatic.com " +
    "https://cdnjs.cloudflare.com; " +
    
    // Connect: Firebase Auth + Database + WebSockets
    "connect-src 'self' " +
    "https://*.firebaseio.com " +
    "https://*.firebasedatabase.app " +
    "wss://*.firebasedatabase.app " +
    "https://*.googleapis.com " +
    "https://www.gstatic.com " +
    "https://identitytoolkit.googleapis.com " +
    "https://securetoken.googleapis.com; " +
    
    // Frames: None needed for your admin dashboard
    "frame-src 'none'; " +
    
    // Security directives
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none';"
  );

  // Additional security headers
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  
  app.disable('x-powered-by');
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
