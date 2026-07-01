export abstract class CodexAppServerError extends Error {
  abstract readonly tag: string;
  readonly cause?: unknown;

  get _tag(): string {
    return this.tag;
  }

  protected constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.cause = cause;
  }
}
