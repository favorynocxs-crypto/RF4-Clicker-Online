const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? ''
  : 'https://rf4-clicker-online.onrender.com';

// Slug helpers for authentic images loading
function getImageSlug(name) {
  return name.normalize("NFD")
             .replace(/[\u0300-\u036f]/g, "")
             .toLowerCase()
             .replace(/[^a-z0-9]/g, "_")
             .replace(/__+/g, "_")
             .replace(/^_|_$/g, "");
}
function getBaseFishName(fullName) {
  return fullName.split(' (')[0];
}

// Global state variables
let token = localStorage.getItem('rf4_token') || null;
let username = localStorage.getItem('rf4_username') || null;
let metadata = null;
let userState = null;

// Game counters
let currentSilver = 0.0;
let spsRate = 0.0;
let spcRate = 1.0;
let lastSyncTime = Date.now();

// Fishing RPG Game State
let fishingState = 'idle'; // 'idle', 'casting', 'bite', 'combat'
let activeFish = null;
let combatProgress = 50.0;
let combatDrainInterval = null;
let escapeTimeout = null;

// Elements
const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const toggleAuth = document.getElementById('toggle-auth');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');

const logoutBtn = document.getElementById('logout-btn');
const hudUsername = document.getElementById('hud-username');
const hudLvlVal = document.getElementById('hud-lvl-val');
const xpProgress = document.getElementById('xp-progress');
const hudXpVal = document.getElementById('hud-xp-val');

const setupRod = document.getElementById('setup-rod');
const setupReel = document.getElementById('setup-reel');
const setupLine = document.getElementById('setup-line');
const setupBait = document.getElementById('setup-bait');

const currentLocName = document.getElementById('current-location-name');
const cookieSilverVal = document.getElementById('cookie-silver-val');
const cookieSpsVal = document.getElementById('cookie-sps-val');
const cookieSpcVal = document.getElementById('cookie-spc-val');

// Fishing Action Zone
const fishingZoneClicker = document.getElementById('fishing-zone-clicker');
const fishingStatusText = document.getElementById('fishing-status-text');
const biteProgressContainer = document.getElementById('bite-progress-container');
const biteProgressFill = document.getElementById('bite-progress-fill');
const combatContainer = document.getElementById('combat-container');
const combatFishName = document.getElementById('combat-fish-name');
const combatFishRarity = document.getElementById('combat-fish-rarity');
const combatProgressFill = document.getElementById('combat-progress-fill');
const fishingActionHint = document.getElementById('fishing-action-hint');

// Sidebar Tabs & grids
const ownedHelpersList = document.getElementById('owned-helpers-list');
const bourricheGrid = document.getElementById('bourriche-grid');
const bourricheCountLbl = document.getElementById('bourriche-count-lbl');
const sellBourricheBtn = document.getElementById('sell-bourriche-btn');
const questsList = document.getElementById('quests-list');

const offlineSplash = document.getElementById('offline-splash');
const offlineSecondsVal = document.getElementById('offline-seconds-val');
const offlineSilverReward = document.getElementById('offline-silver-reward');
const offlineCloseBtn = document.getElementById('offline-close-btn');

// Toast Notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 4000);
}

// Check auth state on start
async function init() {
  await fetchMetadata();
  if (token) {
    showScreen('game-screen');
    await refreshState();
    startLoops();
  } else {
    showScreen('auth-screen');
  }
  setupTabs();
  setupClickerEvents();
}

function showScreen(screenId) {
  authScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  document.getElementById(screenId).classList.add('active');
}

// Fetch constant game metadata
async function fetchMetadata() {
  const statusEl = document.getElementById('server-status');
  try {
    const res = await fetch(`${API_URL}/api/metadata`);
    if (!res.ok) throw new Error("Metadata request failed");
    metadata = await res.json();
    if (statusEl) {
      statusEl.style.display = 'none';
    }
  } catch (err) {
    console.warn("API Server offline, retrying...", err);
    if (statusEl) {
      statusEl.innerText = "Serveur en veille. Réveil en cours (veuillez patienter)...";
    }
    setTimeout(fetchMetadata, 3000);
  }
}

// Refresh user state (vivier, quests, inventory)
async function refreshState() {
  if (!token) return;
  try {
    const res = await fetch(`${API_URL}/api/state`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
      logout();
      return;
    }
    const data = await res.json();
    userState = data;
    
    currentSilver = data.user.silver;
    spsRate = data.stats.sps;
    spcRate = data.stats.spc;
    
    updateHUD();
    renderInventory();
    renderShop('auto'); // default shop view
    renderTravel();
    renderOwnedHelpers();
    renderBourriche();
    renderQuests();
    renderAccount();

    // Check offline progress
    if (data.offline && data.offline.silverEarned > 0) {
      offlineSecondsVal.innerText = data.offline.seconds;
      offlineSilverReward.innerText = `+${data.offline.silverEarned.toFixed(2)}`;
      offlineSplash.classList.add('active');
    }
  } catch (err) {
    console.error('State sync error:', err);
  }
}

function startLoops() {
  // 1. Tick silver locally at 60fps for visual excellence
  let lastTick = performance.now();
  function tick() {
    if (!token) return;
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    if (spsRate > 0) {
      currentSilver += spsRate * dt;
      cookieSilverVal.innerText = currentSilver.toFixed(2);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // 2. Synchronize active state with server every 10 seconds
  setInterval(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        currentSilver = data.newSilver;
        cookieSilverVal.innerText = currentSilver.toFixed(2);
      }
    } catch (e) {}
  }, 10000);

  // 3. Periodic leaderboard updates
  setInterval(() => {
    if (token) {
      loadLeaderboard();
    }
  }, 12000);
}

const WATER_BODIES_BG = {
  'Lac aux moustique': 'map_moustique.jpg',
  'Rivière Belaya': 'map_belaya.jpg',
  'Lac cuivré': 'map_cuivre.jpg',
  'Mer de Norvège': 'map_norvege.jpg'
};

function updateHUD() {
  if (!userState) return;
  const { user } = userState;
  
  cookieSilverVal.innerText = currentSilver.toFixed(2);
  cookieSpsVal.innerText = spsRate.toFixed(2);
  currentLocName.innerText = user.current_water_body;
  
  hudLvlVal.innerText = user.level;

  // Change background dynamically on the game screen element instead of body
  const bgImg = WATER_BODIES_BG[user.current_water_body] || 'map_moustique.jpg';
  const encodedPath = encodeURI(`./images/${bgImg}`);
  document.getElementById('game-screen').style.backgroundImage = `url("${encodedPath}")`;

  // XP calculation
  const currentLvlXP = (user.level - 1) * (user.level - 1) * 100;
  const nextLvlXP = user.level * user.level * 100;
  const progressPercent = Math.min(100, ((user.xp - currentLvlXP) / (nextLvlXP - currentLvlXP)) * 100);
  
  xpProgress.style.width = `${progressPercent}%`;
  hudXpVal.innerText = `${user.xp} / ${nextLvlXP} XP`;

  // Setup items
  setupRod.innerText = user.current_rod;
  setupReel.innerText = user.current_reel;
  setupLine.innerText = user.current_line;
  setupBait.innerText = user.current_bait;

  // Sync style selection
  updateStyleSelectorUI();
}

// Authentication Logic
let isRegisterMode = false;
toggleAuth.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  authTitle.innerText = isRegisterMode ? 'Inscription' : 'Connexion';
  authBtn.innerText = isRegisterMode ? 'Créer un compte' : 'Se connecter';
  toggleAuth.innerText = isRegisterMode ? 'Se connecter' : 'Créer un compte';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value;
  const password = passwordInput.value;

  const url = isRegisterMode ? `${API_URL}/api/register` : `${API_URL}/api/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, 'danger');
      return;
    }

    if (isRegisterMode) {
      showToast('Compte créé avec succès ! Connectez-vous.', 'success');
      isRegisterMode = false;
      authTitle.innerText = 'Connexion';
      authBtn.innerText = 'Se connecter';
      toggleAuth.innerText = 'Créer un compte';
    } else {
      token = data.token;
      localStorage.setItem('rf4_token', token);
      localStorage.setItem('rf4_username', data.username);
      showToast('Connexion réussie', 'success');
      showScreen('game-screen');
      await refreshState();
      startLoops();
    }
  } catch (err) {
    showToast('Erreur serveur', 'danger');
  }
});

logoutBtn.addEventListener('click', logout);
function logout() {
  token = null;
  localStorage.removeItem('rf4_token');
  localStorage.removeItem('rf4_username');
  showScreen('auth-screen');
}

// Tabs switching logic
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      document.getElementById(target).classList.add('active');

      if (target === 'tab-leaderboard') loadLeaderboard();
      if (target === 'tab-inventory') renderInventory();
      if (target === 'tab-shop') renderShop('auto');
      if (target === 'tab-bourriche') renderBourriche();
      if (target === 'tab-quests') renderQuests();
      if (target === 'tab-travel') renderTravel();
      if (target === 'tab-prises') renderPrises();
      if (target === 'tab-map') renderMapInfo();
      if (target === 'tab-stats') renderStats();
      if (target === 'tab-repair') renderRepair();
    });
  });
}

// ACTIVE FISHING & COMBAT ACTIONS
function setupClickerEvents() {
  fishingZoneClicker.addEventListener('click', (e) => {
    if (!token) return;

    if (fishingState === 'idle') {
      startCombatDirect();
    } else if (fishingState === 'combat') {
      dealDamage(e);
    }
  });

  sellBourricheBtn.addEventListener('click', sellBourriche);

  // Setup Technique Style buttons
  document.querySelectorAll('.style-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedStyle = e.target.getAttribute('data-style');
      changeFishingStyle(selectedStyle);
    });
  });
}

async function changeFishingStyle(style) {
  if (!token || fishingState !== 'idle') return;
  try {
    const res = await fetch(`${API_URL}/api/style`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ style })
    });
    const data = await res.json();
    if (res.ok) {
      userState.user.current_style = style;
      showToast(`Style de pêche changé : ${translateStyle(style)} !`, 'success');
      updateStyleSelectorUI();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {}
}

function translateStyle(s) {
  if (s === 'fond') return 'Pêche de Fond';
  if (s === 'leurre') return 'Pêche au Leurre';
  if (s === 'vif') return 'Pêche au Vif';
  return s;
}

function updateStyleSelectorUI() {
  if (!userState || !metadata) return;
  const user = userState.user;
  const allowedStyles = metadata.waterBodies[user.current_water_body].styles || ['fond', 'leurre'];

  document.querySelectorAll('.style-select-btn').forEach(btn => {
    const s = btn.getAttribute('data-style');
    if (allowedStyles.includes(s)) {
      btn.disabled = false;
      btn.style.opacity = '1';
    } else {
      btn.disabled = true;
      btn.style.opacity = '0.25';
      if (s === user.current_style) {
        // Fallback to fond if style is no longer allowed (e.g. after traveling)
        setTimeout(() => changeFishingStyle('fond'), 50);
      }
    }

    if (s === user.current_style) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Cast Line & Wait progress simulation
// Active Combat Variables for Direct Clicker
let combatClicksDealt = 0;
let combatMaxClicks = 10;
let combatTimeRemaining = 8.0;
let combatTimerInterval = null;

async function startCombatDirect() {
  if (fishingState !== 'idle' || !token) return;
  
  fishingState = 'fetching';
  fishingStatusText.innerText = "FERRAGE DU POISSON...";
  fishingActionHint.innerText = "Veuillez patienter...";
  
  try {
    const res = await fetch(`${API_URL}/api/fish/bite`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 403) {
      const errorData = await res.json();
      resetFishingState();
      showToast(errorData.error, 'danger');
      logout();
      return;
    }
    
    if (!res.ok) {
      resetFishingState();
      showToast("Le poisson s'est enfui.", 'danger');
      return;
    }
    
    const data = await res.json();
    activeFish = data;
    fishingState = 'combat';
    
    // Setup combat parameters
    combatClicksDealt = 0;
    combatMaxClicks = data.clicksRequired;
    combatTimeRemaining = data.combatTime || 8.0; 
    
    // Update UI elements
    fishingStatusText.style.display = 'none';
    combatContainer.style.display = 'block';
    combatFishName.innerText = data.fishName;
    combatFishRarity.innerText = data.rarity;
    
    combatFishRarity.className = 'combat-fish-rarity';
    if (data.rarity.includes('Non-Tagué')) combatFishRarity.classList.add('rarity-non-tague');
    else if (data.rarity.includes('Trophée Bleu')) combatFishRarity.classList.add('rarity-trophee-bleu');
    else if (data.rarity.includes('Trophée')) combatFishRarity.classList.add('rarity-trophee');
    else combatFishRarity.classList.add('rarity-tague');
    
    fishingActionHint.innerText = "CLIQUEZ À RÉPETTITION POUR INFLIGER DES DÉGÂTS !";
    updateCombatUI();

    // Timer countdown loop
    combatTimerInterval = setInterval(() => {
      if (fishingState !== 'combat') {
        clearInterval(combatTimerInterval);
        return;
      }
      
      combatTimeRemaining -= 0.1;
      if (combatTimeRemaining <= 0) {
        clearInterval(combatTimerInterval);
        resetFishingState();
        showToast("Le poisson s'est échappé ! Temps écoulé. 🐟💨", 'danger');
      } else {
        updateCombatUI();
      }
    }, 100);
  } catch (err) {
    resetFishingState();
  }
}

function updateCombatUI() {
  const pct = (combatClicksDealt / combatMaxClicks) * 100;
  combatProgressFill.style.width = `${Math.min(100, pct)}%`;
  
  const timerEl = document.getElementById('combat-timer-text');
  if (timerEl) {
    timerEl.innerText = `Temps restant : ${Math.max(0, combatTimeRemaining).toFixed(1)}s`;
  }
  
  const clicksEl = document.getElementById('combat-clicks-left');
  if (clicksEl) {
    clicksEl.innerText = `Dégâts : ${Math.min(combatMaxClicks, Math.floor(combatClicksDealt))} / ${combatMaxClicks}`;
  }
}

function dealDamage(e) {
  if (fishingState !== 'combat' || !activeFish) return;

  // Clicks dealt is increased by click power (spcRate)
  combatClicksDealt += spcRate;
  updateCombatUI();

  // Visual splash effect
  createSplashVisual(e.clientX, e.clientY);

  if (combatClicksDealt >= combatMaxClicks) {
    if (combatTimerInterval) clearInterval(combatTimerInterval);
    landFish();
  }
}

async function landFish() {
  fishingState = 'landing';
  fishingActionHint.innerText = "Épuisette en cours...";

  try {
    const res = await fetch(`${API_URL}/api/fish/land`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: activeFish.token })
    });

    if (res.status === 403) {
      const errorData = await res.json();
      resetFishingState();
      showToast(errorData.error, 'danger');
      logout();
      return;
    }

    const data = await res.json();
    if (res.ok) {
      // Trigger splash reward overlay
      showToast(`Capturé ! ${data.fishName} (${data.weight.toFixed(3)} kg) 🎉`, 'success');
      
      // Force refresh data
      await refreshState();
      
      if (data.levelUp) {
        showToast(`FÉLICITATIONS ! Passage au Niveau ${data.levelUp} ! 🌟`, 'success');
      }
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast("Erreur lors de la capture.", 'danger');
  }
  resetFishingState();
}

function resetFishingState() {
  fishingState = 'idle';
  activeFish = null;
  combatClicksDealt = 0;
  if (combatTimerInterval) clearInterval(combatTimerInterval);

  if (biteProgressContainer) biteProgressContainer.style.display = 'none';
  if (combatContainer) combatContainer.style.display = 'none';
  if (fishingStatusText) {
    fishingStatusText.style.display = 'block';
    fishingStatusText.innerText = "CLIQUEZ POUR PÊCHER";
  }
  if (fishingActionHint) {
    fishingActionHint.innerText = "Cliquez sur la zone ci-dessus pour ferrer un poisson et le combattre !";
  }
}

function createSplashVisual(x, y) {
  const el = document.createElement('div');
  el.className = 'click-effect';
  el.innerText = '💦';
  el.style.left = `${x - 15}px`;
  el.style.top = `${y - 15}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// BOURRICHE (Vivier) RENDERING
function renderBourriche() {
  bourricheGrid.innerHTML = '';
  if (!userState || !userState.vivier) return;

  const fishList = userState.vivier;
  const unsoldFishes = fishList.filter(f => !f.sold);
  bourricheCountLbl.innerText = `${fishList.length} poisson(s) (dont ${unsoldFishes.length} à vendre)`;

  if (fishList.length === 0) {
    bourricheGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 15px; grid-column:1/-1;">Bourriche vide. Allez pêcher !</p>';
    return;
  }

  fishList.forEach(fish => {
    const card = document.createElement('div');
    
    // Class names matching rarity: Non-Tagué, Tagué, Trophée, Trophée Bleu
    let cardClass = 'item-card fish-card';
    let labelClass = 'rarity-tague';
    if (fish.fish_name.includes('(Trophée Bleu)')) { cardClass += ' trophee-bleu'; labelClass = 'rarity-trophee-bleu'; }
    else if (fish.fish_name.includes('(Trophée)')) { cardClass += ' trophee'; labelClass = 'rarity-trophee'; }
    else if (fish.fish_name.includes('(Non-Tagué)')) { cardClass += ' non-tague'; labelClass = 'rarity-non-tague'; }
    else { cardClass += ' tague'; labelClass = 'rarity-tague'; }
    
    const baseName = getBaseFishName(fish.fish_name);
    const slug = getImageSlug(baseName);

    if (fish.sold) {
      cardClass += ' sold-fish';
    }

    card.className = cardClass;
    card.innerHTML = `
      <div class="card-img-container" ${fish.sold ? 'style="opacity: 0.5; filter: grayscale(100%);"' : ''}>
        <img class="fish-card-img" src="images/fish/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="fallback-icon fish-fallback">🐟</div>
      </div>
      <div class="item-info">
        <h4 class="${labelClass}">${baseName} (${fish.fish_name.split('(')[1]}</h4>
        <p>Poids: ${fish.weight.toFixed(3)} kg</p>
        <p>Taille: ${Math.floor(Math.pow(fish.weight, 1/3) * 35)} cm</p>
        <p style="color:var(--accent); font-weight:600; margin-top:3px;">
          ${fish.sold ? 'VENDU' : `Valeur: ${fish.silver_value.toFixed(2)} Silver`}
        </p>
      </div>
    `;
    if (fish.sold) {
      card.style.opacity = '0.7';
      card.style.order = '999'; // Push to bottom (requires flex/grid reordering, optional)
    }
    bourricheGrid.appendChild(card);
  });
}

// SELL FISH MARKET action
async function sellBourriche() {
  try {
    const res = await fetch(`${API_URL}/api/fish/sell`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Poissons vendus ! +${data.silverEarned.toFixed(2)} Silver gagnés ! 💰`, 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast("Vente impossible.", 'danger');
  }
}

// QUESTS (Défis) RENDERING
function renderQuests() {
  questsList.innerHTML = '';
  if (!userState || !userState.quests) return;

  userState.quests.forEach(q => {
    const card = document.createElement('div');
    card.className = 'helper-card';

    const pct = Math.min(100, Math.floor((q.progress / q.target) * 100));
    
    // Render claim button or success label
    let statusAction = '';
    if (q.claimed) {
      statusAction = '<span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">RÉCLAMÉ</span>';
    } else if (q.progress >= q.target) {
      statusAction = `<button class="btn btn-primary btn-sm" style="background-color:var(--accent); color:#000;" onclick="claimQuest('${q.id}')">Réclamer</button>`;
    } else {
      statusAction = `<span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${q.progress}/${q.target}</span>`;
    }

    card.innerHTML = `
      <div class="helper-info" style="width: 70%;">
        <h4>${q.title}</h4>
        <span style="font-size:0.75rem; line-height:1.2; display:block; margin:2px 0;">${q.desc}</span>
        <span style="color:var(--accent); font-size:0.75rem; font-weight:600;">Récompense: ${q.rewardDesc}</span>
        
        <!-- Quest progress indicator line -->
        <div style="background-color:rgba(0,0,0,0.4); height:4px; border-radius:2px; overflow:hidden; margin-top:6px; width:100%;">
          <div style="background-color:var(--primary); height:100%; width:${pct}%;"></div>
        </div>
      </div>
      <div class="quest-action-status">${statusAction}</div>
    `;
    questsList.appendChild(card);
  });
}

async function claimQuest(questId) {
  try {
    const res = await fetch(`${API_URL}/api/quests/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ questId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Défi complété ! Récompense obtenue: ${data.rewardMsg} 🎁`, 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast("Récompense indisponible.", 'danger');
  }
}
window.claimQuest = claimQuest;

// INVENTAIRE MATERIEL
function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  if (!userState) return;

  const gearItems = userState.inventory.filter(i => i.item_type !== 'auto_fisher');

  if (gearItems.length === 0) {
    grid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; grid-column:1/-1;">Sac vide.</p>';
    return;
  }

  gearItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

    const isEquipped = 
      (item.item_type === 'rod' && userState.user.current_rod === item.item_name) ||
      (item.item_type === 'reel' && userState.user.current_reel === item.item_name) ||
      (item.item_type === 'line' && userState.user.current_line === item.item_name) ||
      (item.item_type === 'bait' && userState.user.current_bait === item.item_name);

    let details = '';
    if (item.item_type === 'rod') details = `Force: +${metadata.rods[item.item_name].addPower}`;
    else if (item.item_type === 'reel') details = `Mult: x${metadata.reels[item.item_name].multiplier}`;
    else if (item.item_type === 'line') details = `Crit: +${Math.round(metadata.lines[item.item_name].critChance * 100)}%`;
    else if (item.item_type === 'bait') details = `Attraction: +${metadata.baits[item.item_name].addPower}`;

    const slug = getImageSlug(item.item_name);

    card.innerHTML = `
      <div class="card-img-container">
        <img class="gear-card-img" src="images/gear/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="fallback-icon gear-fallback">🎣</div>
      </div>
      <div class="item-info">
        <h4>${item.item_name}</h4>
        <span class="item-badge">${translateType(item.item_type)}</span>
        <p style="margin-top: 4px;">${details}</p>
      </div>
      <div class="item-card-footer">
        ${isEquipped ? '<span style="color:var(--success); font-weight:600; font-size:0.8rem;">ÉQUIPÉ</span>' : `<button class="btn btn-primary btn-sm" onclick="equipItem('${item.item_type}', '${item.item_name}')">Équiper</button>`}
      </div>
    `;
    grid.appendChild(card);
  });
}

function translateType(type) {
  switch(type) {
    case 'rod': return 'Canne';
    case 'reel': return 'Moulinet';
    case 'line': return 'Fil';
    case 'bait': return 'Appât';
    default: return type;
  }
}

async function equipItem(type, name) {
  try {
    const res = await fetch(`${API_URL}/api/equip`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, name })
    });
    if (res.ok) {
      showToast('Équipement équipé', 'success');
      await refreshState();
    } else {
      const data = await res.json();
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur équipement', 'danger');
  }
}
window.equipItem = equipItem;

// OWNED PASSIVE HELPERS
function renderOwnedHelpers() {
  ownedHelpersList.innerHTML = '';
  if (!userState) return;

  const helpers = userState.inventory.filter(i => i.item_type === 'auto_fisher');

  if (helpers.length === 0) {
    ownedHelpersList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 10px;">Aucun auto-pêcheur actif.</p>';
    return;
  }

  helpers.forEach(item => {
    const config = metadata.autoFishers[item.item_name];
    const totalSPS = item.quantity * config.sps * userState.stats.lakeMult;
    
    const card = document.createElement('div');
    card.className = 'helper-card';
    card.innerHTML = `
      <div class="helper-info">
        <h4>${item.item_name}</h4>
        <span>Production: +${totalSPS.toFixed(1)} Silver/s</span>
      </div>
      <div class="helper-count">x${item.quantity}</div>
    `;
    ownedHelpersList.appendChild(card);
  });
}

// BOUTIQUE
const shopTabs = document.querySelectorAll('.shop-tab-btn');
shopTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    shopTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderShop(tab.getAttribute('data-shop'));
  });
});

function renderShop(category) {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  if (!metadata || !userState) return;

  if (category === 'auto') {
    // Render Auto Fishers
    Object.keys(metadata.autoFishers).forEach(name => {
      const config = metadata.autoFishers[name];
      const inventoryItem = userState.inventory.find(i => i.item_name === name);
      const ownedCount = inventoryItem ? inventoryItem.quantity : 0;
      const currentCost = Math.floor(config.baseCost * Math.pow(1.15, ownedCount));

      const card = document.createElement('div');
      card.className = 'item-card';
      const slug = getImageSlug(name);
      card.innerHTML = `
        <div class="card-img-container">
          <img class="gear-card-img" src="images/gear/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="fallback-icon gear-fallback">🤖</div>
        </div>
        <div class="item-info">
          <h4>${name}</h4>
          <p>${config.desc}</p>
          <p style="margin-top: 4px; color: var(--primary);">Prod: +${config.sps} Silver/s</p>
          <span class="item-badge">Possédé: ${ownedCount} / ${userState.user.has_ameliorateur ? 7 : 5}</span>
        </div>
        <div class="item-card-footer">
          <span class="item-price">${currentCost} 🪙</span>
          <button class="btn btn-primary btn-sm" onclick="buyAutoHelper('${name}', 'auto_fisher')">Acheter</button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Render Auto Clickers
    Object.keys(metadata.autoClickers).forEach(name => {
      const config = metadata.autoClickers[name];
      const inventoryItem = userState.inventory.find(i => i.item_name === name);
      const ownedCount = inventoryItem ? inventoryItem.quantity : 0;
      const currentCost = Math.floor(config.baseCost * Math.pow(1.15, ownedCount));

      const card = document.createElement('div');
      card.className = 'item-card';
      const slug = getImageSlug(name);
      card.innerHTML = `
        <div class="card-img-container">
          <img class="gear-card-img" src="images/gear/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="fallback-icon gear-fallback">🖱️</div>
        </div>
        <div class="item-info">
          <h4>${name}</h4>
          <p>${config.desc}</p>
          <p style="margin-top: 4px; color: var(--accent);">Clic: +${config.addPower} Puissance</p>
          <span class="item-badge">Possédé: ${ownedCount} / ${userState.user.has_ameliorateur ? 7 : 5}</span>
        </div>
        <div class="item-card-footer">
          <span class="item-price">${currentCost} 🪙</span>
          <button class="btn btn-primary btn-sm" onclick="buyAutoHelper('${name}', 'auto_clicker')">Acheter</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } else if (category === 'p2w') {
    // Boutique Premium Pay-to-Win
    const packs = [
      { id: 'silver', name: '💰 Le Pack Argent', desc: '+1000 Silver instantanément (utilisable plusieurs fois)', price: '4.99€', icon: '💰' },
      { id: 'voyageur', name: '🗺️ Le Voyageur', desc: 'Permet de voyager sur n\'importe quelle map sans restriction de niveau et gratuitement', price: '4.99€', icon: '🌍' },
      { id: 'ameliorateur', name: '📈 L\'Améliorateur', desc: 'Augmente la limite d\'achat des améliorations/cliqueurs de 5 à 7', price: '7.99€', icon: '📈' },
      { id: 'offline', name: '🛌 L\'Offline', desc: 'Active les gains hors-ligne (50% de production sur 1h max)', price: '9.99€', icon: '🛌' }
    ];
    packs.forEach(pack => {
      const card = document.createElement('div');
      card.className = 'item-card p2w-card';
      card.innerHTML = `
        <div class="card-img-container">
          <div class="fallback-icon" style="display:flex; font-size:2.5rem;">${pack.icon}</div>
        </div>
        <div class="item-info">
          <h4 style="color:var(--accent);">${pack.name}</h4>
          <p>${pack.desc}</p>
        </div>
        <div class="item-card-footer">
          <span class="item-price" style="color:#e5a93b; font-size:1rem;">${pack.price}</span>
          <button class="btn btn-sm" style="background:linear-gradient(135deg,#e5a93b,#f1c40f);color:#000;font-weight:800;" onclick="buyP2W('${pack.id}')">ACHETER</button>
        </div>
      `;
      grid.appendChild(card);
    });
  } else {
    let items = {};
    let itemType = '';
    let isBaitCategory = false;

    if (category === 'rods') { items = metadata.rods; itemType = 'rod'; }
    else if (category === 'reels') { items = metadata.reels; itemType = 'reel'; }
    else if (category === 'lines') { items = metadata.lines; itemType = 'line'; }
    else if (['vers', 'vifs', 'artificiel', 'leurres'].includes(category)) { 
      items = metadata.baits; 
      itemType = 'bait'; 
      isBaitCategory = true; 
    }

    Object.keys(items).forEach(name => {
      const data = items[name];
      if (data.cost === 0) return;
      if (isBaitCategory && data.category !== category) return;

      const userLevel = userState.user.level;
      const isLocked = data.levelRequired && userLevel < data.levelRequired;

      const card = document.createElement('div');
      card.className = `item-card ${isLocked ? 'locked-item' : ''}`;

      let spec = '';
      if (itemType === 'rod') spec = `Force Clic: +${data.addPower}`;
      else if (itemType === 'reel') spec = `Multiplier: x${data.multiplier}`;
      else if (itemType === 'line') spec = `Crit Chance: +${Math.round(data.critChance * 100)}%`;
      else if (itemType === 'bait') spec = `Attraction: +${data.addPower}`;

      const slug = getImageSlug(name);

      card.innerHTML = `
        <div class="card-img-container">
          <img class="gear-card-img" src="images/gear/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="fallback-icon gear-fallback">🎣</div>
          ${isLocked ? '<div class="lock-overlay">🔒</div>' : ''}
        </div>
        <div class="item-info">
          <h4>${name}</h4>
          <p>${spec}</p>
          ${isLocked ? `<p style="color:var(--danger); font-size:0.75rem; font-weight:600; margin-top:4px;">🔒 Débloquer : ${data.mapName}</p>` : ''}
        </div>
        <div class="item-card-footer">
          <span class="item-price">${data.cost.toFixed(2)} 🪙</span>
          ${isLocked ? 
            `<button class="btn btn-sm" disabled style="background:rgba(255,255,255,0.03); color:var(--text-muted); cursor:not-allowed;">Bloqué</button>` : 
            `<button class="btn btn-primary btn-sm" onclick="buyGearItem('${itemType}', '${name}')">Acheter</button>`
          }
        </div>
      `;
      grid.appendChild(card);
    });
  }
}

async function buyAutoHelper(name, type) {
  try {
    const res = await fetch(`${API_URL}/api/shop/buy_auto`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Achat réussi !', 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur d\'achat', 'danger');
  }
}
window.buyAutoHelper = buyAutoHelper;

async function buyGearItem(type, name) {
  try {
    const res = await fetch(`${API_URL}/api/shop/buy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, name })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Matériel acheté avec succès !', 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur d\'achat', 'danger');
  }
}
window.buyGearItem = buyGearItem;

// VOYAGES
function renderTravel() {
  const grid = document.getElementById('travel-grid');
  grid.innerHTML = '';
  if (!metadata || !userState) return;

  const maps = Object.keys(metadata.waterBodies).map(key => {
    return { name: key, ...metadata.waterBodies[key] };
  }).sort((a, b) => a.levelRequired - b.levelRequired);

  maps.forEach(wb => {
    const isCurrent = userState.user.current_water_body === wb.name;
    const hasVoyageur = userState.user.has_voyageur;
    const isLocked = userState.user.level < wb.levelRequired;
    const cost = hasVoyageur ? 0 : wb.travelCost;
    const bgImg = WATER_BODIES_BG[wb.name] || 'map_moustique.jpg';
    
    const card = document.createElement('div');
    card.className = `item-card map-card ${isLocked ? 'map-locked' : ''}`;
    card.style.backgroundImage = `url("${encodeURI('./images/' + bgImg)}")`;
    card.style.position = 'relative';
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
    card.style.color = '#fff';
    card.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
    
    // Gradient overlay for better text readability
    card.innerHTML = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 100%);z-index:1;border-radius:inherit;"></div>
      ${isLocked ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3rem;z-index:3;">🔒</div>' : ''}
      <div class="map-card-content" style="position:relative;z-index:2;display:flex;flex-direction:column;height:100%;justify-content:space-between;">
        <div class="item-info">
          <h4 style="font-size:1.2rem;margin-bottom:5px;">${wb.name}</h4>
          <p>Niveau requis: ${hasVoyageur ? `<span style="text-decoration:line-through;">${wb.levelRequired}</span> (Voyageur)` : wb.levelRequired}</p>
        </div>
        <div class="item-card-footer" style="margin-top:20px;">
          <span class="item-price" style="font-size:1.1rem;">${cost > 0 ? `${cost} 🪙` : '<span style="color:var(--success);">Gratuit</span>'}</span>
          ${isCurrent 
            ? '<span style="color:var(--success); font-weight:800; font-size:0.95rem; background:rgba(0,0,0,0.5); padding:5px; border-radius:4px;">SUR PLACE</span>' 
            : `<button class="btn btn-primary btn-sm" ${isLocked ? 'disabled' : ''} onclick="travelTo('${wb.name}')">${isLocked ? 'Verrouillé' : 'Voyager'}</button>`
          }
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function travelTo(name) {
  try {
    const res = await fetch(`${API_URL}/api/travel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Voyage vers ${name} réussi ! 📍`, 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur voyage', 'danger');
  }
}
window.travelTo = travelTo;

// CLASSEMENT
async function loadLeaderboard() {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard`);
    const list = await res.json();
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    list.forEach((u, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${index + 1}</td>
        <td><strong>${u.username}</strong></td>
        <td>${u.level}</td>
        <td>${u.silver.toFixed(2)} 🪙</td>
        <td>${u.total_helpers} 🎣</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Leaderboard load error:', err);
  }
}

offlineCloseBtn.addEventListener('click', () => {
  offlineSplash.classList.remove('active');
});

// P2W PURCHASE HANDLER
async function buyP2W(packId) {
  if (!confirm('⚠️ Voulez-vous vraiment acheter ce pack Premium ?')) return;
  try {
    const res = await fetch(`${API_URL}/api/shop/p2w`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pack: packId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`🔥 ${data.message}`, 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur d\'achat Premium', 'danger');
  }
}
window.buyP2W = buyP2W;

function renderAccount() {
  if (!userState) return;
  const u = userState.user;
  const el = (id) => document.getElementById(id);
  
  if (el('account-username-lbl')) el('account-username-lbl').innerText = u.username;
}

function renderStats() {
  if (!userState) return;
  const u = userState.user;
  const el = (id) => document.getElementById(id);
  
  if (el('stat-level')) el('stat-level').innerText = u.level;
  if (el('stat-xp')) el('stat-xp').innerText = `${u.xp} XP`;
  if (el('stat-catches')) el('stat-catches').innerText = u.total_catches;
  if (el('stat-capital')) el('stat-capital').innerText = `${(u.total_capital || 0).toFixed(2)} Silver`;
  if (el('stat-spent')) el('stat-spent').innerText = `${(u.total_silver_spent || 0).toFixed(2)} Silver`;
  if (el('stat-time')) el('stat-time').innerText = `${Math.floor((u.total_time_played || 0) / 60)} min`;
  if (el('stat-clicks')) el('stat-clicks').innerText = u.total_clicks || 0;
}

function renderPrises() {
  const grid = document.getElementById('prises-grid');
  grid.innerHTML = '';
  if (!userState || !userState.vivier) return;

  const fishList = userState.vivier;
  
  // Group by fish_name (which includes rarity) to find the max weight
  const records = {};
  fishList.forEach(f => {
    if (!records[f.fish_name] || f.weight > records[f.fish_name].weight) {
      records[f.fish_name] = f;
    }
  });

  const uniqueRecords = Object.values(records).sort((a, b) => b.weight - a.weight);

  if (uniqueRecords.length === 0) {
    grid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 15px; grid-column:1/-1;">Aucune prise enregistrée.</p>';
    return;
  }

  uniqueRecords.forEach(fish => {
    const card = document.createElement('div');
    let cardClass = 'item-card fish-card';
    let labelClass = 'rarity-tague';
    if (fish.fish_name.includes('(Trophée Bleu)')) { cardClass += ' trophee-bleu'; labelClass = 'rarity-trophee-bleu'; }
    else if (fish.fish_name.includes('(Trophée)')) { cardClass += ' trophee'; labelClass = 'rarity-trophee'; }
    else if (fish.fish_name.includes('(Non-Tagué)')) { cardClass += ' non-tague'; labelClass = 'rarity-non-tague'; }
    else { cardClass += ' tague'; labelClass = 'rarity-tague'; }
    
    const baseName = getBaseFishName(fish.fish_name);
    const slug = getImageSlug(baseName);

    card.className = cardClass;
    card.innerHTML = `
      <div class="card-img-container">
        <img class="fish-card-img" src="images/fish/${slug}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="fallback-icon fish-fallback">🐟</div>
      </div>
      <div class="item-info">
        <h4 class="${labelClass}">${baseName} (${fish.fish_name.split('(')[1]}</h4>
        <p>Record Poids: ${fish.weight.toFixed(3)} kg</p>
        <p>Taille: ${Math.floor(Math.pow(fish.weight, 1/3) * 35)} cm</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderMapInfo() {
  const container = document.getElementById('map-info-container');
  container.innerHTML = '';
  if (!userState || !metadata) return;

  const currentMap = userState.user.current_water_body;
  const wb = metadata.waterBodies[currentMap];
  if (!wb) return;

  const bgImg = WATER_BODIES_BG[currentMap] || 'map_moustique.jpg';
  
  let html = `
    <div style="background-image: url('${encodeURI('./images/' + bgImg)}'); background-size: cover; background-position: center; border-radius: 12px; padding: 20px; position: relative; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
      <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.7); border-radius: 12px;"></div>
      <div style="position: relative; z-index: 1;">
        <h3 style="color: var(--primary); font-size: 1.5rem; margin-bottom: 10px;">${currentMap}</h3>
        <p style="margin-bottom: 10px;"><strong>Niveau Requis :</strong> ${wb.levelRequired}</p>
        <p style="margin-bottom: 10px;"><strong>Coût de voyage :</strong> ${wb.travelCost > 0 ? wb.travelCost + ' Silver' : 'Gratuit'}</p>
        <p style="margin-bottom: 10px;"><strong>Techniques Autorisées :</strong> ${wb.styles.map(s => translateStyle(s)).join(', ')}</p>
      </div>
    </div>
    <h3>Poissons de la Map</h3>
    <table class="leaderboard-table" style="margin-top: 15px;">
      <thead>
        <tr>
          <th>Espèce</th>
          <th>Poids Min</th>
          <th>Poids Max</th>
          <th>Taux de drop</th>
          <th>Valeur (par kg)</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (metadata.fishDatabase[currentMap]) {
    metadata.fishDatabase[currentMap].forEach(f => {
      html += `
        <tr>
          <td><strong>${f.name}</strong></td>
          <td>${f.minW} kg</td>
          <td>${f.maxW} kg</td>
          <td>${(f.rate * 100).toFixed(1)}%</td>
          <td style="color:var(--accent);">${f.valuePerKg} S</td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderRepair() {
  const grid = document.getElementById('repair-grid');
  grid.innerHTML = '';
  if (!userState || !metadata) return;

  const u = userState.user;
  const rod = metadata.rods[u.current_rod];
  const reel = metadata.reels[u.current_reel];

  if (rod) {
    const cost = Math.floor(rod.cost * 0.5);
    const durability = (u.current_rod_durability || 100).toFixed(1);
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${u.current_rod} (Canne)</h4>
        <p>Durabilité : <span style="color:${durability < 30 ? 'var(--danger)' : 'var(--success)'};">${durability}%</span></p>
      </div>
      <div class="item-card-footer">
        <span class="item-price">${cost} 🪙</span>
        <button class="btn btn-primary btn-sm" ${durability >= 100 ? 'disabled' : ''} onclick="repairGear('rod', '${u.current_rod}')">Réparer</button>
      </div>
    `;
    grid.appendChild(card);
  }

  if (reel) {
    const cost = Math.floor(reel.cost * 0.5);
    const durability = (u.current_reel_durability || 100).toFixed(1);
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${u.current_reel} (Moulinet)</h4>
        <p>Durabilité : <span style="color:${durability < 30 ? 'var(--danger)' : 'var(--success)'};">${durability}%</span></p>
      </div>
      <div class="item-card-footer">
        <span class="item-price">${cost} 🪙</span>
        <button class="btn btn-primary btn-sm" ${durability >= 100 ? 'disabled' : ''} onclick="repairGear('reel', '${u.current_reel}')">Réparer</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function repairGear(type, name) {
  try {
    const res = await fetch(`${API_URL}/api/repair`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, name })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Réparation effectuée !', 'success');
      await refreshState();
      renderRepair();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur de réparation', 'danger');
  }
}

init();
