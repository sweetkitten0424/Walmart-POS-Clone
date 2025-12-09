const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-me';
const TOKEN_EXPIRY = '12h';

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.store_id || null
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function handleLogin(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const matches = bcrypt.compareSync(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.store_id
    }
  });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const prefix = 'Bearer ';

  if (!header.startsWith(prefix)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(prefix.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'admin' || req.user.role === role) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = {
  handleLogin,
  authMiddleware,
  requireRole
};