const db = require('./database');
const crypto = require('crypto');
const {
  FISH_DATABASE,
  WATER_BODIES,
  RODS,
  REELS,
  LINES,
  BAITS,
  AUTO_FISHERS,
  AUTO_CLICKER
} = require('./data/constants');

const secret = "rf4-clicker-secret-salt-2026";

function generateFishToken(data) {
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

function verifyFishToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto.createHmac('sha256', secret).update(decoded.payload).digest('hex');
    if (expectedSignature === decoded.signature) {
      return JSON.parse(decoded.payload);
    }
  } catch (e) {}
  return null;
}

function calculateLevel(xp) {
  let level = 1;
  while (xp >= level * level * 100) {
    level++;
  }
  return level;
}

async function getUserStats(userId, user) {
  let flatSPC = 1.0;
  
  const rod = user.current_rod;
  if (RODS[rod]) flatSPC += RODS[rod].addPower;

  const bait = user.current_bait;
  if (BAITS[bait]) flatSPC += BAITS[bait].addPower;

  let reelMult = 1.0;
  const reel = user.current_reel;
  if (REELS[reel]) reelMult = REELS[reel].multiplier;

  const baseSPC = flatSPC * reelMult;

  let critChance = 0.05;
  const line = user.current_line;
  if (LINES[line]) critChance += LINES[line].critChance;

  let sps = 0.0;
  const helpers = await db.all('SELECT item_name, quantity FROM inventory WHERE user_id = $1 AND item_type = $2', [userId, 'auto_fisher']);
  for (const h of helpers) {
    if (AUTO_FISHERS[h.item_name]) {
      sps += AUTO_FISHERS[h.item_name].sps * h.quantity;
    }
  }

  let lakeMult = 1.0;
  const lake = user.current_water_body;
  if (WATER_BODIES[lake]) {
    lakeMult = WATER_BODIES[lake].mult;
  }

  return {
    spc: Number((baseSPC * lakeMult).toFixed(2)),
    sps: Number((sps * lakeMult).toFixed(2)),
    critChance,
    lakeMult
  };
}

async function getQuestsStatus(userId) {
  const dailyCatchesRes = await db.get("SELECT COUNT(*) as cnt FROM catches WHERE user_id = $1 AND timestamp::date = CURRENT_DATE", [userId]);
  const dailyCatches = parseInt(dailyCatchesRes.cnt) || 0;

  const dailyTrophiesRes = await db.get("SELECT COUNT(*) as cnt FROM catches WHERE user_id = $1 AND timestamp::date = CURRENT_DATE AND (fish_name LIKE '%Trophée%' OR fish_name LIKE '%Bleu%')", [userId]);
  const dailyTrophies = parseInt(dailyTrophiesRes.cnt) || 0;

  const claimed = await db.all('SELECT quest_id FROM user_quests WHERE user_id = $1 AND completed = TRUE AND last_reset::date = CURRENT_DATE', [userId]);
  const claimedIds = claimed.map(q => q.quest_id);

  return [
    { id: 'quest_1', title: 'Pêcheur du Dimanche', desc: "Attraper 5 poissons aujourd'hui.", progress: dailyCatches, target: 5, claimed: claimedIds.includes('quest_1'), rewardDesc: '+50 Silver', silverReward: 50 },
    { id: 'quest_2', title: 'Apprenti Pêcheur', desc: "Attraper 20 poissons aujourd'hui.", progress: dailyCatches, target: 20, claimed: claimedIds.includes('quest_2'), rewardDesc: '+150 Silver', silverReward: 150 },
    { id: 'quest_3', title: 'Pêcheur Confirmé', desc: "Attraper 50 poissons aujourd'hui.", progress: dailyCatches, target: 50, claimed: claimedIds.includes('quest_3'), rewardDesc: '+500 Silver', silverReward: 500 },
    { id: 'quest_4', title: 'Chasseur de Trophées', desc: "Attraper 1 poisson Trophée ou Trophée Bleu aujourd'hui.", progress: dailyTrophies, target: 1, claimed: claimedIds.includes('quest_4'), rewardDesc: '+1000 Silver', silverReward: 1000 },
    { id: 'quest_5', title: 'Maître Pêcheur', desc: "Attraper 100 poissons aujourd'hui.", progress: dailyCatches, target: 100, claimed: claimedIds.includes('quest_5'), rewardDesc: '+2000 Silver', silverReward: 2000 }
  ];
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const user = await db.get('SELECT * FROM users WHERE password_hash = $1', [token]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token / unauthorized' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database error authentication' });
  }
}

module.exports = {
  generateFishToken,
  verifyFishToken,
  calculateLevel,
  getUserStats,
  getQuestsStatus,
  authenticate
};
