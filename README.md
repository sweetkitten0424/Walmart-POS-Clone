# Multi-Store POS + Inventory (Node.js, Express, React, MongoDB Atlas)

This is a functional POS + Inventory system with:

- Node.js + Express backend
- MongoDB Atlas database (via Mongoose)
- React + Vite frontend
- **Multi-store** support (stores, registers)
- POS checkout with tax calculation
- Inventory tracking per store
- **TC# generation** for each transaction (Walmart-style)
- **TC# barcode** on the receipt (CODE128)
- **Receipt text customization** per store (header/footer + placeholders)
- **User accounts + roles** (`admin`, `manager`, `cashier`)
- **Returns / refunds by TC#**
- **Inventory management UI** (create/edit products, adjust quantities)
- **User management UI** (admin-only)
- **Reporting** (sales by day, cashier, product, and category, per store, date range)
- **Receipt designer UI** (manager/admin, with presets and SALE/REFUND preview)
- Optional **local print agent** service for talking to real receipt printers
  - Auto-print on sale and refund from the backend
  - Manual print from the POS UI

## Structure

- `server/` – Express API + MongoDB (Mongoose)
- `client/` – React POS frontend (Vite)

---

## Getting started

### Backend (MongoDB Atlas)

1. **Create a MongoDB Atlas cluster** (or use an existing one) and a database user.
2. Get your connection string, e.g.:

   ```text
   mongodb+srv://Admin:<db_password>@cluster0.vyabsir.mongodb.net/pos?retryWrites=true&w=majority&appName=Cluster0
   ```

3. Export the connection URI (and optionally a JWT secret) in your shell:

   ```bash
   cd server
   npm install

   export MONGODB_URI="mongodb+srv://Admin:<db_password>@cluster0.vyabsir.mongodb.net/pos?retryWrites=true&w=majority&appName=Cluster0"
   export JWT_SECRET="some-long-random-string"

   npm run dev
   # API will run on http://localhost:4000
   ```

On first run it will connect to MongoDB and seed:

- Store `001 - Demo Superstore`
- Register `R1 - Front Register 1`
- Sample products (Milk, Bread, Batteries) with quantity 100 at that store
- A default receipt template for that store
- Demo users:
  - `admin` / `admin123` (role: `admin`)
  - `manager` / `manager123` (role: `manager`)
  - `cashier` / `cashier123` (role: `cashier`)

### Frontend

```bash
cd client
npm install
npm run dev
# Vite dev server on http://localhost:5173
# It proxies /api to http://localhost:4000
```

Open `http://localhost:5173`:

1. **Login** with one of the demo accounts, e.g.:
   - `cashier / cashier123`
   - `manager / manager123`
   - `admin / admin123`
2. Select **store / register**.
3. Use the tabs:
   - **Sale** – normal checkout
   - **Return / Refund** – process returns using TC#
   - **Inventory** – create/edit products and set quantities (manager/admin only)

---

## Features

### 1. Authentication & roles

Backend:

- `POST /api/auth/login` – returns `{ token, user }` on success.
- JWT-based auth; all other `/api` endpoints require `Authorization: Bearer <token>`.

Seeded roles:

- **admin**
  - All capabilities.
- **manager**
  - Inventory management
  - Receipt template updates
  - Sales and returns
- **cashier**
  - Sales and returns only.

Frontend:

- Login screen calls `/api/auth/login`.
- Token is kept in memory and sent with each API call.

---

### 2. POS checkout (Sale tab)

- Scan barcode (or type barcode/SKU/name and press Enter).
- Items are added with:
  - Price + tax per unit (from product).
  - Quantity adjustments with +/- buttons.
  - In-stock quantity shown (per store).
- Totals:
  - Subtotal
  - Tax
  - Total
- Payment method: `cash`, `card`, `other` (simulated).
- On **Checkout**:
  - POST `/api/transactions`
  - Stores a `SALE` transaction and transaction items
  - Decrements inventory for that store
  - Generates a **TC#**
  - Returns:
    - `transaction`
    - `items`
    - `receiptText` (rendered server-side)
- Receipt:
  - Displayed as text plus CODE128 barcode of the TC#.

---

### 3. TC# generation and barcode

Format:

- `YYYYMMDD-STORECODE-REGCODE-HHMM-SEQ`
  - `YYYYMMDD` – date
  - `STORECODE` – e.g. `001`
  - `REGCODE` – e.g. `R1`
  - `HHMM` – time
  - `SEQ` – zero-padded transaction id

Backend: `tcGenerator.js` generates the TC# when a transaction is created.

Frontend: `react-barcode` renders the TC# barcode on the receipt.

---

### 4. Returns / refunds by TC# (Return tab)

Backend endpoints:

- `GET /api/transactions/by-tc/:tcNumber`
  - Looks up a transaction by TC#
  - Returns `{ transaction, items }`
- `POST /api/transactions/:id/refund`
  - Body:

    ```json
    {
      "items": [
        { "transactionItemId": "<transactionItemId>", "quantity": 1 }
      ]
    }
    ```

  - Creates a new `REFUND` transaction referencing the original `SALE`
  - Inserts negative-quantity line items
  - **Increases** inventory (puts stock back)
  - Generates a new TC# for the refund
  - Returns `{ transaction, items, receiptText }`

> Note: In the MongoDB version, IDs are string ObjectIds instead of integers. The API always returns IDs as strings (e.g. `"id": "65f..."`), and the frontend sends those back unchanged.

Front-end Return flow:

1. Enter or scan TC# on the **Return / Refund** tab.
2. App loads original transaction + items.
3. For each item:
   - Shows purchased quantity.
   - lets you select refund quantity (0 … purchased).
4. Click **Process Refund**:
   - Calls `POST /api/transactions/:id/refund`.
   - Shows the refund receipt, with:
     - `*** REFUND ***` header line
     - Negative totals
     - New TC# + barcode.

---

### 5. Inventory management UI (Inventory tab)

Accessible only to `manager` and `admin`.

Backend endpoints:

- `GET /api/inventory?storeId=...`
  - Per-store inventory with product details.
- `POST /api/products` (manager/admin)
  - Create new product and initial inventory for a store.
- `PUT /api/products/:id` (manager/admin)
  - Update SKU, barcode, name, category, price, tax rate, active.
- `POST /api/inventory/set` (manager/admin)
  - Set quantity for a given `{ storeId, productId }`.

Frontend (Inventory tab):

- Inventory table:
  - Name, SKU, barcode, price, tax rate, quantity for the current store.
- **Add Product**:
  - Create product (SKU, barcode, name, category, price, tax_rate)
  - Set initial quantity for current store.
- **Edit**:
  - Edit product details.
  - Set new quantity for current store.

---

### 6. Receipt customization

API:

- `GET /api/stores/:storeId/receipt-template`
- `PUT /api/stores/:storeId/receipt-template` (manager/admin)

Example payload:

```json
{
  "header": "{{store_name}}\\n{{store_address}}\\nSupport: {{store_phone}}\\n",
  "footer": "Thanks for shopping!\\nTC#: {{tc_number}}\\nDate: {{date}}\\nCashier: {{cashier_name}}\\nType: {{tx_type}}\\n",
  "options": {
    "show_tax_breakdown": true
  }
}
```

Supported placeholders in header/footer:

- `{{store_name}}`
- `{{store_address}}`
- `{{store_phone}}`
- `{{tc_number}}`
- `{{total}}`
- `{{subtotal}}`
- `{{tax_total}}`
- `{{date}}`
- `{{cashier_name}}`
- `{{store_code}}`
- `{{register_code}}`
- `{{tx_type}}` (`SALE` or `REFUND`)
- `{{payment_method}}`

The receipt body (items + totals) is rendered server-side and is not template-driven, but you can control header/footer and whether tax is broken out.

---

### Local print agent and auto-printing

There is a small separate project in `print-agent/`:

- Listens on `http://localhost:9100` by default.
- Exposes:
  - `POST /print/transaction` – expects `{ "transactionId": 123 }`
  - `POST /print/raw` – expects `{ "text": "..." }`
- Fetches rendered receipt text from the main POS API and prints it to stdout.
  - You can replace the stdout logic with ESC/POS printer code.

Run it:

```bash
cd print-agent
npm install
export POS_API_BASE=http://localhost:4000
export POS_API_TOKEN="<JWT from /api/auth/login>"  # e.g. admin token
npm start
```

#### Auto-print from backend

The backend can call the print agent automatically on each SALE or REFUND.

Configure the POS backend with:

```bash
cd server
export PRINT_AGENT_BASE=http://localhost:9100
npm run dev
```

When `PRINT_AGENT_BASE` is set:

- After each successful `POST /api/transactions` (SALE), the server calls:

  - `POST ${PRINT_AGENT_BASE}/print/transaction` with `{ transactionId }`

- After each successful `POST /api/transactions/:id/refund` (REFUND), it does the same.

This is best-effort (fire-and-forget): failures are logged but do not block the POS response.

#### Print from the POS UI

On the POS receipt panel (Sale or Return tab) there is a **Print** button:

- Frontend calls:

  ```http
  POST /print/transaction  # proxied by Vite to the print agent
  {
    "transactionId": <current receipt transaction id>
  }
  ```

- The result shows either an error or a “Sent to local print agent.” hint.

### Notes

- Payments are simulated (`cash`, `card`, `other`).
- The TC# barcode can be scanned with typical USB barcode scanners (keyboard wedge).
- TC# format: `YYYYMMDD-STORECODE-REGCODE-HHMM-SEQ`, where `SEQ` is the transaction ID.

You can extend this with:

- More detailed inventory operations (receiving, purchase orders, shrinkage)
- Hardware integrations (ESC/POS printers, integrated payment terminals)
- Additional reporting (e.g., daily Z-reports, hourly breakdowns)