import OpenAI from 'openai';

const getAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
});

export const generateMonthlySummary = async ({ month, transactions, totalIncome, totalExpenses, topCategories }) => {
  const prompt = `You are PesaMind, a personal finance AI for Kenyan M-Pesa users.
Generate a friendly monthly summary for ${month}.
Data:
- Total Income: KES ${totalIncome?.toLocaleString()}
- Total Expenses: KES ${totalExpenses?.toLocaleString()}
- Net Savings: KES ${(totalIncome - totalExpenses)?.toLocaleString()}
- Top spending categories: ${JSON.stringify(topCategories)}
- Number of transactions: ${transactions?.length}
Write 3-4 sentences highlighting financial health, biggest spending area, and one actionable tip. Warm, encouraging tone. No bullet points.`;

  try {
    const res = await getAI().chat.completions.create({
      model: 'llama-3.1-8b-instant',
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

export const categorizeTransactions = async (transactions) => {
  try {
    const prompt = `Categorize these M-Pesa transactions. Return ONLY JSON: {"categories": [{"category": string}]}
Categories: food_dining, transport, utilities, shopping, airtime_data, entertainment, healthcare, education, savings, business, salary, other
Transactions:
${transactions.slice(0, 30).map((t, i) => `${i}. ${t.description} KSH${t.amount}`).join('\n')}`;

    const res = await getAI().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000,
    });
    const data = JSON.parse(res.choices[0].message.content);
    return data.categories || [];
  } catch (err) {
    console.error('AI categorization error:', err.message);
    return [];
  }
};

export const analyzeTransactionFraud = async (transaction) => {
  return { is_flagged: false, fraud_score: 0, reason: null };
};