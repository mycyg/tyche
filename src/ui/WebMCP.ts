import type { Action, Run } from "../game/types";
import { publicState } from "../game/engine";
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
}
export function registerGameTools(
  get: () => Run | null,
  dispatch: (action: Action) => Run | null,
): () => void {
  const context = (
    document as unknown as {
      modelContext?: {
        registerTool(
          tool: Tool,
          options: { signal: AbortSignal },
        ): void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = (tool: Tool) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* optional browser proposal */
    }
  };
  const result = () => {
    const r = get();
    return r ? publicState(r) : { phase: "title" };
  };
  register({
    name: "read_tyche_turn",
    description:
      "Read the current visible Tyche game state and available choices. Does not reveal future outcomes or hidden hazards before the tribunal.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: result,
  });
  register({
    name: "confirm_tyche_choice",
    description:
      "Commit a currently available game choice by its exact ID. This spends in-game resources, rolls any required check, and saves the result. Use only for a choice the player wants to make.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      if (
        !input ||
        typeof input !== "object" ||
        !("id" in input) ||
        typeof input.id !== "string" ||
        Object.keys(input).length !== 1
      )
        throw new Error("Expected a choice ID.");
      const before = get();
      if (!before || before.phase !== "play")
        throw new Error("No choice is available.");
      const after = dispatch({ type: "choose", id: input.id });
      if (after === before) throw new Error("Choice ID is not available.");
      return result();
    },
  });
  register({
    name: "advance_tyche_turn",
    description:
      "Acknowledge the current resolved roll or result, or select an offered debuff. Advances the same saved game state as the visible buttons; never starts or replaces a run.",
    inputSchema: {
      type: "object",
      properties: {
        action: { enum: ["continue", "ack-roll", "debuff"] },
        id: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      if (
        !input ||
        typeof input !== "object" ||
        !("action" in input) ||
        !["continue", "ack-roll", "debuff"].includes(String(input.action))
      )
        throw new Error("Unsupported action.");
      const x = input as {
        action: "continue" | "ack-roll" | "debuff";
        id?: string;
      };
      if (x.action === "debuff" && typeof x.id !== "string")
        throw new Error("Expected an offered debuff ID.");
      const before = get(),
        after = dispatch(
          x.action === "debuff"
            ? { type: "debuff", id: x.id! }
            : { type: x.action },
        );
      if (after === before)
        throw new Error("Action is unavailable in this phase.");
      return result();
    },
  });
  return () => lifecycle.abort();
}
