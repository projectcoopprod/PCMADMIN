// =========================
// Security Headers Middleware
// =========================
app.use((req, res, next) => {
  // Content Security Policy - controls resource loading
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://www.gstatic.com https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "connect-src 'self' https://*.firebaseio.com https://*.firebasedatabase.app https://presidential-car-museum-default-rtdb.asia-southeast1.firebasedatabase.app https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  
  // X-Frame-Options - prevents clickjacking (SAMEORIGIN allows your own frames)
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  
  // Referrer-Policy - controls referrer information
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
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
  
  // Strict-Transport-Security - enforces HTTPS (only if using HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  
  // X-Content-Type-Options - prevents MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // X-XSS-Protection - legacy XSS protection (for older browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  next();
});
