import OpenAI from 'openai';

const getAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
});

export async function generateMonthlySummary({ month, totalIncome, totalExpenses, topCategories }) {
  try {
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;
    
    const prompt = `You are PesaMind, an AI financial advisor for Kenyans.
Based on this M-Pesa data for ${month}, write a friendly 3-paragraph financial summary.
Include spending habits, top expense areas, savings rate, and 2-3 actionable tips.
Be specific and encouraging. Use Kenyan context where relevant.

Data:
- Total Income: KSH ${totalIncome?.toLocaleString()}
- Total Expenses: KSH ${totalExpenses?.toLocaleString()}
- Savings: KSH ${(totalIncome - totalExpenses)?.toLocaleString()}
- Savings Rate: ${savingsRate}%
- Top Categories: ${JSON.stringify(topCategories)}

Write in plain text, no markdown, no bullet points.`;

    const res = await getAI().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    return res.choices[0].message.content;
  } catch (err) {
    console.error('Summary generation error:', err.message);
    return 'Your monthly summary could not be generated at this time.';
  }
}

export async function categorizeTransactions(transactions) {
  try {
    const prompt = `Categorize these M-Pesa transactions. Return ONLY a JSON object with key "categories" containing an array where each item has "category" and "subcategory".
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
}

export async function analyzeTransactionFraud(transaction) {
  return { is_flagged: false, fraud_score: 0, reason: null };
}