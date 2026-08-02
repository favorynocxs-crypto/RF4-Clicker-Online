const express = require('express');
const cors = require('cors');
const path = require('path');
require('./database'); // Initializes schema automatically if url is present

const authRoutes = require('./routes/auth');
const fishingRoutes = require('./routes/fishing');
const shopRoutes = require('./routes/shop');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', authRoutes);
app.use('/api/fish', fishingRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api', userRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
