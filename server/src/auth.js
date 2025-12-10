const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-me';
const TOKEN_EXPIRY = '12h';

function createToken(user) {
  return jwt.sign(
    {
      id: String(user._id),
      username: user.username,
      role: user.role,
      storeId: user.store ? String(user.store) : null
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

async function handleLogin(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = await User.findOne({ username }).lean();

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
      id: String(user._id),
      username: user.username,
      role: user.role,
      storeId: user.store ? String(user.store) : null
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