const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Lazy-load supabase so a missing package doesn't crash the whole function
function getSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch(e) { return null; }
}

const FREE_DAILY_LIMIT = 10;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cert, desc, previousQuestions = [], userId, plan } = req.body || {};
  if (!cert) return res.status(400).json({ error: 'cert is required' });

  // Check limits if userId provided
  if (userId) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        const today = new Date().toISOString().split('T')[0];
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, questions_today, last_reset_date')
          .eq('id', userId)
          .single();

        if (profile) {
          if (profile.last_reset_date !== today) {
            await supabase.from('profiles').update({ questions_today: 0, last_reset_date: today }).eq('id', userId);
            profile.questions_today = 0;
          }
          if (profile.plan === 'free' && profile.questions_today >= FREE_DAILY_LIMIT) {
            return res.status(403).json({ error: 'Daily limit reached', limit: FREE_DAILY_LIMIT, plan: 'free' });
          }
          await supabase.from('profiles').update({ questions_today: (profile.questions_today||0) + 1 }).eq('id', userId);
        }
      }
    } catch (e) {
      console.error('Profile check error:', e.message);
    }
  }

  try {
    const prevList = (previousQuestions||[]).slice(-5).map(q => '- ' + q).join('\n');
    const prompt = `You are a strict ${cert} exam question generator.
Generate exactly 1 exam-style multiple-choice question for ${cert}.
Topic area: ${desc || cert}
${prevList ? 'Do NOT repeat these recent questions:\n' + prevList : ''}
Return ONLY valid JSON, no markdown, no backticks:
{"question":"exam question text","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"2-3 sentence explanation of why the correct answer is right and others are wrong"}
Rules: correct is the 0-based index. Make it realistic exam difficulty. Specific to ${cert} exam content.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text.trim().replace(/```json|\n```|```/g, '').trim();
    const question = JSON.parse(text);

    if (!question.question || !question.options || question.correct === undefined) {
      throw new Error('Invalid question format from AI');
    }

    return res.status(200).json(question);
  } catch (err) {
    console.error('Question generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate question', details: err.message });
  }
};