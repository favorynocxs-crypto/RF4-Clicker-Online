const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const router = express.Router();

router.post('/register', async (req, res) => {
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

    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'rod', 'Comfort FD360', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'reel', 'Express Fishing Spark 1 2000S', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'line', 'Siberia Mono SS (3.2kg)', 1]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_name, quantity) VALUES ($1, $2, $3, $4)', [userId, 'bait', 'Pain', 1]);
    await db.query('COMMIT');

    res.json({ success: true });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch(e) {}
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
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

module.exports = router;
