const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, password } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Sign up user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: password || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      email_confirm: true,
      user_metadata: { name: name || '' }
    });

    if (error) {
      // User already exists — still return success to avoid enumeration
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        return res.status(200).json({ success: true, message: 'Account ready' });
      }
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, userId: data.user.id });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
};