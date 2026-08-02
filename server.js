const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = {};

// Constant game data with exact RF4 French names
const WATER_BODIES = {
  'Mosquito Lake': {
    levelRequired: 1,
    travelCost: 0,
    fish: [
      { name: 'Carassin doré', minW: 0.1, maxW: 2.5, valPerKg: 8, xpPerKg: 10, baits: ['Pain', 'Ver rouge', 'Asticots'] },
      { name: 'Carassin argenté', minW: 0.1, maxW: 2.0, valPerKg: 9, xpPerKg: 12, baits: ['Pain', 'Ver rouge', 'Asticots'] },
      { name: 'Gardon', minW: 0.05, maxW: 1.5, valPerKg: 10, xpPerKg: 15, baits: ['Pain', 'Asticots'] },
      { name: 'Perche commune', minW: 0.1, maxW: 1.8, valPerKg: 12, xpPerKg: 18, baits: ['Ver rouge'] }
    ]
  },
  'Winding Rivulet': {
    levelRequired: 3,
    travelCost: 100,
    fish: [
      { name: 'Chevesne', minW: 0.2, maxW: 4.0, valPerKg: 14, xpPerKg: 20, baits: ['Ver rouge', 'Asticots', 'Caster'] },
      { name: 'Vandoise', minW: 0.02, maxW: 0.3, valPerKg: 25, xpPerKg: 30, baits: ['Pain', 'Asticots'] },
      { name: 'Ablette', minW: 0.01, maxW: 0.08, valPerKg: 40, xpPerKg: 50, baits: ['Pain', 'Asticots'] },
      { name: 'Goujon', minW: 0.01, maxW: 0.1, valPerKg: 30, xpPerKg: 35, baits: ['Ver rouge', 'Asticots'] }
    ]
  },
  'Kuori Lake': {
    levelRequired: 12,
    travelCost: 500,
    fish: [
      { name: 'Omble de Kuori', minW: 1.0, maxW: 15.0, valPerKg: 25, xpPerKg: 40, baits: ['Ver rouge', 'Caster', 'Bouillettes Fraise/Banane'] },
      { name: 'Truite de Sevan', minW: 0.5, maxW: 9.0, valPerKg: 22, xpPerKg: 35, baits: ['Ver rouge', 'Bouillettes Fraise/Banane'] },
      { name: 'Truite lacustre', minW: 1.0, maxW: 12.0, valPerKg: 20, xpPerKg: 30, baits: ['Ver rouge', 'Bouillettes Fraise/Banane'] },
      { name: 'Brochet', minW: 1.0, maxW: 16.0, valPerKg: 18, xpPerKg: 25, baits: ['Ver rouge', 'Caster'] }
    ]
  },
  'Bear Lake': {
    levelRequired: 18,
    travelCost: 1200,
    fish: [
      { name: 'Carpe commune', minW: 2.0, maxW: 25.0, valPerKg: 15, xpPerKg: 25, baits: ['Bouillettes Fraise/Banane', 'Caster'] },
      { name: 'Carpe miroir', minW: 2.0, maxW: 25.0, valPerKg: 18, xpPerKg: 28, baits: ['Bouillettes Fraise/Banane'] },
      { name: 'Carpe amour', minW: 2.0, maxW: 20.0, valPerKg: 16, xpPerKg: 26, baits: ['Bouillettes Fraise/Banane', 'Caster'] }
    ]
  }
};

const RODS = {
  'Siberia Starter Tele': { maxW: 3.0, cost: 0 },
  'Express Fishing Sorrento FD130': { maxW: 5.5, cost: 150 },
  'Siberia Fortuna Feeder FD420': { maxW: 19.5, cost: 350 },
  'Model One Feeder FD420': { maxW: 26.0, cost: 750 },
  'Syberia SuperDuty FD420': { maxW: 35.0, cost: 1800 }
};

const REELS = {
  'Express Fishing Lacerti 4000S': { maxDrag: 3.5, cost: 0 },
  'Siberia Spark 2000S': { maxDrag: 5.5, cost: 180 },
  'Siberia Adriatica 5000S': { maxDrag: 7.5, cost: 450 },
  'Siberia Sabre 60s': { maxDrag: 10.0, cost: 900 },
  'Beluga Caliber HST 8000': { maxDrag: 15.5, cost: 2200 }
};

const LINES = {
  'Siberia Mono SS (3.2kg)': { strength: 3.2, cost: 0 },
  'Siberia Mono SS (5.4kg)': { strength: 5.4, cost: 30 },
  'Express Fishing Mono SS (7.8kg)': { strength: 7.8, cost: 70 },
  'Simmons Mono SS (11.5kg)': { strength: 11.5, cost: 120 },
  'Siberia DevilBraid (22kg)': { strength: 22.0, cost: 300 }
};

const BAITS = {
  'Pain': { cost: 0, count: 999999 },
  'Ver rouge': { cost: 15, count: 30 },
  'Asticots': { cost: 25, count: 30 },
  'Caster': { cost: 40, count: 30 },
  'Bouillettes Fraise/Banane': { cost: 80, count: 30 }
};

function calculateLevel(xp) {
  let level = 1;
  while (xp >= level * level * 100) {
    level++;
  }
  return level;
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

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username (min 3 chars) and password (min 4 chars) required' });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    await db.query('BEGIN');
    const result = await db.get(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, password_hash]
    );
    const userId = result.id;

    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'rod', 'Siberia Starter Tele', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'reel', 'Express Fishing Lacerti 4000S', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'line', 'Siberia Mono SS (3.2kg)', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'bait', 'Pain', 999999]);
    await db.query('COMMIT');

    res.json({ success: true });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch(e) {}
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE username = $1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    res.json({ token: user.password_hash, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/state', authenticate, async (req, res) => {
  try {
    const inventory = await db.all('SELECT item_type, item_name, quantity FROM inventory WHERE user_id = $1', [req.user.id]);
    const recentCatches = await db.all('SELECT fish_name, weight, silver_value, xp_value, timestamp FROM catches WHERE user_id = $1 ORDER BY id DESC LIMIT 10', [req.user.id]);
    
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
        current_bait: req.user.current_bait
      },
      inventory,
      recentCatches
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user state' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.all(
      `SELECT username, level, xp, silver, 
      (SELECT COUNT(*) FROM catches WHERE catches.user_id = users.id)::integer as total_catches 
      FROM users ORDER BY xp DESC LIMIT 10`
    );
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.post('/api/fish/cast', authenticate, async (req, res) => {
  const { user } = req;
  
  if (user.current_bait !== 'Pain') {
    const baitInv = await db.get('SELECT quantity FROM inventory WHERE user_id = $1 AND item_type = \'bait\' AND item_name = $2', [user.id, user.current_bait]);
    if (!baitInv || baitInv.quantity <= 0) {
      return res.status(400).json({ error: 'Plus d\'appât ! Achetez-en dans la boutique.' });
    }
  }

  const wb = WATER_BODIES[user.current_water_body];
  if (!wb) return res.status(400).json({ error: 'Plan d\'eau invalide' });

  const matchingFish = wb.fish.filter(f => f.baits.includes(user.current_bait));
  if (matchingFish.length === 0) {
    return res.status(400).json({ error: 'Cet appât n\'attire aucun poisson ici.' });
  }

  const selectedTemplate = matchingFish[Math.floor(Math.random() * matchingFish.length)];
  
  const weight = Number((selectedTemplate.minW + Math.random() * (selectedTemplate.maxW - selectedTemplate.minW)).toFixed(3));
  const silverVal = Number((weight * selectedTemplate.valPerKg).toFixed(2));
  const xpVal = Math.round(weight * selectedTemplate.xpPerKg * 10);

  const token = user.password_hash;
  activeSessions[token] = {
    fish: {
      name: selectedTemplate.name,
      weight,
      silver: silverVal,
      xp: xpVal
    },
    castTime: Date.now()
  };

  if (user.current_bait !== 'Pain') {
    await db.query('UPDATE inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_type = \'bait\' AND item_name = $2', [user.id, user.current_bait]);
  }

  res.json({
    success: true,
    fishName: selectedTemplate.name,
    weight,
    difficulty: Math.round(weight * 2)
  });
});

app.post('/api/fish/catch', authenticate, async (req, res) => {
  const token = req.user.password_hash;
  const session = activeSessions[token];

  if (!session) {
    return res.status(400).json({ error: 'No active cast found. Cast first.' });
  }

  if (Date.now() - session.castTime < 1000) {
    return res.status(400).json({ error: 'Cheating detected: Reel too fast!' });
  }

  const caught = session.fish;
  delete activeSessions[token];

  try {
    const lineStrength = LINES[req.user.current_line].strength;
    const rodMax = RODS[req.user.current_rod].maxW;

    let broke = false;
    let brokeReason = '';

    if (caught.weight > lineStrength * 1.5) {
      broke = true;
      brokeReason = 'Votre fil a cassé sous la tension ! Le poisson était trop lourd.';
    } else if (caught.weight > rodMax * 1.5) {
      broke = true;
      brokeReason = 'Votre canne s\'est brisée en deux !';
    }

    if (broke) {
      if (brokeReason.includes('fil')) {
        const item = await db.get('SELECT quantity FROM inventory WHERE user_id = $1 AND item_type = \'line\' AND item_name = $2', [req.user.id, req.user.current_line]);
        if (item && item.quantity > 1) {
          await db.query('UPDATE inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_type = \'line\' AND item_name = $2', [req.user.id, req.user.current_line]);
        } else {
          await db.query('DELETE FROM inventory WHERE user_id = $1 AND item_type = \'line\' AND item_name = $2', [req.user.id, req.user.current_line]);
        }
        await db.query('UPDATE users SET current_line = \'Siberia Mono SS (3.2kg)\' WHERE id = $1', [req.user.id]);
      } else {
        const item = await db.get('SELECT quantity FROM inventory WHERE user_id = $1 AND item_type = \'rod\' AND item_name = $2', [req.user.id, req.user.current_rod]);
        if (item && item.quantity > 1) {
          await db.query('UPDATE inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_type = \'rod\' AND item_name = $2', [req.user.id, req.user.current_rod]);
        } else {
          await db.query('DELETE FROM inventory WHERE user_id = $1 AND item_type = \'rod\' AND item_name = $2', [req.user.id, req.user.current_rod]);
        }
        await db.query('UPDATE users SET current_rod = \'Siberia Starter Tele\' WHERE id = $1', [req.user.id]);
      }

      return res.json({
        success: false,
        broke: true,
        reason: brokeReason
      });
    }

    await db.query(
      'INSERT INTO catches (user_id, fish_name, weight, silver_value, xp_value) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, caught.name, caught.weight, caught.silver, caught.xp]
    );

    const newXP = req.user.xp + caught.xp;
    const newLevel = calculateLevel(newXP);
    const newSilver = Number((req.user.silver + caught.silver).toFixed(2));

    await db.query(
      'UPDATE users SET silver = $1, xp = $2, level = $3 WHERE id = $4',
      [newSilver, newXP, newLevel, req.user.id]
    );

    res.json({
      success: true,
      broke: false,
      fish: caught,
      levelUp: newLevel > req.user.level ? newLevel : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record catch' });
  }
});

app.post('/api/shop/buy', authenticate, async (req, res) => {
  const { type, name } = req.body;
  let cost = 0;

  if (type === 'rod' && RODS[name]) cost = RODS[name].cost;
  else if (type === 'reel' && REELS[name]) cost = REELS[name].cost;
  else if (type === 'line' && LINES[name]) cost = LINES[name].cost;
  else if (type === 'bait' && BAITS[name]) cost = BAITS[name].cost;
  else return res.status(400).json({ error: 'Invalid item type or name' });

  if (req.user.silver < cost) {
    return res.status(400).json({ error: 'Pas assez de Silver !' });
  }

  try {
    const qty = type === 'bait' ? BAITS[name].count : 1;
    
    await db.query(
      `INSERT INTO inventory (user_id, item_type, item_name, quantity) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(user_id, item_type, item_name) 
       DO UPDATE SET quantity = inventory.quantity + $5`,
      [req.user.id, type, name, qty, qty]
    );

    const newSilver = Number((req.user.silver - cost).toFixed(2));
    await db.query('UPDATE users SET silver = $1 WHERE id = $2', [newSilver, req.user.id]);

    res.json({ success: true, newSilver });
  } catch (err) {
    res.status(500).json({ error: 'Purchase failed' });
  }
});

app.post('/api/travel', authenticate, async (req, res) => {
  const { name } = req.body;
  const wb = WATER_BODIES[name];

  if (!wb) return res.status(400).json({ error: 'Invalid water body' });
  if (req.user.level < wb.levelRequired) {
    return res.status(400).json({ error: `Requires level ${wb.levelRequired}` });
  }
  if (req.user.silver < wb.travelCost) {
    return res.status(400).json({ error: 'Not enough Silver to travel!' });
  }

  try {
    const newSilver = Number((req.user.silver - wb.travelCost).toFixed(2));
    await db.query('UPDATE users SET current_water_body = $1, silver = $2 WHERE id = $3', [name, newSilver, req.user.id]);
    res.json({ success: true, newSilver });
  } catch (err) {
    res.status(500).json({ error: 'Travel failed' });
  }
});

app.post('/api/equip', authenticate, async (req, res) => {
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

app.get('/api/metadata', (req, res) => {
  res.json({
    rods: RODS,
    reels: REELS,
    lines: LINES,
    baits: BAITS,
    waterBodies: WATER_BODIES
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
