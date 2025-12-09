const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../data/pos.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

function initDb() {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT
    );

    CREATE TABLE IF NOT EXISTS registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (store_id) REFERENCES stores(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE (store_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS receipt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL UNIQUE,
      header TEXT,
      footer TEXT,
      options TEXT,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      store_id INTEGER,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      register_id INTEGER NOT NULL,
      cashier_id INTEGER,
      cashier_name TEXT,
      subtotal REAL NOT NULL,
      tax_total REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      tc_number TEXT UNIQUE,
      type TEXT NOT NULL DEFAULT 'SALE',
      reference_transaction_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id),
      FOREIGN KEY (register_id) REFERENCES registers(id),
      FOREIGN KEY (cashier_id) REFERENCES users(id),
      FOREIGN KEY (reference_transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      tax_amount REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // In case the database was created with an older schema, try to add missing columns.
  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'SALE'`);
  } catch (err) {
    // ignore if column already exists
  }
  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN reference_transaction_id INTEGER`);
  } catch (err) {
    // ignore if column already exists
  }
  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN cashier_id INTEGER`);
  } catch (err) {
    // ignore if column already exists
  }

  seedIfEmpty();
}

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) as count FROM stores').get();
  if (row.count > 0) {
    return;
  }

  const insertStore = db.prepare(
    'INSERT INTO stores (code, name, address, phone) VALUES (?, ?, ?, ?)'
  );
  const storeInfo = insertStore.run(
    '001',
    'Demo Superstore',
    '123 Main St, Demo City',
    '555-123-4567'
  );
  const storeId = storeInfo.lastInsertRowid;

  const insertRegister = db.prepare(
    'INSERT INTO registers (store_id, code, name) VALUES (?, ?, ?)'
  );
  insertRegister.run(storeId, 'R1', 'Front Register 1');

  const insertProduct = db.prepare(
    'INSERT INTO products (sku, barcode, name, category, price, tax_rate, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const products = [
    {
      sku: '1001',
      barcode: '100000000001',
      name: 'Whole Milk 1L',
      category: 'Grocery',
      price: 2.99,
      tax_rate: 5
    },
    {
      sku: '1002',
      barcode: '100000000002',
      name: 'Bread Loaf',
      category: 'Bakery',
      price: 1.99,
      tax_rate: 5
    },
    {
      sku: '1003',
      barcode: '100000000003',
      name: 'AA Batteries (4-pack)',
      category: 'Electronics',
      price: 4.5,
      tax_rate: 10
    }
  ];

  const insertInventory = db.prepare(
    'INSERT INTO inventory (store_id, product_id, quantity) VALUES (?, ?, ?)'
  );

  for (const p of products) {
    const info = insertProduct.run(
      p.sku,
      p.barcode,
      p.name,
      p.category,
      p.price,
      p.tax_rate,
      1
    );
    const productId = info.lastInsertRowid;
    insertInventory.run(storeId, productId, 100);
  }

  const insertTemplate = db.prepare(
    'INSERT INTO receipt_templates (store_id, header, footer, options) VALUES (?, ?, ?, ?)'
  );

  const headerTemplate = `{{store_name}}
{{store_address}}
{{store_phone}}

`;
  const footerTemplate = `Thank you for shopping with us!
TC#: {{tc_number}}
Date: {{date}}
Cashier: {{cashier_name}}
Type: {{tx_type}}
`;

  const options = JSON.stringify({
    show_tax_breakdown: true
  });

  insertTemplate.run(storeId, headerTemplate, footerTemplate, options);

  const insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, role, store_id) VALUES (?, ?, ?, ?)'
  );

  const adminPassword = bcrypt.hashSync('admin123', 10);
  const managerPassword = bcrypt.hashSync('manager123', 10);
  const cashierPassword = bcrypt.hashSync('cashier123', 10);

  // Global admin (no specific store)
  insertUser.run('admin', adminPassword, 'admin', null);

  // Store-level manager and cashier
  insertUser.run('manager', managerPassword, 'manager', storeId);
  insertUser.run('cashier', cashierPassword, 'cashier', storeId);
}

module.exports = {
  db,
  initDb
};