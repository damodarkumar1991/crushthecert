const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, questions_today, created_at, stripe_customer_id')
      .eq('id', user.id)
      .single();

    return res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || '',
      plan: profile?.plan || 'free',
      questions_today: profile?.questions_today || 0,
      member_since: profile?.created_at || user.created_at
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};