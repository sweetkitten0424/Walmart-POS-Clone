const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

// Load environment variables from .env in local development.
// In Vercel or other hosts, set these in the platform UI.
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line global-require
  require('dotenv').config();
}

const {
  initDb,
  Store,
  Register,
  Product,
  Inventory,
  ReceiptTemplate,
  User,
  Transaction,
  TransactionItem
} = require('./db');
const { generateTC } = require('./tcGenerator');
const { renderTextReceipt } = require('./receiptRenderer');
const { handleLogin, authMiddleware, requireRole } = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;
const PRINT_AGENT_BASE = process.env.PRINT_AGENT_BASE || null;

app.use(cors());
app.use(express.json());

function sendToPrintAgent(transactionId) {
  if (!PRINT_AGENT_BASE || !transactionId) {
    return;
  }

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

// Public endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', handleLogin);

// All endpoints below this line require authentication
app.use(authMiddleware);

// User management (admin only)
app.get('/api/users', requireRole('admin'), async (req, res) => {
  const users = await User.find({})
    .populate('store')
    .sort({ username: 1 })
    .lean();

  const result = users.map((u) => ({
    id: String(u._id),
    username: u.username,
    role: u.role,
    store_id: u.store ? String(u.store._id) : null,
    store_code: u.store ? u.store.code : null,
    store_name: u.store ? u.store.name : null
  }));

  res.json(result);
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
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

  let store = null;
  if (storeId) {
    store = await Store.findById(storeId).lean();
    if (!store) {
      return res.status(400).json({ error: 'Invalid storeId' });
    }
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const created = await User.create({
      username: username.trim(),
      password_hash: passwordHash,
      role,
      store: store ? store._id : null
    });

    return res.status(201).json({
      id: String(created._id),
      username: created.username,
      role: created.role,
      store_id: created.store ? String(created.store) : null,
      store_code: store ? store.code : null,
      store_name: store ? store.name : null
    });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key error')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  const id = req.params.id;

  const existing = await User.findById(id);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { username, password, role, storeId } = req.body || {};
  const allowedRoles = ['admin', 'manager', 'cashier'];
  const newRole = role != null ? role : existing.role;
  if (!allowedRoles.includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let store = existing.store;
  if (storeId !== undefined) {
    if (!storeId) {
      store = null;
    } else {
      const storeDoc = await Store.findById(storeId).lean();
      if (!storeDoc) {
        return res.status(400).json({ error: 'Invalid storeId' });
      }
      store = storeDoc._id;
    }
  }

  const newUsername =
    username != null && username.trim() ? username.trim() : existing.username;

  let passwordHash = existing.password_hash;
  if (password != null && password !== '') {
    passwordHash = bcrypt.hashSync(password, 10);
  }

  try {
    existing.username = newUsername;
    existing.password_hash = passwordHash;
    existing.role = newRole;
    existing.store = store;
    await existing.save();

    const populated = await User.findById(existing._id)
      .populate('store')
      .lean();

    return res.json({
      id: String(populated._id),
      username: populated.username,
      role: populated.role,
      store_id: populated.store ? String(populated.store._id) : null,
      store_code: populated.store ? populated.store.code : null,
      store_name: populated.store ? populated.store.name : null
    });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key error')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  const id = req.params.id;

  if (id === req.user.id) {
    return res
      .status(400)
      .json({ error: 'You cannot delete your own user account' });
  }

  const existing = await User.findById(id);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  await User.deleteOne({ _id: existing._id }).exec();
  return res.status(204).end();
});

// Stores
app.get('/api/stores', async (req, res) => {
  const stores = await Store.find().sort({ code: 1 }).lean();
  const result = stores.map((s) => ({
    id: String(s._id),
    code: s.code,
    name: s.name,
    address: s.address,
    phone: s.phone
  }));
  res.json(result);
});

// Registers for a store
app.get('/api/registers', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const registers = await Register.find({ store: storeId })
    .sort({ code: 1 })
    .lean();
  const result = registers.map((r) => ({
    id: String(r._id),
    store_id: String(r.store),
    code: r.code,
    name: r.name
  }));
  res.json(result);
});

// Products listing/search
app.get('/api/products', async (req, res) => {
  const search = (req.query.search || '').trim();
  const filter = { active: true };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } }
    ];
  }
  const products = await Product.find(filter).sort({ name: 1 }).lean();
  const result = products.map((p) => ({
    id: String(p._id),
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    price: p.price,
    tax_rate: p.tax_rate,
    active: p.active
  }));
  res.json(result);
});

// Product lookup by barcode
app.get('/api/products/barcode/:barcode', async (req, res) => {
  const barcode = req.params.barcode;
  const product = await Product.findOne({ barcode, active: true }).lean();

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  return res.json({
    id: String(product._id),
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    price: product.price,
    tax_rate: product.tax_rate,
    active: product.active
  });
});

// Create a new product and initial inventory for a store (manager/admin)
app.post('/api/products', requireRole('manager'), async (req, res) => {
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

  const store = await Store.findById(storeId).lean();
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  try {
    const product = await Product.create({
      sku,
      barcode: barcode || null,
      name,
      category: category || null,
      price: Number(price),
      tax_rate: Number(tax_rate),
      active: true
    });

    const qty = quantity != null ? Number(quantity) : 0;
    await Inventory.findOneAndUpdate(
      { store: store._id, product: product._id },
      { $set: { quantity: qty } },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      id: String(product._id),
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      price: product.price,
      tax_rate: product.tax_rate,
      active: product.active
    });
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('duplicate key error') && msg.includes('sku')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    if (msg.includes('duplicate key error') && msg.includes('barcode')) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update an existing product (manager/admin)
app.put('/api/products/:id', requireRole('manager'), async (req, res) => {
  const id = req.params.id;

  const existing = await Product.findById(id);
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

  if (sku != null) existing.sku = sku;
  if (barcode !== undefined) existing.barcode = barcode || null;
  if (name != null) existing.name = name;
  if (category !== undefined) existing.category = category || null;
  if (price != null) existing.price = Number(price);
  if (tax_rate != null) existing.tax_rate = Number(tax_rate);
  if (active != null) existing.active = !!active;

  try {
    await existing.save();
    const p = existing.toObject();
    return res.json({
      id: String(p._id),
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      price: p.price,
      tax_rate: p.tax_rate,
      active: p.active
    });
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('duplicate key error') && msg.includes('sku')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    if (msg.includes('duplicate key error') && msg.includes('barcode')) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

// Inventory overview for a store
app.get('/api/inventory', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const rows = await Inventory.find({ store: storeId })
    .populate('product')
    .lean();

  const result = rows.map((row) => ({
    store_id: String(row.store),
    product_id: String(row.product._id),
    quantity: row.quantity,
    sku: row.product.sku,
    barcode: row.product.barcode,
    name: row.product.name,
    category: row.product.category,
    price: row.product.price,
    tax_rate: row.product.tax_rate,
    active: row.product.active
  }));

  res.json(result);
});

// Set inventory quantity for a product in a store (manager/admin)
app.post('/api/inventory/set', requireRole('manager'), async (req, res) => {
  const { storeId, productId, quantity } = req.body || {};
  if (!storeId || !productId || quantity == null) {
    return res.status(400).json({
      error: 'storeId, productId and quantity are required'
    });
  }

  const store = await Store.findById(storeId).lean();
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    return res.status(400).json({ error: 'Invalid productId' });
  }

  const inv = await Inventory.findOneAndUpdate(
    { store: storeId, product: productId },
    { $set: { quantity: Number(quantity) } },
    { upsert: true, new: true }
  )
    .populate('product')
    .lean();

  return res.json({
    store_id: String(inv.store),
    product_id: String(inv.product._id),
    quantity: inv.quantity,
    sku: inv.product.sku,
    barcode: inv.product.barcode,
    name: inv.product.name,
    category: inv.product.category,
    price: inv.product.price,
    tax_rate: inv.product.tax_rate,
    active: inv.product.active
  });
});

// Get receipt template for a store
app.get('/api/stores/:storeId/receipt-template', async (req, res) => {
  const storeId = req.params.storeId;
  const store = await Store.findById(storeId).lean();
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }

  const template = await ReceiptTemplate.findOne({ store: storeId }).lean();

  if (!template) {
    return res.json({
      store_id: storeId,
      header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n',
      footer:
        'Thank you for shopping with us!\nTC#: {{tc_number}}\nDate: {{date}}\nCashier: {{cashier_name}}\nType: {{tx_type}}\n',
      options: { show_tax_breakdown: true }
    });
  }

  return res.json({
    id: String(template._id),
    store_id: String(template.store),
    header: template.header || '',
    footer: template.footer || '',
    options: template.options || {}
  });
});

// Update receipt template for a store (manager/admin)
app.put(
  '/api/stores/:storeId/receipt-template',
  requireRole('manager'),
  async (req, res) => {
    const storeId = req.params.storeId;
    const store = await Store.findById(storeId).lean();
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const { header, footer, options } = req.body || {};
    if (header == null || footer == null) {
      return res.status(400).json({ error: 'header and footer are required' });
    }

    await ReceiptTemplate.findOneAndUpdate(
      { store: storeId },
      {
        $set: {
          header,
          footer,
          options: options || {}
        }
      },
      { upsert: true }
    );

    const updated = await ReceiptTemplate.findOne({ store: storeId }).lean();
    return res.json({
      id: String(updated._id),
      store_id: String(updated.store),
      header: updated.header || '',
      footer: updated.footer || '',
      options: updated.options || {}
    });
  }
);

// Create a transaction (checkout)
app.post('/api/transactions', async (req, res) => {
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

  const store = await Store.findById(storeId).lean();
  if (!store) {
    return res.status(400).json({ error: 'Invalid storeId' });
  }

  const register = await Register.findOne({ _id: registerId, store: storeId }).lean();
  if (!register) {
    return res.status(400).json({ error: 'Invalid registerId for store' });
  }

  let subtotal = 0;
  let taxTotal = 0;

  const cartItems = [];

  for (const item of items) {
    const productId = item.productId;
    const quantity = Number(item.quantity);
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid item in items array' });
    }

    const product = await Product.findById(productId).lean();
    if (!product || !product.active) {
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
  const createdAt = new Date();
  const cashierId = req.user ? req.user.id : null;
  const cashierName = req.user ? req.user.username : '';

  const session = await Transaction.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const tx = await Transaction.create(
        [
          {
            store: storeId,
            register: registerId,
            cashier: cashierId || null,
            cashier_name: cashierName,
            subtotal,
            tax_total: taxTotal,
            total,
            payment_method: paymentMethod,
            type: 'SALE',
            created_at: createdAt
          }
        ],
        { session }
      );
      const transaction = tx[0];

      const tc = generateTC({
        storeCode: store.code,
        registerCode: register.code,
        transactionId: transaction._id.toString(),
        date: createdAt
      });

      transaction.tc_number = tc;
      await transaction.save({ session });

      const itemDocs = cartItems.map((item) => ({
        transaction: transaction._id,
        product: item.product._id,
        product_name: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        category: item.product.category,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        tax_amount: item.taxAmount
      }));

      await TransactionItem.insertMany(itemDocs, { session });

      for (const item of cartItems) {
        await Inventory.findOneAndUpdate(
          { store: storeId, product: item.product._id },
          { $inc: { quantity: -item.quantity } },
          { upsert: true, session }
        );
      }

      const receiptText = await renderTextReceipt(transaction._id);

      const txObj = transaction.toObject();
      const itemsOut = itemDocs.map((it, idx) => ({
        id: String(idx),
        transaction_id: String(transaction._id),
        product_id: String(it.product),
        product_name: it.product_name,
        barcode: it.barcode,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
        tax_amount: it.tax_amount
      }));

      result = {
        transaction: {
          id: String(txObj._id),
          store_id: String(txObj.store),
          register_id: String(txObj.register),
          cashier_id: txObj.cashier ? String(txObj.cashier) : null,
          cashier_name: txObj.cashier_name,
          subtotal: txObj.subtotal,
          tax_total: txObj.tax_total,
          total: txObj.total,
          payment_method: txObj.payment_method,
          tc_number: txObj.tc_number,
          type: txObj.type,
          created_at: txObj.created_at
        },
        items: itemsOut,
        receiptText
      };
    });
  } catch (err) {
    await session.endSession();
    return res.status(500).json({ error: 'Failed to create transaction' });
  }

  await session.endSession();
  sendToPrintAgent(result.transaction.id);
  return res.json(result);
});

// Look up a transaction by TC#
app.get('/api/transactions/by-tc/:tcNumber', async (req, res) => {
  const tcNumber = req.params.tcNumber;

  const tx = await Transaction.findOne({ tc_number: tcNumber })
    .populate('store')
    .populate('register')
    .lean();

  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const items = await TransactionItem.find({ transaction: tx._id }).lean();

  const itemsOut = items.map((it) => ({
    id: String(it._id),
    transaction_id: String(it.transaction),
    product_id: String(it.product),
    product_name: it.product_name,
    barcode: it.barcode,
    sku: it.sku,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    tax_amount: it.tax_amount
  }));

  return res.json({
    transaction: {
      id: String(tx._id),
      store_id: String(tx.store._id),
      store_name: tx.store.name,
      store_code: tx.store.code,
      register_id: String(tx.register._id),
      register_name: tx.register.name,
      register_code: tx.register.code,
      cashier_id: tx.cashier ? String(tx.cashier) : null,
      cashier_name: tx.cashier_name,
      subtotal: tx.subtotal,
      tax_total: tx.tax_total,
      total: tx.total,
      payment_method: tx.payment_method,
      tc_number: tx.tc_number,
      type: tx.type,
      created_at: tx.created_at
    },
    items: itemsOut
  });
});

// Create a refund transaction referencing an existing sale
app.post('/api/transactions/:id/refund', async (req, res) => {
  const originalId = req.params.id;

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: 'items is required and must be non-empty' });
  }

  const original = await Transaction.findById(originalId)
    .populate('store')
    .populate('register')
    .lean();

  if (!original) {
    return res.status(404).json({ error: 'Original transaction not found' });
  }

  if (original.type && original.type !== 'SALE') {
    return res
      .status(400)
      .json({ error: 'Only SALE transactions can be refunded' });
  }

  const originalItems = await TransactionItem.find({
    transaction: original._id
  }).lean();

  if (originalItems.length === 0) {
    return res
      .status(400)
      .json({ error: 'Original transaction has no items' });
  }

  const originalById = new Map();
  originalItems.forEach((row) => {
    originalById.set(String(row._id), row);
  });

  const refundLines = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const tiId = String(item.transactionItemId);
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

    if (qty > Math.abs(originalItem.quantity)) {
      return res.status(400).json({
        error: `Refund quantity for item ${tiId} exceeds original quantity`
      });
    }

    const unitPrice = originalItem.unit_price;
    const perUnitTax =
      originalItem.quantity !== 0
        ? originalItem.tax_amount / Math.abs(originalItem.quantity)
        : 0;

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
  const createdAt = new Date();
  const cashierId = req.user ? req.user.id : null;
  const cashierName = req.user ? req.user.username : '';

  const session = await Transaction.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const txArr = await Transaction.create(
        [
          {
            store: original.store._id,
            register: original.register._id,
            cashier: cashierId || null,
            cashier_name: cashierName,
            subtotal: -subtotal,
            tax_total: -taxTotal,
            total,
            payment_method: original.payment_method,
            type: 'REFUND',
            reference_transaction: original._id,
            created_at: createdAt
          }
        ],
        { session }
      );

      const refundTx = txArr[0];

      const tc = generateTC({
        storeCode: original.store.code,
        registerCode: original.register.code,
        transactionId: refundTx._id.toString(),
        date: createdAt
      });

      refundTx.tc_number = tc;
      await refundTx.save({ session });

      const refundItemDocs = [];

      for (const line of refundLines) {
        const negativeQty = -line.quantity;
        const negativeLineTotal = -line.lineSubtotal;
        const negativeTax = -line.lineTax;

        refundItemDocs.push({
          transaction: refundTx._id,
          product: line.originalItem.product,
          product_name: line.originalItem.product_name,
          sku: line.originalItem.sku,
          barcode: line.originalItem.barcode,
          category: line.originalItem.category,
          quantity: negativeQty,
          unit_price: line.unitPrice,
          line_total: negativeLineTotal,
          tax_amount: negativeTax
        });

        await Inventory.findOneAndUpdate(
          { store: original.store._id, product: line.originalItem.product },
          { $inc: { quantity: line.quantity } },
          { upsert: true, session }
        );
      }

      await TransactionItem.insertMany(refundItemDocs, { session });

      const receiptText = await renderTextReceipt(refundTx._id);

      const refundObj = refundTx.toObject();
      const itemsOut = refundItemDocs.map((it, idx) => ({
        id: String(idx),
        transaction_id: String(refundObj._id),
        product_id: String(it.product),
        product_name: it.product_name,
        barcode: it.barcode,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
        tax_amount: it.tax_amount
      }));

      result = {
        transaction: {
          id: String(refundObj._id),
          store_id: String(refundObj.store),
          register_id: String(refundObj.register),
          cashier_id: refundObj.cashier ? String(refundObj.cashier) : null,
          cashier_name: refundObj.cashier_name,
          subtotal: refundObj.subtotal,
          tax_total: refundObj.tax_total,
          total: refundObj.total,
          payment_method: refundObj.payment_method,
          tc_number: refundObj.tc_number,
          type: refundObj.type,
          created_at: refundObj.created_at
        },
        items: itemsOut,
        receiptText
      };
    });
  } catch (err) {
    await session.endSession();
    return res.status(500).json({ error: 'Failed to create refund transaction' });
  }

  await session.endSession();
  sendToPrintAgent(result.transaction.id);
  return res.json(result);
});

// Reports - sales summary (manager/admin)
app.get('/api/reports/sales-summary', requireRole('manager'), async (req, res) => {
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

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const match = {
    created_at: { $gte: fromDate, $lte: toDate }
  };

  if (storeId) {
    match.store = storeId;
  } else if (req.user.role !== 'admin' && req.user.storeId) {
    match.store = req.user.storeId;
  }

  const summaryAgg = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        sales_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'SALE'] }, '$total', 0]
          }
        },
        refunds_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'REFUND'] }, '$total', 0]
          }
        },
        net_total: { $sum: '$total' },
        tx_count: { $sum: 1 }
      }
    }
  ]).exec();

  const summaryRow = summaryAgg[0] || {};

  const byDay = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$created_at' }
        },
        sales_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'SALE'] }, '$total', 0]
          }
        },
        refunds_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'REFUND'] }, '$total', 0]
          }
        },
        net_total: { $sum: '$total' },
        tx_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]).exec();

  const byCashier = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $ifNull: ['$cashier_name', 'Unknown']
        },
        sales_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'SALE'] }, '$total', 0]
          }
        },
        refunds_total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'REFUND'] }, '$total', 0]
          }
        },
        net_total: { $sum: '$total' },
        tx_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]).exec();

  const txMatch = match;

  const byProduct = await TransactionItem.aggregate([
    {
      $lookup: {
        from: 'transactions',
        localField: 'transaction',
        foreignField: '_id',
        as: 'tx'
      }
    },
    { $unwind: '$tx' },
    { $match: { 'tx.created_at': txMatch.created_at, ...(txMatch.store && { 'tx.store': txMatch.store }) } },
    {
      $group: {
        _id: '$product',
        product_name: { $first: '$product_name' },
        sku: { $first: '$sku' },
        barcode: { $first: '$barcode' },
        net_qty: { $sum: '$quantity' },
        net_sales: { $sum: '$line_total' },
        net_tax: { $sum: '$tax_amount' }
      }
    },
    { $sort: { net_sales: -1 } }
  ]).exec();

  const byCategory = await TransactionItem.aggregate([
    {
      $lookup: {
        from: 'transactions',
        localField: 'transaction',
        foreignField: '_id',
        as: 'tx'
      }
    },
    { $unwind: '$tx' },
    { $match: { 'tx.created_at': txMatch.created_at, ...(txMatch.store && { 'tx.store': txMatch.store }) } },
    {
      $group: {
        _id: {
          $ifNull: ['$category', 'Uncategorized']
        },
        net_qty: { $sum: '$quantity' },
        net_sales: { $sum: '$line_total' },
        net_tax: { $sum: '$tax_amount' }
      }
    },
    { $sort: { net_sales: -1 } }
  ]).exec();

  const summary = {
    sales_total: summaryRow.sales_total || 0,
    refunds_total: summaryRow.refunds_total || 0,
    net_total: summaryRow.net_total || 0,
    tx_count: summaryRow.tx_count || 0
  };

  res.json({
    range: { from, to, storeId: storeId || null },
    summary,
    byDay: byDay.map((row) => ({
      day: row._id,
      sales_total: row.sales_total,
      refunds_total: row.refunds_total,
      net_total: row.net_total,
      tx_count: row.tx_count
    })),
    byCashier: byCashier.map((row) => ({
      cashier_name: row._id,
      sales_total: row.sales_total,
      refunds_total: row.refunds_total,
      net_total: row.net_total,
      tx_count: row.tx_count
    })),
    byProduct: byProduct.map((row) => ({
      product_id: String(row._id),
      product_name: row.product_name,
      sku: row.sku,
      barcode: row.barcode,
      net_qty: row.net_qty,
      net_sales: row.net_sales,
      net_tax: row.net_tax
    })),
    byCategory: byCategory.map((row) => ({
      category: row._id,
      net_qty: row.net_qty,
      net_sales: row.net_sales,
      net_tax: row.net_tax
    }))
  });
});

// Get receipt text for a transaction
app.get('/api/transactions/:id/receipt', async (req, res) => {
  const id = req.params.id;

  const tx = await Transaction.findById(id).lean();
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  try {
    const receiptText = await renderTextReceipt(id);
    res.json({
      transaction: {
        id: String(tx._id),
        store_id: String(tx.store),
        register_id: String(tx.register),
        cashier_id: tx.cashier ? String(tx.cashier) : null,
        cashier_name: tx.cashier_name,
        subtotal: tx.subtotal,
        tax_total: tx.tax_total,
        total: tx.total,
        payment_method: tx.payment_method,
        tc_number: tx.tc_number,
        type: tx.type,
        created_at: tx.created_at
      },
      receiptText
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to render receipt' });
  }
});

(async () => {
  await initDb();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`POS API listening on http://localhost:${PORT}`);
  });
})();