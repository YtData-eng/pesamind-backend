import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'PesaMind <notifications@pesamind.online>';
const APP_URL = process.env.APP_URL || 'https://pesamind.online';

// ── Shared design tokens ──────────────────────────────────
const colors = {
  bg: '#070C09',
  surface: '#0C1A0E',
  border: '#1A3A1A',
  emerald: '#00E87A',
  darkGreen: '#003D20',
  textPrimary: '#E8F5E8',
  textSecondary: 'rgba(232,245,232,0.65)',
  textMuted: 'rgba(232,245,232,0.4)',
  danger: '#FF4D6D',
  warning: '#F59E0B',
  purple: '#7B5EA7',
};

// ── Logo as real inline SVG (renders correctly everywhere) ──
const logoSvg = `
<svg width="44" height="44" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
  <rect width="56" height="56" rx="16" fill="#0C1A0E" stroke="#00E87A" stroke-width="0.8"/>
  <circle cx="28" cy="28" r="20" fill="none" stroke="#00E87A" stroke-width="0.4" opacity="0.3"/>
  <circle cx="28" cy="28" r="13" fill="none" stroke="#00D4AA" stroke-width="0.4" opacity="0.5"/>
  <line x1="28" y1="20" x2="28" y2="10" stroke="#00E87A" stroke-width="0.6" opacity="0.4"/>
  <line x1="36" y1="28" x2="45" y2="28" stroke="#00D4AA" stroke-width="0.6" opacity="0.35"/>
  <line x1="20" y1="28" x2="11" y2="28" stroke="#00D4AA" stroke-width="0.6" opacity="0.35"/>
  <circle cx="28" cy="28" r="7" fill="none" stroke="#00E87A" stroke-width="1.3"/>
  <circle cx="28" cy="28" r="3" fill="#00E87A"/>
</svg>`;

// ── Shared layout pieces ──────────────────────────────────
const wrapper = (innerHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:${colors.bg};">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: ${colors.bg}; padding: 0;">
    <div style="padding: 40px 36px 32px;">
      ${innerHtml}
    </div>
    <div style="border-top: 1px solid ${colors.border}; padding: 24px 36px; text-align: center;">
      <p style="color: ${colors.textMuted}; font-size: 12px; margin: 0; letter-spacing: 0.3px;">
        PesaMind &middot; Built for Kenya &middot; <a href="${APP_URL}" style="color: ${colors.textMuted}; text-decoration: underline;">pesamind.online</a>
      </p>
    </div>
  </div>
</body>
</html>`;

const header = (label) => `
<div style="text-align: center; margin-bottom: 32px;">
  ${logoSvg}
  <p style="color: ${colors.textMuted}; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 14px 0 0;">${label}</p>
</div>`;

const primaryButton = (text, href) => `
<div style="text-align: center; margin: 28px 0 8px;">
  <a href="${href}" style="display: inline-block; background: ${colors.emerald}; color: ${colors.darkGreen}; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: -0.2px;">${text}</a>
</div>`;

const infoBox = (label, value, accentColor) => `
<div style="background: ${colors.surface}; border: 1px solid ${accentColor}25; border-radius: 12px; padding: 18px 20px; margin-bottom: 10px;">
  <p style="color: ${colors.textMuted}; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 6px;">${label}</p>
  <p style="color: ${accentColor}; font-size: 18px; font-weight: 600; margin: 0; letter-spacing: -0.3px;">${value}</p>
</div>`;

const statRow = (label, value, accentColor) => `
<div style="display: flex; justify-content: space-between; align-items: center; background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 10px; padding: 14px 18px; margin-bottom: 8px;">
  <span style="color: ${colors.textSecondary}; font-size: 13px;">${label}</span>
  <strong style="color: ${accentColor}; font-size: 14px; font-weight: 600;">${value}</strong>
</div>`;

// ══════════════════════════════════════════════════════════
// WELCOME EMAIL
// ══════════════════════════════════════════════════════════
export const sendWelcomeEmail = async (email, name, referralCode) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Welcome to PesaMind, ${name}`,
      html: wrapper(`
        ${header('Welcome')}
        <h1 style="color: ${colors.textPrimary}; font-size: 24px; font-weight: 300; text-align: center; margin: 0 0 8px; letter-spacing: -0.3px;">
          Welcome, <span style="font-weight: 600; color: ${colors.emerald};">${name}</span>
        </h1>
        <p style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.7; text-align: center; margin: 0 0 32px;">
          You've joined the smartest way to manage M-Pesa finances in Kenya.
        </p>

        <div style="background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 14px; padding: 24px; margin-bottom: 28px;">
          <p style="color: ${colors.emerald}; font-weight: 600; font-size: 13px; letter-spacing: 0.3px; margin: 0 0 16px;">Three steps to your first insight</p>
          <div style="margin-bottom: 12px;">
            <span style="color: ${colors.emerald}; font-weight: 600; font-size: 12px; margin-right: 8px;">01</span>
            <span style="color: ${colors.textSecondary}; font-size: 13px;">Download your M-Pesa PDF from MySafaricom app</span>
          </div>
          <div style="margin-bottom: 12px;">
            <span style="color: ${colors.emerald}; font-weight: 600; font-size: 12px; margin-right: 8px;">02</span>
            <span style="color: ${colors.textSecondary}; font-size: 13px;">Upload it to PesaMind &mdash; we unlock it automatically</span>
          </div>
          <div>
            <span style="color: ${colors.emerald}; font-weight: 600; font-size: 12px; margin-right: 8px;">03</span>
            <span style="color: ${colors.textSecondary}; font-size: 13px;">Get AI-powered insights on your spending</span>
          </div>
        </div>

        ${primaryButton('Upload Your First Statement', `${APP_URL}/statements`)}

        <div style="margin-top: 32px; background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 14px; padding: 22px; text-align: center;">
          <p style="color: ${colors.textMuted}; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 10px;">Your Referral Code</p>
          <p style="font-size: 26px; font-weight: 700; color: ${colors.emerald}; letter-spacing: 6px; margin: 0 0 8px;">${referralCode}</p>
          <p style="color: ${colors.textMuted}; font-size: 12px; margin: 0;">Earn 1 free Pro month for every 3 referrals</p>
        </div>
      `),
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error('Welcome email error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════
// BUDGET ALERT
// ══════════════════════════════════════════════════════════
export const sendBudgetAlert = async (email, name, category, spent, budget) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Budget alert: ${category} spending exceeded`,
      html: wrapper(`
        ${header('Budget Alert')}
        <p style="color: ${colors.textSecondary}; font-size: 14px; margin: 0 0 20px;">Hi ${name},</p>

        <div style="background: rgba(255,77,109,0.06); border: 1px solid rgba(255,77,109,0.2); border-radius: 14px; padding: 22px; margin-bottom: 24px;">
          <p style="color: ${colors.danger}; font-weight: 600; font-size: 13px; letter-spacing: 0.3px; margin: 0 0 10px;">Budget Exceeded</p>
          <p style="color: ${colors.textPrimary}; font-size: 14px; line-height: 1.7; margin: 0;">
            You've spent <strong style="color: ${colors.danger};">KSH ${Number(spent).toLocaleString()}</strong> on <strong>${category?.replace(/_/g, ' ')}</strong>, exceeding your budget of <strong>KSH ${Number(budget).toLocaleString()}</strong>.
          </p>
        </div>

        ${primaryButton('View Budgets', `${APP_URL}/budgets`)}
      `),
    });
  } catch (err) {
    console.error('Budget alert error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════
// FRAUD ALERT
// ══════════════════════════════════════════════════════════
export const sendFraudAlert = async (email, name, description, amount) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Fraud alert: suspicious transaction detected`,
      html: wrapper(`
        ${header('Security Alert')}
        <p style="color: ${colors.textSecondary}; font-size: 14px; margin: 0 0 20px;">Hi ${name},</p>

        <div style="background: rgba(255,77,109,0.06); border: 1px solid rgba(255,77,109,0.2); border-radius: 14px; padding: 22px; margin-bottom: 20px;">
          <p style="color: ${colors.danger}; font-weight: 600; font-size: 13px; letter-spacing: 0.3px; margin: 0 0 12px;">Suspicious Transaction Detected</p>
          <p style="color: ${colors.textPrimary}; font-size: 14px; margin: 0 0 10px;">${description}</p>
          <p style="color: ${colors.danger}; font-weight: 600; font-size: 16px; margin: 0;">KSH ${Number(amount).toLocaleString()}</p>
        </div>

        <p style="color: ${colors.textSecondary}; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
          If you didn't authorise this, check your M-Pesa account immediately.
        </p>

        ${primaryButton('Review Fraud Alerts', `${APP_URL}/fraud`)}
      `),
    });
  } catch (err) {
    console.error('Fraud alert error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════
// REFERRAL REWARD
// ══════════════════════════════════════════════════════════
export const sendReferralReward = async (email, name, freeMonths) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `You earned ${freeMonths} free Pro month${freeMonths > 1 ? 's' : ''}`,
      html: wrapper(`
        ${header('Referral Reward')}
        <h1 style="color: ${colors.textPrimary}; font-size: 22px; font-weight: 300; text-align: center; margin: 0 0 8px;">
          You earned a <span style="font-weight: 600; color: ${colors.emerald};">reward</span>
        </h1>
        <p style="color: ${colors.textSecondary}; font-size: 14px; text-align: center; margin: 0 0 28px;">Hi ${name}, your referral has signed up.</p>

        <div style="background: ${colors.surface}; border: 1px solid rgba(0,232,122,0.2); border-radius: 14px; padding: 28px; text-align: center; margin-bottom: 8px;">
          <p style="font-size: 30px; font-weight: 700; color: ${colors.emerald}; margin: 0 0 6px; letter-spacing: -0.5px;">
            ${freeMonths} Free Pro Month${freeMonths > 1 ? 's' : ''}
          </p>
          <p style="color: ${colors.textMuted}; font-size: 13px; margin: 0;">Added to your account automatically</p>
        </div>

        ${primaryButton('View Your Plan', `${APP_URL}/pricing`)}
      `),
    });
  } catch (err) {
    console.error('Referral reward email error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════
// MONTHLY REPORT
// ══════════════════════════════════════════════════════════
export const sendMonthlyReport = async (email, name, month, stats) => {
  try {
    const savings = (stats.income || 0) - (stats.expenses || 0);
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Your PesaMind report for ${month}`,
      html: wrapper(`
        ${header('Monthly Report')}
        <h1 style="color: ${colors.textPrimary}; font-size: 22px; font-weight: 300; text-align: center; margin: 0 0 6px;">${month}</h1>
        <p style="color: ${colors.textSecondary}; font-size: 13px; text-align: center; margin: 0 0 28px;">Hi ${name}, here's your monthly summary</p>

        ${statRow('Total Income', `KSH ${Number(stats.income || 0).toLocaleString()}`, colors.emerald)}
        ${statRow('Total Expenses', `KSH ${Number(stats.expenses || 0).toLocaleString()}`, colors.danger)}
        ${statRow('Net Savings', `KSH ${Number(savings).toLocaleString()}`, colors.purple)}
        ${statRow('Health Score', `${stats.score || 0}/100`, colors.warning)}

        ${primaryButton('View Full Dashboard', `${APP_URL}/dashboard`)}
      `),
    });
  } catch (err) {
    console.error('Monthly report error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════
// CORPORATE INVITE
// ══════════════════════════════════════════════════════════
export const sendCorporateInviteEmail = async (email, companyName, inviteLink) => {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `${companyName} has invited you to PesaMind`,
      html: wrapper(`
        ${header('Workplace Benefit')}
        <h1 style="color: ${colors.textPrimary}; font-size: 22px; font-weight: 300; text-align: center; margin: 0 0 16px;">
          You're <span style="font-weight: 600; color: ${colors.emerald};">invited</span>
        </h1>
        <p style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8; text-align: center; margin: 0 0 24px;">
          <strong style="color: ${colors.emerald};">${companyName}</strong> has added you to their PesaMind Financial Wellness programme &mdash; free AI-powered M-Pesa insights, fraud protection, and a credit score, as a workplace benefit.
        </p>

        <div style="background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 14px; padding: 20px 22px; margin-bottom: 24px;">
          <p style="color: ${colors.emerald}; font-weight: 600; font-size: 12px; letter-spacing: 0.5px; margin: 0 0 8px;">🔒 Your privacy is protected</p>
          <p style="color: ${colors.textSecondary}; font-size: 13px; line-height: 1.7; margin: 0;">
            This is your own personal PesaMind account. <strong style="color: ${colors.textPrimary};">${companyName} can never see your individual transactions, spending, or balance</strong> &mdash; they only receive anonymised, company-wide averages. Your financial data stays yours, even if you change jobs.
          </p>
        </div>

        ${primaryButton('Accept Invitation', inviteLink)}

        <p style="color: ${colors.textMuted}; font-size: 12px; text-align: center; margin: 20px 0 0; line-height: 1.6;">
          This link expires in 7 days. If you already have a PesaMind account, log in first, then click this link to activate your benefit.
        </p>
      `),
    });
    return true;
  } catch (err) {
    console.error('Failed to send corporate invite email:', err.message);
    return false;
  }
};