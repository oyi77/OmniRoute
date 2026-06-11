/**
 * Smart Router Plugin — advanced example intercepting Model Selection.
 *
 * @module smart-router
 */

export function onRequest(ctx) {
  const config = ctx?.config || {};
  // Count approx tokens (1 token ~ 4 chars)
  const prompt = ctx?.body?.messages?.map(m => m.content).join(" ") || "";
  if (ctx?.metadata) {
    ctx.metadata.__promptLength = prompt.length;
  }
}

/**
 * onModelSelect hook — override the model before it reaches the executor.
 */
export function onModelSelect(ctx, selectedModel) {
  const config = ctx?.config || {};
  const maxChars = (config.maxTokensForExpensiveModel || 1000) * 4;
  const promptLength = ctx?.metadata?.__promptLength || 0;

  // If the prompt is too long, we forcefully route to the cheaper fallback model
  if (promptLength > maxChars) {
    const fallback = config.fallbackModel || "gpt-3.5-turbo";
    console.log(\`[smart-router] Prompt length \${promptLength} > \${maxChars}. Rerouting \${selectedModel} -> \${fallback}\`);
    return fallback;
  }

  // Otherwise, return the originally selected model untouched
  return selectedModel;
}
