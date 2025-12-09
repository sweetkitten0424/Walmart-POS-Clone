const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { db, initDb } = require('./db');
const { generateTC } = require('./tcGenerator');
const { renderTextReceipt } = require('./receiptRenderer');
const { handleLogin, authMiddleware, requireRole } = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;
const PRINT_AGENT_BASE = process.env.PRINT_AGENT_BASE || null;

initDb();

app.use(cors());
app.use(express.json());

function getStoreById(storeId) {
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
}

function sendToPrintAgent(transactionId) {
  if (!PRINT_AGENT_BASE || !transactionId) {
    return;
  }

  // Fire-and-forget: do not await, avoid delaying API responses
  (async () => {
    try {
      await fetch(`${PRINT_AGENT_BASE}/print/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Print agent error:', err);
    }
  })();
}

function getRegisterById(registerId) {
  return db.prepare('SELECT * FROM registers WHERE id = ?').get(registerId);
}

function getProductById(productId) {
  return db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
}

// Public endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', handleLogin);

// All endpoints below this line require authentication
app.use(authMiddleware);

// User management (admin only)
app.get('/api/users', requireRole('admin'), (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.store_id,
        s.code AS store_code,
        s.name AS store_name
      FROM users u
      LEFT JOIN stores s ON s.id = u.store_id
      ORDER BY u.username
    `
    )
    .all();

  res.json(rows);
});

app.post('/api/users', requireRole('admin'), (req, res) => {
  const { username, password, role, storeId } = req.body || {};

  if (!username || !password || !role) {
    return res
      .status(400)
      .json({ error: 'username, password and role are required' });
  }

  const allowedRoles = ['admin', 'manager', 'cashier'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let storeIdValue = null;
  if (storeId !== undefined && storeId !== null && storeId !== '') {
    const numericStoreId = Number(storeId);
    if (!numericStoreId) {
      return res.status(400).json({ error: 'Invalid storeId' });
    }
    const store = getStoreById(numericStoreId);
    if (!store) {
      return res.status(400).json({ error: 'Invalid storeId' });
    }
    storeIdValue = numericStoreId;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, password_hash, role, store_id) VALUES (?, ?, ?, ?)'
      )
      .run(username.trim(), passwordHash, role, storeIdValue);

    const created = db
      .prepare(
        `
        SELECT
          u.id,
          u.username,
          u.role,
          u.store_id,
          s.code AS store_code,
          s.name AS store_name
        FROM users u
        LEFT JOIN stores s ON s.id = u.store_id
        WHERE u.id = ?
      `
      )
      .get(info.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: users.username')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const existing = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id);

  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { username, password, role, storeId } = req.body || {};

  const allowedRoles = ['admin', 'manager', 'cashier'];
  const newRole = role != null ? role : existing.role;
  if (!allowedRoles.includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let storeIdValue =
    existing.store_id !== null && existing.store_id !== undefined
      ? existing.store_id
      : null;
  if (storeId !== undefined) {
    if (storeId === null || storeId === '') {
      storeIdValue = null;
    } else {
      const numericStoreId = Number(storeId);
      if (!numericStoreId) {
        return res.status(400).json({ error: 'Invalid storeId' });
      }
      const store = getStoreById(numericStoreId);
      if (!store) {
        return res.status(400).json({ error: 'Invalid storeId' });
      }
      storeIdValue = numericStoreId;
    }
  }

  const newUsername =
    username != null && username.trim()
      ? username.trim()
      : existing.username;

  let passwordHash = existing.password_hash;
  if (password != null && password !== '') {
    passwordHash = bcrypt.hashSync(password, 10);
  }

  try {
    db.prepare(
      `
      UPDATE users
      SET username = ?, password_hash = ?, role = ?, store_id = ?
      WHERE id = ?
    `
    ).run(newUsername, passwordHash, newRole, storeIdValue, id);

    const updated = db
      .prepare(
        `
        SELECT
          u.id,
          u.username,
          u.role,
          u.store_id,
          s.code AS store_code,
          s.name AS store_name
        FROM users u
        LEFT JOIN stores s ON s.id = u.store_id
        WHERE u.id = ?
      `
      )
      .get(id);

    res.json(updated);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: users.username')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (id === req.user.id) {
    return res
      .status(400)
      .json({ error: 'You cannot delete your own user account' });
  }

  const existing = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id);

  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.status(204).end();
});

// Stores
app.get('/api/stores', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores ORDER BY code').all();
  res.json(stores);
});

// Registers for a store
app.get('/api/registers', (req, res) => {
  const storeId = Number(req.query.storeId);
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }
  const registers = db
    .prepare('SELECT * FROM registers WHERE store_id = ? ORDER BY code')
    .all(storeId);
  res.json(registers);
});

// Products listing/search
app.get('/api/products', (req, res) => {
  const search = (req.query.search || '').trim();
  let products;
  if (search) {
    const like = `%${search}%`;
    products = db
      .prepare(
        'SELECT * FROM products WHERE (name LIKE ? OR sku LIKE ?) AND active = 1 ORDER BY name'
      )
      .all(like, like);
  } else {
    products = db
      .prepare('SELECT * FROM products WHERE active = 1 ORDER BY name')
      .all();
  }
  res.json(products);
});

// Product lookup by barcode
app.get('/api/products/barcode/:barcode', (req, res) => {
  const barcode = req.params.barcode;
  const product = db
    .prepare('SELECT * FROM products WHERE barcode = ? AND active = 1')
    .get(barcode);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

// Create a new product and initial inventory for a store (manager/admin)
app.post('/api/products', requireRole('manager'), (req, res) => {
  const {
    sku,
    barcode,
    name,
    category,
    price,
    tax_rate,
    storeId,
    quantity
  } = req.body || {};

  if (!sku || !name || price == null || tax_rate == null || !storeId) {
    return res.status(400).json({
      error: 'sku, name, price, tax_rate and storeId are required'
    });
  }

  const store = getStoreById(Number(storeId));
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  const insertProduct = db.prepare(
    'INSERT INTO products (sku, barcode, name, category, price, tax_rate, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );

  const insertInventory = db.prepare(
    `
    INSERT INTO inventory (store_id, product_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = excluded.quantity
  `
  );

  try {
    const productInfo = insertProduct.run(
      sku,
      barcode || null,
      name,
      category || null,
      Number(price),
      Number(tax_rate)
    );
    const productId = productInfo.lastInsertRowid;
    const qty = quantity != null ? Number(quantity) : 0;

    insertInventory.run(Number(storeId), productId, qty);

    const product = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(productId);

    res.status(201).json(product);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: products.sku')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    if (String(err.message || '').includes('UNIQUE constraint failed: products.barcode')) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update an existing product (manager/admin)
app.put('/api/products/:id', requireRole('manager'), (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid product id' });
  }

  const existing = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const {
    sku,
    barcode,
    name,
    category,
    price,
    tax_rate,
    active
  } = req.body || {};

  const updated = {
    sku: sku != null ? sku : existing.sku,
    barcode: barcode != null ? barcode : existing.barcode,
    name: name != null ? name : existing.name,
    category: category != null ? category : existing.category,
    price: price != null ? Number(price) : existing.price,
    tax_rate: tax_rate != null ? Number(tax_rate) : existing.tax_rate,
    active: active != null ? (active ? 1 : 0) : existing.active
  };

  try {
    db.prepare(
      `
      UPDATE products
      SET sku = ?, barcode = ?, name = ?, category = ?, price = ?, tax_rate = ?, active = ?
      WHERE id = ?
    `
    ).run(
      updated.sku,
      updated.barcode,
      updated.name,
      updated.category,
      updated.price,
      updated.tax_rate,
      updated.active,
      id
    );

    const product = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id);

    res.json(product);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE constraint failed: products.sku')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    if (String(err.message || '').includes('UNIQUE constraint failed: products.barcode')) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

// Inventory overview for a store
app.get('/api/inventory', (req, res) => {
  const storeId = Number(req.query.storeId);
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const rows = db
    .prepare(
      `
      SELECT
        i.store_id,
        i.product_id,
        i.quantity,
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.price,
        p.tax_rate,
        p.active
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.store_id = ?
      ORDER BY p.name
    `
    )
    .all(storeId);

  res.json(rows);
});

// Set inventory quantity for a product in a store (manager/admin)
app.post('/api/inventory/set', requireRole('manager'), (req, res) => {
  const { storeId, productId, quantity } = req.body || {};
  if (!storeId || !productId || quantity == null) {
    return res.status(400).json({
      error: 'storeId, productId and quantity are required'
    });
  }

  const store = getStoreById(Number(storeId));
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  const product = getProductById(Number(productId));
  if (!product) {
    return res.status(400).json({ error: 'Invalid productId' });
  }

  const setInventory = db.prepare(
    `
    INSERT INTO inventory (store_id, product_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = excluded.quantity
  `
  );

  setInventory.run(Number(storeId), Number(productId), Number(quantity));

  const updated = db
    .prepare(
      `
      SELECT
        i.store_id,
        i.product_id,
        i.quantity,
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.price,
        p.tax_rate,
        p.active
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.store_id = ? AND i.product_id = ?
    `
    )
    .get(Number(storeId), Number(productId));

  res.json(updated);
});

// Get receipt template for a store
app.get('/api/stores/:storeId/receipt-template', (req, res) => {
  const storeId = Number(req.params.storeId);
  const store = getStoreById(storeId);
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }

  const template = db
    .prepare('SELECT * FROM receipt_templates WHERE store_id = ?')
    .get(storeId);

  if (!template) {
    return res.json({
      store_id: storeId,
      header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n',
      footer:
        'Thank you for shopping with us!\nTC#: {{tc_number}}\nDate: {{date}}\nCashier: {{cashier_name}}\nType: {{tx_type}}\n',
      options: JSON.stringify({ show_tax_breakdown: true })
    });
  }

  res.json(template);
});

// Update receipt template for a store (manager/admin)
app.put('/api/stores/:storeId/receipt-template', requireRole('manager'), (req, res) => {
  const storeId = Number(req.params.storeId);
  const store = getStoreById(storeId);
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }

  const { header, footer, options } = req.body || {};
  if (header == null || footer == null) {
    return res.status(400).json({ error: 'header and footer are required' });
  }

  const existing = db
    .prepare('SELECT id FROM receipt_templates WHERE store_id = ?')
    .get(storeId);

  if (existing) {
    db.prepare(
      'UPDATE receipt_templates SET header = ?, footer = ?, options = ? WHERE store_id = ?'
    ).run(header, footer, options ? JSON.stringify(options) : null, storeId);
  } else {
    db.prepare(
      'INSERT INTO receipt_templates (store_id, header, footer, options) VALUES (?, ?, ?, ?)'
    ).run(storeId, header, footer, options ? JSON.stringify(options) : null);
  }

  const updated = db
    .prepare('SELECT * FROM receipt_templates WHERE store_id = ?')
    .get(storeId);

  res.json(updated);
});

// Create a transaction (checkout)
app.post('/api/transactions', (req, res) => {
  const {
    storeId,
    registerId,
    items,
    paymentMethod
  } = req.body || {};

  if (!storeId || !registerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'storeId, registerId and non-empty items are required'
    });
  }

  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' });
  }

  const store = getStoreById(storeId);
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  const register = getRegisterById(registerId);
  if (!register || register.store_id !== storeId) {
    return res.status(400).json({ error: 'Invalid registerId for store' });
  }

  let subtotal = 0;
  let taxTotal = 0;

  const cartItems = [];

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid item in items array' });
    }

    const product = getProductById(productId);
    if (!product) {
      return res.status(400).json({ error: `Invalid productId: ${productId}` });
    }

    const unitPrice = product.price;
    const lineTotal = unitPrice * quantity;
    const taxAmount = (lineTotal * product.tax_rate) / 100;

    subtotal += lineTotal;
    taxTotal += taxAmount;

    cartItems.push({
      product,
      quantity,
      unitPrice,
      lineTotal,
      taxAmount
    });
  }

  const total = subtotal + taxTotal;
  const createdAt = new Date().toISOString();
  const cashierId = req.user ? req.user.id : null;
  const cashierName = req.user ? req.user.username : '';

  const insertTransaction = db.prepare(
    `
    INSERT INTO transactions
      (store_id, register_id, cashier_id, cashier_name, subtotal, tax_total, total, payment_method, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SALE', ?)
  `
  );

  const insertItem = db.prepare(
    `
    INSERT INTO transaction_items
      (transaction_id, product_id, quantity, unit_price, line_total, tax_amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  );

  const updateInventory = db.prepare(
    `
    UPDATE inventory
    SET quantity = quantity - ?
    WHERE store_id = ? AND product_id = ?
  `
  );

  const txWrapper = db.transaction(() => {
    const info = insertTransaction.run(
      storeId,
      registerId,
      cashierId,
      cashierName,
      subtotal,
      taxTotal,
      total,
      paymentMethod,
      createdAt
    );
    const transactionId = info.lastInsertRowid;

    const tc = generateTC({
      storeCode: store.code,
      registerCode: register.code,
      transactionId,
      date: new Date(createdAt)
    });

    db.prepare('UPDATE transactions SET tc_number = ? WHERE id = ?').run(
      tc,
      transactionId
    );

    for (const item of cartItems) {
      insertItem.run(
        transactionId,
        item.product.id,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.taxAmount
      );

      updateInventory.run(item.quantity, storeId, item.product.id);
    }

    const receiptText = renderTextReceipt(transactionId);

    const txRow = db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(transactionId);

    const txItems = db
      .prepare(
        `
        SELECT
          ti.*,
          p.name AS product_name,
          p.barcode,
          p.sku
        FROM transaction_items ti
        JOIN products p ON p.id = ti.product_id
        WHERE ti.transaction_id = ?
      `
      )
      .all(transactionId);

    return {
      transaction: txRow,
      items: txItems,
      receiptText
    };
  });

  try {
    const result = txWrapper();
    // Best-effort auto-print via local/remote print agent
    sendToPrintAgent(result.transaction.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Look up a transaction by TC#
app.get('/api/transactions/by-tc/:tcNumber', (req, res) => {
  const tcNumber = req.params.tcNumber;

  const tx = db
    .prepare(
      `
      SELECT
        t.*,
        s.name AS store_name,
        s.code AS store_code,
        r.code AS register_code,
        r.name AS register_name
      FROM transactions t
      JOIN stores s ON s.id = t.store_id
      JOIN registers r ON r.id = t.register_id
      WHERE t.tc_number = ?
    `
    )
    .get(tcNumber);

  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const items = db
    .prepare(
      `
      SELECT
        ti.*,
        p.name AS product_name,
        p.barcode,
        p.sku
      FROM transaction_items ti
      JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?
    `
    )
    .all(tx.id);

  res.json({
    transaction: tx,
    items
  });
});

// Create a refund transaction referencing an existing sale
app.post('/api/transactions/:id/refund', (req, res) => {
  const originalId = Number(req.params.id);
  if (!originalId) {
    return res.status(400).json({ error: 'Invalid transaction id' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: 'items is required and must be non-empty' });
  }

  const original = db
    .prepare(
      `
      SELECT
        t.*,
        s.code AS store_code,
        r.code AS register_code
      FROM transactions t
      JOIN stores s ON s.id = t.store_id
      JOIN registers r ON r.id = t.register_id
      WHERE t.id = ?
    `
    )
    .get(originalId);

  if (!original) {
    return res.status(404).json({ error: 'Original transaction not found' });
  }

  if (original.type && original.type !== 'SALE') {
    return res
      .status(400)
      .json({ error: 'Only SALE transactions can be refunded' });
  }

  const originalItems = db
    .prepare(
      `
      SELECT
        ti.*,
        p.name AS product_name,
        p.tax_rate
      FROM transaction_items ti
      JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?
    `
    )
    .all(originalId);

  if (originalItems.length === 0) {
    return res
      .status(400)
      .json({ error: 'Original transaction has no items' });
  }

  const originalById = new Map();
  originalItems.forEach((row) => {
    originalById.set(row.id, row);
  });

  const refundLines = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const tiId = Number(item.transactionItemId);
    const qty = Number(item.quantity);
    if (!tiId || !qty || qty <= 0) {
      return res
        .status(400)
        .json({ error: 'Invalid item entry in items array' });
    }

    const originalItem = originalById.get(tiId);
    if (!originalItem) {
      return res
        .status(400)
        .json({ error: `Invalid transactionItemId: ${tiId}` });
    }

    if (qty > originalItem.quantity) {
      return res.status(400).json({
        error: `Refund quantity for item ${tiId} exceeds original quantity`
      });
    }

    const unitPrice = originalItem.unit_price;
    const perUnitTax =
      originalItem.quantity !== 0
        ? originalItem.tax_amount / originalItem.quantity
        : (unitPrice * originalItem.tax_rate) / 100;

    const lineSubtotal = unitPrice * qty;
    const lineTax = perUnitTax * qty;

    subtotal += lineSubtotal;
    taxTotal += lineTax;

    refundLines.push({
      originalItem,
      quantity: qty,
      unitPrice,
      lineSubtotal,
      lineTax
    });
  }

  if (refundLines.length === 0) {
    return res.status(400).json({ error: 'No valid items to refund' });
  }

  const total = -(subtotal + taxTotal); // refund is negative total
  const createdAt = new Date().toISOString();
  const cashierId = req.user ? req.user.id : null;
  const cashierName = req.user ? req.user.username : '';

  const insertTransaction = db.prepare(
    `
    INSERT INTO transactions
      (store_id, register_id, cashier_id, cashier_name, subtotal, tax_total, total, payment_method, type, reference_transaction_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REFUND', ?, ?)
  `
  );

  const insertItem = db.prepare(
    `
    INSERT INTO transaction_items
      (transaction_id, product_id, quantity, unit_price, line_total, tax_amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  );

  const updateInventory = db.prepare(
    `
    UPDATE inventory
    SET quantity = quantity + ?
    WHERE store_id = ? AND product_id = ?
  `
  );

  const txWrapper = db.transaction(() => {
    const info = insertTransaction.run(
      original.store_id,
      original.register_id,
      cashierId,
      cashierName,
      -subtotal,
      -taxTotal,
      total,
      original.payment_method,
      originalId,
      createdAt
    );
    const refundId = info.lastInsertRowid;

    const tc = generateTC({
      storeCode: original.store_code,
      registerCode: original.register_code,
      transactionId: refundId,
      date: new Date(createdAt)
    });

    db.prepare('UPDATE transactions SET tc_number = ? WHERE id = ?').run(
      tc,
      refundId
    );

    for (const line of refundLines) {
      const negativeQty = -line.quantity;
      const negativeLineTotal = -line.lineSubtotal;
      const negativeTax = -line.lineTax;

      insertItem.run(
        refundId,
        line.originalItem.product_id,
        negativeQty,
        line.unitPrice,
        negativeLineTotal,
        negativeTax
      );

      updateInventory.run(
        line.quantity,
        original.store_id,
        line.originalItem.product_id
      );
    }

    const receiptText = renderTextReceipt(refundId);

    const txRow = db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(refundId);

    const txItems = db
      .prepare(
        `
        SELECT
          ti.*,
          p.name AS product_name,
          p.barcode,
          p.sku
        FROM transaction_items ti
        JOIN products p ON p.id = ti.product_id
        WHERE ti.transaction_id = ?
      `
      )
      .all(refundId);

    return {
      transaction: txRow,
      items: txItems,
      receiptText
    };
  });

  try {
    const result = txWrapper();
    // Best-effort auto-print via local/remote print agent
    sendToPrintAgent(result.transaction.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create refund transaction' });
  }
});

// Reports - sales summary (manager/admin)
app.get('/api/reports/sales-summary', requireRole('manager'), (req, res) => {
  let { from, to, storeId } = req.query;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (!to) {
    to = todayStr;
  }
  if (!from) {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    from = d.toISOString().slice(0, 10);
  }

  const params = [from, to];
  let storeClause = '';

  if (storeId) {
    const numericStoreId = Number(storeId);
    if (!numericStoreId) {
      return res.status(400).json({ error: 'Invalid storeId' });
    }
    storeClause = ' AND t.store_id = ?';
    params.push(numericStoreId);
  } else if (req.user.role !== 'admin' && req.user.storeId) {
    storeClause = ' AND t.store_id = ?';
    params.push(Number(req.user.storeId));
  }

  const summaryRow = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN t.type = 'SALE' THEN t.total ELSE 0 END) AS sales_total,
        SUM(CASE WHEN t.type = 'REFUND' THEN t.total ELSE 0 END) AS refunds_total,
        SUM(t.total) AS net_total,
        COUNT(*) AS tx_count
      FROM transactions t
      WHERE date(t.created_at) BETWEEN ? AND ?${storeClause}
    `
    )
    .get(...params) || {};

  const byDay = db
    .prepare(
      `
      SELECT
        date(t.created_at) AS day,
        SUM(CASE WHEN t.type = 'SALE' THEN t.total ELSE 0 END) AS sales_total,
        SUM(CASE WHEN t.type = 'REFUND' THEN t.total ELSE 0 END) AS refunds_total,
        SUM(t.total) AS net_total,
        COUNT(*) AS tx_count
      FROM transactions t
      WHERE date(t.created_at) BETWEEN ? AND ?${storeClause}
      GROUP BY day
      ORDER BY day
    `
    )
    .all(...params);

  const byCashier = db
    .prepare(
      `
      SELECT
        COALESCE(u.username, t.cashier_name, 'Unknown') AS cashier_name,
        SUM(CASE WHEN t.type = 'SALE' THEN t.total ELSE 0 END) AS sales_total,
        SUM(CASE WHEN t.type = 'REFUND' THEN t.total ELSE 0 END) AS refunds_total,
        SUM(t.total) AS net_total,
        COUNT(*) AS tx_count
      FROM transactions t
      LEFT JOIN users u ON u.id = t.cashier_id
      WHERE date(t.created_at) BETWEEN ? AND ?${storeClause}
      GROUP BY cashier_name
      ORDER BY cashier_name
    `
    )
    .all(...params);

  const byProduct = db
    .prepare(
      `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.barcode,
        SUM(ti.quantity) AS net_qty,
        SUM(ti.line_total) AS net_sales,
        SUM(ti.tax_amount) AS net_tax
      FROM transactions t
      JOIN transaction_items ti ON ti.transaction_id = t.id
      JOIN products p ON p.id = ti.product_id
      WHERE date(t.created_at) BETWEEN ? AND ?${storeClause}
      GROUP BY p.id, p.name, p.sku, p.barcode
      ORDER BY net_sales DESC
    `
    )
    .all(...params);

  const byCategory = db
    .prepare(
      `
      SELECT
        COALESCE(p.category, 'Uncategorized') AS category,
        SUM(ti.quantity) AS net_qty,
        SUM(ti.line_total) AS net_sales,
        SUM(ti.tax_amount) AS net_tax
      FROM transactions t
      JOIN transaction_items ti ON ti.transaction_id = t.id
      JOIN products p ON p.id = ti.product_id
      WHERE date(t.created_at) BETWEEN ? AND ?${storeClause}
      GROUP BY category
      ORDER BY net_sales DESC
    `
    )
    .all(...params);

  const summary = {
    sales_total: summaryRow.sales_total || 0,
    refunds_total: summaryRow.refunds_total || 0,
    net_total: summaryRow.net_total || 0,
    tx_count: summaryRow.tx_count || 0
  };

  res.json({
    range: { from, to, storeId: storeId || null },
    summary,
    byDay,
    byCashier,
    byProduct,
    byCategory
  });
});

// Get receipt text for a transaction
app.get('/api/transactions/:id/receipt', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const txRow = db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(id);

  if (!txRow) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  try {
    const receiptText = renderTextReceipt(id);
    res.json({
      transaction: txRow,
      receiptText
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to render receipt' });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`POS API listening on http://localhost:${PORT}`);
});