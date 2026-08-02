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
      current_water_body TEXT DEFAULT 'Mosquito Lake',
      current_rod TEXT DEFAULT 'Starter Tele',
      current_reel TEXT DEFAULT 'Lacerti 4000S',
      current_line TEXT DEFAULT 'Syberia Mono (3.2kg)',
      current_bait TEXT DEFAULT 'Bread',
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Inventory Table
    await client.query(`CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      UNIQUE(user_id, item_type, item_name)
    )`);

    // Catches Table
    await client.query(`CREATE TABLE IF NOT EXISTS catches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fish_name TEXT NOT NULL,
      weight REAL NOT NULL,
      silver_value REAL NOT NULL,
      xp_value INTEGER NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

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
