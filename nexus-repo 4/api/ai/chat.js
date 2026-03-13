// api/ai/chat.js — Claude-powered trading AI agent
const Anthropic = require('@anthropic-ai/sdk');
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  if (!process.env.ANTHROPIC_API_KEY) {
    return err(res, 'AI agent not configured. Add ANTHROPIC_API_KEY to environment variables.', 503);
  }

  const { message, conversation_id, context } = req.body || {};
  if (!message?.trim()) return err(res, 'Message required');

  const db = getPool();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Load conversation history
    let conv = null;
    if (conversation_id) {
      const { rows } = await db.query(
        'SELECT * FROM ai_conversations WHERE id=$1 AND user_id=$2',
        [conversation_id, user.id]
      );
      conv = rows[0] || null;
    }

    const history = conv?.messages
      ? (typeof conv.messages === 'string' ? JSON.parse(conv.messages) : conv.messages)
      : [];

    history.push({ role: 'user', content: message.trim() });

    const systemPrompt = `You are NEXUS AI, an institutional-grade trading intelligence assistant embedded in the NEXUS trading platform. You have deep expertise in:
- Forex, CFD, commodities, indices, and cryptocurrency trading
- Technical analysis (candlestick patterns, Elliott Wave, Fibonacci, VSA, ICT concepts)
- Risk management, position sizing, Kelly criterion, portfolio correlation
- Trading psychology, cognitive bias, and discipline frameworks
- MetaTrader 5 platform and MQL5 programming
- Broker server infrastructure and connectivity
- Portfolio analytics and performance metrics (drawdown, Sharpe ratio, profit factor)
- Copy trading strategies and risk allocation

${context?.account ? `\nAccount context: Balance $${context.account.balance}, Equity $${context.account.equity}, Open trades: ${context.account.open_trades || 0}` : ''}
${context?.recent_trades?.length ? `\nRecent trade performance: ${context.recent_trades.slice(0,3).map(t => `${t.symbol} ${t.direction} P&L:$${parseFloat(t.profit||0).toFixed(2)}`).join(', ')}` : ''}

Provide actionable, specific insights. When discussing strategies, always include risk management considerations. Use markdown formatting when it improves clarity. Be direct and professional — you are speaking to traders who want concrete answers, not disclaimers.

Today's date: ${new Date().toISOString().slice(0,10)}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: history.map(m => ({ role: m.role, content: m.content }))
    });

    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });

    // Persist conversation
    let savedId = conversation_id;
    if (conv) {
      await db.query(
        'UPDATE ai_conversations SET messages=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify(history), conv.id]
      );
    } else {
      const title = message.trim().slice(0, 80);
      const { rows } = await db.query(
        'INSERT INTO ai_conversations(user_id, title, messages) VALUES($1,$2,$3) RETURNING id',
        [user.id, title, JSON.stringify(history)]
      );
      savedId = rows[0].id;
    }

    return ok(res, { reply, conversation_id: savedId });
  } catch (e) {
    console.error('AI chat error:', e);
    if (e.status === 401) return err(res, 'Invalid Anthropic API key', 503);
    return err(res, 'AI service error: ' + e.message, 500);
  }
}
