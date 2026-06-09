import { SkillValidationError } from "./errors.js";
import type { SkillSchema } from "./types.js";

export const passthroughSchema = {
  parse: <T>(value: T): T => value,
} satisfies SkillSchema<unknown>;

export function parseWithSchema<T>(
  schema: SkillSchema<T>,
  value: unknown,
  label: "input" | "output",
): T {
  if (typeof schema.safeParse === "function") {
    const result = schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new SkillValidationError(`Invalid skill ${label}.`, result.error);
  }

  if (typeof schema.parse === "function") {
    try {
      return schema.parse(value);
    } catch (error) {
      throw new SkillValidationError(`Invalid skill ${label}.`, error);
    }
  }

  throw new SkillValidationError(`Skill ${label} schema cannot parse values.`, schema);
}
