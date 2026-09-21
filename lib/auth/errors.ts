// Thrown by authorization helpers; Server Actions translate it into a friendly result.
export class AuthorizationError extends Error {
  readonly kind: "unauthenticated" | "forbidden";

  constructor(kind: "unauthenticated" | "forbidden", message?: string) {
    super(message ?? (kind === "unauthenticated" ? "Please sign in to continue." : "You don't have permission to do this."));
    this.name = "AuthorizationError";
    this.kind = kind;
  }
}

// Thrown by business logic when a rule is violated (e.g. "cannot deactivate the Super Admin").
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}
