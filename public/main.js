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
  console.error("Firebase initialization failed:", error);
  alert("Failed to initialize Firebase. Please check your configuration.");
}

// ============================================================
// Global State
// ============================================================
let combinedData = [];
let isAuthenticated = false;
let isAppReady = false;
let isSuperAdmin = false;
let currentUsername = null;
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
  throw new Error("No SHA-256 available");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requireSuperAdmin() {
  if (!isSuperAdmin) {
    alert('Only Super Admin can perform this action.');
    return false;
  }
  return true;
}

// ============================================================
// Login Function
// ============================================================
async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorEl = document.getElementById("login-error");

  errorEl.classList.add("hidden");

  if (loginLockoutUntil && Date.now() < loginLockoutUntil) {
    const remainingSeconds = Math.ceil((loginLockoutUntil - Date.now()) / 1000);
    errorEl.textContent = `Too many failed attempts. Please wait ${remainingSeconds} seconds.`;
    errorEl.classList.remove("hidden");
    return;
  }

  if (loginLockoutUntil && Date.now() >= loginLockoutUntil) {
    loginAttempts = 0;
    loginLockoutUntil = null;
  }

  try {
    const hashed = await sha256(password);

    const saSnap = await get(superAdminRef);
    const saData = saSnap.val();
    const saPass = saData?.password || saData?.passwordHash;
    const isSaMatch = saData && saData.username === username && (saPass === hashed || saPass === password);
    
    if (isSaMatch) {
      loginAttempts = 0;
      loginLockoutUntil = null;
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

    const adminSnap = await get(adminsRef);
    const admins = adminSnap.val() || {};
    const usernameKey = Object.keys(admins).find(k => k.toLowerCase() === username.toLowerCase());
    const adminRecord = usernameKey ? admins[usernameKey] : undefined;
    const adminPass = adminRecord?.passwordHash || adminRecord?.password;
    const isAdminMatch = adminRecord && (adminPass === hashed || adminPass === password);
    
    if (isAdminMatch) {
      loginAttempts = 0;
      loginLockoutUntil = null;
      currentUsername = usernameKey;
      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("dashboard").classList.remove("hidden");
      document.getElementById("welcome-label").textContent = `Welcome, Admin ${usernameKey}`;
      updateSuperAdminDisplay();
      startInactivityTimer();
      return;
    }

    loginAttempts++;

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      loginLockoutUntil = Date.now() + LOCKOUT_DURATION;
      errorEl.textContent = `Too many failed attempts. Locked out for 30 seconds.`;
      
      const unlockBtn = document.getElementById("request-superadmin-btn");
      if (unlockBtn) unlockBtn.classList.remove("hidden");
      
      try {
        const newReqRef = push(unlockReqsRef);
        await set(newReqRef, {
          username: username,
          client: 'Web Admin - Failed Login',
          requestedAt: Date.now(),
          status: 'Pending',
          attemptCount: loginAttempts
        });
        
        const statusEl = document.getElementById('sa-request-status');
        if (statusEl) {
          statusEl.textContent = 'Unlock request sent to Super Admin.';
          statusEl.classList.remove('hidden');
        }
      } catch (e) {
        console.error('Failed to create unlock request:', e);
      }
      
      const countdownInterval = setInterval(() => {
        if (Date.now() >= loginLockoutUntil) {
          clearInterval(countdownInterval);
          loginAttempts = 0;
          loginLockoutUntil = null;
          errorEl.textContent = 'You can try logging in again.';
          errorEl.classList.add('bg-green-900', 'text-green-200');
          setTimeout(() => {
            errorEl.classList.add("hidden");
            errorEl.classList.remove('bg-green-900', 'text-green-200');
          }, 3000);
        } else {
          const remainingSeconds = Math.ceil((loginLockoutUntil - Date.now()) / 1000);
          errorEl.textContent = `Too many failed attempts. Please wait ${remainingSeconds} seconds.`;
        }
      }, 1000);
      
    } else {
      const attemptsLeft = MAX_LOGIN_ATTEMPTS - loginAttempts;
      errorEl.textContent = `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`;
    }

    errorEl.classList.remove("hidden");

  } catch (err) {
    console.error("Login error:", err);
    errorEl.textContent = "Login failed. Try again.";
    errorEl.classList.remove("hidden");
  }
}

function logout() {
  try {
    isSuperAdmin = false;
    isAuthenticated = false;
    currentUsername = null;

    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('login-section')?.classList.remove('hidden');
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';

    document.getElementById('btn-unlocks')?.classList.add('hidden');
    document.getElementById('btn-sessions')?.classList.add('hidden');
    document.getElementById('btn-admins')?.classList.add('hidden');
    document.getElementById('btn-settings')?.classList.add('hidden');

    showTab('home');
    stopInactivityTimer();
  } catch (e) {
    console.error('logout error:', e);
  }
}

// ============================================================
// Firebase Authentication
// ============================================================
function initializeSecureAuth() {
  updateConnectionStatus("Connecting to database...", "amber");

  onAuthStateChanged(auth, (user) => {
    if (user) {
      isAuthenticated = true;
      updateConnectionStatus("Connected to database", "green");
      if (!isAppReady) {
        initializeDatabaseListeners();
        isAppReady = true;
      }
    } else {
      updateConnectionStatus("Signing in anonymously...", "amber");
      signInAnonymously(auth).catch((error) => {
        console.error("Authentication failed:", error);
        updateConnectionStatus("Connection failed", "red");
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

  onValue(unlockReqsRef, (snapshot) => {
    const data = snapshot.val() || {};
    populateUnlockRequests(data);
    
    if (!isAuthenticated && loginLockoutUntil) {
      const currentUser = document.getElementById("username")?.value?.trim();
      if (currentUser) {
        const approved = Object.values(data).find(
          req => req.username === currentUser && req.status === 'Approved'
        );
        
        if (approved) {
          loginAttempts = 0;
          loginLockoutUntil = null;
          
          const errorEl = document.getElementById("login-error");
          if (errorEl) {
            errorEl.textContent = 'Your account has been unlocked by Super Admin. You can login now.';
            errorEl.classList.remove("hidden");
            errorEl.classList.add('bg-green-900', 'text-green-200');
          }
          
          const statusEl = document.getElementById('sa-request-status');
          if (statusEl) {
            statusEl.textContent = 'Approved! You can now login.';
            statusEl.classList.add('text-green-400');
          }
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
// App Initialization
// ============================================================
function initializeApplication() {
  const loadingTimeout = setTimeout(() => {
    updateConnectionStatus("Connection timeout", "red");
    showError("Connection timeout. Please refresh the page.");
  }, 15000);

  initializeSecureAuth();

  const originalUpdateStatus = updateConnectionStatus;
  updateConnectionStatus = function (message, color) {
    if (color === "green") clearTimeout(loadingTimeout);
    originalUpdateStatus(message, color);
  };
}

initializeApplication();

// ============================================================
// UI Refresh
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

    const studentTbody = document.getElementById("student-table-body");
    const visitorTbody = document.getElementById("visitor-table-body");

    if (studentTbody) {
      studentTbody.innerHTML = "";
      for (const item of students) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="py-3 px-6">${escapeHtml(item.nickname || item.name || item.fullname || "—")}</td>
          <td class="py-3 px-6">${escapeHtml(item.location || item.address || "—")}</td>
          <td class="py-3 px-6">${fmtTime(item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6">${fmtDate(item.timestamp || item.time || item.dateTime)}</td>
          <td class="py-3 px-6"><button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button></td>`;
        const deleteBtn = tr.querySelector('button');
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Delete student '${escapeHtml(item.nickname || item.name || item.fullname || '—')}'?`)) {
            deleteStudent(item.id);
          }
        });
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
          <td class="py-3 px-6"><button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button></td>`;
        const deleteBtn = tr.querySelector('button');
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Delete visitor '${escapeHtml(item.nickname || item.name || item.fullname || '—')}'?`)) {
            deleteVisitor(item.id);
          }
        });
        visitorTbody.appendChild(tr);
      }
    }

  } catch (e) {
    console.error("refreshUI error:", e);
  }

  try { renderCharts(); } catch (e) { console.error("renderCharts error:", e); }
}

// ============================================================
// Tabs
// ============================================================
function showTab(tabName, event) {
  try {
    if (event?.preventDefault) event.preventDefault();

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const active = document.getElementById(`tab-${tabName}`);
    if (active) active.classList.remove('hidden');

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

// ============================================================
// Charts
// ============================================================
function renderCharts() {
  const byRole = aggregateByRole(combinedData.filter(x => x._roleNorm === 'visitor'));
  const byHour = aggregateByHour(combinedData);
  const byDay = aggregateByDay(combinedData);

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

function aggregateByRole(items) {
  const counts = {};
  for (const it of items) {
    const role = it.role || it._roleNorm || 'visitor';
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function aggregateByHour(items) {
  const counts = {};
  for (const it of items) {
    const ts = coerceTimestamp(it.timestamp || it.time || it.date || it.dateTime);
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
    const day = new Date(ts).getDay();
    counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}

// ============================================================
// Populate Tables
// ============================================================
function populateAdmins(data) {
  const tbody = document.getElementById("admins-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [username, adminData] of Object.entries(data)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-3 px-6">${username}</td>
      <td class="py-3 px-6">${adminData.createdAt ? new Date(adminData.createdAt).toLocaleString() : "—"}</td>
      <td class="py-3 px-6"><button class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Delete</button></td>`;
    const deleteBtn = tr.querySelector('button');
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete admin '${username}'?`)) {
        deleteAdmin(username);
      }
    });
    tbody.appendChild(tr);
  }
}

function populateUnlockRequests(data) {
  const tbody = document.getElementById("unlock-req-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [reqId, reqData] of Object.entries(data)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-3 px-6">${reqId}</td>
      <td class="py-3 px-6">${reqData.client || "—"}</td>
      <td class="py-3 px-6">${reqData.username || "—"}</td>
      <td class="py-3 px-6">${reqData.requestedAt ? new Date(reqData.requestedAt).toLocaleString() : "—"}</td>
      <td class="py-3 px-6">${reqData.status || "Pending"}</td>
      <td class="py-3 px-6">
        <button class="approve-btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs mr-2">Approve</button>
        <button class="reject-btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs">Reject</button>
      </td>`;
    
    const approveBtn = tr.querySelector('.approve-btn');
    const rejectBtn = tr.querySelector('.reject-btn');
    
    approveBtn.addEventListener('click', () => {
      if (confirm(`Approve unlock request '${reqId}'?`)) {
        approveUnlockRequest(reqId);
      }
    });
    
    rejectBtn.addEventListener('click', () => {
      if (confirm(`Reject unlock request '${reqId}'?`)) {
        rejectUnlockRequest(reqId);
      }
    });
    
    tbody.appendChild(tr);
  }
}

function populateAdminSessions(data) {
  const tbody = document.getElementById("admin-session-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const [sessionId, sessionData] of Object.entries(data)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-3 px-6">${sessionId}</td>
      <td class="py-3 px-6">${sessionData.username || "—"}</td>
      <td class="py-3 px-6">${sessionData.timeIn ? new Date(sessionData.timeIn).toLocaleString() : "—"}</td>
      <td class="py-3 px-6">${sessionData.timeOut ? new Date(sessionData.timeOut).toLocaleString() : "—"}</td>`;
    tbody.appendChild(tr);
  }
}

// ============================================================
// Admin Functions
// ============================================================
async function createAdmin(event) {
  event.preventDefault();
  if (!requireSuperAdmin()) return;
  
  const username = document.getElementById('new-admin-username').value.trim();
  const password = document.getElementById('new-admin-password').value.trim();
  
  if (!username || !password) {
    alert('Please enter both username and password');
    return;
  }
  
  if (username.toLowerCase() === 'superadmin') {
    alert('Cannot use "superadmin" as username');
    return;
  }
  
  if (password.length < 6) {
    alert('Password must be at least 6 characters long');
    return;
  }
  
  try {
    stopInactivityTimer();
    
    const adminSnap = await get(adminsRef);
    const admins = adminSnap.val() || {};
    const existingKey = Object.keys(admins).find(k => k.toLowerCase() === username.toLowerCase());
    
    if (existingKey) {
      alert(`Admin '${username}' already exists`);
      startInactivityTimer();
      return;
    }
    
    const passwordHash = await sha256(password);
    
    await set(ref(db, `admins/${username}`), {
      passwordHash: passwordHash,
      createdAt: Date.now()
    });
    
    alert(`Admin '${username}' created successfully`);
    
    document.getElementById('new-admin-username').value = '';
    document.getElementById('new-admin-password').value = '';
    
    startInactivityTimer();
    
  } catch (e) {
    console.error('Failed to create admin:', e);
    alert('Failed to create admin: ' + e.message);
    startInactivityTimer();
  }
}

async function deleteAdmin(username) {
  if (!requireSuperAdmin()) return;
  if (!username) return;
  
  try {
    stopInactivityTimer();
    await remove(ref(db, `admins/${username}`));
    alert(`Admin '${username}' deleted successfully.`);
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to delete admin:', e);
    alert('Failed to delete admin.');
    startInactivityTimer();
  }
}

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
  
  if (newUsername === currentUsername) {
    alert('New username is the same as current username');
    return;
  }
  
  try {
    stopInactivityTimer();
    
    const saSnap = await get(superAdminRef);
    if (!saSnap.exists()) {
      alert('Superadmin account not found');
      startInactivityTimer();
      return;
    }
    
    const currentData = saSnap.val();
    
    await set(superAdminRef, {
      username: newUsername,
      passwordHash: currentData.passwordHash || currentData.password,
      createdAt: currentData.createdAt || Date.now(),
      updatedAt: Date.now
    });
    
    console.log('Username updated in database to:', newUsername);
    alert(`Username changed successfully to "${newUsername}". You will be logged out.`);
    
    document.getElementById('new-username').value = '';
    setTimeout(() => logout(), 2000);
    
  } catch (e) {
    console.error('Username change error:', e);
    alert('Failed to change username: ' + e.message);
    startInactivityTimer();
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
    stopInactivityTimer();
    
    const saSnap = await get(superAdminRef);
    if (!saSnap.exists()) {
      alert('Superadmin account not found');
      startInactivityTimer();
      return;
    }
    
    const currentData = saSnap.val();
    const storedHash = currentData?.passwordHash || currentData?.password || '';
    
    const inputHash = await sha256(currentPassword);
    const isMatch = (inputHash === storedHash) || (currentPassword === storedHash);
    
    if (!isMatch) {
      alert('Current password is incorrect');
      startInactivityTimer();
      return;
    }
    
    const newHash = await sha256(newPassword);
    
    await set(superAdminRef, {
      username: currentData.username,
      passwordHash: newHash,
      createdAt: currentData.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    
    console.log('Password updated in database');
    alert('Password changed successfully. You will be logged out.');
    
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    
    setTimeout(() => logout(), 2000);
    
  } catch (e) {
    console.error('Password change error:', e);
    alert('Failed to change password: ' + e.message);
    startInactivityTimer();
  }
}

async function approveUnlockRequest(reqId) {
  if (!requireSuperAdmin()) return;
  if (!reqId) return;
  
  try {
    stopInactivityTimer();
    
    await set(ref(db, `unlock_requests/${reqId}`), { 
      status: 'Approved',
      approvedAt: Date.now(),
      approvedBy: currentUsername
    });
    
    console.log('Unlock request approved:', reqId);
    alert(`Unlock request '${reqId}' approved successfully.`);
    
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to approve unlock request:', e);
    alert('Failed to approve: ' + e.message);
    startInactivityTimer();
  }
}

async function rejectUnlockRequest(reqId) {
  if (!requireSuperAdmin()) return;
  if (!reqId) return;
  
  try {
    stopInactivityTimer();
    
    await set(ref(db, `unlock_requests/${reqId}`), { 
      status: 'Rejected',
      rejectedAt: Date.now(),
      rejectedBy: currentUsername
    });
    
    console.log('Unlock request rejected:', reqId);
    alert(`Unlock request '${reqId}' rejected successfully.`);
    
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to reject:', e);
    alert('Failed to reject: ' + e.message);
    startInactivityTimer();
  }
}

async function requestSuperAdminUnlock() {
  const username = document.getElementById('username').value.trim();
  if (!username) {
    alert('Please enter your username first');
    return;
  }
  
  try {
    const newReqRef = push(unlockReqsRef);
    await set(newReqRef, {
      username: username,
      client: 'Web Admin',
      requestedAt: Date.now(),
      status: 'Pending'
    });
    
    const statusEl = document.getElementById('sa-request-status');
    if (statusEl) {
      statusEl.textContent = 'Unlock request sent. Please wait for Super Admin approval.';
      statusEl.classList.remove('hidden');
    }
    
  } catch (e) {
    console.error('Failed to request unlock:', e);
    alert('Failed to send unlock request.');
  }
}

async function deleteStudent(studentId) {
  if (!isAuthenticated) {
    alert('You must be logged in to delete students.');
    return;
  }
  if (!studentId) return;
  
  try {
    stopInactivityTimer();
    await remove(ref(db, `students/${studentId}`));
    alert('Student deleted successfully.');
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to delete student:', e);
    alert('Failed to delete student.');
    startInactivityTimer();
  }
}

async function deleteVisitor(visitorId) {
  if (!isAuthenticated) {
    alert('You must be logged in to delete visitors.');
    return;
  }
  if (!visitorId) return;
  
  try {
    stopInactivityTimer();
    await remove(ref(db, `visitors/${visitorId}`));
    alert('Visitor deleted successfully.');
    startInactivityTimer();
  } catch (e) {
    console.error('Failed to delete visitor:', e);
    alert('Failed to delete visitor.');
    startInactivityTimer();
  }
}

function updateSuperAdminDisplay() {
  const usernameEl = document.getElementById('display-username');
  if (usernameEl) {
    usernameEl.textContent = currentUsername || '';
  }
  const currentUsernameInput = document.getElementById('current-username');
  if (currentUsernameInput) {
    currentUsernameInput.value = currentUsername || '';
  }
}

// ============================================================
// Inactivity Timer
// ============================================================
let inactivityTimeout = null;

function getAutoLogoutDuration() {
  return isSuperAdmin ? 4000 : 30000;
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  if (isAuthenticated) {
    inactivityTimeout = setTimeout(() => {
      alert('Session expired due to inactivity. You will be logged out.');
      logout();
    }, getAutoLogoutDuration());
  }
}

function startInactivityTimer() {
  resetInactivityTimer();
}

function stopInactivityTimer() {
  clearTimeout(inactivityTimeout);
}

['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, true);
});

// ============================================================
// Expose to Window
// ============================================================
window.login = login;
window.logout = logout;
window.showTab = showTab;
window.createAdmin = createAdmin;
window.changeSuperAdminUsername = changeSuperAdminUsername;
window.changeSuperAdminPassword = changeSuperAdminPassword;
window.requestSuperAdminUnlock = requestSuperAdminUnlock;
