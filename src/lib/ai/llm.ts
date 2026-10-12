import "server-only";

/**
 * Provider-agnostic LLM runner with tool calling.
 *
 * Configure via environment variables (checked in this order):
 *   1. AI_API_KEY (+ optional AI_BASE_URL, AI_MODEL)      — any OpenAI-compatible API
 *      (Groq, OpenRouter, Together, local Ollama/LM Studio, …)
 *   2. OPENAI_API_KEY (+ optional OPENAI_BASE_URL, OPENAI_MODEL)
 *   3. ANTHROPIC_API_KEY (+ optional ANTHROPIC_MODEL)
 *
 * When nothing is configured the assistants fall back to their built-in
 * deterministic engines, so the UI keeps working without a key.
 */

export type AiTool = {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters (possibly empty). */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

export type AiChatMessage = { role: "user" | "assistant"; content: string };

type AiProvider = "openai" | "anthropic" | "openai-compatible";

type AiConfig = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const REQUEST_TIMEOUT_MS = 30_000;

function resolveConfig(): AiConfig | null {
  const customKey = process.env.AI_API_KEY?.trim();
  if (customKey) {
    return {
      provider: "openai-compatible",
      apiKey: customKey,
      baseUrl: (process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      baseUrl: (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, ""),
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-latest",
    };
  }

  return null;
}

/** Whether a live LLM is configured, and which one. */
export function aiStatus(): {
  enabled: boolean;
  provider: AiProvider | null;
  model: string | null;
} {
  const cfg = resolveConfig();
  return { enabled: cfg !== null, provider: cfg?.provider ?? null, model: cfg?.model ?? null };
}

type Json = Record<string, unknown>;

async function fetchJson(url: string, init: RequestInit): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return (await res.json()) as Json;
  } finally {
    clearTimeout(timer);
  }
}

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

async function executeTool(
  tools: AiTool[],
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}"` };
  try {
    return await tool.execute(args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

/**
 * Run a system-prompted conversation with tools until the model produces a
 * final answer (or rounds run out). Returns null when no provider is
 * configured or the call fails — callers fall back to their local engine.
 */
export async function runAiToolLoop(opts: {
  system: string;
  messages: AiChatMessage[];
  tools: AiTool[];
  maxRounds?: number;
}): Promise<string | null> {
  const cfg = resolveConfig();
  if (!cfg) return null;

  try {
    return cfg.provider === "anthropic"
      ? await runAnthropic(cfg, opts)
      : await runOpenAICompatible(cfg, opts);
  } catch (err) {
    console.error("[ai] tool loop failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function runOpenAICompatible(cfg: AiConfig, opts: {
  system: string;
  messages: AiChatMessage[];
  tools: AiTool[];
  maxRounds?: number;
}): Promise<string | null> {
  const maxRounds = opts.maxRounds ?? 4;
  const messages: Json[] = [
    { role: "system", content: opts.system },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let round = 0; round < maxRounds; round++) {
    const data = await fetchJson(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: 900,
        temperature: 0.2,
      }),
    });

    const choice = (data["choices"] as Json[] | undefined)?.[0]?.["message"] as Json | undefined;
    if (!choice) return null;

    const calls = (choice["tool_calls"] as Json[] | undefined) ?? [];
    const text = typeof choice["content"] === "string" ? (choice["content"] as string).trim() : "";

    if (calls.length === 0) return text.length > 0 ? text : null;

    messages.push(choice);
    for (const call of calls) {
      const fn = call["function"] as Json | undefined;
      const name = typeof fn?.["name"] === "string" ? (fn["name"] as string) : "";
      const result = await executeTool(opts.tools, name, safeParseArgs(fn?.["arguments"]));
      messages.push({
        role: "tool",
        tool_call_id: call["id"],
        content: JSON.stringify(result ?? null),
      });
    }
  }
  return null;
}

async function runAnthropic(cfg: AiConfig, opts: {
  system: string;
  messages: AiChatMessage[];
  tools: AiTool[];
  maxRounds?: number;
}): Promise<string | null> {
  const maxRounds = opts.maxRounds ?? 4;
  const messages: Json[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let round = 0; round < maxRounds; round++) {
    const data = await fetchJson(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        system: opts.system,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    const blocks = (data["content"] as Json[] | undefined) ?? [];
    const text = blocks
      .filter((b) => b["type"] === "text")
      .map((b) => b["text"] as string)
      .join("\n")
      .trim();
    const calls = blocks.filter((b) => b["type"] === "tool_use");

    if (calls.length === 0) return text.length > 0 ? text : null;

    messages.push({ role: "assistant", content: blocks });
    const results: Json[] = [];
    for (const call of calls) {
      const name = typeof call["name"] === "string" ? (call["name"] as string) : "";
      const input =
        typeof call["input"] === "object" && call["input"] !== null
          ? (call["input"] as Record<string, unknown>)
          : {};
      const result = await executeTool(opts.tools, name, input);
      results.push({
        type: "tool_result",
        tool_use_id: call["id"],
        content: JSON.stringify(result ?? null),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return null;
}
