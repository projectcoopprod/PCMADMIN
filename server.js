const express = require("express");
const path = require("path");
const app = express();

// =========================
// Security Headers Middleware
// =========================
app.use((req, res, next) => {
  // Content Security Policy - More specific and secure
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    
    // Scripts: Allow Firebase, Tailwind, and necessary CDNs
    "script-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://unpkg.com/scrollreveal@4.0.9/ " +
    "https://www.gstatic.com/firebasejs/ " +
    "https://cdnjs.cloudflare.com/ajax/libs/; " +
    
    // Styles: Limited to necessary sources
    "style-src 'self' 'unsafe-inline' " +
    "https://cdn.tailwindcss.com " +
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/; " +
    
    // Images: Allow external images and maps
    "img-src 'self' data: https: blob:; " +
    
    // Fonts: FontAwesome and other CDN fonts
    "font-src 'self' data: " +
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/; " +
    
    // Connect: Firebase databases and APIs - INCLUDES WSS for WebSockets
    "connect-src 'self' " +
    "https://*.firebaseio.com " +
    "https://*.firebasedatabase.app " +
    "wss://*.firebasedatabase.app " +  // Critical for Firebase Realtime DB
    "https://*.googleapis.com " +
    "https://www.gstatic.com " +
    "https://identitytoolkit.googleapis.com " +
    "https://securetoken.googleapis.com; " +
    
    // Frames: Google Maps embed
    "frame-src 'self' https://www.google.com/maps/; " +
    
    // Prevent your site from being framed by others
    "frame-ancestors 'none'; " +
    
    // Restrict base URL and form submissions
    "base-uri 'self'; " +
    "form-action 'self'; " +
    
    // Block all object/embed tags (Flash, etc.)
    "object-src 'none'; " +
    
    // Only load media from self
    "media-src 'self'; " +
    
    // Upgrade insecure requests to HTTPS
    "upgrade-insecure-requests;"
  );

  // Additional Security Headers
  res.setHeader("X-Frame-Options", "DENY"); // Stronger than SAMEORIGIN
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", 
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );
  
  // HSTS - Force HTTPS (only enable if you have SSL)
  // Uncomment when you have HTTPS configured on Render:
  // res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  
  // Remove identifying headers
  app.disable('x-powered-by');
  
  next();
});

// =========================
// Serve Static Files
// =========================
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));

// =========================
// Routes
// =========================
// Health check endpoint (useful for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Fallback route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// Error Handling
// =========================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
