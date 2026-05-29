import OpenAI from 'openai';

let ai;
function getAI() {
  if (!ai) {
    ai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
    });
  }
  return ai;
}

export async function categorizeTransactions(transactions) {
  const prompt = `Categorize these M-Pesa transactions. Return JSON array: [{"category": string, "subcategory": string}]
Categories: food_dining, transport, utilities, shopping, airtime_data, entertainment, healthcare, education, savings, business, salary, other

Transactions:
${transactions.slice(0, 50).map((t, i) => `${i}. ${t.description} KSH${t.amount}`).join('\n')}`;

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    const data = JSON.parse(res.choices[0].message.content);
    return data.categories || data.results || [];
  } catch (err) {
    console.error('AI categorization failed:', err.message);
    return [];
  }
}

export async function generateFinancialSummary(stats) {
  const prompt = `You are PesaMind, an AI financial advisor for Kenyans.
Write a friendly 3-paragraph summary with spending insights and 2-3 actionable tips.
Data: Income KSH${stats.totalIncome}, Expenses KSH${stats.totalExpenses}, Savings Rate ${stats.savingsRate}%, Top categories: ${JSON.stringify(stats.topCategories)}
Plain text only, no markdown.`;

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    return res.choices[0].message.content;
  } catch (err) {
    return 'Unable to generate AI summary at this time.';
  }
}

export async function analyzeTransactionFraud(transaction) {
  return { is_flagged: false, fraud_score: 0, reason: null };
}