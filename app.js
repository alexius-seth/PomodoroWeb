/* =

   PERSISTENCE (localStorage keys):
     dp_sessions_today   — work sessions completed today (number)
     dp_minutes_total    — total focused minutes all time (number)
     dp_last_study_date  — last date a session was completed (YYYY-MM-DD)
     dp_tasks            — task list (JSON array)
     dp_theme_color      — custom theme color (hex string)
   */

"use strict";

const NAME = "Monica"; // <-- Set your name here for personalized greetings and stats

/* ── Storage Keys ─────────────────────────────────────────── */
const KEYS = {
  sessionsToday: "dp_sessions_today",
  minutesTotal: "dp_minutes_total",
  lastStudyDate: "dp_last_study_date",
  tasks: "dp_tasks",
  themeColor: "dp_theme_color",
  bgColor: "dp_bg_color",
  durations: "dp_timer_durations",
};

/* ── Timer Configuration ──────────────────────────────────── */
const MODES = {
  work: {
    duration: 25 * 60,
    label: "Focus Time",
    seal: "⚜ Commence Session",
    isBreak: false,
  },
  short: {
    duration: 5 * 60,
    label: "Short Recess",
    seal: "⚜ Brief Adjournment",
    isBreak: true,
  },
  long: {
    duration: 15 * 60,
    label: "Long Recess",
    seal: "⚜ Extended Recess",
    isBreak: true,
  },
};

const CIRCUMFERENCE = 2 * Math.PI * 110;

/* ── Quotes ───────────────────────────────────────────────── */
const QUOTES = [
  {
    text: "The most courageous act is still to think for yourself. Aloud.",
    author: "Coco Chanel",
  },
  {
    text: "Power is not only what you have, but what the enemy thinks you have.",
    author: "Saul Alinsky",
  },
  {
    text: "To be prepared is half the victory.",
    author: "Miguel de Cervantes",
  },
  {
    text: "In politics, nothing happens by accident. If it happened, you can bet it was planned that way.",
    author: "Franklin D. Roosevelt",
  },
  {
    text: "Educating the mind without educating the heart is no education at all.",
    author: "Aristotle",
  },
  {
    text: "Power concedes nothing without a demand. It never did and it never will.",
    author: "Frederick Douglass",
  },
  {
    text: "The function of freedom is to free someone else.",
    author: "Toni Morrison",
  },
  {
    text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.",
    author: "James Baldwin",
  },
  {
    text: "Injustice anywhere is a threat to justice everywhere.",
    author: "Martin Luther King Jr.",
  },
  { text: "We are the ones we have been waiting for.", author: "June Jordan" },
  {
    text: "The most common way people give up their power is by thinking they don't have any.",
    author: "Alice Walker",
  },
  {
    text: "One child, one teacher, one book, one pen can change the world.",
    author: "Malala Yousafzai",
  },
  {
    text: "If liberty means anything at all, it means the right to tell people what they do not want to hear.",
    author: "George Orwell",
  },
  {
    text: "In the long run, the most unpleasant truth is a safer companion than a pleasant falsehood.",
    author: "Theodore Roosevelt",
  },
];

const WELCOME_QUOTES = [
  `"Good morning, ${NAME}. The world is shaped by those who show up — and you're here."`,
  `"Every great political theorist started exactly where you are now, ${NAME}."`,
  `"Today's study session is tomorrow's policy, ${NAME}. Let's begin."`,
  `"History remembers those who prepared, ${NAME}. Your moment is being forged right now."`,
  `"The pen is mightier than the sword — and yours is about to do great work, ${NAME}."`,
];

/* ══════════════════════════════════════════════════════════
   STORAGE HELPERS
   ══════════════════════════════════════════════════════════ */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/* ── Load persisted state ─────────────────────────────────── */
function loadState() {
  const today = todayStr();
  const lastDate = lsGet(KEYS.lastStudyDate, null);

  // Sessions today — reset if it's a new calendar day
  sessionsToday = lastDate === today ? lsGet(KEYS.sessionsToday, 0) : 0;

  // Total minutes — cumulative all-time, never resets
  minutesTotal = lsGet(KEYS.minutesTotal, 0);

  // Tasks — restored as-is (user clears manually)
  tasks = lsGet(KEYS.tasks, []);
}

function saveState() {
  lsSet(KEYS.sessionsToday, sessionsToday);
  lsSet(KEYS.minutesTotal, minutesTotal);
  lsSet(KEYS.lastStudyDate, todayStr());

  // Queue for sync (if sync manager exists)
  if (window.syncManager && window.syncManager.isOnline) {
    window.syncManager.queueDataForSync({
      type: "STATE_UPDATE",
      data: {
        sessionsToday: sessionsToday,
        minutesTotal: minutesTotal,
        lastStudyDate: todayStr(),
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Replace your existing saveTasks function
function saveTasks() {
  lsSet(KEYS.tasks, tasks);

  // Queue for sync (if sync manager exists)
  if (window.syncManager && window.syncManager.isOnline) {
    window.syncManager.queueDataForSync({
      type: "TASKS_UPDATE",
      data: {
        tasks: tasks,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */

let currentMode = "work";
let timeLeft = MODES.work.duration;
let totalTime = MODES.work.duration;
let isRunning = false;
let intervalId = null;
let usedQuoteIndices = [];
let sessionsCycle = 0;

// Persisted
let sessionsToday = 0;
let minutesTotal = 0;
let tasks = [];

/* ── Derived stat: tasks done today (computed from tasks array) */
function tasksDoneCount() {
  return tasks.filter((t) => t.done).length;
}

/* ── DOM References ───────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const els = {
  timerCard: $("timerCard"),
  timerDisplay: $("timerDisplay"),
  modeLabel: $("modeLabel"),
  cardSealTop: $("cardSealTop"),
  ringSvg: $("ringSvg"),
  ringProg: $("ringProg"),
  sessionDots: $("sessionDots"),
  startBtn: $("startBtn"),
  quoteText: $("quoteText"),
  quoteAuthor: $("quoteAuthor"),
  notification: $("notification"),
  statSessions: $("statSessions"),
  statMinutes: $("statMinutes"),
  statTasksDone: $("statTasksDone"),
  taskInput: $("taskInput"),
  taskList: $("taskList"),
  welcomeOverlay: $("welcomeOverlay"),
  welcomeQuote: $("welcomeQuote"),
};

/* ══════════════════════════════════════════════════════════
   WELCOME SCREEN 
   ══════════════════════════════════════════════════════════ */

function initWelcome() {
  const quoteElem = els.welcomeQuote || $("welcomeQuote");
  if (!quoteElem) return;

  const randomIndex = Math.floor(Math.random() * WELCOME_QUOTES.length);
  quoteElem.textContent = WELCOME_QUOTES[randomIndex];
}

// Select a random welcome quote
const randomIndex = Math.floor(Math.random() * WELCOME_QUOTES.length);
const q = WELCOME_QUOTES[randomIndex];

console.log("Selected quote:", q); // Debug log

// Set the text content
els.welcomeQuote.textContent = q;

// Force the quote to be visible
els.welcomeQuote.style.display = "block";
els.welcomeQuote.style.visibility = "visible";

// Also check if the welcome overlay is visible
console.log(
  "Welcome overlay visible:",
  els.welcomeOverlay.classList.contains("hidden"),
);

function dismissWelcome() {
  els.welcomeOverlay.classList.add("hidden");
  setTimeout(() => {
    if (els.welcomeOverlay) {
      els.welcomeOverlay.style.display = "none";
    }
  }, 450);
}

/* ══════════════════════════════════════════════════════════
   TIMER
   ══════════════════════════════════════════════════════════ */

function setMode(mode) {
  if (isRunning) return;
  currentMode = mode;
  timeLeft = MODES[mode].duration;
  totalTime = MODES[mode].duration;
  const isBreak = MODES[mode].isBreak;
  document
    .querySelectorAll(".mode-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));

  els.modeLabel.textContent = MODES[mode].label;
  els.cardSealTop.textContent = MODES[mode].seal;
  updateDisplay();
  updateRing();
  showNextQuote();
}

function toggleTimer() {
  isRunning ? pauseTimer() : startTimer();
}

function startTimer() {
  isRunning = true;
  els.startBtn.textContent = "Pause";
  els.ringSvg.classList.add("ticking");

  intervalId = setInterval(tick, 1000);
}

function pauseTimer() {
  clearInterval(intervalId);
  isRunning = false;
  els.startBtn.textContent = "Resume";
  els.ringSvg.classList.remove("ticking");
}

function resetTimer() {
  clearInterval(intervalId);
  isRunning = false;
  els.ringSvg.classList.remove("ticking");
  els.startBtn.textContent = "Begin";
  timeLeft = totalTime = MODES[currentMode].duration;
  updateDisplay();
  updateRing();
}

function skipSession() {
  clearInterval(intervalId);
  isRunning = false;
  els.ringSvg.classList.remove("ticking");
  onSessionComplete();
}

function tick() {
  if (timeLeft <= 0) {
    clearInterval(intervalId);
    isRunning = false;
    onSessionComplete();
    return;
  }
  timeLeft--;
  updateDisplay();
  updateRing();
}

/* ── Session completion ───────────────────────────────────── */
function onSessionComplete() {
  els.ringSvg.classList.remove("ticking");
  els.startBtn.textContent = "Begin";
  playChime();

  if (!MODES[currentMode].isBreak) {
    sessionsToday++;
    sessionsCycle++;
    minutesTotal += 25;
    saveState();
    updateStats();
    renderDots();
    showNotification(`✦ Well done, ${NAME}! Session complete.`);
    const nextMode = sessionsCycle % 4 === 0 ? "long" : "short";
    setTimeout(() => setMode(nextMode), 900);
  } else {
    showNotification(`⚜ Recess over, ${NAME} — time to focus!`);
    setTimeout(() => setMode("work"), 900);
  }
}

function updateDisplay() {
  els.timerDisplay.textContent = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;
}

function updateRing() {
  els.ringProg.style.strokeDashoffset =
    CIRCUMFERENCE * (1 - timeLeft / totalTime);
}

function renderDots() {
  const filled = sessionsCycle % 4;
  els.sessionDots.innerHTML = Array.from(
    { length: 4 },
    (_, i) => `<div class="dot${i < filled ? " filled" : ""}"></div>`,
  ).join("");
}

function updateStats() {
  els.statSessions.textContent = sessionsToday;
  els.statMinutes.textContent = minutesTotal;
  els.statTasksDone.textContent = tasksDoneCount();
}

/* ══════════════════════════════════════════════════════════
   QUOTES
   ══════════════════════════════════════════════════════════ */

/* Show "Pacta sunt servanda" once on first load */
function showOpeningMaxim() {
  els.quoteText.innerHTML =
    `<em style="font-style:italic;color:var(--primary-deep);font-size:15px;letter-spacing:0.03em;">Pacta sunt servanda</em>` +
    `<span style="display:block;font-style:italic;font-size:13px;color:var(--ink-light);margin-top:4px;">"Agreements must be kept."</span>`;
  els.quoteAuthor.textContent = "⚖ International Law · Roman Law";
}

function showNextQuote() {
  if (usedQuoteIndices.length >= QUOTES.length) usedQuoteIndices = [];
  let idx;
  do {
    idx = Math.floor(Math.random() * QUOTES.length);
  } while (usedQuoteIndices.includes(idx));
  usedQuoteIndices.push(idx);
  const q = QUOTES[idx];
  els.quoteText.style.opacity = els.quoteAuthor.style.opacity = "0";
  setTimeout(() => {
    els.quoteText.innerHTML = `"${q.text}"`;
    els.quoteAuthor.textContent = `— ${q.author}`;
    els.quoteText.style.opacity = els.quoteAuthor.style.opacity = "1";
  }, 300);
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATION
   ══════════════════════════════════════════════════════════ */

function showNotification(message) {
  els.notification.textContent = message;
  els.notification.classList.add("show");
  setTimeout(() => els.notification.classList.remove("show"), 3200);
}

/* ══════════════════════════════════════════════════════════
   CHIME
   ══════════════════════════════════════════════════════════ */

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  } catch (e) {
    console.warn("Audio unavailable:", e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   TASKS
   ══════════════════════════════════════════════════════════ */

function addTask() {
  const input = els.taskInput;
  const text = input.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, done: false });
  input.value = "";
  input.focus();
  saveTasks();
  renderTasks();
  updateStats(); // tasks done count may change
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.done = !task.done;
    saveTasks();
    renderTasks();
    updateStats(); // update tasks done count live
  }
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  renderTasks();
  updateStats();
}

function renderTasks() {
  if (tasks.length === 0) {
    els.taskList.innerHTML = `<li class="task-empty">Add your study tasks above, ${NAME}…</li>`;
    return;
  }
  els.taskList.innerHTML = tasks
    .map(
      (task) => `
    <li class="task-item">
      <div class="task-check${task.done ? " done" : ""}" onclick="toggleTask(${task.id})" title="${task.done ? "Mark incomplete" : "Mark complete"}"></div>
      <span class="task-text${task.done ? " done" : ""}">${escapeHtml(task.text)}</span>
      <button class="task-delete" onclick="deleteTask(${task.id})" title="Remove task">✕</button>
    </li>`,
    )
    .join("");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════ */

document.addEventListener("keydown", (e) => {
  // Ignore shortcuts if the user is typing in ANY input or text field
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      toggleTimer();
      break;
    case "KeyR":
      if (!isRunning) resetTimer();
      break;
    case "KeyS":
      skipSession();
      break;
    case "Digit1":
      setMode("work");
      break;
    case "Digit2":
      setMode("short");
      break;
    case "Digit3":
      setMode("long");
      break;
  }
});

/* ══════════════════════════════════════════════════════════
   OFFLINE & SYNC MANAGER
   ══════════════════════════════════════════════════════════ */

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.pendingSync = [];
    this.notificationTimeout = null;
    this.hasShownInitialSync = false; // Add this flag
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for online/offline events
    window.addEventListener("online", () => {
      this.isOnline = true;
      console.log("📡 Back online — attempting sync");
      this.showNotification("Connection restored. Syncing data...", 2000);
      this.triggerSync();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      console.log("📴 Offline mode — saving changes locally");
      this.showNotification(
        "You are offline. Changes will sync when connection returns.",
        3000,
      );
    });

    // Listen for service worker messages
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "SYNC_SUCCESS") {
          console.log("✅ Sync successful:", event.data.payload);
          this.showNotification("Data synced successfully!", 2000);
          this.updateSyncStatus();
        } else if (event.data && event.data.type === "SYNC_FAILED") {
          console.error("❌ Sync failed:", event.data.error);
          this.showNotification("Sync failed. Will retry later.", 3000);
        }
      });
    }
  }

  async registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log(
          "Service Worker registered with scope:",
          registration.scope,
        );

        if ("sync" in registration) {
          console.log("Background sync supported");
        } else {
          console.log("Background sync not supported — using fallback");
        }

        return registration;
      } catch (error) {
        console.error("Service Worker registration failed:", error);
      }
    }
    return null;
  }

  async queueDataForSync(data) {
    await this.saveToLocalQueue(data);

    if (this.isOnline) {
      await this.triggerSync();
    } else {
      console.log("Offline — data queued for later sync");
      this.showNotification(
        "Changes saved locally. Will sync when online.",
        2000,
      );
    }
  }

  async saveToLocalQueue(data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PomodoroSyncDB", 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;

        // Make sure the object store exists
        if (!db.objectStoreNames.contains("syncQueue")) {
          db.close();
          // Need to upgrade - reopen with upgrade
          const upgradeRequest = indexedDB.open("PomodoroSyncDB", 2);
          upgradeRequest.onupgradeneeded = (event) => {
            const upgradedDb = event.target.result;
            upgradedDb.createObjectStore("syncQueue", { keyPath: "id" });
          };
          upgradeRequest.onsuccess = () => {
            const upgradedDb = upgradeRequest.result;
            const transaction = upgradedDb.transaction(
              ["syncQueue"],
              "readwrite",
            );
            const store = transaction.objectStore("syncQueue");
            store.add({
              id: Date.now(),
              payload: data,
              timestamp: new Date().toISOString(),
              retries: 0,
            }).onsuccess = () => {
              upgradedDb.close();
              resolve();
            };
          };
          upgradeRequest.onerror = () => reject(upgradeRequest.error);
        } else {
          const transaction = db.transaction(["syncQueue"], "readwrite");
          const store = transaction.objectStore("syncQueue");

          store.add({
            id: Date.now(),
            payload: data,
            timestamp: new Date().toISOString(),
            retries: 0,
          }).onsuccess = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        }
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("syncQueue")) {
          db.createObjectStore("syncQueue", { keyPath: "id" });
        }
      };
    });
  }

  async triggerSync(isInitialLoad = false) {
    if (!this.isOnline) {
      console.log("Offline — skipping sync");
      return;
    }

    const pendingItems = await this.getPendingItems();

    if (pendingItems.length === 0) {
      console.log("No pending items to sync");
      this.updateSyncStatus();
      // Hide any existing notification
      const notification = document.getElementById("syncNotification");
      if (notification) {
        notification.style.opacity = "0";
        notification.classList.remove("show");
        setTimeout(() => {
          if (
            notification.style.opacity === "0" ||
            notification.style.opacity === ""
          ) {
            notification.style.display = "none";
          }
        }, 300);
      }
      return;
    }

    // Only show notification if there are items AND it's not the initial load
    if (!isInitialLoad) {
      console.log(`Syncing ${pendingItems.length} items...`);
      this.showNotification(
        `Syncing ${pendingItems.length} item${pendingItems.length > 1 ? "s" : ""}...`,
        2000,
      );
    } else {
      console.log(
        `Found ${pendingItems.length} pending items to sync (silent sync)`,
      );
    }

    // Try background sync first
    if (
      navigator.serviceWorker.controller &&
      "sync" in navigator.serviceWorker
    ) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register("pomodoro-sync-queue");
        console.log("Background sync triggered");
      } catch (error) {
        console.error("Background sync failed:", error);
        await this.syncImmediately(pendingItems);
      }
    } else {
      await this.syncImmediately(pendingItems);
    }
  }

  async syncImmediately(pendingItems) {
    let successCount = 0;

    for (const item of pendingItems) {
      try {
        const success = await this.sendToServer(item.payload);
        if (success) {
          await this.removeFromQueue(item.id);
          successCount++;
        }
      } catch (error) {
        console.error("Sync failed for item:", item.id, error);
      }
    }

    if (successCount > 0) {
      this.showNotification(
        `Synced ${successCount} item${successCount > 1 ? "s" : ""}!`,
        2000,
      );
      this.updateSyncStatus();
      await this.reloadFromServer();
    }
  }

  async getPendingItems() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PomodoroSyncDB", 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("syncQueue")) {
          db.close();
          resolve([]);
          return;
        }

        const transaction = db.transaction(["syncQueue"], "readonly");
        const store = transaction.objectStore("syncQueue");
        const getAll = store.getAll();

        getAll.onsuccess = () => {
          db.close();
          resolve(getAll.result || []);
        };

        getAll.onerror = () => {
          db.close();
          reject(getAll.error);
        };
      };
    });
  }

  async removeFromQueue(id) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("PomodoroSyncDB", 1);

      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("syncQueue")) {
          db.close();
          resolve();
          return;
        }

        const transaction = db.transaction(["syncQueue"], "readwrite");
        const store = transaction.objectStore("syncQueue");
        const deleteRequest = store.delete(id);

        deleteRequest.onsuccess = () => {
          db.close();
          resolve();
        };

        deleteRequest.onerror = () => {
          db.close();
          reject(deleteRequest.error);
        };
      };
    });
  }

  async sendToServer(payload) {
    // Mock server sync - replace with actual API call
    console.log("Sending to server:", payload);
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true; // Simulate success
  }

  async reloadFromServer() {
    // Fetch latest data from server if needed
    console.log("Reloading data from server...");
  }

  updateSyncStatus() {
    let syncIndicator = document.getElementById("syncIndicator");
    if (!syncIndicator) {
      syncIndicator = document.createElement("div");
      syncIndicator.id = "syncIndicator";
      syncIndicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        z-index: 1000;
        transition: all 0.3s ease;
        cursor: pointer;
      `;
      document.body.appendChild(syncIndicator);
    }

    if (!this.isOnline) {
      syncIndicator.style.backgroundColor = "#ff6b6b";
      syncIndicator.style.boxShadow = "0 0 8px rgba(255,107,107,0.5)";
      syncIndicator.title = "Offline mode";
    } else {
      syncIndicator.style.backgroundColor = "#4caf50";
      syncIndicator.style.boxShadow = "0 0 8px rgba(76,175,80,0.5)";
      syncIndicator.title = "Online";
    }
  }

  showNotification(message, duration = 3000) {
    // Clear any existing timeout
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }

    // Don't show empty notifications
    if (!message || message.trim() === "") {
      return;
    }

    // Find or create notification element
    let notification = document.getElementById("syncNotification");

    if (!notification) {
      notification = document.createElement("div");
      notification.id = "syncNotification";
      notification.className = "sync-notification";
      notification.textContent = message;
      document.body.appendChild(notification);
    }

    // Update text
    notification.textContent = message;

    // Show notification
    notification.style.display = "block";
    notification.style.opacity = "1";
    notification.classList.add("show");

    // Auto-hide after duration
    this.notificationTimeout = setTimeout(() => {
      notification.style.opacity = "0";
      notification.classList.remove("show");
      setTimeout(() => {
        if (
          notification.style.opacity === "0" ||
          notification.style.opacity === ""
        ) {
          notification.style.display = "none";
        }
      }, 300);
    }, duration);
  }
}

/* ══════════════════════════════════════════════════════════
   DYNAMIC THEME & BACKGROUND COLOR
   ══════════════════════════════════════════════════════════ */

const DEFAULT_COLOR = "#e991b0";
const DEFAULT_BG = "#fef9fb";

function cleanHex(input) {
  if (!input) return null;
  const match = input.match(/[0-9a-fA-F]{6}/);
  return match ? "#" + match[0].toUpperCase() : null;
}

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function applyCustomColor(rawColor, save = true) {
  const formatted = cleanHex(rawColor);
  if (!formatted) return;

  const { h, s } = hexToHSL(formatted);
  const root = document.documentElement;

  root.style.setProperty("--primary", formatted);
  root.style.setProperty(
    "--primary-light",
    `hsl(${h}, ${Math.min(s, 70)}%, 96%)`,
  );
  root.style.setProperty(
    "--primary-mid",
    `hsl(${h}, ${Math.min(s, 60)}%, 88%)`,
  );
  root.style.setProperty("--primary-deep", `hsl(${h}, ${s}%, 38%)`);
  root.style.setProperty("--shadow-primary", `hsla(${h}, ${s}%, 50%, 0.2)`);

  const picker = $("colorPicker");
  const hexInput = $("hexInput");

  if (picker && picker.value.toUpperCase() !== formatted)
    picker.value = formatted;
  if (hexInput && document.activeElement !== hexInput)
    hexInput.value = formatted;

  if (save) lsSet(KEYS.themeColor, formatted);
}

function applyBackgroundColor(rawColor, save = true) {
  const formatted = cleanHex(rawColor);
  if (!formatted) return;

  const root = document.documentElement;
  root.style.setProperty("--cream", formatted);

  // Extract Hue, Saturation, Lightness
  const { h, s, l } = hexToHSL(formatted);

  if (l < 50) {
    // --- FULL DARK MODE ---
    root.style.setProperty("--ink", "#fcf7f9");                  // Crisp light text
    root.style.setProperty("--ink-light", "#d8b8c5");            // Soft blush labels
    root.style.setProperty("--card-bg", `hsl(${h}, ${Math.min(s, 25)}%, 16%)`);  // Sleek dark cards
    root.style.setProperty("--input-bg", `hsl(${h}, ${Math.min(s, 25)}%, 22%)`); // Visible input fields
    root.style.setProperty("--input-text", "#fcf7f9");           // Bright white input text
  } else {
    // --- FULL LIGHT MODE ---
    root.style.setProperty("--ink", "#3d2530");                  // Original dark text
    root.style.setProperty("--ink-light", "#8a6575");            // Original muted mauve
    root.style.setProperty("--card-bg", "#ffffff");              // White cards
    root.style.setProperty("--input-bg", "#fef9fb");             // Soft blush inputs
    root.style.setProperty("--input-text", "#3d2530");           // Dark input text
  }

  const bgPicker = $("bgColorPicker");
  if (bgPicker && bgPicker.value.toUpperCase() !== formatted) {
    bgPicker.value = formatted;
  }

  if (save) lsSet(KEYS.bgColor, formatted);
}
function resetTheme() {
  localStorage.removeItem(KEYS.themeColor);
  localStorage.removeItem(KEYS.bgColor);
  applyCustomColor(DEFAULT_COLOR, false);
  applyBackgroundColor(DEFAULT_BG, false);
}

function initThemeListeners() {
  const picker = $("colorPicker");
  const bgPicker = $("bgColorPicker");
  const hexInput = $("hexInput");

  const commitHex = () => {
    if (!hexInput) return;
    const formatted = cleanHex(hexInput.value);
    if (formatted) {
      applyCustomColor(formatted, true);
      hexInput.value = formatted;
    } else {
      hexInput.value = lsGet(KEYS.themeColor, DEFAULT_COLOR);
    }
  };

  if (picker) {
    picker.addEventListener("input", (e) => applyCustomColor(e.target.value));
    picker.addEventListener("change", (e) => applyCustomColor(e.target.value));
  }

  if (bgPicker) {
    bgPicker.addEventListener("input", (e) =>
      applyBackgroundColor(e.target.value),
    );
    bgPicker.addEventListener("change", (e) =>
      applyBackgroundColor(e.target.value),
    );
  }

  if (hexInput) {
    hexInput.addEventListener("input", (e) => {
      const formatted = cleanHex(e.target.value);
      if (formatted) applyCustomColor(formatted, true);
    });

    hexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitHex();
        hexInput.blur();
      }
    });

    hexInput.addEventListener("blur", commitHex);
  }

  applyCustomColor(lsGet(KEYS.themeColor, DEFAULT_COLOR), false);
  applyBackgroundColor(lsGet(KEYS.bgColor, DEFAULT_BG), false);
}

/* ══════════════════════════════════════════════════════════
   CUSTOM TIMER INTERVALS
   ══════════════════════════════════════════════════════════ */

function loadCustomDurations() {
  const saved = lsGet(KEYS.durations, { work: 25, short: 5, long: 15 });
  MODES.work.duration = (saved.work || 25) * 60;
  MODES.short.duration = (saved.short || 5) * 60;
  MODES.long.duration = (saved.long || 15) * 60;

  const workInput = $("workDurationInput");
  const shortInput = $("shortDurationInput");
  const longInput = $("longDurationInput");

  if (workInput) workInput.value = saved.work || 25;
  if (shortInput) shortInput.value = saved.short || 5;
  if (longInput) longInput.value = saved.long || 15;
}

function initDurationListeners() {
  const inputs = [
    { id: "workDurationInput", mode: "work" },
    { id: "shortDurationInput", mode: "short" },
    { id: "longDurationInput", mode: "long" },
  ];

  inputs.forEach(({ id, mode }) => {
    const elem = $(id);
    if (!elem) return;

    const updateDuration = () => {
      let val = parseInt(elem.value, 10);
      if (isNaN(val) || val < 1) val = 1;

      MODES[mode].duration = val * 60;

      // Persist values
      const currentSaved = lsGet(KEYS.durations, {
        work: 25,
        short: 5,
        long: 15,
      });
      currentSaved[mode] = val;
      lsSet(KEYS.durations, currentSaved);

      // Reset active timer to new length if not actively running
      if (!isRunning && currentMode === mode) {
        timeLeft = MODES[mode].duration;
        totalTime = MODES[mode].duration;
        updateDisplay();
        updateRing();
      }
    };

    elem.addEventListener("change", updateDuration);
    elem.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        updateDuration();
        elem.blur();
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════
   REORDERED INIT FUNCTION
   ══════════════════════════════════════════════════════════ */

async function init() {
  console.log("Initializing app...");

  loadState();
  loadCustomDurations();
  initDurationListeners();
  initWelcome();
  initThemeListeners();
  renderDots();
  showOpeningMaxim();
  renderTasks();
  updateDisplay();
  updateRing();
  updateStats();

  try {
    window.syncManager = new SyncManager();
    await window.syncManager.registerServiceWorker();
  } catch (err) {
    console.warn("Sync manager failed to initialize:", err);
  }
}

// Ensure init executes when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
