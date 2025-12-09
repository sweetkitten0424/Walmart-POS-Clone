/**
 * Simple local print service.
 *
 * This process:
 *  - Listens on localhost (default port 9100)
 *  - Accepts POST /print/transaction with { transactionId }
 *  - Fetches the rendered receipt text from the POS API
 *  - Sends it to stdout (you can replace this with ESC/POS printer code)
 *
 * This is a starting point for integrating real hardware printers.
 */

const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PRINT_AGENT_PORT || 9100;
const POS_API_BASE = process.env.POS_API_BASE || 'http://localhost:4000';
const POS_API_TOKEN = process.env.POS_API_TOKEN || '';

async function fetchReceipt(transactionId) {
  const url = `${POS_API_BASE}/api/transactions/${transactionId}/receipt`;

  const headers = {};
  if (POS_API_TOKEN) {
    headers.Authorization = `Bearer ${POS_API_TOKEN}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to fetch receipt (status ${res.status})`);
  }

  const data = await res.json();
  return data.receiptText;
}

function printToConsole(text) {
  // Replace this with ESC/POS printer code if desired.
  // For example, using a library like "escpos" or "@node-escpos/core":
  //
  // const escpos = require('escpos');
  // escpos.USB = require('escpos-usb');
  // const device = new escpos.USB();
  // const printer = new escpos.Printer(device);
  // device.open((err) => {
  //   if (err) {
  //     console.error('Printer error:', err);
  //     return;
  //   }
  //   printer
  //     .text(text)
  //     .cut()
  //     .close();
  // });
  //
  // For now, just log the text so you can see the output.

  // eslint-disable-next-line no-console
  console.log('================ RECEIPT START ================');
  // eslint-disable-next-line no-console
  console.log(text);
  // eslint-disable-next-line no-console
  console.log('================= RECEIPT END =================');
}

app.post('/print/transaction', async (req, res) => {
  const { transactionId } = req.body || {};
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  try {
    const text = await fetchReceipt(transactionId);
    printToConsole(text);
    return res.json({ status: 'ok' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Print error:', err);
    return res.status(500).json({ error: 'Failed to print receipt' });
  }
});

app.post('/print/raw', (req, res) => {
  const { text } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  printToConsole(String(text));
  return res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Print agent listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Using POS API at ${POS_API_BASE}`);
});