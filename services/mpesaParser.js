const CATEGORY_RULES = [
  { category: 'food_dining', keywords: ['naivas', 'carrefour', 'quickmart', 'food', 'restaurant', 'cafe', 'java', 'kfc', 'pizza', 'chicken', 'meat', 'butchery', 'supermarket', 'grocery', 'eatery', 'hotel', 'bakery', 'milk', 'bread', 'unga', 'sukuma', 'nyama', 'chips', 'burger', 'soda', 'juice', 'waters', 'canteen', 'mess'] },
  { category: 'transport', keywords: ['uber', 'bolt', 'little', 'taxi', 'fare', 'fuel', 'petrol', 'diesel', 'parking', 'matatu', 'bus', 'ferry', 'shuttle', 'safarilink', 'kenya airways', 'jambojet', 'flysax', 'transport', 'bodaboda', 'tuk', 'probox', 'stage'] },
  { category: 'utilities', keywords: ['kplc', 'kenya power', 'water', 'nawasco', 'nairobi water', 'electricity', 'internet', 'wifi', 'safaricom', 'airtel', 'telkom', 'dstv', 'gotv', 'startimes', 'zuku', 'faiba', 'gas', 'cooking gas', 'lpg', 'stima'] },
  { category: 'airtime_data', keywords: ['airtime', 'data', 'bundle', 'prepaid', 'recharge', 'top up', 'topup', 'okoa', 'fuliza'] },
  { category: 'shopping', keywords: ['jumia', 'kilimall', 'amazon', 'aliexpress', 'clothing', 'shoes', 'fashion', 'mall', 'clothes', 'shirt', 'trouser', 'dress', 'kitenge', 'material', 'hardware', 'electronics', 'phone', 'laptop', 'tv', 'fridge'] },
  { category: 'healthcare', keywords: ['pharmacy', 'hospital', 'clinic', 'doctor', 'chemist', 'health', 'medical', 'medicine', 'drugs', 'lab', 'dental', 'optical', 'nairobi hospital', 'aga khan', 'knh', 'mp shah', 'gertrudes', 'nursing'] },
  { category: 'education', keywords: ['school', 'university', 'college', 'fees', 'tuition', 'books', 'stationery', 'uon', 'ku', 'strathmore', 'usiu', 'kca', 'zetech', 'kabarak', 'daystar', 'training', 'exam', 'kcse', 'knec'] },
  { category: 'entertainment', keywords: ['netflix', 'spotify', 'cinema', 'movies', 'gaming', 'showmax', 'youtube', 'club', 'bar', 'pub', 'lounge', 'event', 'concert', 'ticket', 'sport', 'gym', 'fitness'] },
  { category: 'savings', keywords: ['savings', 'sacco', 'investment', 'shares', 'mmf', 'cic', 'icea', 'britam', 'equity', 'kcb', 'cooperative', 'stanlib', 'pension', 'insurance', 'nhif', 'nssf', 'deposit'] },
  { category: 'rent', keywords: ['rent', 'landlord', 'caretaker', 'house', 'apartment', 'bedsitter', 'single room', 'own', 'property', 'lease'] },
  { category: 'business', keywords: ['wholesale', 'supplier', 'goods', 'stock', 'inventory', 'purchase', 'business', 'shop', 'store', 'market', 'trade', 'supply'] },
  { category: 'salary', keywords: ['salary', 'payroll', 'wages', 'stipend', 'allowance', 'payment from', 'employer', 'commission'] },
  { category: 'family_support', keywords: ['mum', 'mom', 'dad', 'father', 'mother', 'sister', 'brother', 'son', 'daughter', 'wife', 'husband', 'family', 'relative', 'uncle', 'aunt', 'cousin', 'nyumba', 'shags'] },
];

function categorizeByKeywords(description) {
  if (!description) return 'other';
  const lower = description.toLowerCase();
  for (const { category, keywords } of CATEGORY_RULES) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'other';
}

export function parseMpesaText(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flat = lines.join(' ');

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
    const category = categorizeByKeywords(description);
    transactions.push({ transaction_id: receiptNo, type, amount: absAmount, balance, description: description.trim(), transaction_date, category, is_flagged: false, counterparty: '' });
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
    category: categorizeByKeywords(row['Description'] || ''),
    is_flagged: false,
  }));
}