import OpenAI from 'openai';

const getAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
});

const CATEGORIES = [
  'food_dining', 'transport', 'utilities', 'shopping', 'airtime_data',
  'entertainment', 'healthcare', 'education', 'savings', 'business',
  'family_support', 'rent', 'salary', 'other',
];

/**
 * Categorize a batch of transactions using AI.
 * Returns array of { transaction_id, category }
 */
export const categorizeTransactions = async (transactions) => {
  const batch = transactions.map((t) => ({
    id: t.transaction_id || t.id,
    description: t.description,
    amount: t.amount,
    type: t.type,
    counterparty: t.counterparty,
  }));

  const prompt = `You are a financial categorization AI for M-Pesa transactions in Kenya.
Categorize each transaction into exactly one of these categories:
${CATEGORIES.join(', ')}

Rules:
- Safaricom/airtime → airtime_data
- Naivas, Carrefour, supermarket → food_dining
- Uber, Little, matatu, fuel → transport
- KPLC, water, Nairobi Water → utilities
- Jumia, online shopping → shopping
- Hospital, pharmacy, clinic → healthcare
- School fees, university → education
- Sent to family → family_support
- Rent payment → rent
- Employer/salary → salary

Respond ONLY with a JSON array: [{"id":"...","category":"..."}]

Transactions:
${JSON.stringify(batch)}`;

  try {
    const res = await getAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const text = res.choices[0].message.content;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.categories || parsed.transactions || [];
  } catch (err) {
    console.error('AI categorization error:', err.message);
    return transactions.map((t) => ({ id: t.transaction_id, category: 'other' }));
  }
};

/**
 * Detect fraud/scam risk in a transaction.
 * Returns { risk_level, reason, ai_analysis }
 */
export const analyzeTransactionFraud = async (transaction) => {
  const prompt = `You are a fraud detection AI for M-Pesa transactions in Kenya.
Analyze this transaction for fraud or scam risk.

Transaction:
${JSON.stringify(transaction, null, 2)}

Known fraud patterns in Kenya:
- Fake prize/lottery messages asking for fees
- Impersonation of Safaricom agents
- Unusual large amounts to unknown recipients
- Multiple rapid transactions to same recipient
- Suspicious descriptions mentioning "won", "prize", "agent", "fee"

Respond with JSON only:
{
  "risk_level": "low|medium|high",
  "reason": "brief explanation",
  "ai_analysis": "detailed analysis"
}`;

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(res.choices[0].message.content);
  } catch (err) {
    console.error('Fraud analysis error:', err.message);
    return { risk_level: 'low', reason: 'Analysis unavailable', ai_analysis: '' };
  }
};

/**
 * Generate a monthly financial summary narrative.
 */
export const generateMonthlySummary = async ({ month, transactions, totalIncome, totalExpenses, topCategories }) => {
  const prompt = `You are a personal finance AI assistant for a Kenyan M-Pesa user.
Generate a friendly, insightful monthly summary for ${month}.

Data:
- Total Income: KES ${totalIncome.toLocaleString()}
- Total Expenses: KES ${totalExpenses.toLocaleString()}
- Net: KES ${(totalIncome - totalExpenses).toLocaleString()}
- Top spending categories: ${JSON.stringify(topCategories)}
- Number of transactions: ${transactions.length}

Write a 3-4 sentence summary that:
1. Highlights their financial health for the month
2. Notes their biggest spending area
3. Gives one actionable tip specific to their situation
4. Uses a warm, encouraging tone

Keep it concise and personal. Do not use bullet points.`;

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    return res.choices[0].message.content.trim();
  } catch (err) {
    console.error('Summary generation error:', err.message);
    return 'Your monthly summary could not be generated at this time.';
  }
};
