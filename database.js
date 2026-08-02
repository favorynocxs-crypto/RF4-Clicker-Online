const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL variable is not set. Database operations will fail.");
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
    ? { rejectUnauthorized: false }
    : false
});

// Initialize DB schema in PostgreSQL
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Users Table
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      silver REAL DEFAULT 50.0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_water_body TEXT DEFAULT 'Lac aux moustique',
      current_rod TEXT DEFAULT 'Comfort FD360',
      current_reel TEXT DEFAULT 'Express Fishing Spark 1 2000S',
      current_line TEXT DEFAULT 'Siberia Mono SS (3.2kg)',
      current_bait TEXT DEFAULT 'Pain',
      current_style TEXT DEFAULT 'fond',
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      current_rod_durability REAL DEFAULT 100.0,
      current_reel_durability REAL DEFAULT 100.0,
      total_time_played INTEGER DEFAULT 0,
      total_clicks INTEGER DEFAULT 0,
      total_silver_spent REAL DEFAULT 0.0,
      total_capital REAL DEFAULT 50.0,
      total_catches INTEGER DEFAULT 0,
      ban_until TIMESTAMP DEFAULT NULL,
      has_voyageur BOOLEAN DEFAULT FALSE,
      has_chanceux BOOLEAN DEFAULT FALSE,
      has_ameliorateur BOOLEAN DEFAULT FALSE,
      has_offline BOOLEAN DEFAULT FALSE
    )`);

    // Ensure columns exist for legacy databases
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_style TEXT DEFAULT 'fond'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_rod_durability REAL DEFAULT 100.0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_reel_durability REAL DEFAULT 100.0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_time_played INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_silver_spent REAL DEFAULT 0.0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_capital REAL DEFAULT 50.0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_catches INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_voyageur BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_chanceux BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_ameliorateur BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_offline BOOLEAN DEFAULT FALSE`);

    // Migration of legacy items to the new specified ones
    try {
      await client.query(`UPDATE users SET current_rod = 'Comfort FD360' WHERE current_rod = 'Starter Rod' OR current_rod = 'Siberia Starter Tele'`);
      await client.query(`UPDATE users SET current_reel = 'Express Fishing Spark 1 2000S' WHERE current_reel = 'Starter Reel' OR current_reel = 'Express Fishing Lacerti 4000S'`);
      await client.query(`UPDATE users SET current_line = 'Siberia Mono SS (3.2kg)' WHERE current_line = 'Starter Line'`);
      await client.query(`UPDATE inventory SET item_name = 'Comfort FD360' WHERE item_type = 'rod' AND (item_name = 'Starter Rod' OR item_name = 'Siberia Starter Tele')`);
      await client.query(`UPDATE inventory SET item_name = 'Express Fishing Spark 1 2000S' WHERE item_type = 'reel' AND (item_name = 'Starter Reel' OR item_name = 'Express Fishing Lacerti 4000S')`);
      await client.query(`UPDATE inventory SET item_name = 'Siberia Mono SS (3.2kg)' WHERE item_type = 'line' AND item_name = 'Starter Line'`);
    } catch(e) {
      console.log("Migration warning:", e.message);
    }

    // Inventory Table
    await client.query(`CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      UNIQUE(user_id, item_type, item_name)
    )`);

    // Catches Table (Bourriche / Keepnet)
    await client.query(`CREATE TABLE IF NOT EXISTS catches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fish_name TEXT NOT NULL,
      weight REAL NOT NULL,
      silver_value REAL NOT NULL,
      xp_value INTEGER NOT NULL,
      sold BOOLEAN DEFAULT FALSE,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Ensure sold column exists for legacy databases
    await client.query(`ALTER TABLE catches ADD COLUMN IF NOT EXISTS sold BOOLEAN DEFAULT FALSE`);

    // Quests completion table
    await client.query(`CREATE TABLE IF NOT EXISTS user_quests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      quest_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed BOOLEAN DEFAULT FALSE,
      last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, quest_id)
    )`);
    await client.query(`ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating database schema:", err);
  } finally {
    client.release();
  }
}

// Automatically try initializing the database schema on start
if (connectionString) {
  initSchema()
    .then(() => console.log("PostgreSQL schema validated successfully."))
    .catch(err => console.error("Database connection failed:", err));
}

// Promise-based query helpers to match simple sql usage
async function query(text, params) {
  return pool.query(text, params);
}

async function get(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0];
}

async function all(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

module.exports = {
  pool,
  query,
  get,
  all,
  initSchema
};
