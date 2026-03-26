/* ============================================================
   THE DIPLOMAT'S POMODORO — app.js
   Personalized for [Name] · Political Science Scholar

   PERSISTENCE (localStorage keys):
     dp_sessions_today   — work sessions completed today (number)
     dp_minutes_total    — total focused minutes all time (number)
     dp_last_study_date  — last date a session was completed (YYYY-MM-DD)
     dp_tasks            — task list (JSON array)
   ============================================================ */

'use strict';

/* ── Personalization ──────────────────────────────────────── */
const NAME = 'Monica'; // <-- Set your name here for personalized greetings and stats

/* ── Storage Keys ─────────────────────────────────────────── */
const KEYS = {
  sessionsToday : 'dp_sessions_today',
  minutesTotal  : 'dp_minutes_total',
  lastStudyDate : 'dp_last_study_date',
  tasks         : 'dp_tasks',
};

/* ── Timer Configuration ──────────────────────────────────── */
const MODES = {
  work:  { duration: 25 * 60, label: 'Focus Time',   seal: '⚜ Commence Session',  isBreak: false },
  short: { duration:  5 * 60, label: 'Short Recess', seal: '⚜ Brief Adjournment', isBreak: true  },
  long:  { duration: 15 * 60, label: 'Long Recess',  seal: '⚜ Extended Recess',   isBreak: true  },
};

const CIRCUMFERENCE = 2 * Math.PI * 110;

/* ── Quotes ───────────────────────────────────────────────── */
const QUOTES = [
  { text: "The most courageous act is still to think for yourself. Aloud.",                                   author: "Coco Chanel"            },
  { text: "Power is not only what you have, but what the enemy thinks you have.",                             author: "Saul Alinsky"           },
  { text: "To be prepared is half the victory.",                                                              author: "Miguel de Cervantes"    },
  { text: "In politics, nothing happens by accident. If it happened, you can bet it was planned that way.",   author: "Franklin D. Roosevelt"  },
  { text: "Educating the mind without educating the heart is no education at all.",                           author: "Aristotle"              },
  { text: "Power concedes nothing without a demand. It never did and it never will.",                         author: "Frederick Douglass"     },
  { text: "The function of freedom is to free someone else.",                                                 author: "Toni Morrison"          },
  { text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.",       author: "James Baldwin"          },
  { text: "Injustice anywhere is a threat to justice everywhere.",                                            author: "Martin Luther King Jr." },
  { text: "We are the ones we have been waiting for.",                                                        author: "June Jordan"            },
  { text: "The most common way people give up their power is by thinking they don't have any.",               author: "Alice Walker"           },
  { text: "One child, one teacher, one book, one pen can change the world.",                                  author: "Malala Yousafzai"       },
  { text: "If liberty means anything at all, it means the right to tell people what they do not want to hear.", author: "George Orwell"        },
  { text: "In the long run, the most unpleasant truth is a safer companion than a pleasant falsehood.",       author: "Theodore Roosevelt"     },
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ── Load persisted state ─────────────────────────────────── */
function loadState() {
  const today    = todayStr();
  const lastDate = lsGet(KEYS.lastStudyDate, null);

  // Sessions today — reset if it's a new calendar day
  sessionsToday = (lastDate === today) ? lsGet(KEYS.sessionsToday, 0) : 0;

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
      type: 'STATE_UPDATE',
      data: {
        sessionsToday: sessionsToday,
        minutesTotal: minutesTotal,
        lastStudyDate: todayStr(),
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Replace your existing saveTasks function
function saveTasks() {
  lsSet(KEYS.tasks, tasks);
  
  // Queue for sync (if sync manager exists)
  if (window.syncManager && window.syncManager.isOnline) {
    window.syncManager.queueDataForSync({
      type: 'TASKS_UPDATE',
      data: {
        tasks: tasks,
        timestamp: new Date().toISOString()
      }
    });
  }
}
/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */

let currentMode      = 'work';
let timeLeft         = MODES.work.duration;
let totalTime        = MODES.work.duration;
let isRunning        = false;
let intervalId       = null;
let usedQuoteIndices = [];
let sessionsCycle    = 0;

// Persisted
let sessionsToday = 0;
let minutesTotal  = 0;
let tasks         = [];

/* ── Derived stat: tasks done today (computed from tasks array) */
function tasksDoneCount() {
  return tasks.filter(t => t.done).length;
}

/* ── DOM References ───────────────────────────────────────── */
const $ = id => document.getElementById(id);
const els = {
  timerCard:      $('timerCard'),
  timerDisplay:   $('timerDisplay'),
  modeLabel:      $('modeLabel'),
  cardSealTop:    $('cardSealTop'),
  ringSvg:        $('ringSvg'),
  ringProg:       $('ringProg'),
  sessionDots:    $('sessionDots'),
  startBtn:       $('startBtn'),
  quoteText:      $('quoteText'),
  quoteAuthor:    $('quoteAuthor'),
  notification:   $('notification'),
  statSessions:   $('statSessions'),
  statMinutes:    $('statMinutes'),
  statTasksDone:  $('statTasksDone'),
  taskInput:      $('taskInput'),
  taskList:       $('taskList'),
  welcomeOverlay: $('welcomeOverlay'),
  welcomeQuote:   $('welcomeQuote'),
};

/* ══════════════════════════════════════════════════════════
   WELCOME SCREEN
   ══════════════════════════════════════════════════════════ */

function initWelcome() {
  console.log('initWelcome called'); // Debug log
  
  // Make sure the element exists
  if (!els.welcomeQuote) {
    console.error('welcomeQuote element not found!');
    return;
  }
  
  // Select a random welcome quote
  const randomIndex = Math.floor(Math.random() * WELCOME_QUOTES.length);
  const q = WELCOME_QUOTES[randomIndex];
  
  console.log('Selected quote:', q); // Debug log
  
  // Set the text content
  els.welcomeQuote.textContent = q;
  
  // Force the quote to be visible
  els.welcomeQuote.style.display = 'block';
  els.welcomeQuote.style.visibility = 'visible';
  
  // Also check if the welcome overlay is visible
  console.log('Welcome overlay visible:', els.welcomeOverlay.classList.contains('hidden'));
}

function dismissWelcome() {
  els.welcomeOverlay.classList.add('hidden');
  setTimeout(() => { 
    if (els.welcomeOverlay) {
      els.welcomeOverlay.style.display = 'none';
    }
  }, 450);
}

/* ══════════════════════════════════════════════════════════
   TIMER
   ══════════════════════════════════════════════════════════ */

function setMode(mode) {
  if (isRunning) return;
  currentMode = mode;
  timeLeft    = MODES[mode].duration;
  totalTime   = MODES[mode].duration;
  const isBreak = MODES[mode].isBreak;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

  els.modeLabel.textContent   = MODES[mode].label;
  els.cardSealTop.textContent = MODES[mode].seal;
  updateDisplay();
  updateRing();
  showNextQuote();
}

function toggleTimer() { isRunning ? pauseTimer() : startTimer(); }

function startTimer() {
  isRunning = true;
  els.startBtn.textContent = 'Pause';
  els.ringSvg.classList.add('ticking');

  intervalId = setInterval(tick, 1000);
}

function pauseTimer() {
  clearInterval(intervalId);
  isRunning = false;
  els.startBtn.textContent = 'Resume';
  els.ringSvg.classList.remove('ticking');
}

function resetTimer() {
  clearInterval(intervalId);
  isRunning = false;
  els.ringSvg.classList.remove('ticking');
  els.startBtn.textContent = 'Begin';
  timeLeft = totalTime = MODES[currentMode].duration;
  updateDisplay();
  updateRing();
}

function skipSession() {
  clearInterval(intervalId);
  isRunning = false;
  els.ringSvg.classList.remove('ticking');
  onSessionComplete();
}

function tick() {
  if (timeLeft <= 0) { clearInterval(intervalId); isRunning = false; onSessionComplete(); return; }
  timeLeft--;
  updateDisplay();
  updateRing();
}

/* ── Session completion ───────────────────────────────────── */
function onSessionComplete() {
  els.ringSvg.classList.remove('ticking');
  els.startBtn.textContent = 'Begin';
  playChime();

  if (!MODES[currentMode].isBreak) {
    sessionsToday++;
    sessionsCycle++;
    minutesTotal += 25;
    saveState();
    updateStats();
    renderDots();
    showNotification(`✦ Well done, ${NAME}! Session complete.`);
    const nextMode = (sessionsCycle % 4 === 0) ? 'long' : 'short';
    setTimeout(() => setMode(nextMode), 900);
  } else {
    showNotification(`⚜ Recess over, ${NAME} — time to focus!`);
    setTimeout(() => setMode('work'), 900);
  }
}

function updateDisplay() {
  els.timerDisplay.textContent =
    `${String(Math.floor(timeLeft/60)).padStart(2,'0')}:${String(timeLeft%60).padStart(2,'0')}`;
}

function updateRing() {
  els.ringProg.style.strokeDashoffset = CIRCUMFERENCE * (1 - timeLeft / totalTime);
}

function renderDots() {
  const filled = sessionsCycle % 4;
  els.sessionDots.innerHTML = Array.from({length:4},(_,i) =>
    `<div class="dot${i < filled ? ' filled' : ''}"></div>`
  ).join('');
}

function updateStats() {
  els.statSessions.textContent  = sessionsToday;
  els.statMinutes.textContent   = minutesTotal;
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
  els.quoteAuthor.textContent = '⚖ International Law · Roman Law';
}

function showNextQuote() {
  if (usedQuoteIndices.length >= QUOTES.length) usedQuoteIndices = [];
  let idx;
  do { idx = Math.floor(Math.random() * QUOTES.length); } while (usedQuoteIndices.includes(idx));
  usedQuoteIndices.push(idx);
  const q = QUOTES[idx];
  els.quoteText.style.opacity = els.quoteAuthor.style.opacity = '0';
  setTimeout(() => {
    els.quoteText.innerHTML     = `"${q.text}"`;
    els.quoteAuthor.textContent = `— ${q.author}`;
    els.quoteText.style.opacity = els.quoteAuthor.style.opacity = '1';
  }, 300);
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATION
   ══════════════════════════════════════════════════════════ */

function showNotification(message) {
  els.notification.textContent = message;
  els.notification.classList.add('show');
  setTimeout(() => els.notification.classList.remove('show'), 3200);
}

/* ══════════════════════════════════════════════════════════
   CHIME
   ══════════════════════════════════════════════════════════ */

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.start(t); osc.stop(t + 0.75);
    });
  } catch(e) { console.warn('Audio unavailable:', e.message); }
}

/* ══════════════════════════════════════════════════════════
   TASKS
   ══════════════════════════════════════════════════════════ */

function addTask() {
  const input = els.taskInput;
  const text  = input.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, done: false });
  input.value = '';
  input.focus();
  saveTasks();
  renderTasks();
  updateStats(); // tasks done count may change
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveTasks();
    renderTasks();
    updateStats(); // update tasks done count live
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
  updateStats();
}

function renderTasks() {
  if (tasks.length === 0) {
    els.taskList.innerHTML = `<li class="task-empty">Add your study tasks above, ${NAME}…</li>`;
    return;
  }
  els.taskList.innerHTML = tasks.map(task => `
    <li class="task-item">
      <div class="task-check${task.done?' done':''}" onclick="toggleTask(${task.id})" title="${task.done?'Mark incomplete':'Mark complete'}"></div>
      <span class="task-text${task.done?' done':''}">${escapeHtml(task.text)}</span>
      <button class="task-delete" onclick="deleteTask(${task.id})" title="Remove task">✕</button>
    </li>`).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════ */

document.addEventListener('keydown', e => {
  if (document.activeElement === els.taskInput) return;
  switch (e.code) {
    case 'Space':  e.preventDefault(); toggleTimer(); break;
    case 'KeyR':   if (!isRunning) resetTimer();      break;
    case 'KeyS':   skipSession();                     break;
    case 'Digit1': setMode('work');                   break;
    case 'Digit2': setMode('short');                  break;
    case 'Digit3': setMode('long');                   break;
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
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Back online — attempting sync');
      this.showNotification('Connection restored. Syncing data...', 2000);
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 Offline mode — saving changes locally');
      this.showNotification('You are offline. Changes will sync when connection returns.', 3000);
    });

    // Listen for service worker messages
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_SUCCESS') {
          console.log('✅ Sync successful:', event.data.payload);
          this.showNotification('Data synced successfully!', 2000);
          this.updateSyncStatus();
        } else if (event.data && event.data.type === 'SYNC_FAILED') {
          console.error('❌ Sync failed:', event.data.error);
          this.showNotification('Sync failed. Will retry later.', 3000);
        }
      });
    }
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered with scope:', registration.scope);
        
        if ('sync' in registration) {
          console.log('Background sync supported');
        } else {
          console.log('Background sync not supported — using fallback');
        }
        
        return registration;
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
    return null;
  }

  async queueDataForSync(data) {
    await this.saveToLocalQueue(data);
    
    if (this.isOnline) {
      await this.triggerSync();
    } else {
      console.log('Offline — data queued for later sync');
      this.showNotification('Changes saved locally. Will sync when online.', 2000);
    }
  }

  async saveToLocalQueue(data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PomodoroSyncDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        
        // Make sure the object store exists
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.close();
          // Need to upgrade - reopen with upgrade
          const upgradeRequest = indexedDB.open('PomodoroSyncDB', 2);
          upgradeRequest.onupgradeneeded = (event) => {
            const upgradedDb = event.target.result;
            upgradedDb.createObjectStore('syncQueue', { keyPath: 'id' });
          };
          upgradeRequest.onsuccess = () => {
            const upgradedDb = upgradeRequest.result;
            const transaction = upgradedDb.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            store.add({
              id: Date.now(),
              payload: data,
              timestamp: new Date().toISOString(),
              retries: 0
            }).onsuccess = () => {
              upgradedDb.close();
              resolve();
            };
          };
          upgradeRequest.onerror = () => reject(upgradeRequest.error);
        } else {
          const transaction = db.transaction(['syncQueue'], 'readwrite');
          const store = transaction.objectStore('syncQueue');
          
          store.add({
            id: Date.now(),
            payload: data,
            timestamp: new Date().toISOString(),
            retries: 0
          }).onsuccess = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        }
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
      };
    });
  }

  async triggerSync() {
    if (!this.isOnline) {
      console.log('Offline — skipping sync');
      return;
    }
    
    const pendingItems = await this.getPendingItems();
    
    if (pendingItems.length === 0) {
      console.log('No pending items to sync');
      this.updateSyncStatus();
      return;
    }
    
    console.log(`Syncing ${pendingItems.length} items...`);
    this.showNotification(`Syncing ${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''}...`, 2000);
    
    // Try background sync first
    if (navigator.serviceWorker.controller && 'sync' in navigator.serviceWorker) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('pomodoro-sync-queue');
        console.log('Background sync triggered');
      } catch (error) {
        console.error('Background sync failed:', error);
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
        console.error('Sync failed for item:', item.id, error);
      }
    }
    
    if (successCount > 0) {
      this.showNotification(`Synced ${successCount} item${successCount > 1 ? 's' : ''}!`, 2000);
      this.updateSyncStatus();
      await this.reloadFromServer();
    }
  }

  async getPendingItems() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PomodoroSyncDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.close();
          resolve([]);
          return;
        }
        
        const transaction = db.transaction(['syncQueue'], 'readonly');
        const store = transaction.objectStore('syncQueue');
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
      const request = indexedDB.open('PomodoroSyncDB', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.close();
          resolve();
          return;
        }
        
        const transaction = db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
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
    console.log('Sending to server:', payload);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return true; // Simulate success
  }

  async reloadFromServer() {
    // Fetch latest data from server if needed
    console.log('Reloading data from server...');
  }

  updateSyncStatus() {
    let syncIndicator = document.getElementById('syncIndicator');
    if (!syncIndicator) {
      syncIndicator = document.createElement('div');
      syncIndicator.id = 'syncIndicator';
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
      syncIndicator.style.backgroundColor = '#ff6b6b';
      syncIndicator.style.boxShadow = '0 0 8px rgba(255,107,107,0.5)';
      syncIndicator.title = 'Offline mode';
    } else {
      syncIndicator.style.backgroundColor = '#4caf50';
      syncIndicator.style.boxShadow = '0 0 8px rgba(76,175,80,0.5)';
      syncIndicator.title = 'Online';
    }
  }

  showNotification(message, duration = 3000) {
    // Clear any existing timeout
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
    
    // Find or create notification element
    let notification = document.getElementById('syncNotification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'syncNotification';
      notification.className = 'notification';
      notification.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #e991b0, #d4708f);
        color: white;
        padding: 12px 24px;
        border-radius: 40px;
        font-family: 'Playfair Display', serif;
        font-size: 14px;
        z-index: 1000;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(notification);
    }
    
    // Update text and show
    notification.textContent = message;
    notification.style.opacity = '1';
    notification.style.display = 'block';
    
    // Auto-hide after duration
    this.notificationTimeout = setTimeout(() => {
      notification.style.opacity = '0';
      // Keep it hidden but don't remove from DOM
      setTimeout(() => {
        if (notification.style.opacity === '0') {
          notification.style.display = 'none';
        }
      }, 300);
    }, duration);
  }
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */

async function init() {
  console.log('Initializing app...');
  
  loadState();
  
  // Initialize SyncManager
  window.syncManager = new SyncManager();
  await window.syncManager.registerServiceWorker();
  
  // Check for pending sync on load
  setTimeout(() => {
    if (window.syncManager) {
      window.syncManager.triggerSync();
    }
  }, 1000);
  
  // Initialize all components
  initWelcome();
  renderDots();
  showOpeningMaxim();
  renderTasks();
  updateDisplay();
  updateRing();
  updateStats();
  
  // Update sync status indicator
  window.syncManager.updateSyncStatus();
  
  // Check online status
  console.log(`📡 ${navigator.onLine ? 'Online' : 'Offline'} mode`);
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('📡 Back online!');
    if (window.syncManager) {
      window.syncManager.updateSyncStatus();
      window.syncManager.triggerSync();
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('📴 Offline!');
    if (window.syncManager) {
      window.syncManager.updateSyncStatus();
    }
  });
}

// Run init when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}