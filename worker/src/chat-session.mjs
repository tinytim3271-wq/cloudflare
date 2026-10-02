import {
  calculateTextCost,
  recordAiUsage,
  runAnthropicTurn,
} from './ai.mjs';
import { HttpError, json, requestJson } from './http.mjs';

const MAX_STORED_MESSAGES = 20;

export class AiChatSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const shopId = request.headers.get('X-MechPro-Shop-Id');
    const userId = request.headers.get('X-MechPro-User-Id');
    const sessionId = request.headers.get('X-MechPro-Ai-Session-Id');
    if (!shopId || !userId || !sessionId) throw new HttpError(401, 'Authenticated shop context is required');

    const ownerShopId = await this.state.storage.get('shopId');
    if (ownerShopId && ownerShopId !== shopId) throw new HttpError(403, 'Chat session belongs to another shop');
    if (!ownerShopId) await this.state.storage.put('shopId', shopId);

    const body = await requestJson(request);
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!message) throw new HttpError(400, 'A message is required');
    const storedHistory = await this.state.storage.get('history');
    const history = Array.isArray(storedHistory) && storedHistory.length
      ? storedHistory
      : Array.isArray(body.history) ? body.history : [];
    const result = await runAnthropicTurn(this.env, {
      shopId,
      message,
      history,
      requestedModel: body.model,
      autoEscalate: body.autoEscalate === true,
    });
    const costs = calculateTextCost(this.env, result.family, result.inputTokens, result.outputTokens);
    await recordAiUsage(this.env, {
      shopId,
      userId,
      channel: 'text',
      provider: 'anthropic',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ...costs,
      metadata: { routingReason: result.routingReason, sessionId, source: 'assistant' },
    });
    const nextHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: result.text },
    ].slice(-MAX_STORED_MESSAGES);
    await this.state.storage.put('history', nextHistory);
    await this.state.storage.put('updatedAt', new Date().toISOString());
    return json({
      message: result.text,
      model: result.model,
      modelFamily: result.family,
      routingReason: result.routingReason,
      sessionId,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
  }
}
