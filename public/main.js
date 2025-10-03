// ============================================================
// Firebase Imports
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, remove, push, update, get, child, set } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// ============================================================
// Firebase Configuration
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyB3xZaZjQrNRODplN6mXhAzDTHqmRcxYHk",
  authDomain: "presidential-car-museum.firebaseapp.com",
  databaseURL: "https://presidential-car-museum-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "presidential-car-museum",
  storageBucket: "presidential-car-museum.appspot.com",
  messagingSenderId: "888401660663",
  appId: "1:888401660663:web:82b179145c73decfec21f2",
  measurementId: "G-7PWEKQW7ZE"
};

// ============================================================
// Initialize Firebase
// ============================================================
let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
  hideLoadingScreen();
  showError("Failed to initialize Firebase. Please check your configuration.");
}

// ============================================================
// Global State
// ============================================================
let combinedData = [];
let isAuthenticated = false;
let isAppReady = false;
let isSuperAdmin = false;
let superAdminIdle = false;
let currentUsername = null;
let currentAdminSessionKey = null;
let roleChartInstance = null;
let timeChartInstance = null;
let dateChartInstance = null;

let loginAttempts = 0;
let loginLockoutUntil = null;
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION = 30000;

const studentsRef = ref(db, "students");
const visitorsRef = ref(db, "visitors");
const unlockReqsRef = ref(db, "unlock_requests");
const adminSessionsRef = ref(db, "admin_sessions");
const adminsRef = ref(db, "admins");
const superAdminRef = ref(db, "super_admin");

// ============================================================
// Utility Functions
// ============================================================
function updateConnectionStatus(message, color) {
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.innerHTML = `<span class="text-${color}-400">${message}</span>`;
  }
}

// Login Functions
async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorEl = document.getElementById("login-error");
  const unlockBtn = document.getElementById("request-superadmin-btn");
  const statusEl = document.getElementById("sa-request-status");

  errorEl.classList.add("hidden");
  if (unlockBtn) unlockBtn.classList.add("hidden");
  if (statusEl) statusEl.classList.add("hidden");

  // Check if user is locked out
  if (loginLockoutUntil && Date.now() < loginLockoutUntil) {
    const remainingTime = Math.ceil((loginLockoutUntil - Date.now()) / 1000);
    errorEl.textContent = `Account locked. Please wait ${remainingTime} seconds or request Super Admin unlock.`;
    errorEl.classList.remove("hidden");
    
    // Show unlock request button
    if (unlockBtn) unlockBtn.classList.remove("hidden");
    
    return;
  }

  // Reset lockout if time has passed
  if (loginLockoutUntil && Date.now() >= loginLockoutUntil) {
    loginAttempts = 0;
    loginLockoutUntil = null;
    if (unlockBtn) unlockBtn.classList.add("hidden");
  }

  try {
    console.log('Login attempt:', { username, password });
    const hashed = await sha256(password);
    console.log('Hashed password:', hashed);

    // Check super admin
    const saSnap = await get(superAdminRef);
    const saData = saSnap.val();
    console.log('Super admin data from Firebase:', saData);
    const saPass = saData?.password || saData?.passwordHash;
    const isSaMatch = saData
      && saData.username === username
      && (saPass === hashed || saPass === password);
    console.log('Super admin match:', isSaMatch);
    
    if (isSaMatch) {
      // Reset login attempts on successful login
      loginAttempts = 0;
      loginLockoutUntil = null;
      if (unlockBtn) unlockBtn.classList.add("hidden");
      
      isSuperAdmin = true;
      currentUsername = username;
      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("dashboard").classList.remove("hidden");
      document.getElementById("btn-unlocks").classList.remove("hidden");
      document.getElementById("btn-sessions").classList.remove("hidden");
      document.getElementById("btn-admins").classList.remove("hidden");
      document.getElementById("btn-settings").classList.remove("hidden");
      document.getElementById("welcome-label").textContent = `Welcome, Super Admin`;
      updateSuperAdminDisplay();
      startInactivityTimer();
      return;
    }

    // Check regular admins
    const adminSnap = await get(adminsRef);
    const admins = adminSnap.val() || {};
    console.log('Admins data from Firebase:', admins);
    const usernameKey = Object.keys(admins).find(k => k.toLowerCase() === username.toLowerCase());
    const adminRecord = usernameKey ? admins[usernameKey] : undefined;
    console.log('Matched admin record:', adminRecord);
    const adminPass = adminRecord?.passwordHash || adminRecord?.password;
    const isAdminMatch = adminRecord && (adminPass === hashed || adminPass === password);
    console.log('Admin match:', isAdminMatch);
    
    if (isAdminMatch) {
      // Reset login attempts on successful login
      loginAttempts = 0;
      loginLockoutUntil = null;
      if (unlockBtn) unlockBtn.classList.add("hidden");
      
      currentUsername = usernameKey;
      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("dashboard").classList.remove("hidden");
      document.getElementById("welcome-label").textContent = `Welcome, Admin ${usernameKey}`;
      updateSuperAdminDisplay();
      startInactivityTimer();
      return;
    }

    // Failed login attempt
    loginAttempts++;
    console.log(`Failed login attempt ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}`);

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      loginLockoutUntil = Date.now() + LOCKOUT_DURATION;
      errorEl.textContent = `Too many failed attempts. Account locked for ${LOCKOUT_DURATION / 1000} seconds.`;
      errorEl.classList.remove("hidden");
      
      // Show unlock request button
      if (unlockBtn) unlockBtn.classList.remove("hidden");
      
      console.log('Account locked until:', new Date(loginLockoutUntil));
    } else {
      const attemptsLeft = MAX_LOGIN_ATTEMPTS - loginAttempts;
      errorEl.textContent = `Invalid credentials. ${attemptsLeft} attempt(s) remaining.`;
      errorEl.classList.remove("hidden");
    }

  } catch (err) {
    console.error("Login error:", err);
    errorEl.textContent = "Login failed. Try again.";
    errorEl.classList.remove("hidden");
  }
}
// Expose to HTML
window.login = login;

function hideLoadingScreen() {
  document.getElementById("loading-screen")?.classList.add("hidden");
  document.getElementById("login-section")?.classList.remove("hidden");
}

function showError(msg) {
  const el = document.getElementById("login-error");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}

function fmtTime(ts) {
  try { return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; }
  catch { return ""; }
}

function fmtDate(ts) {
  try { return ts ? new Date(ts).toLocaleDateString() : ""; }
  catch { return ""; }
}

async function sha256(text) {
  if (window.crypto?.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  if (window.sha256) return window.sha256(text);
  throw new Error("No SHA-256 available");
}

function requireSuperAdmin() {
  if (!isSuperAdmin) {
    alert('Only Super Admin can perform this action.');
    return false;
  }
  return true;
}

// ============================================================
// Firebase Authentication
// ============================================================
function initializeSecureAuth() {
  updateConnectionStatus("🔄 Connecting to database...", "amber");

  onAuthStateChanged(auth, (user) => {
    if (user) {
      isAuthenticated = true;
      updateConnectionStatus("✅ Connected to database", "green");
      if (!isAppReady) {
        initializeDatabaseListeners();
        isAppReady = true;
      }
    } else {
      updateConnectionStatus("🔄 Signing in anonymously...", "amber");
      signInAnonymously(auth).catch((error) => {
        console.error("❌ Authentication failed:", error);
        updateConnectionStatus("❌ Connection failed", "red");
        showError(`Failed to connect to database: ${error.message}.`);
      });
    }
  });
}

// ============================================================
// Database Listeners
// ============================================================
function initializeDatabaseListeners() {
  onValue(studentsRef, (snapshot) => {
    const data = snapshot.val() || {};
    const students = Object.entries(data).map(([id, v]) => ({ id, ...v, _path: "students", _roleNorm: "student" }));
    combinedData = [...students, ...combinedData.filter(x => x._path !== "students")];
    refreshUI();
  });

  onValue(visitorsRef, (snapshot) => {
    const data = snapshot.val() || {};
    const visitors = Object.entries(data).map(([id, v]) => ({ id, ...v, _path: "visitors", _roleNorm: "visitor" }));
    combinedData = [...combinedData.filter(x => x._path !== "visitors"), ...visitors];
    refreshUI();
  });

  // Unlock requests listener with real-time unlock AND auto-login
  onValue(unlockReqsRef, (snapshot) => {
    const data = snapshot.val() || {};
    populateUnlockRequests(data);
    
    // Check if current locked-out user has been approved
    if (loginLockoutUntil && Date.now() < loginLockoutUntil) {
      const currentUser = document.getElementById("username")?.value?.trim();
      const currentPass = document.getElementById("password")?.value?.trim();
      
      if (currentUser) {
        // Find any approved request for this user
        const approvedRequest = Object.entries(data).find(
          ([reqId, req]) => 
            req.username === currentUser && 
            req.status === 'Approved' &&
            req.requestedAt > (Date.now() - 300000) // Within last 5 minutes
        );
        
        if (approvedRequest) {
          // Unlock the user immediately
          loginAttempts = 0;
          loginLockoutUntil = null;
          
          const errorEl = document.getElementById("login-error");
          if (errorEl) {
            errorEl.textContent = '✓ Your account has been unlocked! Logging you in...';
            errorEl.classList.remove("hidden");
            errorEl.classList.remove('bg-red-900', 'text-red-200');
            errorEl.classList.add('bg-green-900', 'text-green-200');
          }
          
          const statusEl = document.getElementById('sa-request-status');
          if (statusEl) {
            statusEl.textContent = '✓ Approved! Logging you in...';
            statusEl.classList.add('text-green-400');
            statusEl.classList.remove('hidden');
          }
          
          // Hide unlock button
          const unlockBtn = document.getElementById("request-superadmin-btn");
          if (unlockBtn) unlockBtn.classList.add("hidden");
          
          console.log('User unlocked via Super Admin approval - auto-logging in');
          
          // AUTO-LOGIN: Trigger login after 1 second
          setTimeout(async () => {
            if (currentPass) {
              // Simulate login button click with the stored credentials
              const loginEvent = new Event('submit', { cancelable: true, bubbles: true });
              const loginForm = document.querySelector('#login-section form');
              if (loginForm) {
                loginForm.dispatchEvent(loginEvent);
              }
            } else {
              // If no password stored, just show success message
              if (errorEl) {
                errorEl.textContent = '✓ Account unlocked! Please enter your password and login.';
              }
            }
          }, 1000);
        }
      }
    }
  });

  onValue(adminSessionsRef, (snapshot) => {
    populateAdminSessions(snapshot.val() || {});
  });

  onValue(adminsRef, (snapshot) => {
    populateAdmins(snapshot.val() || {});
  });
}

// ============================================================
// Approve Unlock Request Function
// ============================================================
async function approveUnlockRequest(reqId) {
  if (!requireSuperAdmin()) return;
  if (!reqId) return;
  
  try {
    stopInactivityTimer();
    
    // Get the request data first to know which user to unlock
    const reqSnap = await get(ref(db, `unlock_requests/${reqId}`));
    const reqData = reqSnap.val();
    
    if (!reqData) {
      alert('Request not found');
      startInactivityTimer();
      return;
    }
    
    // Update the request status
    await update(ref(db, `unlock_requests/${reqId}`), { 
      status: 'Approved',
      approvedAt: Date.now(),
      approvedBy: currentUsername
    });
    
    console.log('Unlock request approved:', reqId, 'for user:', reqData.username);
    alert(`Unlock request approved for '${reqData.username}'. They can now login.`);
    
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to approve unlock request:', e);
    alert('Failed to approve: ' + e.message);
    startInactivityTimer();
  }
}

// ============================================================
// Reject Unlock Request Function
// ============================================================
async function rejectUnlockRequest(reqId) {
  if (!requireSuperAdmin()) return;
  if (!reqId) return;
  
  try {
    stopInactivityTimer();
    
    await update(ref(db, `unlock_requests/${reqId}`), { 
      status: 'Rejected',
      rejectedAt: Date.now(),
      rejectedBy: currentUsername
    });
    
    console.log('Unlock request rejected:', reqId);
    alert(`Unlock request rejected.`);
    
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to reject:', e);
    alert('Failed to reject: ' + e.message);
    startInactivityTimer();
  }
}

// ============================================================
// Request Super Admin Unlock Function
// ============================================================
async function requestSuperAdminUnlock() {
  const username = document.getElementById('username').value.trim();
  if (!username) {
    alert('Please enter your username first');
    return;
  }
  
  try {
    // Check if there's already a pending request for this user
    const snapshot = await get(unlockReqsRef);
    const requests = snapshot.val() || {};
    
    const existingPending = Object.values(requests).find(
      req => req.username === username && 
             req.status === 'Pending' &&
             req.requestedAt > (Date.now() - 300000) // Within last 5 minutes
    );
    
    if (existingPending) {
      const statusEl = document.getElementById('sa-request-status');
      if (statusEl) {
        statusEl.textContent = 'Unlock request already sent. Waiting for Super Admin approval...';
        statusEl.classList.remove('hidden');
      }
      return;
    }
    
    // Create new unlock request
    const newReqRef = push(unlockReqsRef);
    await set(newReqRef, {
      username: username,
      client: 'Web Admin - Locked Out',
      requestedAt: Date.now(),
      status: 'Pending',
      attemptCount: loginAttempts
    });
    
    const statusEl = document.getElementById('sa-request-status');
    if (statusEl) {
      statusEl.textContent = 'Unlock request sent. Waiting for Super Admin approval...';
      statusEl.classList.remove('hidden');
      statusEl.classList.remove('text-green-400');
      statusEl.classList.add('text-amber-300');
    }
    
    console.log('Unlock request created for:', username);
    
  } catch (e) {
    console.error('Failed to request unlock:', e);
    alert('Failed to send unlock request: ' + e.message);
  }
}

// Make sure to expose the updated functions
window.approveUnlockRequest = approveUnlockRequest;
window.rejectUnlockRequest = rejectUnlockRequest;
window.requestSuperAdminUnlock = requestSuperAdminUnlock;

// ============================================================
// App Initialization
// ============================================================
function initializeApplication() {
  const loadingTimeout = setTimeout(() => {
    updateConnectionStatus("⏰ Connection timeout", "red");
    showError("Connection timeout. Please refresh the page.");
  }, 15000);

  initializeSecureAuth();

  const originalUpdateStatus = updateConnectionStatus;
  updateConnectionStatus = function (message, color) {
    if (color === "green") clearTimeout(loadingTimeout);
    originalUpdateStatus(message, color);
  };
}

// ============================================================
// Start Application
// ============================================================
initializeApplication();

// Expose functions needed in HTML
window.showError = showError;
window.sha256 = sha256;
window.showTab = showTab;
window.logout = logout;

// ============================================================
// UI Refresh (Counts + Tables)
// ============================================================
function refreshUI() {
  try {
    const students = combinedData.filter(x => x._roleNorm === "student");
    const visitors = combinedData.filter(x => x._roleNorm === "visitor");

    const studentCountEl = document.getElementById("studentCount");
    const visitorCountEl = document.getElementById("visitorCount");
    const totalCountEl = document.getElementById("totalCount");

    if (studentCountEl) studentCountEl.textContent = String(students.length);
    if (visitorCountEl) visitorCountEl.textContent = String(visitors.length);
    if (totalCountEl) totalCountEl.textContent = String(students.length + visitors.length);

    // Tables
    const studentTbody = document.getElementById("student-table-body");
    const visitorTbody = document.getElementById("visitor-table-body");

    if (studentTbody) {
      studentTbody.innerHTML = "";
      for (const item of students) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="py-3 px-6">${escapeHtml(item.nickname || item.name || item.fullname || "—")}</td>
          <td class="py-3 px-6">${escapeHtml(item.location || item.address || "—")}</td>
         <td class="py-3 px-6">${fmtTime(item.visit_time || item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6">${fmtDate(item.visit_time || item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6"><span class="text-slate-400 text-xs">—</span></td>`;
        // Add delete button for students
        const tdAction = tr.querySelector('td:last-child');
        if (tdAction) {
          tdAction.innerHTML = `<button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button>`;
          const deleteBtn = tdAction.querySelector('button');
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete student '${escapeHtml(item.nickname || item.name || item.fullname || '—')}'?`)) {
              deleteStudent(item.id);
            }
          });
        }
        studentTbody.appendChild(tr);
      }
    }

    if (visitorTbody) {
      visitorTbody.innerHTML = "";
      for (const item of visitors) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="py-3 px-6">${escapeHtml(item.nickname || item.name || item.fullname || "—")}</td>
          <td class="py-3 px-6">${escapeHtml(item.location || item.address || "—")}</td>
          <td class="py-3 px-6">${fmtTime(item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6">${fmtDate(item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6"><span class="text-slate-400 text-xs">—</span></td>`;
        // Add delete button for visitors
        const tdAction = tr.querySelector('td:last-child');
        if (tdAction) {
          tdAction.innerHTML = `<button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button>`;
          const deleteBtn = tdAction.querySelector('button');
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete visitor '${escapeHtml(item.nickname || item.name || item.fullname || '—')}'?`)) {
              deleteVisitor(item.id);
            }
          });
        }
        visitorTbody.appendChild(tr);
      }
    }

  } catch (e) {
    console.error("refreshUI error:", e);
  }

  // Update charts after counts/tables
  try { renderCharts(); } catch (e) { console.error("renderCharts error:", e); }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ============================================================
// Tabs + Logout
// ============================================================
function showTab(tabName, event) {
  try {
    if (event?.preventDefault) event.preventDefault();

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    // Show selected
    const active = document.getElementById(`tab-${tabName}`);
    if (active) active.classList.remove('hidden');

    // Update button styles
    const activeClasses = ['bg-indigo-600', 'text-white'];
    const inactiveClasses = ['text-slate-200'];
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove(...activeClasses);
      if (!btn.classList.contains('hidden')) btn.classList.add(...inactiveClasses);
    });
    if (event?.currentTarget) {
      const btn = event.currentTarget;
      btn.classList.remove(...inactiveClasses);
      btn.classList.add(...activeClasses);
    }
  } catch (e) {
    console.error('showTab error:', e);
  }
}

function logout() {
  try {
    isSuperAdmin = false;
    isAuthenticated = false;
    currentUsername = null;

    // Simple UI reset
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('login-section')?.classList.remove('hidden');
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';

    // Hide superadmin-only tabs next time
    document.getElementById('btn-unlocks')?.classList.add('hidden');
    document.getElementById('btn-sessions')?.classList.add('hidden');
    document.getElementById('btn-admins')?.classList.add('hidden');
    document.getElementById('btn-settings')?.classList.add('hidden');

    // Default to home tab when back in dashboard
    showTab('home');
    stopInactivityTimer();
  } catch (e) {
    console.error('logout error:', e);
  }
}

// ============================================================
// Charts (Chart.js) - FIXED VERSION
// ============================================================
function renderCharts() {
  // FIXED: Include both students and visitors for the role chart
  const byRole = aggregateByRole(combinedData);
  const byHour = aggregateByHour(combinedData);
  const byDay = aggregateByDay(combinedData);

  // Role Chart
  const roleCtx = document.getElementById('roleChart')?.getContext?.('2d');
  if (roleCtx) {
    if (roleChartInstance) roleChartInstance.destroy();
    roleChartInstance = new window.Chart(roleCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(byRole),
        datasets: [{
          data: Object.values(byRole),
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
        }]
      },
      options: { plugins: { legend: { labels: { color: '#e5e7eb' } } } }
    });
  }

  // Time (by hour) Chart
  const timeCtx = document.getElementById('timeChart')?.getContext?.('2d');
  if (timeCtx) {
    const labels = [...Array(24).keys()].map(h => h.toString().padStart(2, '0'));
    const values = labels.map(h => byHour[h] || 0);
    if (timeChartInstance) timeChartInstance.destroy();
    timeChartInstance = new window.Chart(timeCtx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Visits', data: values, backgroundColor: '#22c55e' }] },
      options: {
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } }
        },
        plugins: { legend: { labels: { color: '#e5e7eb' } } }
      }
    });
  }

  // Date (by weekday) Chart
  const dateCtx = document.getElementById('dateChart')?.getContext?.('2d');
  if (dateCtx) {
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const values = labels.map((_, i) => byDay[i] || 0);
    if (dateChartInstance) dateChartInstance.destroy();
    dateChartInstance = new window.Chart(dateCtx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Visits', data: values, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.25)', tension: 0.35, fill: true }] },
      options: {
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
        },
        plugins: { legend: { labels: { color: '#e5e7eb' } } }
      }
    });
  }
}

function coerceTimestamp(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// FIXED: Improved aggregateByRole function
function aggregateByRole(items) {
  const counts = {};
  for (const it of items) {
    // Check _roleNorm first, then fallback to role, then use _path as last resort
    let role = it._roleNorm || it.role;
    if (!role && it._path) {
      role = it._path === 'students' ? 'student' : 'visitor';
    }
    if (!role) role = 'unknown';
    
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function aggregateByHour(items) {
  const counts = {};
  for (const it of items) {
    const ts = coerceTimestamp(it.visit_time || it.timestamp || it.time || it.date || it.dateTime);
    if (ts == null) continue;
    const hour = new Date(ts).getHours().toString().padStart(2, '0');
    counts[hour] = (counts[hour] || 0) + 1;
  }
  return counts;
}

function aggregateByDay(items) {
  const counts = {};
  for (const it of items) {
    const ts = coerceTimestamp(it.timestamp || it.time || it.date || it.dateTime);
    if (ts == null) continue;
    const day = new Date(ts).getDay(); // 0-6
    counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}

// ====================== POPULATE ADMINS ======================
function populateAdmins(data) {
  const tbody = document.getElementById("admins-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [username, adminData] of Object.entries(data)) {
    const tr = document.createElement("tr");

    const tdUser = document.createElement("td");
    tdUser.className = "py-3 px-6";
    tdUser.textContent = username;

    const tdCreated = document.createElement("td");
    tdCreated.className = "py-3 px-6";
    tdCreated.textContent = adminData.createdAt
      ? new Date(adminData.createdAt).toLocaleString()
      : "—";

    const tdAction = document.createElement("td");
    tdAction.className = "py-3 px-6";
    tdAction.innerHTML = `<button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button>`;

    tr.append(tdUser, tdCreated, tdAction);
    tbody.appendChild(tr);
    // Attach delete event
    const deleteBtn = tdAction.querySelector('button');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete admin '${username}'?`)) {
          deleteAdmin(username);
        }
      });
    }
  }
}

// ====================== POPULATE UNLOCK REQUESTS ======================
function populateUnlockRequests(data) {
  const tbody = document.getElementById("unlock-req-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [reqId, reqData] of Object.entries(data)) {
    const tr = document.createElement("tr");

    const tdReqId = document.createElement("td");
    tdReqId.className = "py-3 px-6";
    tdReqId.textContent = reqId;

    const tdClient = document.createElement("td");
    tdClient.className = "py-3 px-6";
    tdClient.textContent = reqData.client || "—";

    const tdUsername = document.createElement("td");
    tdUsername.className = "py-3 px-6";
    tdUsername.textContent = reqData.username || "—";

    const tdRequested = document.createElement("td");
    tdRequested.className = "py-3 px-6";
    tdRequested.textContent = reqData.requestedAt
      ? new Date(reqData.requestedAt).toLocaleString()
      : "—";

    const tdStatus = document.createElement("td");
    tdStatus.className = "py-3 px-6";
    tdStatus.textContent = reqData.status || "Pending";

    const tdAction = document.createElement("td");
    tdAction.className = "py-3 px-6";
    tdAction.innerHTML = `
      <button class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs mr-2">Approve</button>
      <button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Reject</button>
    `;

    tr.append(tdReqId, tdClient, tdUsername, tdRequested, tdStatus, tdAction);
    tbody.appendChild(tr);
  }

  // Attach approve/reject event listeners after populating unlock requests
  const rows = tbody.querySelectorAll('tr');
  Object.keys(data).forEach((reqId, idx) => {
    const approveBtn = rows[idx]?.querySelector('button:nth-child(1)');
    const rejectBtn = rows[idx]?.querySelector('button:nth-child(2)');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => {
        if (confirm(`Approve unlock request '${reqId}'?`)) {
          approveUnlockRequest(reqId);
        }
      });
    }
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => {
        if (confirm(`Reject unlock request '${reqId}'?`)) {
          rejectUnlockRequest(reqId);
        }
      });
    }
  });
}  

function populateAdminSessions(data) {
  const tbody = document.getElementById("admin-session-table-body");

  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [sessionId, sessionData] of Object.entries(data)) {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.className = "py-3 px-6";
    tdId.textContent = sessionId;

    const tdUser = document.createElement("td");
    tdUser.className = "py-3 px-6";
    tdUser.textContent = sessionData.username || "—";

    const tdIn = document.createElement("td");
    tdIn.className = "py-3 px-6";
    tdIn.textContent = sessionData.timeIn
      ? new Date(sessionData.timeIn).toLocaleString()
      : "—";

    const tdOut = document.createElement("td");
    tdOut.className = "py-3 px-6";
    tdOut.textContent = sessionData.timeOut
      ? new Date(sessionData.timeOut).toLocaleString()
      : "—";

    tr.append(tdId, tdUser, tdIn, tdOut);
    tbody.appendChild(tr);
  }
}

// Super Admin Settings Functions
async function changeSuperAdminUsername(event) {
  event.preventDefault();
  if (!requireSuperAdmin()) return;
  
  const newUsername = document.getElementById('new-username').value.trim();
  if (!newUsername) {
    alert('Please enter a new username');
    return;
  }
  
  if (newUsername.toLowerCase() === 'superadmin') {
    alert('Cannot use "superadmin" as username');
    return;
  }
  
  try {
    // Get current superadmin data
    const saSnap = await get(superAdminRef);
    if (!saSnap.exists()) {
      alert('Superadmin account not found');
      return;
    }
    
    const currentData = saSnap.val();
    
    // Update username
    await update(superAdminRef, {
      username: newUsername,
      updatedAt: Date.now()
    });
    
    alert(`Username changed successfully to "${newUsername}". You will need to log in again.`);
    
    // Clear form
    document.getElementById('new-username').value = '';
    
    // Update display
    updateSuperAdminDisplay();
    startInactivityTimer();
    
    // Logout after 2 seconds
    setTimeout(() => {
      logout();
    }, 2000);
    
  } catch (e) {
    console.error(e);
    alert('Failed to change username');
  }
}

async function changeSuperAdminPassword(event) {
  event.preventDefault();
  if (!requireSuperAdmin()) return;
  
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    alert('Please fill in all password fields');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    alert('New passwords do not match');
    return;
  }
  
  if (newPassword.length < 6) {
    alert('New password must be at least 6 characters long');
    return;
  }
  
  try {
    // Get current superadmin data
    const saSnap = await get(superAdminRef);
    if (!saSnap.exists()) {
      alert('Superadmin account not found');
      return;
    }
    
    const currentData = saSnap.val();
    const currentHash = (currentData?.passwordHash || '').trim().toLowerCase();
    
    // Verify current password
    const inputHash = (await sha256(currentPassword)).toLowerCase();
    if (inputHash !== currentHash) {
      alert('Current password is incorrect');
      return;
    }
    
    // Update password
    const newHash = (await sha256(newPassword)).toLowerCase();
    await update(superAdminRef, {
      passwordHash: newHash,
      updatedAt: Date.now()
    });
    
    alert('Password changed successfully. You will need to log in again.');
    
    // Clear form
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    
    // Update display
    updateSuperAdminDisplay();
    startInactivityTimer();
    
    // Logout after 2 seconds
    setTimeout(() => {
      logout();
    }, 2000);
    
  } catch (e) {
    console.error(e);
    alert('Failed to change password');
  }
}

// ====================== DELETE ADMIN FUNCTION ======================
async function deleteAdmin(username) {
  if (!isSuperAdmin) {
    alert('Only Super Admin can delete admins.');
    return;
  }
  if (!username) return;
  try {
    await remove(ref(db, `admins/${username}`));
    alert(`Admin '${username}' deleted successfully.`);
  } catch (e) {
    console.error('Failed to delete admin:', e);
    alert('Failed to delete admin.');
  }
}

// ====================== DELETE STUDENT FUNCTION ======================
async function deleteStudent(studentId) {
  if (!isAuthenticated) {
    alert('You must be logged in to delete students.');
    return;
  }
  if (!studentId) return;
  try {
    await remove(ref(db, `students/${studentId}`));
    alert('Student deleted successfully.');
  } catch (e) {
    console.error('Failed to delete student:', e);
    alert('Failed to delete student.');
  }
}

// ====================== DELETE VISITOR FUNCTION ======================
async function deleteVisitor(visitorId) {
  if (!isAuthenticated) {
    alert('You must be logged in to delete visitors.');
    return;
  }
  if (!visitorId) return;
  try {
    await remove(ref(db, `visitors/${visitorId}`));
    alert('Visitor deleted successfully.');
  } catch (e) {
    console.error('Failed to delete visitor:', e);
    alert('Failed to delete visitor.');
  }
}

// ====================== UPDATE SUPER ADMIN DISPLAY ======================
function updateSuperAdminDisplay() {
  // Display current username in Super Admin Settings tab
  const usernameEl = document.getElementById('display-username');
  if (usernameEl) {
    usernameEl.textContent = currentUsername || '';
  }
  // Also update the input in the change-username form
  const currentUsernameInput = document.getElementById('current-username');
  if (currentUsernameInput) {
    currentUsernameInput.value = currentUsername || '';
  }
}

// ====================== AUTO LOGOUT SESSION ======================
let inactivityTimeout = null;
let lastActivityTime = Date.now();

function getAutoLogoutDuration() {
  // 4 seconds for superadmin, 30 seconds for admin
  return isSuperAdmin ? 4000 : 30000;
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  lastActivityTime = Date.now();
  if (isAuthenticated) {
    inactivityTimeout = setTimeout(() => {
      alert('Session expired due to inactivity. You will be logged out.');
      logout();
    }, getAutoLogoutDuration());
  }
}

// Listen for user activity
['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, true);
});

// Start timer after login
function startInactivityTimer() {
  resetInactivityTimer();
}

// Stop timer on logout
function stopInactivityTimer() {
  clearTimeout(inactivityTimeout);
}

// ====================== CREATE ADMIN FUNCTION ======================
async function createAdmin(event) {
  event.preventDefault();
  if (!isSuperAdmin) {
    alert("Only Super Admin can create admins.");
    return;
  }

  const username = document.getElementById("new-admin-username").value.trim();
  const password = document.getElementById("new-admin-password").value.trim();

  if (!username || !password) {
    alert("Please provide both username and password.");
    return;
  }

  try {
    const hashedPassword = await sha256(password);

    // Save to Firebase under admins/
    await set(ref(db, `admins/${username}`), {
      passwordHash: hashedPassword,
      createdAt: Date.now()
    });

    alert(`Admin '${username}' created successfully.`);
    
    // Clear form
    document.getElementById("new-admin-username").value = "";
    document.getElementById("new-admin-password").value = "";

    // Refresh admin table
    const adminSnap = await get(adminsRef);
    populateAdmins(adminSnap.val() || {});
  } catch (e) {
    console.error("Failed to create admin:", e);
    alert("Failed to create admin: " + e.message);
  }
}

// Expose to HTML
window.createAdmin = createAdmin;
window.changeSuperAdminUsername = changeSuperAdminUsername;
window.changeSuperAdminPassword = changeSuperAdminPassword;



