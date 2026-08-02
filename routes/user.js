const express = require('express');
const db = require('../database');
const { WATER_BODIES, RODS, REELS, LINES, BAITS, AUTO_FISHERS, AUTO_CLICKER, FISH_DATABASE } = require('../data/constants');
const { getUserStats, getQuestsStatus, authenticate } = require('../utils');

const router = express.Router();

router.get('/state', authenticate, async (req, res) => {
  try {
    if (req.user.current_water_body === 'Mosquito Lake' || !WATER_BODIES[req.user.current_water_body]) {
      req.user.current_water_body = 'Lac aux moustique';
      await db.query('UPDATE users SET current_water_body = \'Lac aux moustique\' WHERE id = $1', [req.user.id]);
    }
    
    if (req.user.current_rod === 'Starter Rod' || req.user.current_rod === 'Siberia Starter Tele') {
      await db.query(`UPDATE users SET current_rod = 'Comfort FD360' WHERE id = $1`, [req.user.id]);
      req.user.current_rod = 'Comfort FD360';
    }
    if (req.user.current_reel === 'Starter Reel' || req.user.current_reel === 'Express Fishing Lacerti 4000S') {
      await db.query(`UPDATE users SET current_reel = 'Express Fishing Spark 1 2000S' WHERE id = $1`, [req.user.id]);
      req.user.current_reel = 'Express Fishing Spark 1 2000S';
    }
    if (req.user.current_line === 'Starter Line') {
      await db.query(`UPDATE users SET current_line = 'Siberia Mono SS (3.2kg)' WHERE id = $1`, [req.user.id]);
      req.user.current_line = 'Siberia Mono SS (3.2kg)';
    }
    
    const inventory = await db.all('SELECT item_type, item_name, quantity FROM inventory WHERE user_id = $1', [req.user.id]);
    const stats = await getUserStats(req.user.id, req.user);
    
    const now = new Date();
    const lastActive = new Date(req.user.last_active);
    const elapsedSeconds = Math.max(0, Math.floor((now - lastActive) / 1000));
    
    let offlineSilver = 0;
    if (elapsedSeconds > 2 && stats.sps > 0 && req.user.has_offline) {
      const offlineSeconds = Math.min(elapsedSeconds, 3600);
      offlineSilver = Number((offlineSeconds * stats.sps * 0.5).toFixed(2));
      
      await db.query(
        'UPDATE users SET silver = silver + $1, total_capital = total_capital + $1, last_active = CURRENT_TIMESTAMP WHERE id = $2',
        [offlineSilver, req.user.id]
      );
      req.user.silver = Number((req.user.silver + offlineSilver).toFixed(2));
    } else {
      await db.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
    }

    const vivier = await db.all('SELECT id, fish_name, weight, silver_value, xp_value, timestamp, sold FROM catches WHERE user_id = $1 ORDER BY timestamp DESC', [req.user.id]);
    const quests = await getQuestsStatus(req.user.id);

    res.json({
      user: {
        username: req.user.username,
        silver: req.user.silver,
        xp: req.user.xp,
        level: req.user.level,
        current_water_body: req.user.current_water_body,
        current_rod: req.user.current_rod,
        current_reel: req.user.current_reel,
        current_line: req.user.current_line,
        current_bait: req.user.current_bait,
        current_style: req.user.current_style
      },
      inventory,
      stats,
      vivier,
      quests,
      offline: {
        seconds: elapsedSeconds,
        silverEarned: offlineSilver
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user state' });
  }
});

router.post('/sync', authenticate, async (req, res) => {
  try {
    const stats = await getUserStats(req.user.id, req.user);
    const now = new Date();
    const lastActive = new Date(req.user.last_active);
    const elapsedSeconds = Math.max(0, Math.floor((now - lastActive) / 1000));

    let silverEarned = 0;
    if (elapsedSeconds >= 1 && stats.sps > 0) {
      silverEarned = Number((elapsedSeconds * stats.sps).toFixed(2));
    }

    await db.query(
      'UPDATE users SET silver = silver + $1, last_active = CURRENT_TIMESTAMP WHERE id = $2',
      [silverEarned, req.user.id]
    );

    const updatedUser = await db.get('SELECT silver FROM users WHERE id = $1', [req.user.id]);

    res.json({
      success: true,
      silverEarned,
      newSilver: updatedUser.silver,
      sps: stats.sps,
      spc: stats.spc
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.get('/quests', authenticate, async (req, res) => {
  try {
    const quests = await getQuestsStatus(req.user.id);
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quests' });
  }
});

router.post('/quests/claim', authenticate, async (req, res) => {
  const { questId } = req.body;
  const quests = await getQuestsStatus(req.user.id);
  const q = quests.find(item => item.id === questId);

  if (!q) return res.status(400).json({ error: 'Quête inconnue' });
  if (q.claimed) return res.status(400).json({ error: 'Récompense déjà récupérée' });
  if (q.progress < q.target) return res.status(400).json({ error: 'Objectif non atteint' });

  try {
    await db.query('BEGIN');
    
    await db.query('UPDATE users SET silver = silver + $1, total_capital = total_capital + $1 WHERE id = $2', [q.silverReward, req.user.id]);
    const updated = await db.get('SELECT silver FROM users WHERE id = $1', [req.user.id]);

    await db.query(
      'INSERT INTO user_quests (user_id, quest_id, completed, last_reset) VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP) ON CONFLICT(user_id, quest_id) DO UPDATE SET completed = TRUE, last_reset = CURRENT_TIMESTAMP',
      [req.user.id, questId]
    );

    await db.query('COMMIT');

    res.json({ success: true, rewardMsg: q.rewardDesc, newSilver: updated.silver });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: 'Claiming quest reward failed' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.all(
      `SELECT username, level, xp, silver, 
      (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE inventory.user_id = users.id AND item_type = 'auto_fisher')::integer as total_helpers 
      FROM users ORDER BY silver DESC LIMIT 10`
    );
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

router.post('/travel', authenticate, async (req, res) => {
  const { name } = req.body;
  const wb = WATER_BODIES[name];

  if (!wb) return res.status(400).json({ error: 'Invalid water body' });

  const hasVoyageur = req.user.has_voyageur;
  const cost = hasVoyageur ? 0 : wb.travelCost;

  if (req.user.level < wb.levelRequired) {
    return res.status(400).json({ error: `Niveau ${wb.levelRequired} requis` });
  }
  if (!hasVoyageur && req.user.silver < cost) {
    return res.status(400).json({ error: 'Not enough Silver to travel!' });
  }

  try {
    await db.query('BEGIN');
    await db.query('UPDATE users SET current_water_body = $1, silver = silver - $2, total_silver_spent = total_silver_spent + $2 WHERE id = $3', [name, cost, req.user.id]);
    const updated = await db.get('SELECT silver FROM users WHERE id = $1', [req.user.id]);
    await db.query('COMMIT');

    res.json({ success: true, newSilver: updated.silver });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: 'Travel failed' });
  }
});

router.post('/repair', authenticate, async (req, res) => {
  const { type, name } = req.body;
  let cost = 0;
  
  if (type === 'rod' && RODS[name]) {
    cost = Math.floor(RODS[name].cost * 0.5);
  } else if (type === 'reel' && REELS[name]) {
    cost = Math.floor(REELS[name].cost * 0.5);
  } else {
    return res.status(400).json({ error: 'Équipement invalide' });
  }

  if (req.user.silver < cost) {
    return res.status(400).json({ error: 'Pas assez de Silver pour réparer' });
  }

  try {
    await db.query('BEGIN');
    await db.query('UPDATE users SET silver = silver - $1, total_silver_spent = total_silver_spent + $1 WHERE id = $2', [cost, req.user.id]);
    
    if (type === 'rod') {
      await db.query('UPDATE users SET current_rod_durability = 100.0 WHERE id = $1', [req.user.id]);
    } else {
      await db.query('UPDATE users SET current_reel_durability = 100.0 WHERE id = $1', [req.user.id]);
    }
    
    await db.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: 'Échec de la réparation' });
  }
});

router.post('/equip', authenticate, async (req, res) => {
  const { type, name } = req.body;

  if (!['rod', 'reel', 'line', 'bait'].includes(type)) {
    return res.status(400).json({ error: 'Invalid gear type' });
  }

  try {
    const item = await db.get('SELECT quantity FROM inventory WHERE user_id = $1 AND item_type = $2 AND item_name = $3', [req.user.id, type, name]);
    if (!item || item.quantity <= 0) {
      return res.status(400).json({ error: 'Vous ne possédez pas cet objet.' });
    }

    let field = '';
    if (type === 'rod') field = 'current_rod';
    else if (type === 'reel') field = 'current_reel';
    else if (type === 'line') field = 'current_line';
    else if (type === 'bait') field = 'current_bait';

    await db.query(`UPDATE users SET ${field} = $1 WHERE id = $2`, [name, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Equip failed' });
  }
});

router.post('/style', authenticate, async (req, res) => {
  const { style } = req.body;
  if (!['fond', 'leurre', 'vif'].includes(style)) {
    return res.status(400).json({ error: 'Style de peche invalide' });
  }

  const map = req.user.current_water_body;
  const wb = WATER_BODIES[map] || WATER_BODIES['Lac aux moustique'];
  
  if (!wb.styles.includes(style)) {
    return res.status(400).json({ error: `Ce plan d'eau n'autorise pas la peche au/de: ${style}` });
  }

  try {
    await db.query('UPDATE users SET current_style = $1 WHERE id = $2', [style, req.user.id]);
    res.json({ success: true, current_style: style });
  } catch (err) {
    res.status(500).json({ error: 'Style update failed' });
  }
});

router.get('/metadata', (req, res) => {
  res.json({
    rods: RODS,
    reels: REELS,
    lines: LINES,
    baits: BAITS,
    autoFishers: AUTO_FISHERS,
    autoClickers: AUTO_CLICKER,
    waterBodies: WATER_BODIES,
    fishDatabase: FISH_DATABASE
  });
});

module.exports = router;
