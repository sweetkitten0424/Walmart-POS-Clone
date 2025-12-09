function pad(num, size) {
  return num.toString().padStart(size, '0');
}

/**
 * Generate a Walmart-style TC# for a transaction.
 * Format: YYYYMMDD-STORECODE-REGCODE-HHMM-SEQ
 * Here SEQ is the transaction's numeric ID, zero-padded.
 */
function generateTC({ storeCode, registerCode, transactionId, date = new Date() }) {
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const hh = date.getHours();
  const min = date.getMinutes();

  const datePart = `${pad(yyyy, 4)}${pad(mm, 2)}${pad(dd, 2)}`;
  const timePart = `${pad(hh, 2)}${pad(min, 2)}`;
  const seqPart = pad(transactionId, 6);

  return `${datePart}-${storeCode}-${registerCode}-${timePart}-${seqPart}`;
}

module.exports = {
  generateTC
};