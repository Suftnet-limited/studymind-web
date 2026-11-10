// Harness-level limits for CONTROLLED live-OpenAI runs. Complements the budget proxy (which caps provider calls and
// dollars): this caps what the TEST RUN itself may do, and refuses to start unless every control is verifiably in place.
//   const b = await LiveBudget.start({ proxyUrl });  await b.generation(() => fetch(...));  await b.upload(() => ...)
// Fails CLOSED: anything unverifiable (proxy down, limits looser than agreed, dirty ledger) aborts before a paid call.
export const AGREED = { maxGenerations: 20, maxUploads: 5, maxUsd: 5, concurrency: 1 };

export class BudgetError extends Error {}

export class LiveBudget {
  constructor(proxyUrl, limits = AGREED, fetchImpl = fetch) {
    this.proxyUrl = proxyUrl; this.limits = limits; this.fetch = fetchImpl;
    this.generations = 0; this.uploads = 0; this.chain = Promise.resolve();
  }

  // resume: continue a run whose earlier stage already used the proxy (ledger kept; ceilings and caps still verified).
  static async start({ proxyUrl, limits = AGREED, fetchImpl = fetch, resume = false } = {}) {
    const fail = (m) => { throw new BudgetError(`live test refused to start: ${m}`); };
    if (!proxyUrl) fail('no budget proxy configured');
    let l;
    try {
      const r = await fetchImpl(`${proxyUrl}/__ledger`);
      if (!r.ok) fail(`proxy ledger returned ${r.status}`);
      l = await r.json();
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      fail('budget proxy is not reachable');
    }
    if (!(l.limits.maxUsd <= limits.maxUsd)) fail(`proxy dollar ceiling ${l.limits.maxUsd} is above the agreed $${limits.maxUsd}`);
    if (l.limits.concurrency !== 1) fail('proxy concurrency is not 1');
    if (!(l.limits.maxChat > 0 && l.limits.maxEmbed > 0)) fail('proxy call limits are not set');
    if (!resume && l.counts.chat + l.counts.embed > 0) fail('proxy ledger is not empty; clear it so usage reports are for this run only');
    if (l.spentUsd >= limits.maxUsd) fail(`already spent $${l.spentUsd} of the $${limits.maxUsd} ceiling`);
    return new LiveBudget(proxyUrl, limits, fetchImpl);
  }

  // Serialised (concurrency 1) and counted BEFORE the call, so a failed or retried call still consumes allowance.
  #run(kind, fn) {
    const max = kind === 'generation' ? this.limits.maxGenerations : this.limits.maxUploads;
    const next = this.chain.then(async () => {
      const used = kind === 'generation' ? this.generations : this.uploads;
      if (used >= max) throw new BudgetError(`${kind} limit of ${max} reached; refusing further ${kind}s`);
      if (kind === 'generation') this.generations++; else this.uploads++;
      return fn();
    });
    this.chain = next.catch(() => {});
    return next;
  }
  generation(fn) { return this.#run('generation', fn); }
  upload(fn) { return this.#run('upload', fn); }

  async report() {
    const l = await (await this.fetch(`${this.proxyUrl}/__ledger`)).json();
    return {
      generationsRequested: this.generations, uploads: this.uploads, providerCalls: l.counts, refusedByProxy: l.refused,
      inputTokens: l.inputTokens, outputTokens: l.outputTokens, estimatedUsd: l.spentUsd, byModel: l.byModel,
      calls: l.calls.map(({ at, kind, model, inputTokens, outputTokens, usd, status, ms }) => ({ at, kind, model, inputTokens, outputTokens, usd, status, ms })),
    };
  }
}
