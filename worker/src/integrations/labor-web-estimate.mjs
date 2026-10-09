import {
  WEB_ESTIMATE_LABEL,
  buildLaborWebSearchQuery,
  mapWebLaborEstimateToEstimateLine,
  summarizeWebLaborEstimate,
} from '../../../src/modules/labor-guide.js';
import { HttpError } from '../http.mjs';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Query a configured web search provider. Currently Brave Search via
 * WORKER secret LABOR_WEB_SEARCH_API_KEY (optional LABOR_WEB_SEARCH_PROVIDER=brave).
 * Never invents results — empty/disabled returns a structured miss.
 */
export async function searchLaborWeb(env, {
  year, make, model, engine, operation, keyword, vin,
} = {}, { fetcher = fetch } = {}) {
  const apiKey = String(env.LABOR_WEB_SEARCH_API_KEY || env.BRAVE_SEARCH_API_KEY || '').trim();
  const provider = String(env.LABOR_WEB_SEARCH_PROVIDER || 'brave').trim().toLowerCase();
  if (!apiKey) {
    return {
      found: false,
      label: WEB_ESTIMATE_LABEL,
      message: 'no estimate found',
      reason: 'search_not_configured',
      sourceCount: 0,
      sources: [],
    };
  }
  if (provider !== 'brave') {
    return {
      found: false,
      label: WEB_ESTIMATE_LABEL,
      message: 'no estimate found',
      reason: 'unsupported_search_provider',
      sourceCount: 0,
      sources: [],
    };
  }

  const query = buildLaborWebSearchQuery({
    year, make, model, engine, operation: operation || keyword, keyword,
  });
  if (!query || query.split(' ').length < 3) {
    return {
      found: false,
      label: WEB_ESTIMATE_LABEL,
      message: 'no estimate found',
      reason: 'insufficient_query',
      sourceCount: 0,
      sources: [],
    };
  }

  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('count', '8');
  const response = await fetcher(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });
  if (!response.ok) {
    throw new HttpError(502, `Labor web search failed (${response.status})`);
  }
  const payload = await response.json().catch(() => ({}));
  const results = Array.isArray(payload.web?.results) ? payload.web.results : [];
  const snippets = results.map(item => [item.title, item.description, item.extra_snippets?.join(' ')].filter(Boolean).join(' '));
  const sources = results.map(item => ({ url: item.url, title: item.title || item.url })).filter(item => item.url);

  let summary = summarizeWebLaborEstimate({
    description: [year, make, model, operation || keyword].filter(Boolean).join(' '),
    snippets,
    sources,
  });

  // Optional Workers AI assist: only refine extraction when snippets exist and
  // regex found nothing. Still fail closed if the model returns no numbers.
  if (!summary.found && snippets.length && env.AI && typeof env.AI.run === 'function') {
    try {
      const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'Extract automotive repair labor times in hours from the text. Reply with JSON only: {"hours":[number,...]}. If none, {"hours":[]}. Never invent times.',
          },
          {
            role: 'user',
            content: `Vehicle VIN hint: ${vin || 'n/a'}\nJob: ${operation || keyword || ''}\nText:\n${snippets.slice(0, 6).join('\n---\n')}`,
          },
        ],
      });
      const raw = typeof aiResult === 'string' ? aiResult : (aiResult?.response || JSON.stringify(aiResult));
      const match = String(raw).match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const hours = Array.isArray(parsed.hours) ? parsed.hours : [];
        const hourSnippets = hours.map(value => `${value} hours`).join(' ');
        summary = summarizeWebLaborEstimate({
          description: summary.description || [year, make, model, operation || keyword].filter(Boolean).join(' '),
          snippets: [...snippets, hourSnippets],
          sources,
        });
      }
    } catch {
      // Keep regex miss; do not invent.
    }
  }

  if (!summary.found) {
    return {
      found: false,
      label: WEB_ESTIMATE_LABEL,
      message: 'no estimate found',
      reason: 'no_usable_figures',
      query,
      sourceCount: sources.length,
      sources,
    };
  }

  return {
    ...summary,
    query,
    provider: 'web_estimate',
    notBookTime: true,
  };
}

export function webEstimateResponsePayload(estimate, { laborRate = 0 } = {}) {
  if (!estimate?.found) {
    return {
      connected: false,
      provider: 'web_estimate',
      label: WEB_ESTIMATE_LABEL,
      found: false,
      message: estimate?.message || 'no estimate found',
      reason: estimate?.reason || null,
      query: estimate?.query || null,
      sourceCount: estimate?.sourceCount || 0,
      sources: estimate?.sources || [],
      lines: [],
      groups: [],
      operations: [],
    };
  }
  const line = mapWebLaborEstimateToEstimateLine(estimate, { laborRate }, 0);
  return {
    connected: false,
    provider: 'web_estimate',
    label: WEB_ESTIMATE_LABEL,
    found: true,
    notBookTime: true,
    message: WEB_ESTIMATE_LABEL,
    averageHours: estimate.averageHours,
    minHours: estimate.minHours,
    maxHours: estimate.maxHours,
    sampleCount: estimate.sampleCount,
    sourceCount: estimate.sourceCount,
    sources: estimate.sources,
    query: estimate.query || null,
    lines: [line],
    groups: [],
    operations: [],
  };
}
