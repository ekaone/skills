export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillError";
  }
}

export class SkillRegistrationError extends SkillError {
  constructor(message: string) {
    super(message);
    this.name = "SkillRegistrationError";
  }
}

export class SkillValidationError extends SkillError {
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "SkillValidationError";
    this.cause = cause;
  }
}
