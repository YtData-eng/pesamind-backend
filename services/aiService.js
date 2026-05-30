import OpenAI from "openai";

const getAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1",
});

export const generateMonthlySummary = async ({ month, transactions, totalIncome, totalExpenses, topCategories }) => {
  const prompt = `You are PesaMind, a personal finance AI for Kenyan M-Pesa users. Generate a friendly monthly summary for ${month}. Income: KES ${totalIncome}, Expenses: KES ${totalExpenses}, Top categories: ${JSON.stringify(topCategories)}. Write 3 sentences with one actionable tip.`;
  try {
    const res = await getAI().chat.completions.create({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 300 });
    return res.choices[0].message.content.trim();
  } catch (err) {
    console.error("Summary generation error:", err.message);
    return "Your monthly summary could not be generated at this time.";
  }
};

export const categorizeTransactions = async (transactions) => { return []; };
export const analyzeTransactionFraud = async (transaction) => { return { is_flagged: false, fraud_score: 0 }; };
