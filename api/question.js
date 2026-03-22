const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cert, desc, previousQuestions } = req.body || {};
  if (!cert) return res.status(400).json({ error: 'cert is required' });

  try {
    const prompt = `You are a strict ${cert} exam question generator. Generate exactly 1 exam-style multiple-choice question for ${cert}. Topic area: ${desc||cert}. Return ONLY valid JSON, no markdown: {"question":"text","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"2-3 sentence explanation"}. correct is 0-based index. Realistic exam difficulty.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text.trim().replace(/```json|```/g,'').trim();
    const question = JSON.parse(text);
    return res.status(200).json(question);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate question', details: err.message });
  }
};
