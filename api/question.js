export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { cert, desc, previousQuestions } = req.body;
  if (!cert || !desc) return res.status(400).json({ error: 'Missing cert or desc' });
  const prompt = `You are a strict ${cert} exam question generator. Generate exactly 1 exam-style multiple-choice question for the ${cert} certification. Topic context: ${desc}. Return ONLY valid JSON, no markdown: {"question":"text","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"why correct"}`;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'AI error' });
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const question = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(question);
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
