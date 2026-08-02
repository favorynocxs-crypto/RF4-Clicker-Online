export const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? ''
  : 'https://rf4-clicker-online.onrender.com';

// Global state variables
export let state = {
  token: localStorage.getItem('rf4_token') || null,
  username: localStorage.getItem('rf4_username') || null,
  metadata: null,
  userState: null,
  
  // Game counters
  currentSilver: 0.0,
  spsRate: 0.0,
  spcRate: 1.0,
  lastSyncTime: Date.now(),
  
  // Fishing RPG Game State
  fishingState: 'idle', // 'idle', 'casting', 'bite', 'combat'
  activeFish: null,
  combatProgress: 50.0,
  combatDrainInterval: null,
  escapeTimeout: null,
  
  // Combat internal state
  combatClicksDealt: 0,
  combatMaxClicks: 10,
  combatTimeRemaining: 8.0,
  
  // Cached elements
  elements: {}
};

export function setToken(t) {
  state.token = t;
  if (t) localStorage.setItem('rf4_token', t);
  else localStorage.removeItem('rf4_token');
}

export function setUsername(u) {
  state.username = u;
  if (u) localStorage.setItem('rf4_username', u);
  else localStorage.removeItem('rf4_username');
}

export function updateSilver(val) {
  state.currentSilver = val;
}
