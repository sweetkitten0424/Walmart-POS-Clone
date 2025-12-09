import React, { useEffect, useMemo, useState } from 'react';
import Barcode from 'react-barcode';

const API_BASE = '/api';

function App() {
  const [auth, setAuth] = useState(null); // { token, user }
  const [store, setStore] = useState(null);
  const [register, setRegister] = useState(null);

  const handleLogout = () => {
    setAuth(null);
    setStore(null);
    setRegister(null);
  };

  if (!auth) {
    return <LoginScreen onLoggedIn={setAuth} />;
  }

  if (!store || !register) {
    return (
      <StoreAndRegisterSelector
        token={auth.token}
        user={auth.user}
        onSelected={(s, r) => {
          setStore(s);
          setRegister(r);
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <POSShell
      token={auth.token}
      user={auth.user}
      store={store}
      register={register}
      onChangeStore={() => {
        setStore(null);
        setRegister(null);
      }}
      onLogout={handleLogout}
    />
  );
}

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('cashier');
  const [password, setPassword] = useState('cashier123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username.trim(), password })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Login failed');
        return;
      }

      const data = await res.json();
      onLoggedIn({ token: data.token, user: data.user });
    } catch (err) {
      setError('Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      <div className="panel">
        <h1>POS Login</h1>
        <p className="subtext">
          Demo accounts: <code>admin/admin123</code>, <code>manager/manager123</code>,{' '}
          <code>cashier/cashier123</code>
        </p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit} className="form">
          <label>
            Username
            <input
              type="text"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </label>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StoreAndRegisterSelector({ token, user, onSelected, onLogout }) {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [registers, setRegisters] = useState([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingRegisters, setLoadingRegisters] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchStores() {
      try {
        setLoadingStores(true);
        const res = await fetch(`${API_BASE}/stores`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        let availableStores = data;
        if (user.storeId) {
          availableStores = data.filter((s) => s.id === user.storeId);
        }
        setStores(availableStores);
        if (availableStores.length > 0) {
          setSelectedStoreId(String(availableStores[0].id));
        }
      } catch (err) {
        setError('Failed to load stores');
      } finally {
        setLoadingStores(false);
      }
    }
    fetchStores();
  }, [token, user.storeId]);

  useEffect(() => {
    async function fetchRegisters(storeId) {
      if (!storeId) return;
      try {
        setLoadingRegisters(true);
        const params = new URLSearchParams({ storeId: String(storeId) });
        const res = await fetch(`${API_BASE}/registers?` + params.toString(), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        setRegisters(data);
        if (data.length > 0) {
          setSelectedRegisterId(String(data[0].id));
        }
      } catch (err) {
        setError('Failed to load registers');
      } finally {
        setLoadingRegisters(false);
      }
    }

    if (selectedStoreId) {
      fetchRegisters(selectedStoreId);
    }
  }, [selectedStoreId, token]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const s = stores.find((st) => String(st.id) === String(selectedStoreId));
    const r = registers.find((reg) => String(reg.id) === String(selectedRegisterId));
    if (!s || !r) return;
    onSelected(s, r);
  };

  return (
    <div className="app-container">
      <div className="panel">
        <h1>Select Store &amp; Register</h1>
        <p>
          Logged in as: <strong>{user.username}</strong> ({user.role})
        </p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit} className="form">
          <label>
            Store
            {loadingStores ? (
              <div>Loading stores...</div>
            ) : (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label>
            Register
            {loadingRegisters ? (
              <div>Loading registers...</div>
            ) : (
              <select
                value={selectedRegisterId}
                onChange={(e) => setSelectedRegisterId(e.target.value)}
              >
                {registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="store-actions">
            <button type="submit" className="primary">
              Continue to POS
            </button>
            <button type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function POSShell({ token, user, store, register, onChangeStore, onLogout }) {
  const [mode, setMode] = useState('sale'); // 'sale' | 'return' | 'inventory' | 'receipts' | 'reports' | 'users'
  const [lastTx, setLastTx] = useState(null); // { transaction, receiptText }

  const canManageInventory = user.role === 'manager' || user.role === 'admin';
  const canEditReceipts = user.role === 'manager' || user.role === 'admin';
  const canViewReports = user.role === 'manager' || user.role === 'admin';
  const canManageUsers = user.role === 'admin';

  return (
    <div className="app-container pos-layout">
      <header className="pos-header">
        <div>
          <h1>POS</h1>
          <div className="pos-header-meta">
            <span>
              Store: {store.code} - {store.name}
            </span>
            <span>
              Register: {register.code} - {register.name}
            </span>
          </div>
        </div>
        <div className="pos-header-right">
          <div>
            User: <strong>{user.username}</strong> ({user.role})
          </div>
          <button onClick={onChangeStore}>Change store/register</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="pos-nav">
        <button
          type="button"
          className={mode === 'sale' ? 'nav-tab active' : 'nav-tab'}
          onClick={() => setMode('sale')}
        >
          Sale
        </button>
        <button
          type="button"
          className={mode === 'return' ? 'nav-tab active' : 'nav-tab'}
          onClick={() => setMode('return')}
        >
          Return / Refund
        </button>
        {canManageInventory && (
          <button
            type="button"
            className={mode === 'inventory' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setMode('inventory')}
          >
            Inventory
          </button>
        )}
        {canEditReceipts && (
          <button
            type="button"
            className={mode === 'receipts' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setMode('receipts')}
          >
            Receipts
          </button>
        )}
        {canViewReports && (
          <button
            type="button"
            className={mode === 'reports' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setMode('reports')}
          >
            Reports
          </button>
        )}
        {canManageUsers && (
          <button
            type="button"
            className={mode === 'users' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setMode('users')}
          >
            Users
          </button>
        )}
      </div>

      {mode === 'sale' && (
        <SalePOSPage
          token={token}
          user={user}
          store={store}
          register={register}
          lastTx={lastTx}
          setLastTx={setLastTx}
        />
      )}

      {mode === 'return' && (
        <ReturnPage
          token={token}
          lastTx={lastTx}
          setLastTx={setLastTx}
        />
      )}

      {mode === 'inventory' && canManageInventory && (
        <InventoryPage token={token} store={store} />
      )}

      {mode === 'receipts' && canEditReceipts && (
        <ReceiptDesignerPage token={token} store={store} />
      )}

      {mode === 'reports' && canViewReports && (
        <ReportsPage token={token} user={user} store={store} />
      )}

      {mode === 'users' && canManageUsers && (
        <UsersPage token={token} user={user} />
      )}
    </div>
  );
}

function SalePOSPage({ token, user, store, register, lastTx, setLastTx }) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inventorySnapshot, setInventorySnapshot] = useState([]);

  useEffect(() => {
    async function loadInventory() {
      try {
        const params = new URLSearchParams({ storeId: String(store.id) });
        const res = await fetch(`${API_BASE}/inventory?` + params.toString(), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        setInventorySnapshot(data);
      } catch (err) {
        // non-critical
      }
    }
    loadInventory();
  }, [store.id, token]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const item of cartItems) {
      subtotal += item.unitPrice * item.quantity;
      tax += item.taxAmountPerUnit * item.quantity;
    }
    const total = subtotal + tax;
    return {
      subtotal,
      tax,
      total
    };
  }, [cartItems]);

  const handleAddProductToCart = (product) => {
    setCartItems((current) => {
      const existing = current.find((ci) => ci.productId === product.id);
      const taxPerUnit = (product.price * product.tax_rate) / 100;
      if (existing) {
        return current.map((ci) =>
          ci.productId === product.id
            ? { ...ci, quantity: ci.quantity + 1 }
            : ci
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          taxAmountPerUnit: taxPerUnit,
          sku: product.sku,
          barcode: product.barcode
        }
      ];
    });
  };

  const findInventoryQuantity = (productId) => {
    const row = inventorySnapshot.find((i) => i.product_id === productId);
    return row ? row.quantity : null;
  };

  const handleScan = async (e) => {
    e.preventDefault();
    const input = barcodeInput.trim();
    if (!input) return;

    setError('');
    setBarcodeInput('');

    try {
      const res = await fetch(
        `${API_BASE}/products/barcode/${encodeURIComponent(input)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (res.status === 404) {
        // fallback: search by name or SKU
        const params = new URLSearchParams({ search: input });
        const searchRes = await fetch(
          `${API_BASE}/products?` + params.toString(),
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        const results = await searchRes.json();
        if (!Array.isArray(results) || results.length === 0) {
          setError('No matching product found');
          return;
        }
        handleAddProductToCart(results[0]);
        return;
      }

      const product = await res.json();
      handleAddProductToCart(product);
    } catch (err) {
      setError('Failed to look up product');
    }
  };

  const updateQuantity = (productId, delta) => {
    setCartItems((current) => {
      return current
        .map((ci) =>
          ci.productId === productId
            ? { ...ci, quantity: Math.max(0, ci.quantity + delta) }
            : ci
        )
        .filter((ci) => ci.quantity > 0);
    });
  };

  const removeItem = (productId) => {
    setCartItems((current) => current.filter((ci) => ci.productId !== productId));
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      setError('Cart is empty');
      return;
    }
    setSubmitting(true);
    setError('');
    setLastTx(null);

    try {
      const payload = {
        storeId: store.id,
        registerId: register.id,
        paymentMethod,
        items: cartItems.map((ci) => ({
          productId: ci.productId,
          quantity: ci.quantity
        }))
      };

      const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.error || 'Failed to complete transaction');
        return;
      }

      const data = await res.json();
      setLastTx(data);
      setCartItems([]);
    } catch (err) {
      setError('Failed to complete transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSale = () => {
    setLastTx(null);
    setCartItems([]);
    setError('');
  };

  return (
    <>
      <main className="pos-main">
        <section className="pos-left">
          <form onSubmit={handleScan} className="scan-form">
            <label>
              Scan barcode / type SKU or name
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode here..."
                autoFocus
              />
            </label>
            <button type="submit">Add Item</button>
          </form>

          {error && <div className="error">{error}</div>}

          <div className="cart">
            <h2>Cart</h2>
            {cartItems.length === 0 ? (
              <div className="empty">No items in cart</div>
            ) : (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => {
                    const lineSubtotal = item.unitPrice * item.quantity;
                    const lineTax = item.taxAmountPerUnit * item.quantity;
                    const lineTotal = lineSubtotal + lineTax;
                    const invQty = findInventoryQuantity(item.productId);
                    return (
                      <tr key={item.productId}>
                        <td>
                          <div>{item.name}</div>
                          <div className="subtext">
                            SKU: {item.sku} | Barcode: {item.barcode || '—'}
                          </div>
                          {invQty != null && (
                            <div className="subtext">In stock: {invQty}</div>
                          )}
                        </td>
                        <td className="qty-cell">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, -1)}
                          >
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, 1)}
                          >
                            +
                          </button>
                        </td>
                        <td>{item.unitPrice.toFixed(2)}</td>
                        <td>{lineTax.toFixed(2)}</td>
                        <td>{lineTotal.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => removeItem(item.productId)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="pos-right">
          <div className="totals-panel">
            <h2>Totals</h2>
            <div className="totals-row">
              <span>Subtotal</span>
              <span>{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="totals-row">
              <span>Tax</span>
              <span>{totals.tax.toFixed(2)}</span>
            </div>
            <div className="totals-row total">
              <span>Total</span>
              <span>{totals.total.toFixed(2)}</span>
            </div>

            <label>
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </label>

            <button
              type="button"
              className="primary"
              disabled={submitting || cartItems.length === 0}
              onClick={handleCheckout}
            >
              {submitting ? 'Processing...' : 'Checkout'}
            </button>

            {lastTx && (
              <button type="button" onClick={handleNewSale}>
                New Sale
              </button>
            )}
          </div>

          {lastTx && (
            <ReceiptPanel
              transaction={lastTx.transaction}
              receiptText={lastTx.receiptText}
            />
          )}
        </section>
      </main>
    </>
  );
}

function ReturnPage({ token, lastTx, setLastTx }) {
  const [tcInput, setTcInput] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [originalTx, setOriginalTx] = useState(null);
  const [items, setItems] = useState([]); // { id, name, sku, barcode, purchasedQty, refundQty }
  const [submitting, setSubmitting] = useState(false);
  const [refundError, setRefundError] = useState('');

  const loadByTc = async (e) => {
    e.preventDefault();
    setLookupError('');
    setRefundError('');
    setLastTx(null);

    const tc = tcInput.trim();
    if (!tc) return;

    try {
      const res = await fetch(
        `${API_BASE}/transactions/by-tc/${encodeURIComponent(tc)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLookupError(body.error || 'Transaction not found');
        setOriginalTx(null);
        setItems([]);
        return;
      }

      const data = await res.json();
      setOriginalTx(data.transaction);
      setItems(
        data.items.map((it) => ({
          id: it.id,
          productId: it.product_id,
          name: it.product_name,
          sku: it.sku,
          barcode: it.barcode,
          purchasedQty: Math.abs(it.quantity),
          refundQty: Math.abs(it.quantity)
        }))
      );
    } catch (err) {
      setLookupError('Failed to look up transaction');
      setOriginalTx(null);
      setItems([]);
    }
  };

  const updateRefundQty = (id, delta) => {
    setItems((current) =>
      current
        .map((it) => {
          if (it.id !== id) return it;
          const next = Math.max(0, Math.min(it.purchasedQty, it.refundQty + delta));
          return { ...it, refundQty: next };
        })
        .filter((it) => it.purchasedQty > 0)
    );
  };

  const handleProcessRefund = async () => {
    if (!originalTx) return;
    const selected = items.filter((it) => it.refundQty > 0);
    if (selected.length === 0) {
      setRefundError('No items selected for refund');
      return;
    }

    setSubmitting(true);
    setRefundError('');
    setLastTx(null);

    try {
      const payload = {
        items: selected.map((it) => ({
          transactionItemId: it.id,
          quantity: it.refundQty
        }))
      };

      const res = await fetch(
        `${API_BASE}/transactions/${originalTx.id}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRefundError(body.error || 'Failed to process refund');
        return;
      }

      const data = await res.json();
      setLastTx(data);
    } catch (err) {
      setRefundError('Failed to process refund');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <main className="pos-main">
        <section className="pos-left">
          <form onSubmit={loadByTc} className="scan-form">
            <label>
              Enter or scan TC#
              <input
                type="text"
                value={tcInput}
                onChange={(e) => setTcInput(e.target.value)}
                placeholder="Scan TC# barcode or type TC#"
                autoFocus
              />
            </label>
            <button type="submit">Load Transaction</button>
          </form>
          {lookupError && <div className="error">{lookupError}</div>}

          <div className="cart">
            <h2>Original Items</h2>
            {!originalTx ? (
              <div className="empty">No transaction loaded</div>
            ) : items.length === 0 ? (
              <div className="empty">No items to refund</div>
            ) : (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Purchased</th>
                    <th>Refund Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div>{it.name}</div>
                        <div className="subtext">
                          SKU: {it.sku} | Barcode: {it.barcode || '—'}
                        </div>
                      </td>
                      <td>{it.purchasedQty}</td>
                      <td className="qty-cell">
                        <button
                          type="button"
                          onClick={() => updateRefundQty(it.id, -1)}
                        >
                          -
                        </button>
                        <span>{it.refundQty}</span>
                        <button
                          type="button"
                          onClick={() => updateRefundQty(it.id, 1)}
                        >
                          +
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="pos-right">
          <div className="totals-panel">
            <h2>Refund</h2>
            {originalTx ? (
              <div className="subtext">
                Refunding from TC#: <strong>{originalTx.tc_number}</strong>
              </div>
            ) : (
              <div className="subtext">Load a transaction by TC# to start a refund.</div>
            )}

            <button
              type="button"
              className="primary"
              disabled={submitting || !originalTx}
              onClick={handleProcessRefund}
            >
              {submitting ? 'Processing refund...' : 'Process Refund'}
            </button>

            {refundError && <div className="error">{refundError}</div>}
          </div>

          {lastTx && (
            <ReceiptPanel
              transaction={lastTx.transaction}
              receiptText={lastTx.receiptText}
            />
          )}
        </section>
      </main>
    </>
  );
}

function InventoryPage({ token, store }) {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editProduct, setEditProduct] = useState(null); // product/inventory row
  const [form, setForm] = useState({
    sku: '',
    barcode: '',
    name: '',
    category: '',
    price: '',
    tax_rate: '',
    quantity: ''
  });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ storeId: String(store.id) });
      const res = await fetch(`${API_BASE}/inventory?` + params.toString(), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      setInventory(data);
    } catch (err) {
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id, token]);

  const startCreate = () => {
    setEditProduct(null);
    setForm({
      sku: '',
      barcode: '',
      name: '',
      category: '',
      price: '',
      tax_rate: '',
      quantity: ''
    });
    setCreating(true);
  };

  const startEdit = (row) => {
    setCreating(false);
    setEditProduct(row);
    setForm({
      sku: row.sku || '',
      barcode: row.barcode || '',
      name: row.name || '',
      category: row.category || '',
      price: String(row.price ?? ''),
      tax_rate: String(row.tax_rate ?? ''),
      quantity: String(row.quantity ?? '')
    });
  };

  const handleFormChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (creating) {
        const payload = {
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || null,
          name: form.name.trim(),
          category: form.category.trim() || null,
          price: parseFloat(form.price),
          tax_rate: parseFloat(form.tax_rate),
          storeId: store.id,
          quantity: parseFloat(form.quantity || '0')
        };

        const res = await fetch(`${API_BASE}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Failed to create product');
          return;
        }
      } else if (editProduct) {
        const productPayload = {
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || null,
          name: form.name.trim(),
          category: form.category.trim() || null,
          price: parseFloat(form.price),
          tax_rate: parseFloat(form.tax_rate)
        };

        const resProd = await fetch(
          `${API_BASE}/products/${editProduct.product_id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(productPayload)
          }
        );

        if (!resProd.ok) {
          const body = await resProd.json().catch(() => ({}));
          setError(body.error || 'Failed to update product');
          return;
        }

        const invPayload = {
          storeId: store.id,
          productId: editProduct.product_id,
          quantity: parseFloat(form.quantity || '0')
        };

        const resInv = await fetch(`${API_BASE}/inventory/set`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(invPayload)
        });

        if (!resInv.ok) {
          const body = await resInv.json().catch(() => ({}));
          setError(body.error || 'Failed to update inventory');
          return;
        }
      }

      await loadInventory();
      setEditProduct(null);
      setCreating(false);
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="pos-main">
      <section className="pos-left">
        <div className="inventory-header">
          <h2>Inventory – {store.name}</h2>
          <button type="button" onClick={startCreate}>
            + Add Product
          </button>
        </div>
        {loading ? (
          <div>Loading inventory...</div>
        ) : inventory.length === 0 ? (
          <div className="empty">No products in inventory.</div>
        ) : (
          <table className="cart-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Price</th>
                <th>Tax %</th>
                <th>Qty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={row.product_id}>
                  <td>{row.name}</td>
                  <td>{row.sku}</td>
                  <td>{row.barcode || '—'}</td>
                  <td>{row.price.toFixed(2)}</td>
                  <td>{row.tax_rate.toFixed(2)}</td>
                  <td>{row.quantity}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      <section className="pos-right">
        <div className="totals-panel">
          <h2>{creating ? 'Add Product' : editProduct ? 'Edit Product' : 'Details'}</h2>
          {(creating || editProduct) && (
            <form className="form" onSubmit={handleSave}>
              <label>
                Name
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  required
                />
              </label>
              <label>
                SKU
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => handleFormChange('sku', e.target.value)}
                  required
                />
              </label>
              <label>
                Barcode
                <input
                  type="text"
                  value={form.barcode}
                  onChange={(e) => handleFormChange('barcode', e.target.value)}
                />
              </label>
              <label>
                Category
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => handleFormChange('category', e.target.value)}
                />
              </label>
              <label>
                Price
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => handleFormChange('price', e.target.value)}
                  required
                />
              </label>
              <label>
                Tax rate (%)
                <input
                  type="number"
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(e) => handleFormChange('tax_rate', e.target.value)}
                  required
                />
              </label>
              <label>
                Quantity (for this store)
                <input
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => handleFormChange('quantity', e.target.value)}
                />
              </label>

              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}
          {!creating && !editProduct && (
            <p className="subtext">
              Select a product from the left to edit details and quantity, or click
              &quot;Add Product&quot; to create a new one.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function ReceiptDesignerPage({ token, store }) {
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [previewType, setPreviewType] = useState('SALE');
  const [appliedPresetId, setAppliedPresetId] = useState('');

  const presets = [
    {
      id: 'simple',
      name: 'Simple',
      header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n',
      footer:
        'Thank you!\nTC#: {{tc_number}}\nDate: {{date}}\nCashier: {{cashier_name}}\n',
      showTaxBreakdown: true
    },
    {
      id: 'walmart-style',
      name: 'Walmart-style',
      header:
        '{{store_name}}\n{{store_address}}\n{{store_phone}}\n------------------------------\n',
      footer:
        '------------------------------\nType: {{tx_type}}\nTC#: {{tc_number}}\nDate: {{date}}\nCashier: {{cashier_name}}\nPayment: {{payment_method}}\n',
      showTaxBreakdown: true
    },
    {
      id: 'minimal',
      name: 'Minimal',
      header: '{{store_name}}\n',
      footer: 'TC#: {{tc_number}}  Total: {{total}}\n',
      showTaxBreakdown: false
    }
  ];

  const applyTemplate = (text, context) => {
    if (!text) return '';
    return text.replace(/{{(\w+)}}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(context, key) && context[key] != null) {
        return String(context[key]);
      }
      return '';
    });
  };

  useEffect(() => {
    async function loadTemplate() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_BASE}/stores/${store.id}/receipt-template`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        const data = await res.json();
        setHeader(data.header || '');
        setFooter(data.footer || '');
        if (data.options) {
          try {
            const opts =
              typeof data.options === 'string'
                ? JSON.parse(data.options)
                : data.options;
            setShowTaxBreakdown(
              opts.show_tax_breakdown !== undefined
                ? !!opts.show_tax_breakdown
                : true
            );
          } catch {
            setShowTaxBreakdown(true);
          }
        } else {
          setShowTaxBreakdown(true);
        }
        setAppliedPresetId('');
      } catch (err) {
        setError('Failed to load receipt template');
      } finally {
        setLoading(false);
      }
    }
    loadTemplate();
  }, [store.id, token]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = {
        header,
        footer,
        options: {
          show_tax_breakdown: showTaxBreakdown
        }
      };
      const res = await fetch(
        `${API_BASE}/stores/${store.id}/receipt-template`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to save template');
        return;
      }
      setSaved(true);
    } catch (err) {
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = (presetId) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setHeader(preset.header);
    setFooter(preset.footer);
    setShowTaxBreakdown(preset.showTaxBreakdown);
    setAppliedPresetId(presetId);
    setSaved(false);
  };

  const sampleContext = {
    store_name: store.name,
    store_address: '123 Main St',
    store_phone: '555-123-4567',
    store_code: store.code,
    register_code: 'R1',
    tc_number: '20250101-001-R1-1200-000001',
    date: '2025-01-01 12:00',
    cashier_name: 'demo.cashier',
    tx_type: previewType,
    payment_method: previewType === 'SALE' ? 'card' : 'cash',
    subtotal: '10.00',
    tax_total: '1.00',
    total: previewType === 'SALE' ? '11.00' : '-11.00'
  };

  const renderedHeader = applyTemplate(header, sampleContext) || '(no header)';
  const renderedFooter = applyTemplate(footer, sampleContext) || '(no footer)';

  return (
    <main className="pos-main">
      <section className="pos-left">
        <div className="inventory-header">
          <h2>Receipt Template – {store.name}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="subtext">Preset:</span>
            <select
              value={appliedPresetId}
              onChange={(e) => handleApplyPreset(e.target.value)}
            >
              <option value="">(none)</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div>Loading template...</div>
        ) : (
          <form className="form" onSubmit={handleSave}>
            <label>
              Header template
              <textarea
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                rows={6}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
              />
            </label>
            <label>
              Footer template
              <textarea
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                rows={6}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showTaxBreakdown}
                onChange={(e) => setShowTaxBreakdown(e.target.checked)}
              />
              Show tax breakdown line on receipt
            </label>
            {error && <div className="error">{error}</div>}
            {saved && !error && (
              <div className="subtext">Template saved successfully.</div>
            )}
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </form>
        )}
      </section>

      <section className="pos-right">
        <div className="receipt-panel">
          <div className="receipt-panel-header">
            <h2>Preview</h2>
            <div className="subtext">
              Preview as:{' '}
              <button
                type="button"
                className={previewType === 'SALE' ? 'nav-tab active' : 'nav-tab'}
                onClick={() => setPreviewType('SALE')}
              >
                SALE
              </button>
              <button
                type="button"
                className={previewType === 'REFUND' ? 'nav-tab active' : 'nav-tab'}
                onClick={() => setPreviewType('REFUND')}
              >
                REFUND
              </button>
            </div>
          </div>
          <div className="receipt-box">
            <pre>{renderedHeader}</pre>
            <pre>
{`1  Example Item        5.00
1  Another Item        5.00
------------------------------
Subtotal: ${sampleContext.subtotal}
Tax:      ${showTaxBreakdown ? sampleContext.tax_total : '—'}
Total:    ${sampleContext.total}`}
            </pre>
            <pre>{renderedFooter}</pre>
          </div>
          <div className="subtext" style={{ marginTop: 8 }}>
            Available placeholders:
            <ul>
              <li>
                Store:{' '}
                <code>
                  {'{{store_name}} {{store_address}} {{store_phone}} {{store_code}} {{register_code}}'}
                </code>
              </li>
              <li>
                Transaction:{' '}
                <code>
                  {'{{tc_number}} {{date}} {{cashier_name}} {{tx_type}} {{payment_method}}'}
                </code>
              </li>
              <li>
                Totals:{' '}
                <code>
                  {'{{subtotal}} {{tax_total}} {{total}}'}
                </code>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function ReportsPage({ token, user, store }) {
  const [from, setFrom] = useState(() => {
    const today = new Date();
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const formatMoney = (value) => {
    const num = Number(value) || 0;
    const sign = num < 0 ? '-' : '';
    return sign + Math.abs(num).toFixed(2);
  };

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        from,
        to,
        storeId: String(store.id)
      });
      const res = await fetch(
        `${API_BASE}/reports/sales-summary?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to load report');
        setReport(null);
        return;
      }
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError('Failed to load report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    loadReport();
  };

  return (
    <main className="pos-main">
      <section className="pos-left">
        <h2>Sales Summary</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Loading...' : 'Update'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        {report && (
          <div className="cart">
            <h2>
              Summary ({report.range.from} → {report.range.to})
            </h2>
            <div className="totals-row">
              <span>Gross sales</span>
              <span>{formatMoney(report.summary.sales_total)}</span>
            </div>
            <div className="totals-row">
              <span>Refunds</span>
              <span>{formatMoney(report.summary.refunds_total)}</span>
            </div>
            <div className="totals-row total">
              <span>Net total</span>
              <span>{formatMoney(report.summary.net_total)}</span>
            </div>
            <div className="subtext">
              Transactions: {report.summary.tx_count || 0}
            </div>
          </div>
        )}
      </section>

      <section className="pos-right">
        {report ? (
          <>
            <div className="cart">
              <h2>By Day</h2>
              {report.byDay && report.byDay.length > 0 ? (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Gross</th>
                      <th>Refunds</th>
                      <th>Net</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byDay.map((row) => (
                      <tr key={row.day}>
                        <td>{row.day}</td>
                        <td>{formatMoney(row.sales_total)}</td>
                        <td>{formatMoney(row.refunds_total)}</td>
                        <td>{formatMoney(row.net_total)}</td>
                        <td>{row.tx_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">No transactions in this period.</div>
              )}
            </div>

            <div className="cart">
              <h2>By Cashier</h2>
              {report.byCashier && report.byCashier.length > 0 ? (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Cashier</th>
                      <th>Gross</th>
                      <th>Refunds</th>
                      <th>Net</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byCashier.map((row) => (
                      <tr key={row.cashier_name}>
                        <td>{row.cashier_name}</td>
                        <td>{formatMoney(row.sales_total)}</td>
                        <td>{formatMoney(row.refunds_total)}</td>
                        <td>{formatMoney(row.net_total)}</td>
                        <td>{row.tx_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">No transactions in this period.</div>
              )}
            </div>

            <div className="cart">
              <h2>By Product</h2>
              {report.byProduct && report.byProduct.length > 0 ? (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Barcode</th>
                      <th>Net Qty</th>
                      <th>Net Sales</th>
                      <th>Net Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byProduct.map((row) => (
                      <tr key={row.product_id}>
                        <td>{row.product_name}</td>
                        <td>{row.sku}</td>
                        <td>{row.barcode || '—'}</td>
                        <td>{row.net_qty}</td>
                        <td>{formatMoney(row.net_sales)}</td>
                        <td>{formatMoney(row.net_tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">No product data in this period.</div>
              )}
            </div>

            <div className="cart">
              <h2>By Category</h2>
              {report.byCategory && report.byCategory.length > 0 ? (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Net Qty</th>
                      <th>Net Sales</th>
                      <th>Net Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byCategory.map((row) => (
                      <tr key={row.category}>
                        <td>{row.category}</td>
                        <td>{row.net_qty}</td>
                        <td>{formatMoney(row.net_sales)}</td>
                        <td>{formatMoney(row.net_tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">No category data in this period.</div>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            No data yet. Select a date range and click Update.
          </div>
        )}
      </section>
    </main>
  );
}

function UsersPage({ token, user }) {
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'cashier',
    storeId: ''
  });

  const loadStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/stores`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      setStores(data);
    } catch (err) {
      setError('Failed to load stores');
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to load users');
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setCreating(true);
    setEditUser(null);
    setForm({
      username: '',
      password: '',
      role: 'cashier',
      storeId: ''
    });
  };

  const startEdit = (u) => {
    setCreating(false);
    setEditUser(u);
    setForm({
      username: u.username || '',
      password: '',
      role: u.role || 'cashier',
      storeId: u.store_id ? String(u.store_id) : ''
    });
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      username: form.username.trim(),
      role: form.role,
      storeId: form.storeId ? Number(form.storeId) : null
    };
    if (form.password) {
      payload.password = form.password;
    }

    if (!payload.username) {
      setError('Username is required');
      setSaving(false);
      return;
    }
    if (creating && !form.password) {
      setError('Password is required for new users');
      setSaving(false);
      return;
    }

    try {
      let res;
      if (creating) {
        res = await fetch(`${API_BASE}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else if (editUser) {
        res = await fetch(`${API_BASE}/users/${editUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (res && !res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to save user');
        return;
      }

      await loadUsers();
      setCreating(false);
      setEditUser(null);
      setForm({
        username: '',
        password: '',
        role: 'cashier',
        storeId: ''
      });
    } catch (err) {
      setError('Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"?`)) {
      return;
    }
    setError('');
    try {
      const res = await fetch(`${API_BASE}/users/${u.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to delete user');
        return;
      }
      await loadUsers();
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const storeLabel = (u) => {
    if (!u.store_id) return 'All stores';
    const store = stores.find((s) => s.id === u.store_id);
    if (!store) return `Store #${u.store_id}`;
    return `${store.code} - ${store.name}`;
  };

  return (
    <main className="pos-main">
      <section className="pos-left">
        <div className="inventory-header">
          <h2>Users</h2>
          <button type="button" onClick={startCreate}>
            + Add User
          </button>
        </div>
        {loading ? (
          <div>Loading users...</div>
        ) : users.length === 0 ? (
          <div className="empty">No users found.</div>
        ) : (
          <table className="cart-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Store</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.role}</td>
                  <td>{storeLabel(u)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => startEdit(u)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      disabled={u.id === user.id}
                      onClick={() => handleDelete(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      <section className="pos-right">
        <div className="totals-panel">
          <h2>{creating ? 'Add User' : editUser ? 'Edit User' : 'Details'}</h2>
          {(creating || editUser) && (
            <form className="form" onSubmit={handleSave}>
              <label>
                Username
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) =>
                    handleFormChange('username', e.target.value)
                  }
                  required
                />
              </label>
              <label>
                Password {editUser && <span className="subtext">(leave blank to keep)</span>}
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    handleFormChange('password', e.target.value)
                  }
                />
              </label>
              <label>
                Role
                <select
                  value={form.role}
                  onChange={(e) => handleFormChange('role', e.target.value)}
                >
                  <option value="cashier">cashier</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Store
                <select
                  value={form.storeId}
                  onChange={(e) => handleFormChange('storeId', e.target.value)}
                >
                  <option value="">All stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}
          {!creating && !editUser && (
            <p className="subtext">
              Select a user from the left to edit them, or click &quot;Add
              User&quot; to create a new one.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function ReceiptPanel({ transaction, receiptText }) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [printed, setPrinted] = useState(false);

  const handlePrint = async () => {
    if (!transaction || !transaction.id) return;
    setPrinting(true);
    setPrintError('');
    setPrinted(false);
    try {
      const res = await fetch('/print/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transactionId: transaction.id })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPrintError(body.error || 'Failed to send to printer');
        return;
      }
      setPrinted(true);
    } catch (err) {
      setPrintError('Failed to send to printer');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="receipt-panel">
      <div className="receipt-panel-header">
        <h2>Receipt</h2>
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
        >
          {printing ? 'Printing...' : 'Print'}
        </button>
      </div>
      <div className="receipt-box">
        <pre>{receiptText}</pre>
        {transaction.tc_number && (
          <div className="barcode-wrapper">
            <Barcode
              value={transaction.tc_number}
              format="CODE128"
              displayValue
              fontSize={12}
            />
          </div>
        )}
      </div>
      {printError && <div className="error">{printError}</div>}
      {printed && !printError && (
        <div className="subtext">Sent to local print agent.</div>
      )}
    </div>
  );
}

export default App;