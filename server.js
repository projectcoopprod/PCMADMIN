const express = require("express");
const path = require("path");
const app = express();

// =========================
// Security Headers Middleware
// =========================
// =========================
// Security Headers Middleware
// =========================
app.use((req, res, next) => {
  // Content Security Policy - controls resource loading
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://www.gstatic.com https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://presidential-car-museum-default-rtdb.asia-southeast1.firebasedatabase.app https://www.gstatic.com; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "upgrade-insecure-requests"
  );
  
  // X-Frame-Options - prevents clickjacking (DENY is more secure than SAMEORIGIN)
  res.setHeader("X-Frame-Options", "DENY");
  
  // Referrer-Policy - controls referrer information
  res.setHeader("Referrer-Policy", "no-referrer");
  
  // Permissions-Policy - controls browser features
  res.setHeader("Permissions-Policy", 
    "camera=(), " +
    "microphone=(), " +
    "geolocation=(), " +
    "payment=(), " +
    "usb=(), " +
    "magnetometer=(), " +
    "gyroscope=(), " +
    "accelerometer=()"
  );
  
  // Strict-Transport-Security - enforces HTTPS
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  
  // X-Content-Type-Options - prevents MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // X-XSS-Protection - legacy XSS protection (for older browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  next();
});

// =========================
// Serve Static Files
// =========================
app.use(express.static(path.join(__dirname, "public")));

// Fallback (for SPAs, optional)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));


