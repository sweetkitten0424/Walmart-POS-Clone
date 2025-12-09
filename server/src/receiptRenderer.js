const { db } = require('./db');

function applyTemplate(text, context) {
  if (!text) {
    return '';
  }
  return text.replace(/{{(\w+)}}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key) && context[key] != null) {
      return String(context[key]);
    }
    return '';
  });
}

function formatMoney(value) {
  const num = Number(value) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + Math.abs(num).toFixed(2);
}

/**
 * Render a text receipt for the given transaction.
 * Uses the store's receipt template (header/footer) plus a fixed body layout.
 */
function renderTextReceipt(transactionId) {
  const tx = db
    .prepare(
      `
      SELECT
        t.*,
        s.name AS store_name,
        s.address AS store_address,
        s.phone AS store_phone,
        s.code AS store_code,
        r.code AS register_code,
        r.name AS register_name
      FROM transactions t
      JOIN stores s ON s.id = t.store_id
      JOIN registers r ON r.id = t.register_id
      WHERE t.id = ?
    `
    )
    .get(transactionId);

  if (!tx) {
    throw new Error('Transaction not found');
  }

  const items = db
    .prepare(
      `
      SELECT
        ti.*,
        p.name AS product_name
      FROM transaction_items ti
      JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?
    `
    )
    .all(transactionId);

  let template = db
    .prepare('SELECT * FROM receipt_templates WHERE store_id = ?')
    .get(tx.store_id);

  if (!template) {
    template = {
      header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n',
      footer: 'Thank you for shopping!\nTC#: {{tc_number}}\n',
      options: JSON.stringify({ show_tax_breakdown: true })
    };
  }

  let options = {};
  if (template.options) {
    try {
      options = JSON.parse(template.options);
    } catch (err) {
      options = {};
    }
  }

  const createdAt = new Date(tx.created_at);
  const context = {
    store_name: tx.store_name,
    store_address: tx.store_address || '',
    store_phone: tx.store_phone || '',
    tc_number: tx.tc_number,
    total: formatMoney(tx.total),
    subtotal: formatMoney(tx.subtotal),
    tax_total: formatMoney(tx.tax_total),
    date: createdAt.toLocaleString(),
    cashier_name: tx.cashier_name || '',
    store_code: tx.store_code,
    register_code: tx.register_code,
    tx_type: tx.type || 'SALE',
    payment_method: tx.payment_method
  };

  const lines = [];

  const renderedHeader = applyTemplate(template.header, context).trimEnd();
  if (renderedHeader) {
    lines.push(renderedHeader);
  }

  lines.push('');
  if (tx.type === 'REFUND') {
    lines.push('*** REFUND ***');
  }
  lines.push(`TC#: ${tx.tc_number}`);
  lines.push(`Date: ${context.date}`);
  if (tx.cashier_name) {
    lines.push(`Cashier: ${tx.cashier_name}`);
  }
  lines.push(`Store: ${tx.store_name} (${tx.store_code})`);
  lines.push(`Register: ${tx.register_code}`);
  lines.push(`Payment: ${tx.payment_method}`);
  lines.push('');
  lines.push('Items:');

  items.forEach((item) => {
    const name = item.product_name;
    const qty = Math.abs(item.quantity);
    const price = item.unit_price.toFixed(2);
    const lineTotal = formatMoney(item.line_total);
    lines.push(`- ${name} x${qty} @ ${price} = ${lineTotal}`);
  });

  lines.push('');
  lines.push(`Subtotal: ${formatMoney(tx.subtotal)}`);

  if (options.show_tax_breakdown) {
    lines.push(`Tax:      ${formatMoney(tx.tax_total)}`);
  }

  lines.push(`Total:    ${formatMoney(tx.total)}`);
  lines.push('');

  const renderedFooter = applyTemplate(template.footer, context).trimEnd();
  if (renderedFooter) {
    lines.push(renderedFooter);
  }

  return lines.join('\n');
}

module.exports = {
  renderTextReceipt
};