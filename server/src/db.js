const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/pos-dev'; // fallback for local dev

// Schemas
const StoreSchema = new Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  address: String,
  phone: String
});

const RegisterSchema = new Schema({
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  code: { type: String, required: true },
  name: { type: String, required: true }
});

const ProductSchema = new Schema({
  sku: { type: String, unique: true, required: true },
  barcode: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  category: String,
  price: { type: Number, required: true },
  tax_rate: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
});

const InventorySchema = new Schema({
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 0 }
});
InventorySchema.index({ store: 1, product: 1 }, { unique: true });

const ReceiptTemplateSchema = new Schema({
  store: { type: Schema.Types.ObjectId, ref: 'Store', unique: true, required: true },
  header: String,
  footer: String,
  options: Schema.Types.Mixed
});

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'cashier'], required: true },
  store: { type: Schema.Types.ObjectId, ref: 'Store', default: null }
});

const TransactionSchema = new Schema({
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  register: { type: Schema.Types.ObjectId, ref: 'Register', required: true },
  cashier: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  cashier_name: String,
  subtotal: { type: Number, required: true },
  tax_total: { type: Number, required: true },
  total: { type: Number, required: true },
  payment_method: { type: String, required: true },
  tc_number: { type: String, unique: true },
  type: { type: String, enum: ['SALE', 'REFUND'], default: 'SALE' },
  reference_transaction: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  created_at: { type: Date, required: true }
});

const TransactionItemSchema = new Schema({
  transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  // denormalised for easier reporting
  product_name: { type: String, required: true },
  sku: String,
  barcode: String,
  category: String,
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  line_total: { type: Number, required: true },
  tax_amount: { type: Number, required: true }
});

// Models
const Store = mongoose.model('Store', StoreSchema);
const Register = mongoose.model('Register', RegisterSchema);
const Product = mongoose.model('Product', ProductSchema);
const Inventory = mongoose.model('Inventory', InventorySchema);
const ReceiptTemplate = mongoose.model('ReceiptTemplate', ReceiptTemplateSchema);
const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const TransactionItem = mongoose.model('TransactionItem', TransactionItemSchema);

async function seedIfEmpty() {
  const storeCount = await Store.countDocuments().exec();
  if (storeCount > 0) {
    return;
  }

  const store = await Store.create({
    code: '001',
    name: 'Demo Superstore',
    address: '123 Main St, Demo City',
    phone: '555-123-4567'
  });

  const register = await Register.create({
    store: store._id,
    code: 'R1',
    name: 'Front Register 1'
  });

  const productsSeed = [
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

  const products = [];
  for (const p of productsSeed) {
    const prod = await Product.create({
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      price: p.price,
      tax_rate: p.tax_rate,
      active: true
    });
    products.push(prod);
    await Inventory.create({
      store: store._id,
      product: prod._id,
      quantity: 100
    });
  }

  await ReceiptTemplate.create({
    store: store._id,
    header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n\n',
    footer:
      'Thank you for shopping with us!\nTC#: {{tc_number}}\nDate: {{date}}\nCashier: {{cashier_name}}\nType: {{tx_type}}\n',
    options: {
      show_tax_breakdown: true
    }
  });

  const adminPassword = bcrypt.hashSync('admin123', 10);
  const managerPassword = bcrypt.hashSync('manager123', 10);
  const cashierPassword = bcrypt.hashSync('cashier123', 10);

  await User.create({
    username: 'admin',
    password_hash: adminPassword,
    role: 'admin',
    store: null
  });

  await User.create({
    username: 'manager',
    password_hash: managerPassword,
    role: 'manager',
    store: store._id
  });

  await User.create({
    username: 'cashier',
    password_hash: cashierPassword,
    role: 'cashier',
    store: store._id
  });

  // keep lints quiet about unused register variable
  void register;
}

async function initDb() {
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 10
  });
  await seedIfEmpty();
}

module.exports = {
  initDb,
  Store,
  Register,
  Product,
  Inventory,
  ReceiptTemplate,
  User,
  Transaction,
  TransactionItem
};