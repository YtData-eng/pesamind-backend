export function parseMpesaText(text) {
  const transactions = [];

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flat = lines.join(' ');

  // Receipt and date are joined: UESEC67NDQ2026-05-28 20:03:30
  const txRegex = /([A-Z0-9]{8,})(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*?)\s*Completed(-?[\d,]+\.\d{2})([\d,]+\.\d{2})/g;

  let match;
  while ((match = txRegex.exec(flat)) !== null) {
    const [, receiptNo, dateTime, description, amountStr, balanceStr] = match;

    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const balance = parseFloat(balanceStr.replace(/,/g, ''));

    if (amount === 0) continue;

    const type = amount > 0 ? 'receive' : 'send_money';
    const absAmount = Math.abs(amount);
    const transaction_date = new Date(dateTime.trim());
    if (isNaN(transaction_date.getTime())) continue;

    transactions.push({
      transaction_id: receiptNo,
      type,
      amount: absAmount,
      balance,
      description: description.trim(),
      transaction_date,
      category: null,
      is_flagged: false,
      counterparty: ''
    });
  }

  console.log(`Parser found ${transactions.length} transactions`);
  return transactions;
}

export function parseMpesaCsv(rows) {
  return rows.map(row => ({
    transaction_id: row['Receipt No'] || '',
    type: 'send_money',
    amount: parseFloat(row['Amount'] || 0),
    balance: parseFloat(row['Balance'] || 0),
    counterparty: '',
    description: row['Description'] || '',
    transaction_date: new Date(row['Date'] || ''),
    category: null,
    is_flagged: false,
  }));
}