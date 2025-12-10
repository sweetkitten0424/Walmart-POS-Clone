const {
  Transaction,
  TransactionItem,
  ReceiptTemplate,
  Store,
  Register
} = require('./db');

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
async function renderTextReceipt(transactionId) {
  const tx = await Transaction.findById(transactionId)
    .populate('store')
    .populate('register')
    .lean();

  if (!tx) {
    throw new Error('Transaction not found');
  }

  const items = await TransactionItem.find({ transaction: tx._id }).lean();

  let template = await ReceiptTemplate.findOne({ store: tx.store._id }).lean();

  if (!template) {
    template = {
      header: '{{store_name}}\n{{store_address}}\n{{store_phone}}\n',
      footer: 'Thank you for shopping!\nTC#: {{tc_number}}\n',
      options: { show_tax_breakdown: true }
    };
  }

  const options = template.options || {};

  const createdAt =
    tx.created_at instanceof Date ? tx.created_at : new Date(tx.created_at);

  const context = {
    store_name: tx.store.name,
    store_address: tx.store.address || '',
    store_phone: tx.store.phone || '',
    tc_number: tx.tc_number,
    total: formatMoney(tx.total),
    subtotal: formatMoney(tx.subtotal),
    tax_total: formatMoney(tx.tax_total),
    date: createdAt.toLocaleString(),
    cashier_name: tx.cashier_name || '',
    store_code: tx.store.code,
    register_code: tx.register.code,
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
  lines.push(`Store: ${tx.store.name} (${tx.store.code})`);
  lines.push(`Register: ${tx.register.code}`);
  lines.push(`Payment: ${tx.payment_method}`);
  lines.push('');
  lines.push('Items:');

  items.forEach((item) => {
    const name = item.product_name || '';
    const qty = Math.abs(item.quantity);
    const price = (item.unit_price || 0).toFixed(2);
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