import { SkillRegistrationError } from "./errors.js";
import { mcpToolToSkill } from "./mcp.js";
import { parseWithSchema } from "./schema.js";
import type {
  McpSkillSource,
  RegistryOptions,
  Skill,
  SkillRegistry,
  SkillSource,
} from "./types.js";

export class InMemorySkillRegistry implements SkillRegistry {
  readonly #skills = new Map<string, Skill>();
  readonly #latestById = new Map<string, string>();
  readonly #options: RegistryOptions;

  constructor(options: RegistryOptions = {}) {
    this.#options = options;
  }

  register(skill: Skill): void {
    assertSkill(skill);

    const key = skillKey(skill.id, skill.version);

    if (this.#skills.has(key) && this.#options.allowOverwrite !== true) {
      throw new SkillRegistrationError(`Skill already registered: ${key}`);
    }

    this.#skills.set(key, skill);
    this.#latestById.set(skill.id, key);
  }

  get(id: string, lookup: { version?: string } = {}): Skill | undefined {
    if (lookup.version !== undefined) {
      return this.#skills.get(skillKey(id, lookup.version));
    }

    const latestKey = this.#latestById.get(id);
    return latestKey === undefined ? undefined : this.#skills.get(latestKey);
  }

  list(tags: string[] = []): Skill[] {
    const skills = [...this.#skills.values()];

    if (tags.length === 0) {
      return skills;
    }

    return skills.filter((skill) => {
      const skillTags = new Set(skill.tags ?? []);
      return tags.every((tag) => skillTags.has(tag));
    });
  }

  async load(source: SkillSource): Promise<void> {
    const skills = await skillsFromSource(source);

    for (const skill of skills) {
      this.register(skill);
    }
  }
}

export function createSkillRegistry(options?: RegistryOptions): SkillRegistry {
  return new InMemorySkillRegistry(options);
}

export async function executeSkill<I, O>(
  skill: Skill<I, O>,
  input: unknown,
  ctx: Parameters<Skill<I, O>["execute"]>[1],
): Promise<O> {
  const parsedInput = parseWithSchema(skill.inputSchema, input, "input");
  const output = await skill.execute(parsedInput, ctx);
  return parseWithSchema(skill.outputSchema, output, "output");
}

function assertSkill(skill: Skill): void {
  if (skill.id.trim().length === 0) {
    throw new SkillRegistrationError("Skill id is required.");
  }

  if (skill.description.trim().length === 0) {
    throw new SkillRegistrationError("Skill description is required.");
  }

  if (typeof skill.execute !== "function") {
    throw new SkillRegistrationError(`Skill execute function is required: ${skill.id}`);
  }
}

async function skillsFromSource(source: SkillSource): Promise<Iterable<Skill>> {
  if (source.kind === "local") {
    return typeof source.skills === "function" ? await source.skills() : source.skills;
  }

  if (source.kind === "loader") {
    return source.load();
  }

  if (source.kind === "remote") {
    const payload = await source.fetcher(String(source.url));
    return source.decode(payload);
  }

  return mcpSkillsFromSource(source);
}

async function mcpSkillsFromSource(source: McpSkillSource): Promise<Skill[]> {
  const tools = typeof source.tools === "function" ? await source.tools() : source.tools;
  return [...tools].map((tool) => mcpToolToSkill(tool, source.namespace));
}

function skillKey(id: string, version?: string): string {
  return version === undefined ? id : `${id}@${version}`;
}
