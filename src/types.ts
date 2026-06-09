export type SchemaResult<T> =
  | { success: true; data: T }
  | { success: false; error: unknown };

export type SkillSchema<T = unknown> = {
  parse?: (value: unknown) => T;
  safeParse?: (value: unknown) => SchemaResult<T>;
};

export type MemoryStore = {
  get?: (key: string) => Promise<unknown> | unknown;
  set?: (key: string, value: unknown) => Promise<void> | void;
  append?: (key: string, value: unknown) => Promise<void> | void;
};

export type SkillContext = {
  agentId: string;
  memory: MemoryStore;
  signal?: AbortSignal;
};

export type SkillTag = "search" | "write" | "compute" | "io" | "destructive" | string;

export type SkillCost = "cheap" | "expensive" | "external";

export type Skill<I = unknown, O = unknown> = {
  id: string;
  version?: string;
  description: string;
  inputSchema: SkillSchema<I>;
  outputSchema: SkillSchema<O>;
  execute: (input: I, ctx: SkillContext) => Promise<O>;
  tags?: SkillTag[];
  cost?: SkillCost;
};

export type SkillLookup = {
  version?: string;
};

export type SkillRegistry = {
  register(skill: Skill): void;
  get(id: string, lookup?: SkillLookup): Skill | undefined;
  list(tags?: string[]): Skill[];
  load(source: SkillSource): Promise<void>;
};

export type LocalSkillSource = {
  kind: "local";
  skills: Iterable<Skill> | (() => Iterable<Skill> | Promise<Iterable<Skill>>);
};

export type LoaderSkillSource = {
  kind: "loader";
  load: () => Iterable<Skill> | Promise<Iterable<Skill>>;
};

export type RemoteSkillSource = {
  kind: "remote";
  url: string | URL;
  fetcher: (url: string) => Promise<unknown>;
  decode: (payload: unknown) => Iterable<Skill> | Promise<Iterable<Skill>>;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: SkillSchema<unknown>;
  outputSchema?: SkillSchema<unknown>;
  call: (input: unknown, ctx: SkillContext) => Promise<unknown>;
  annotations?: {
    destructiveHint?: boolean;
    readOnlyHint?: boolean;
  };
};

export type McpSkillSource = {
  kind: "mcp";
  tools: Iterable<McpTool> | (() => Iterable<McpTool> | Promise<Iterable<McpTool>>);
  namespace?: string;
};

export type SkillSource =
  | LocalSkillSource
  | LoaderSkillSource
  | RemoteSkillSource
  | McpSkillSource;

export type RegistryOptions = {
  allowOverwrite?: boolean;
};
