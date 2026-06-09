import { describe, expect, it } from "vitest";
import {
  SkillRegistrationError,
  SkillValidationError,
  createSkillRegistry,
  executeSkill,
  passthroughSchema,
  type Skill,
  type SkillContext,
  type SkillSchema,
} from "../src/index.js";

describe("skill registry", () => {
  it("registers and retrieves skills by id", () => {
    const registry = createSkillRegistry();
    const skill = echoSkill("search.web", ["search", "io"]);

    registry.register(skill);

    expect(registry.get("search.web")).toBe(skill);
  });

  it("prevents duplicate registrations by default", () => {
    const registry = createSkillRegistry();
    const skill = echoSkill("search.web");

    registry.register(skill);

    expect(() => registry.register(skill)).toThrow(SkillRegistrationError);
  });

  it("lists skills matching all requested tags", () => {
    const registry = createSkillRegistry();
    const searchSkill = echoSkill("search.web", ["search", "io"]);
    const writeSkill = echoSkill("file.write", ["write", "io", "destructive"]);

    registry.register(searchSkill);
    registry.register(writeSkill);

    expect(registry.list(["io"])).toEqual([searchSkill, writeSkill]);
    expect(registry.list(["io", "destructive"])).toEqual([writeSkill]);
  });

  it("allows multiple versions of the same skill to coexist", () => {
    const registry = createSkillRegistry();
    const v1 = echoSkill("search.web", ["search"], "1.0.0");
    const v2 = echoSkill("search.web", ["search"], "2.0.0");

    registry.register(v1);
    registry.register(v2);

    expect(registry.get("search.web", { version: "1.0.0" })).toBe(v1);
    expect(registry.get("search.web", { version: "2.0.0" })).toBe(v2);
    expect(registry.get("search.web")).toBe(v2);
  });

  it("loads local, remote, and loader sources", async () => {
    const registry = createSkillRegistry();
    const localSkill = echoSkill("local.echo");
    const remoteSkill = echoSkill("remote.echo");
    const loaderSkill = echoSkill("loader.echo");

    await registry.load({ kind: "local", skills: [localSkill] });
    await registry.load({
      kind: "remote",
      url: "https://skills.example/catalog.json",
      fetcher: async () => ({ skills: [remoteSkill] }),
      decode: (payload) => (payload as { skills: Skill[] }).skills,
    });
    await registry.load({ kind: "loader", load: async () => [loaderSkill] });

    expect(registry.get("local.echo")).toBe(localSkill);
    expect(registry.get("remote.echo")).toBe(remoteSkill);
    expect(registry.get("loader.echo")).toBe(loaderSkill);
  });

  it("adapts MCP tools into external IO skills", async () => {
    const registry = createSkillRegistry();

    await registry.load({
      kind: "mcp",
      namespace: "tools",
      tools: [
        {
          name: "readFile",
          description: "Read a file from the workspace.",
          call: async (input) => ({ input }),
          annotations: { readOnlyHint: true },
        },
      ],
    });

    const skill = registry.get("tools.readFile");

    if (skill === undefined) {
      throw new Error("Expected MCP skill to be registered.");
    }

    expect(skill.description).toBe("Read a file from the workspace.");
    expect(skill.cost).toBe("external");
    expect(skill.tags).toEqual(["io", "search"]);
    await expect(skill.execute({ path: "README.md" }, createContext())).resolves.toEqual({
      input: { path: "README.md" },
    });
  });
});

describe("executeSkill", () => {
  it("validates input and output schemas around execution", async () => {
    const skill: Skill<{ value: number }, { doubled: number }> = {
      id: "compute.double",
      description: "Double a number.",
      inputSchema: objectWithNumber("value"),
      outputSchema: objectWithNumber("doubled"),
      tags: ["compute"],
      cost: "cheap",
      execute: async (input) => ({ doubled: input.value * 2 }),
    };

    await expect(executeSkill(skill, { value: 21 }, createContext())).resolves.toEqual({
      doubled: 42,
    });
    await expect(executeSkill(skill, { value: "21" }, createContext())).rejects.toThrow(
      SkillValidationError,
    );
  });
});

function createContext(): SkillContext {
  return {
    agentId: "agent-1",
    memory: new MapMemoryStore(),
  };
}

function echoSkill(id: string, tags: string[] = [], version?: string): Skill {
  const skill: Skill = {
    id,
    description: `Echo values through ${id}.`,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    tags,
    cost: "cheap",
    execute: async (input) => input,
  };

  if (version !== undefined) {
    skill.version = version;
  }

  return skill;
}

function objectWithNumber<T extends string>(key: T): SkillSchema<Record<T, number>> {
  return {
    parse: (value) => {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as Record<string, unknown>)[key] !== "number"
      ) {
        throw new Error(`Expected object with numeric ${key}.`);
      }

      return value as Record<T, number>;
    },
  };
}

class MapMemoryStore {
  readonly #values = new Map<string, unknown>();

  get(key: string): unknown {
    return this.#values.get(key);
  }

  set(key: string, value: unknown): void {
    this.#values.set(key, value);
  }

  append(key: string, value: unknown): void {
    const current = this.#values.get(key);
    const items = Array.isArray(current) ? current : [];
    this.#values.set(key, [...items, value]);
  }
}
