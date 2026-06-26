const TYPE_MAP = {
  'Customer Transfer': 'send_money', 'Pay Bill': 'pay_bill',
  'Buy Goods': 'buy_goods', 'Withdraw Cash': 'withdraw',
  'Deposit Cash': 'deposit', 'Airtime': 'airtime',
  'Receive Money': 'receive', 'Customer Merchant Payment': 'buy_goods',
  'Business Payment': 'receive', 'Salary Payment': 'receive',
};

export function parseMpesaText(text) {
  const transactions = [];
  const lines = text.split('\n');
  const txRegex = /([A-Z0-9]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/;

  for (const line of lines) {
    const match = line.match(txRegex);
    if (!match) continue;
    const [, txnId, dateStr, details, paidInStr, withdrawnStr, balanceStr] = match;
    const paidInAmt = parseFloat(paidInStr.replace(/,/g, '')) || 0;
    const withdrawnAmt = parseFloat(withdrawnStr.replace(/,/g, '')) || 0;
    const balance = parseFloat(balanceStr.replace(/,/g, '')) || 0;
    const amount = paidInAmt > 0 ? paidInAmt : withdrawnAmt;
    const type = paidInAmt > 0 ? 'receive' : 'send_money';
    const transaction_date = new Date(dateStr);
    if (isNaN(transaction_date)) continue;
    transactions.push({ transaction_id: txnId, type, amount, balance, counterparty: '', description: details, transaction_date, category: null, is_flagged: false });
  }
  return transactions;
}

export function parseMpesaCsv(rows) {
  return rows.map(row => ({
    transaction_id: row['Transaction ID'] || row['Receipt No'] || '',
    type: 'send_money', amount: parseFloat(row['Amount'] || 0),
    balance: parseFloat(row['Balance'] || 0), counterparty: row['Counterparty'] || '',
    description: row['Description'] || row['Details'] || '',
    transaction_date: new Date(row['Date'] || row['Completion Time']),
    category: null, is_flagged: false,
  }));
}