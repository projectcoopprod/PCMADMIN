const express = require("express");
const path = require("path");
const app = express();

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    
    // Scripts: All CDNs + Firebase database for JSONP callbacks
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://cdn.tailwindcss.com " +
    "https://unpkg.com " +
    "https://cdn.jsdelivr.net " +
    "https://www.gstatic.com " +
    "https://cdnjs.cloudflare.com " +
    "https://presidential-car-museum-default-rtdb.asia-southeast1.firebasedatabase.app; " +
    
    // Styles: Tailwind, Google Fonts, Font Awesome
    "style-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://fonts.googleapis.com " +
    "https://cdnjs.cloudflare.com; " +
    
    // Images: Allow all HTTPS images (for user content flexibility)
    "img-src 'self' data: https: blob:; " +
    
    // Fonts: Google Fonts + Font Awesome
    "font-src 'self' data: " +
    "https://fonts.gstatic.com " +
    "https://cdnjs.cloudflare.com; " +
    
    // Connect: Firebase APIs + WebSockets
    "connect-src 'self' " +
    "https://*.firebaseio.com " +
    "https://*.firebasedatabase.app " +
    "wss://*.firebasedatabase.app " +
    "https://*.googleapis.com " +
    "https://www.gstatic.com " +
    "https://identitytoolkit.googleapis.com " +
    "https://securetoken.googleapis.com; " +
    
    // Frames: Google Maps embed only
    "frame-src 'self' https://www.google.com; " +
    
    // Security directives
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none';"
  );

  // Additional security headers
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
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
