import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'PesaMind <onboarding@resend.dev>';
const APP_URL = 'https://pesamind-frontend-f77z.vercel.app';

const baseStyle = `font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; background: #050F09; color: white; padding: 40px; border-radius: 16px;`;
const logoHtml = `<div style="text-align: center; margin-bottom: 32px;"><div style="width: 56px; height: 56px; background: #00E87A; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 12px;">₿</div><h2 style="margin: 0; color: white; font-size: 22px;">PesaMind</h2></div>`;
const footerHtml = `<p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px; text-align: center;">PesaMind · Built for Kenya 🇰🇪 · <a href="${APP_URL}" style="color: rgba(255,255,255,0.3);">Visit App</a></p>`;

export const sendWelcomeEmail = async (email, name, referralCode) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `🎉 Welcome to PesaMind, ${name}!`,
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <h1 style="font-size: 28px; margin-bottom: 8px;">Welcome, ${name}! 🎉</h1>
          <p style="color: rgba(255,255,255,0.7); line-height: 1.7;">You've joined the smartest way to manage M-Pesa finances in Kenya. Here's how to get started:</p>
          
          <div style="background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="color: #00E87A; font-weight: 700; margin: 0 0 12px;">3 steps to your first insight:</p>
            <p style="margin: 0 0 8px; color: white;">1️⃣ Download your M-Pesa PDF from MySafaricom app</p>
            <p style="margin: 0 0 8px; color: white;">2️⃣ Upload it to PesaMind (we unlock it automatically)</p>
            <p style="margin: 0; color: white;">3️⃣ Get AI-powered insights on your spending</p>
          </div>

          <a href="${APP_URL}/statements" style="display: block; text-align: center; background: #00E87A; color: #000; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 16px; margin-bottom: 24px;">Upload Your First Statement →</a>

          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; text-align: center;">
            <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0 0 8px;">Your referral code — share & earn 1 free Pro month per 3 referrals:</p>
            <p style="font-size: 24px; font-weight: 900; color: #00E87A; letter-spacing: 4px; margin: 0;">${referralCode}</p>
            <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin: 8px 0 0;">Share link: ${APP_URL}/register?ref=${referralCode}</p>
          </div>
          ${footerHtml}
        </div>
      `
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error('Welcome email error:', err.message);
  }
};

export const sendBudgetAlert = async (email, name, category, spent, budget) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `⚠️ Budget Alert: ${category} spending exceeded`,
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <p style="color: rgba(255,255,255,0.7);">Hi ${name},</p>
          <div style="background: rgba(255,77,109,0.1); border: 1px solid rgba(255,77,109,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #FF4D6D; font-weight: 700; margin: 0 0 8px;">⚠️ Budget Exceeded</p>
            <p style="color: white; margin: 0;">You've spent <strong style="color: #FF4D6D;">KSH ${Number(spent).toLocaleString()}</strong> on <strong>${category?.replace(/_/g, ' ')}</strong>, exceeding your budget of <strong>KSH ${Number(budget).toLocaleString()}</strong>.</p>
          </div>
          <a href="${APP_URL}/budgets" style="display: inline-block; background: #00E87A; color: #000; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700;">View Budgets →</a>
          ${footerHtml}
        </div>
      `
    });
  } catch (err) {
    console.error('Budget alert error:', err.message);
  }
};

export const sendFraudAlert = async (email, name, description, amount) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `🚨 Fraud Alert: Suspicious transaction detected`,
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <p style="color: rgba(255,255,255,0.7);">Hi ${name},</p>
          <div style="background: rgba(255,77,109,0.1); border: 1px solid rgba(255,77,109,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #FF4D6D; font-weight: 700; margin: 0 0 8px;">🚨 Suspicious Transaction</p>
            <p style="color: white; margin: 0 0 8px;">${description}</p>
            <p style="color: #FF4D6D; font-weight: 700; margin: 0;">Amount: KSH ${Number(amount).toLocaleString()}</p>
          </div>
          <p style="color: rgba(255,255,255,0.7);">If you didn't authorize this, check your M-Pesa immediately.</p>
          <a href="${APP_URL}/fraud" style="display: inline-block; background: #FF4D6D; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; margin-top: 16px;">View Fraud Alerts →</a>
          ${footerHtml}
        </div>
      `
    });
  } catch (err) {
    console.error('Fraud alert error:', err.message);
  }
};

export const sendReferralReward = async (email, name, freeMonths) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `🎁 You earned ${freeMonths} free Pro month!`,
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <h2 style="text-align: center; margin-bottom: 8px;">You earned a reward! 🎁</h2>
          <p style="color: rgba(255,255,255,0.7); text-align: center;">Hi ${name}, your referral has signed up!</p>
          <div style="background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="font-size: 48px; margin: 0 0 8px;">🏆</p>
            <p style="font-size: 24px; font-weight: 900; color: #00E87A; margin: 0;">${freeMonths} Free Pro Month${freeMonths > 1 ? 's' : ''}</p>
            <p style="color: rgba(255,255,255,0.5); font-size: 14px; margin: 8px 0 0;">Added to your account automatically</p>
          </div>
          <a href="${APP_URL}/pricing" style="display: block; text-align: center; background: #00E87A; color: #000; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 800;">View Your Plan →</a>
          ${footerHtml}
        </div>
      `
    });
  } catch (err) {
    console.error('Referral reward email error:', err.message);
  }
};

export const sendMonthlyReport = async (email, name, month, stats) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `📊 Your PesaMind Monthly Report — ${month}`,
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <h2 style="text-align: center; margin-bottom: 4px;">Your ${month} Report</h2>
          <p style="color: rgba(255,255,255,0.5); text-align: center; margin-bottom: 24px;">Hi ${name}, here's your monthly financial summary</p>
          
          <div style="display: grid; gap: 12px; margin-bottom: 24px;">
            <div style="background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.15); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between;">
              <span style="color: rgba(255,255,255,0.6);">Total Income</span>
              <strong style="color: #00E87A;">KSH ${Number(stats.income || 0).toLocaleString()}</strong>
            </div>
            <div style="background: rgba(255,77,109,0.08); border: 1px solid rgba(255,77,109,0.15); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between;">
              <span style="color: rgba(255,255,255,0.6);">Total Expenses</span>
              <strong style="color: #FF4D6D;">KSH ${Number(stats.expenses || 0).toLocaleString()}</strong>
            </div>
            <div style="background: rgba(123,94,167,0.08); border: 1px solid rgba(123,94,167,0.15); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between;">
              <span style="color: rgba(255,255,255,0.6);">Net Savings</span>
              <strong style="color: #7B5EA7;">KSH ${Number((stats.income || 0) - (stats.expenses || 0)).toLocaleString()}</strong>
            </div>
            <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between;">
              <span style="color: rgba(255,255,255,0.6);">Health Score</span>
              <strong style="color: #F59E0B;">${stats.score || 0}/100</strong>
            </div>
          </div>

          <a href="${APP_URL}/dashboard" style="display: block; text-align: center; background: #00E87A; color: #000; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 800;">View Full Dashboard →</a>
          ${footerHtml}
        </div>
      `
    });
  } catch (err) {
    console.error('Monthly report error:', err.message);
  }
};