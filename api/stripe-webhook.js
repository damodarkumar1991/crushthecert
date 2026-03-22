const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const raw = await getRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.payment_succeeded') {
    const obj = event.data.object;
    const email = obj.customer_email || obj.customer_details?.email;
    const customerId = obj.customer;
    const subscriptionId = obj.subscription;

    if (!email) {
      console.error('No email in webhook event');
      return res.status(200).json({ received: true });
    }

    try {
      // 1. Check if user already exists in Supabase Auth
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      let existingUser = existingUsers?.users?.find(u => u.email === email);

      let userId;
      if (existingUser) {
        // User exists — just upgrade their plan
        userId = existingUser.id;
      } else {
        // New user — create account in Supabase
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!A1'
        });
        if (createErr) {
          console.error('Create user error:', createErr);
        } else {
          userId = newUser.user.id;
        }
      }

      // 2. Upsert profile as Pro
      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          email,
          plan: 'pro',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId
        }, { onConflict: 'id' });
      }

      // 3. Send magic link so they can enter the portal immediately
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: 'https://crushthecert.com/portal' }
      });

      if (!linkErr && linkData?.properties?.action_link) {
        const magicLink = linkData.properties.action_link;
        await resend.emails.send({
          from: 'CrushTheCert <hello@crushthecert.com>',
          to: email,
          subject: 'You are now Pro — enter your portal',
          html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:40px 0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e0ddd8;border-radius:12px;overflow:hidden">
<tr><td style="background:#0a0a0a;padding:24px 32px"><p style="margin:0;font-family:monospace;font-size:14px;color:#fafaf8;font-weight:500">CrushTheCert</p></td></tr>
<tr><td style="padding:36px 32px">
<h2 style="margin:0 0 12px;font-size:26px;font-weight:900;color:#0a0a0a;font-family:Georgia,serif">Welcome to Pro!</h2>
<p style="margin:0 0 8px;font-size:15px;color:#888580;line-height:1.6">Payment confirmed. Your Pro account is active.</p>
<p style="margin:0 0 28px;font-size:15px;color:#888580;line-height:1.6">Click below to enter your portal — unlimited questions, full AI explanations, and all Pro features are ready for you.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
<tr><td style="background:#0a0a0a;border-radius:8px">
<a href="${magicLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:500;color:#fafaf8;text-decoration:none">Enter my Pro portal →</a>
</td></tr></table>
<p style="margin:0;font-size:12px;color:#888580">This link expires in 1 hour. If you need a new one, go to crushthecert.com/login</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e0ddd8"><p style="margin:0;font-size:11px;font-family:monospace;color:#888580">© 2026 CrushTheCert · crushthecert.com</p></td></tr>
</table></td></tr></table>
</body></html>`
        });
      }

      console.log('Pro upgrade complete for:', email);
    } catch (err) {
      console.error('Upgrade error:', err.message);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer;
    // Downgrade to free
    await supabase.from('profiles').update({ plan: 'free', stripe_subscription_id: null })
      .eq('stripe_customer_id', customerId);
    console.log('Downgraded customer:', customerId);
  }

  res.status(200).json({ received: true });
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}