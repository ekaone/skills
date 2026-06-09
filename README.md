# @ekaone/skills

`@ekaone/skills` is the typed skill registry and loader for the Agent OS ecosystem.

Its main purpose is to describe, register, discover, load, and execute small capability atoms called **skills**. A skill is not a prompt template and it is not an agent. It is a typed async function with a metadata envelope that the OS can reason about before invocation.

Skills are meant to answer questions like:

- What can this agent invoke?
- What input and output shape does this capability expect?
- Is this operation cheap, external, or destructive?
- Can this capability be selected by tags such as `search`, `write`, `compute`, or `io`?
- Can an MCP tool or remote catalog be adapted into the same registry shape?

## Installation

```bash
pnpm add @ekaone/skills
```

```bash
npm install @ekaone/skills
```

```bash
yarn add @ekaone/skills
```

## What Is A Skill?

A skill is a typed async function plus metadata:

```ts
import type { Skill } from "@ekaone/skills";

type SearchInput = {
  query: string;
};

type SearchOutput = {
  results: string[];
};

const searchSkill: Skill<SearchInput, SearchOutput> = {
  id: "search.web",
  description: "Search the web for relevant documents and return result URLs.",
  inputSchema: {
    parse: (value) => value as SearchInput,
  },
  outputSchema: {
    parse: (value) => value as SearchOutput,
  },
  tags: ["search", "io"],
  cost: "external",
  execute: async (input, ctx) => {
    ctx.signal?.throwIfAborted();

    return {
      results: [`https://example.com/search?q=${encodeURIComponent(input.query)}`],
    };
  },
};
```

The schema interface is intentionally structural. Zod works well here, but core does not require Zod as a runtime dependency. Any object with `parse` or `safeParse` can be used.

## Example 1: Register And Execute A Local Skill

```ts
import {
  createSkillRegistry,
  executeSkill,
  type Skill,
  type SkillContext,
} from "@ekaone/skills";

const inputSchema = {
  parse(value: unknown): { value: number } {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { value?: unknown }).value !== "number"
    ) {
      throw new Error("Expected { value: number }.");
    }

    return value as { value: number };
  },
};

const outputSchema = {
  parse(value: unknown): { doubled: number } {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { doubled?: unknown }).doubled !== "number"
    ) {
      throw new Error("Expected { doubled: number }.");
    }

    return value as { doubled: number };
  },
};

const doubleSkill: Skill<{ value: number }, { doubled: number }> = {
  id: "compute.double",
  description: "Double a numeric value.",
  inputSchema,
  outputSchema,
  tags: ["compute"],
  cost: "cheap",
  execute: async (input) => ({ doubled: input.value * 2 }),
};

const registry = createSkillRegistry();
registry.register(doubleSkill);

const skill = registry.get("compute.double");

if (skill === undefined) {
  throw new Error("Skill is not registered.");
}

const ctx: SkillContext = {
  agentId: "agent-123",
  memory: {
    set: async (key, value) => {
      console.log("memory write", key, value);
    },
  },
};

const result = await executeSkill(skill, { value: 21 }, ctx);

console.log(result);
// { doubled: 42 }
```

`executeSkill` validates input before the skill runs and validates output after it completes.

## Example 2: Load MCP Tools As Skills

```ts
import { createSkillRegistry } from "@ekaone/skills";

const registry = createSkillRegistry();

await registry.load({
  kind: "mcp",
  namespace: "tools",
  tools: [
    {
      name: "readFile",
      description: "Read a file from the workspace.",
      annotations: {
        readOnlyHint: true,
      },
      call: async (input) => {
        return {
          input,
          content: "file contents would be returned here",
        };
      },
    },
  ],
});

const skills = registry.list(["io", "search"]);

console.log(skills[0]?.id);
// tools.readFile
```

MCP tools are adapted into skills with:

- `id`: `${namespace}.${tool.name}`
- `description`: the MCP tool description, or a generated fallback
- `cost`: `external`
- `tags`: `io`, plus `search` for read-only tools and `destructive` for destructive tools

## API

### `createSkillRegistry(options?)`

Creates an in-memory registry.

```ts
import { createSkillRegistry } from "@ekaone/skills";

const registry = createSkillRegistry();
```

Options:

```ts
type RegistryOptions = {
  allowOverwrite?: boolean;
};
```

By default, registering the same skill id and version twice throws `SkillRegistrationError`.

### `InMemorySkillRegistry`

Concrete registry implementation.

```ts
import { InMemorySkillRegistry } from "@ekaone/skills";

const registry = new InMemorySkillRegistry({
  allowOverwrite: true,
});
```

### `registry.register(skill)`

Registers one skill.

```ts
registry.register(skill);
```

Registration validates the basic envelope:

- `id` must not be empty
- `description` must not be empty
- `execute` must be a function

### `registry.get(id, lookup?)`

Gets one skill by id.

```ts
const latest = registry.get("search.web");
const v1 = registry.get("search.web", { version: "1.0.0" });
```

If no version is provided, the registry returns the most recently registered version for that id.

### `registry.list(tags?)`

Lists skills. When tags are provided, the skill must include every requested tag.

```ts
const allSkills = registry.list();
const searchableIoSkills = registry.list(["search", "io"]);
const destructiveSkills = registry.list(["destructive"]);
```

### `registry.load(source)`

Loads skills from a source.

Supported sources:

```ts
type LocalSkillSource = {
  kind: "local";
  skills: Iterable<Skill> | (() => Iterable<Skill> | Promise<Iterable<Skill>>);
};

type LoaderSkillSource = {
  kind: "loader";
  load: () => Iterable<Skill> | Promise<Iterable<Skill>>;
};

type RemoteSkillSource = {
  kind: "remote";
  url: string | URL;
  fetcher: (url: string) => Promise<unknown>;
  decode: (payload: unknown) => Iterable<Skill> | Promise<Iterable<Skill>>;
};

type McpSkillSource = {
  kind: "mcp";
  tools: Iterable<McpTool> | (() => Iterable<McpTool> | Promise<Iterable<McpTool>>);
  namespace?: string;
};
```

Remote loading is intentionally explicit: the caller provides both `fetcher` and `decode`. This keeps core dependency-free and lets Relayhouse decide how to fetch, authenticate, cache, and validate remote catalogs.

### `executeSkill(skill, input, ctx)`

Validates input, invokes the skill, and validates output.

```ts
const output = await executeSkill(skill, input, ctx);
```

This is the safest default invocation path for agents and dispatchers.

### `mcpToolToSkill(tool, namespace?)`

Converts one MCP-like tool into a skill.

```ts
import { mcpToolToSkill } from "@ekaone/skills";

const skill = mcpToolToSkill(tool, "tools");
```

### `parseWithSchema(schema, value, label)`

Parses a value using a schema with either `safeParse` or `parse`.

```ts
const parsed = parseWithSchema(schema, input, "input");
```

Throws `SkillValidationError` when parsing fails.

### `passthroughSchema`

A schema that returns the value unchanged.

```ts
import { passthroughSchema } from "@ekaone/skills";
```

Useful for prototype skills, MCP tools, and tests where validation is handled elsewhere.

## Core Types

```ts
type Skill<I = unknown, O = unknown> = {
  id: string;
  version?: string;
  description: string;
  inputSchema: SkillSchema<I>;
  outputSchema: SkillSchema<O>;
  execute: (input: I, ctx: SkillContext) => Promise<O>;
  tags?: SkillTag[];
  cost?: SkillCost;
};
```

```ts
type SkillContext = {
  agentId: string;
  memory: MemoryStore;
  signal?: AbortSignal;
};
```

```ts
type MemoryStore = {
  get?: (key: string) => Promise<unknown> | unknown;
  set?: (key: string, value: unknown) => Promise<void> | void;
  append?: (key: string, value: unknown) => Promise<void> | void;
};
```

```ts
type SkillCost = "cheap" | "expensive" | "external";
type SkillTag = "search" | "write" | "compute" | "io" | "destructive" | string;
```

## Design Notes

- Core is dependency-free.
- Zod can be used through the structural `parse` and `safeParse` schema interface.
- Multiple versions of the same skill id can coexist.
- `description` should be written for skill selection by an LLM or dispatcher.
- `destructive` skills can be routed through approval systems such as `@ekaone/approval`.
- `SkillContext.agentId` is intended to come from `@ekaone/identity`.
- `SkillContext.memory` is intended to come from `@ekaone/memory`.
- Agent manifests can declare which skill ids they are allowed to invoke, while Relayhouse can dispatch calls through the registry.

## Errors

```ts
SkillError
SkillRegistrationError
SkillValidationError
```

`SkillRegistrationError` is thrown for invalid or duplicate registrations.

`SkillValidationError` is thrown when input or output schema validation fails.

## License

MIT (c) [Eka Prasetia](./LICENSE)
