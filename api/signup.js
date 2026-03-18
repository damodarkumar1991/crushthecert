const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!A1',
      email_confirm: true,
      user_metadata: { name: name || '' }
    });

    if (error && !error.message.includes('already registered') && !error.message.includes('already been registered')) {
      console.error('Supabase signup error:', error);
      return res.status(400).json({ error: error.message });
    }

    const userId = data?.user?.id;

    // Send welcome email via Resend
    try {
      await resend.emails.send({
        from: 'CrushTheCert <hello@crushthecert.com>',
        to: email,
        subject: 'Welcome to CrushTheCert — your first AI questions are ready',
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e0ddd8;border-radius:12px;overflow:hidden">
        
        <!-- Header -->
        <tr><td style="background:#0a0a0a;padding:28px 40px">
          <p style="margin:0;font-family:monospace;font-size:15px;font-weight:600;color:#fafaf8;letter-spacing:-0.02em">CrushTheCert</p>
        </td></tr>
        
        <!-- Body -->
        <tr><td style="padding:40px">
          <h1 style="margin:0 0 12px;font-size:28px;font-weight:900;color:#0a0a0a;line-height:1.1">
            You're in, ${name || 'there'}! 🎯
          </h1>
          <p style="margin:0 0 24px;font-size:16px;color:#888580;line-height:1.7">
            Your free CrushTheCert account is ready. You get <strong style="color:#0a0a0a">10 AI-generated questions per day</strong> across all 8 cert tracks — completely free, forever.
          </p>
          
          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
            <tr><td style="background:#0a0a0a;border-radius:8px">
              <a href="https://crushthecert.com/#demo" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:500;color:#fafaf8;text-decoration:none">
                Start practising now →
              </a>
            </td></tr>
          </table>

          <!-- What you get -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ee;border-radius:8px;margin-bottom:32px">
            <tr><td style="padding:24px">
              <p style="margin:0 0 16px;font-size:12px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:#888580">Your free plan includes</p>
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:14px;color:#0a0a0a">✓ &nbsp;10 AI questions per day</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#0a0a0a">✓ &nbsp;All 8 cert tracks (PSM, PMP, AWS, Salesforce, SAFe, CSM + more)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#0a0a0a">✓ &nbsp;Basic score tracking</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#888580">— &nbsp;AI explanations (Pro)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#888580">— &nbsp;Weak spot analysis (Pro)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#888580">— &nbsp;Exam simulator (Pro)</td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Upgrade nudge -->
          <p style="margin:0 0 8px;font-size:14px;color:#888580;line-height:1.6">
            Want unlimited questions, full AI explanations and a study coach? 
            <a href="https://crushthecert.com/#pricing" style="color:#0a0a0a;font-weight:500">Upgrade to Pro from A$19.99/month →</a>
          </p>
        </td></tr>
        
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #e0ddd8">
          <p style="margin:0;font-size:12px;font-family:monospace;color:#888580">
            © 2026 CrushTheCert · <a href="https://crushthecert.com" style="color:#888580">crushthecert.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
      // Don't fail signup if email fails
    }

    return res.status(200).json({ success: true, userId });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
};