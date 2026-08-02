// URL backend dynamique
const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? ''
  : 'https://rf4-clicker-online.onrender.com'; // À remplacer par votre URL Render finale si différente


// Global state variables
let token = localStorage.getItem('rf4_token') || null;
let username = localStorage.getItem('rf4_username') || null;
let metadata = null;
let userState = null;

// Fishing combat variables
let currentFishingState = 'idle'; // idle, casted, bite, fighting
let biteTimer = null;
let biteTimeout = null;
let catchDifficulty = 1;
let tension = 30;
let fightProgress = 0;
let fightInterval = null;
let redZoneTime = 0;
let zeroZoneTime = 0;

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
const hudSilverVal = document.getElementById('hud-silver-val');

const setupRod = document.getElementById('setup-rod');
const setupReel = document.getElementById('setup-reel');
const setupLine = document.getElementById('setup-line');
const setupBait = document.getElementById('setup-bait');
const recentCatchesList = document.getElementById('recent-catches-list');

const currentLocName = document.getElementById('current-location-name');
const actionBtn = document.getElementById('action-btn');
const fishingStateMsg = document.getElementById('fishing-state-msg');
const bobber = document.getElementById('fishing-bobber');
const bobberRipple = document.getElementById('bobber-ripple');
const waterArea = document.getElementById('water-area');

const fightHud = document.getElementById('fight-hud');
const tensionIndicator = document.getElementById('tension-indicator');
const reelBtn = document.getElementById('reel-btn');

const catchSplash = document.getElementById('catch-splash');
const catchFishName = document.getElementById('catch-fish-name');
const catchFishWeight = document.getElementById('catch-fish-weight');
const catchRewardSilver = document.getElementById('catch-reward-silver');
const catchRewardXp = document.getElementById('catch-reward-xp');
const catchCloseBtn = document.getElementById('catch-close-btn');

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
    startPeriodicRefresh();
  } else {
    showScreen('auth-screen');
  }
  setupTabs();
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
      statusEl.style.backgroundColor = "rgba(217, 75, 75, 0.1)";
      statusEl.style.borderColor = "rgba(217, 75, 75, 0.3)";
      statusEl.style.color = "var(--danger)";
    }
    // Retry in 3 seconds to auto-recover when Render wakes up
    setTimeout(fetchMetadata, 3000);
  }
}


// Refresh whole user state
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
    updateHUD();
    renderInventory();
    renderShop('rods'); // default shop view
    renderTravel();
    renderRecentCatches();
  } catch (err) {
    console.error('State sync error:', err);
  }
}

function startPeriodicRefresh() {
  setInterval(() => {
    if (token && currentFishingState === 'idle') {
      refreshState();
    }
    if (token) {
      loadLeaderboard();
    }
  }, 10000);
}

const WATER_BODIES_BG = {
  'Mosquito Lake': 'mosquito_lake.jpg',
  'Winding Rivulet': 'winding_rivulet.jpg',
  'Kuori Lake': 'kuori_lake.jpg',
  'Bear Lake': 'bear_lake.jpg'
};

function updateHUD() {
  if (!userState) return;
  const { user } = userState;
  hudUsername.innerText = user.username;
  hudLvlVal.innerText = user.level;
  hudSilverVal.innerText = user.silver.toFixed(2);
  currentLocName.innerText = user.current_water_body;

  // Change background of water container dynamically
  const bgImg = WATER_BODIES_BG[user.current_water_body] || 'mosquito_lake.jpg';
  waterArea.style.backgroundImage = `url('images/${bgImg}')`;

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
      startPeriodicRefresh();
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
      if (target === 'tab-shop') renderShop('rods');
    });
  });
}

// PÊCHE : CLICKER & COMBAT ACTION
actionBtn.addEventListener('click', () => {
  if (currentFishingState === 'idle') {
    startCast();
  } else if (currentFishingState === 'bite') {
    hookFish();
  }
});

// Speed up bite timer on water click (Clicker aspect!)
waterArea.addEventListener('click', (e) => {
  if (currentFishingState === 'casted' && e.target !== actionBtn) {
    if (biteTimer > 1000) {
      biteTimer -= 1000;
      showToast('Attraction du poisson... 🎣', 'info');
      bobberRipple.classList.remove('active');
      void bobberRipple.offsetWidth; // trigger reflow
      bobberRipple.classList.add('active');
    }
  }
});

async function startCast() {
  try {
    const res = await fetch(`${API_URL}/api/fish/cast`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, 'danger');
      return;
    }

    currentFishingState = 'casted';
    actionBtn.innerText = 'Attente de touche...';
    actionBtn.disabled = true;
    fishingStateMsg.innerText = 'Ligne lancée dans la zone méta. Attente d\'un poisson...';
    
    bobber.className = 'bobber active';
    bobberRipple.className = 'bobber-wave active';

    catchDifficulty = data.difficulty;
    biteTimer = 8000 + Math.random() * 7000;
    checkBiteLoop();
  } catch (err) {
    showToast('Erreur réseau', 'danger');
  }
}

function checkBiteLoop() {
  if (currentFishingState !== 'casted') return;

  if (biteTimer <= 0) {
    triggerBite();
  } else {
    biteTimer -= 100;
    biteTimeout = setTimeout(checkBiteLoop, 100);
  }
}

function triggerBite() {
  currentFishingState = 'bite';
  bobber.className = 'bobber active bite';
  actionBtn.innerText = 'FERREZ !';
  actionBtn.disabled = false;
  actionBtn.className = 'btn btn-action btn-danger';
  fishingStateMsg.innerText = 'TOUCHE ! Ferrez vite !';

  biteTimeout = setTimeout(() => {
    if (currentFishingState === 'bite') {
      missFish();
    }
  }, 3000);
}

function missFish() {
  currentFishingState = 'idle';
  resetFishingUI();
  showToast('Le poisson s\'est échappé avec l\'appât...', 'danger');
  refreshState();
}

function hookFish() {
  clearTimeout(biteTimeout);
  currentFishingState = 'fighting';
  
  actionBtn.style.display = 'none';
  bobber.className = 'bobber';
  bobberRipple.className = 'bobber-wave';
  fishingStateMsg.innerText = 'Combat avec le poisson !';
  fightHud.style.display = 'flex';

  tension = 30;
  fightProgress = 0;
  redZoneTime = 0;
  zeroZoneTime = 0;
  fightInterval = setInterval(combatLoop, 100);
}

reelBtn.addEventListener('click', () => {
  if (currentFishingState === 'fighting') {
    tension = Math.min(100, tension + 9);
    if (tension >= 40 && tension <= 80) {
      fightProgress += 4;
    } else {
      fightProgress += 1;
    }
  }
});

function combatLoop() {
  if (currentFishingState !== 'fighting') return;

  tension = Math.max(0, tension - 3);
  const fishPull = (Math.random() - 0.4) * catchDifficulty * 2.5;
  tension = Math.max(0, Math.min(100, tension + fishPull));

  tensionIndicator.style.width = `${tension}%`;

  if (tension >= 85) {
    redZoneTime += 100;
    tensionIndicator.style.background = 'var(--danger)';
    if (redZoneTime >= 1500) {
      breakLine('Tension trop élevée !');
      return;
    }
  } else if (tension <= 5) {
    zeroZoneTime += 100;
    tensionIndicator.style.background = 'var(--danger)';
    if (zeroZoneTime >= 2000) {
      breakLine('Fil trop détendu, le poisson s\'est décroché.');
      return;
    }
  } else {
    redZoneTime = 0;
    zeroZoneTime = 0;
    if (tension >= 40 && tension <= 80) {
      tensionIndicator.style.background = 'var(--success)';
    } else {
      tensionIndicator.style.background = 'var(--accent)';
    }
  }

  if (tension > 5 && tension < 85) {
    fightProgress += 0.8;
  }

  if (fightProgress >= 100) {
    resolveCatch();
  }
}

async function breakLine(reason) {
  clearInterval(fightInterval);
  currentFishingState = 'idle';
  fightHud.style.display = 'none';
  actionBtn.style.display = 'inline-flex';
  resetFishingUI();
  
  try {
    const res = await fetch(`${API_URL}/api/fish/catch`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.broke) {
      showToast(`${reason} ${data.reason}`, 'danger');
    } else {
      showToast(reason, 'danger');
    }
  } catch(e) {}
  
  refreshState();
}

async function resolveCatch() {
  clearInterval(fightInterval);
  currentFishingState = 'idle';
  fightHud.style.display = 'none';
  actionBtn.style.display = 'inline-flex';
  resetFishingUI();

  try {
    const res = await fetch(`${API_URL}/api/fish/catch`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error, 'danger');
      return;
    }

    if (data.broke) {
      showToast(`Casse ! ${data.reason}`, 'danger');
    } else {
      catchFishName.innerText = data.fish.name;
      catchFishWeight.innerText = data.fish.weight.toFixed(3);
      catchRewardSilver.innerText = `+${data.fish.silver.toFixed(2)}`;
      catchRewardXp.innerText = `+${data.fish.xp}`;
      catchSplash.classList.add('active');

      if (data.levelUp) {
        showToast(`Félicitations ! Vous passez au Niveau ${data.levelUp} ! 🎉`, 'success');
      }
    }
    refreshState();
  } catch (err) {
    showToast('Erreur de validation de la prise', 'danger');
  }
}

catchCloseBtn.addEventListener('click', () => {
  catchSplash.classList.remove('active');
});

function resetFishingUI() {
  actionBtn.className = 'btn btn-action';
  actionBtn.innerText = 'Lancer la ligne';
  actionBtn.disabled = false;
  bobber.className = 'bobber';
  bobberRipple.className = 'bobber-wave';
  fishingStateMsg.innerText = 'Prêt à lancer votre ligne.';
}

// INVENTAIRE
function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  if (!userState) return;

  userState.inventory.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

    const isEquipped = 
      (item.item_type === 'rod' && userState.user.current_rod === item.item_name) ||
      (item.item_type === 'reel' && userState.user.current_reel === item.item_name) ||
      (item.item_type === 'line' && userState.user.current_line === item.item_name) ||
      (item.item_type === 'bait' && userState.user.current_bait === item.item_name);

    let details = '';
    if (item.item_type === 'rod') details = `Force: ${metadata.rods[item.item_name].maxW} kg`;
    else if (item.item_type === 'reel') details = `Frein: ${metadata.reels[item.item_name].maxDrag} kg`;
    else if (item.item_type === 'line') details = `Résistance: ${metadata.lines[item.item_name].strength} kg`;
    else if (item.item_type === 'bait') details = `Quantité: ${item.quantity}`;

    card.innerHTML = `
      <div class="item-info">
        <h4>${item.item_name}</h4>
        <span class="item-badge">${translateType(item.item_type)}</span>
        <p style="margin-top: 5px;">${details}</p>
      </div>
      <div class="item-card-footer">
        ${isEquipped ? '<span style="color:var(--success); font-weight:600; font-size:0.85rem;">ÉQUIPÉ</span>' : `<button class="btn btn-primary btn-sm" onclick="equipItem('${item.item_type}', '${item.item_name}')">Équiper</button>`}
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
      showToast('Équipement mis à jour', 'success');
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

  let items = {};
  let itemType = '';

  if (category === 'rods') { items = metadata.rods; itemType = 'rod'; }
  else if (category === 'reels') { items = metadata.reels; itemType = 'reel'; }
  else if (category === 'lines') { items = metadata.lines; itemType = 'line'; }
  else if (category === 'baits') { items = metadata.baits; itemType = 'bait'; }

  Object.keys(items).forEach(name => {
    const data = items[name];
    if (data.cost === 0) return;

    const card = document.createElement('div');
    card.className = 'item-card';

    let spec = '';
    if (itemType === 'rod') spec = `Résistance: ${data.maxW} kg`;
    else if (itemType === 'reel') spec = `Drag max: ${data.maxDrag} kg`;
    else if (itemType === 'line') spec = `Force: ${data.strength} kg`;
    else if (itemType === 'bait') spec = `Pack de ${data.count}`;

    card.innerHTML = `
      <div class="item-info">
        <h4>${name}</h4>
        <p>${spec}</p>
      </div>
      <div class="item-card-footer">
        <span class="item-price">${data.cost.toFixed(2)} 🪙</span>
        <button class="btn btn-primary btn-sm" onclick="buyItem('${itemType}', '${name}')">Acheter</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function buyItem(type, name) {
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
      showToast('Achat réussi !', 'success');
      await refreshState();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast('Erreur d\'achat', 'danger');
  }
}
window.buyItem = buyItem;

// VOYAGE
function renderTravel() {
  const grid = document.getElementById('travel-grid');
  grid.innerHTML = '';
  if (!metadata || !userState) return;

  Object.keys(metadata.waterBodies).forEach(name => {
    const wb = metadata.waterBodies[name];
    const isCurrent = userState.user.current_water_body === name;

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${name}</h4>
        <p>Niveau requis: ${wb.levelRequired}</p>
        <p style="margin-top: 5px; font-size: 0.75rem; color: var(--primary);">Poissons: ${wb.fish.map(f => f.name).join(', ')}</p>
      </div>
      <div class="item-card-footer">
        <span class="item-price">${wb.travelCost > 0 ? `${wb.travelCost} 🪙` : 'Gratuit'}</span>
        ${isCurrent ? '<span style="color:var(--success); font-weight:600; font-size:0.85rem;">SUR PLACE</span>' : `<button class="btn btn-primary btn-sm" onclick="travelTo('${name}')">Voyager</button>`}
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
function renderRecentCatches() {
  recentCatchesList.innerHTML = '';
  if (!userState || userState.recentCatches.length === 0) {
    recentCatchesList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center;">Aucune prise récente</p>';
    return;
  }

  userState.recentCatches.forEach(c => {
    const card = document.createElement('div');
    card.className = 'catch-card';
    card.innerHTML = `
      <div class="catch-card-info">
        <h4>${c.fish_name}</h4>
        <span>${c.weight.toFixed(3)} kg</span>
      </div>
      <div class="catch-card-reward">
        <div class="silver">+${c.silver_value.toFixed(2)} 🪙</div>
        <div class="xp">+${c.xp_value} XP</div>
      </div>
    `;
    recentCatchesList.appendChild(card);
  });
}

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
        <td>${u.xp} XP</td>
        <td>${u.silver.toFixed(2)} 🪙</td>
        <td>${u.total_catches} 🐟</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Leaderboard load error:', err);
  }
}

init();
