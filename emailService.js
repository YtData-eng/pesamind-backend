import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendBudgetAlert = async (email, name, category, spent, budget) => {
  try {
    await transporter.sendMail({
      from: `PesaMind <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `⚠️ Budget Alert: ${category} spending exceeded`,
      html: `
        <div style="font-family: system-ui; max-width: 500px; margin: 0 auto; background: #050F09; color: white; padding: 32px; border-radius: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
            <div style="width: 40px; height: 40px; background: #00E87A; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">₿</div>
            <h2 style="margin: 0; color: white;">PesaMind Alert</h2>
          </div>
          <p style="color: rgba(255,255,255,0.7);">Hi ${name},</p>
          <div style="background: rgba(255,77,109,0.1); border: 1px solid rgba(255,77,109,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #FF4D6D; font-weight: 700; margin: 0 0 8px;">⚠️ Budget Exceeded</p>
            <p style="color: white; margin: 0;">You've spent <strong style="color: #FF4D6D;">KSH ${spent.toLocaleString()}</strong> on <strong>${category}</strong> this month, exceeding your budget of <strong>KSH ${budget.toLocaleString()}</strong>.</p>
          </div>
          <a href="https://pesamind-frontend-f77z.vercel.app/budgets" style="display: inline-block; background: #00E87A; color: #000; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700;">View Budgets →</a>
          <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 24px;">PesaMind · Built for Kenya 🇰🇪</p>
        </div>
      `,
    });
    console.log(`Budget alert sent to ${email}`);
  } catch (err) {
    console.error('Email error:', err.message);
  }
};

export const sendFraudAlert = async (email, name, description, amount) => {
  try {
    await transporter.sendMail({
      from: `PesaMind <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `🚨 Fraud Alert: Suspicious transaction detected`,
      html: `
        <div style="font-family: system-ui; max-width: 500px; margin: 0 auto; background: #050F09; color: white; padding: 32px; border-radius: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
            <div style="width: 40px; height: 40px; background: #00E87A; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">₿</div>
            <h2 style="margin: 0; color: white;">PesaMind Security Alert</h2>
          </div>
          <p style="color: rgba(255,255,255,0.7);">Hi ${name},</p>
          <div style="background: rgba(255,77,109,0.1); border: 1px solid rgba(255,77,109,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #FF4D6D; font-weight: 700; margin: 0 0 8px;">🚨 Suspicious Transaction Detected</p>
            <p style="color: white; margin: 0 0 8px;">${description}</p>
            <p style="color: #FF4D6D; font-weight: 700; margin: 0;">Amount: KSH ${amount.toLocaleString()}</p>
          </div>
          <p style="color: rgba(255,255,255,0.7);">If you did not authorize this, please check your M-Pesa account immediately.</p>
          <a href="https://pesamind-frontend-f77z.vercel.app/fraud" style="display: inline-block; background: #FF4D6D; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; margin-top: 16px;">View Fraud Alerts →</a>
          <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 24px;">PesaMind · Built for Kenya 🇰🇪</p>
        </div>
      `,
    });
    console.log(`Fraud alert sent to ${email}`);
  } catch (err) {
    console.error('Email error:', err.message);
  }
};

export const sendWelcomeEmail = async (email, name) => {
  try {
    await transporter.sendMail({
      from: `PesaMind <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `🎉 Welcome to PesaMind, ${name}!`,
      html: `
        <div style="font-family: system-ui; max-width: 500px; margin: 0 auto; background: #050F09; color: white; padding: 32px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="width: 60px; height: 60px; background: #00E87A; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 16px;">₿</div>
            <h1 style="margin: 0; color: white;">Welcome to PesaMind!</h1>
          </div>
          <p style="color: rgba(255,255,255,0.7);">Hi ${name}, you're now part of a smarter way to manage your M-Pesa finances.</p>
          <div style="background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #00E87A; font-weight: 700; margin: 0 0 12px;">Get started in 3 steps:</p>
            <p style="color: white; margin: 0 0 8px;">1️⃣ Download your M-Pesa statement from MySafaricom</p>
            <p style="color: white; margin: 0 0 8px;">2️⃣ Upload the PDF to PesaMind</p>
            <p style="color: white; margin: 0;">3️⃣ Get AI insights on your spending</p>
          </div>
          <a href="https://pesamind-frontend-f77z.vercel.app/statements" style="display: inline-block; background: #00E87A; color: #000; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 16px;">Upload Your First Statement →</a>
          <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">PesaMind · Built for Kenya 🇰🇪 · <a href="#" style="color: rgba(255,255,255,0.3);">Unsubscribe</a></p>
        </div>
      `,
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error('Email error:', err.message);
  }
};