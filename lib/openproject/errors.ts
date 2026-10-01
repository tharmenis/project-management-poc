export type OpenProjectErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unavailable"
  | "unknown";

export class OpenProjectError extends Error {
  constructor(
    readonly status: number,
    readonly kind: OpenProjectErrorKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "OpenProjectError";
  }
}

export function classifyStatus(status: number): OpenProjectErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status >= 500) return "unavailable";
  return "unknown";
}

export function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as Record<string, unknown>;

  const embedded = record._embedded as Record<string, unknown> | undefined;
  const errors = embedded?.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((entry) =>
        entry && typeof entry === "object" && "message" in entry
          ? String((entry as { message: unknown }).message)
          : String(entry),
      )
      .filter(Boolean);
    if (messages.length > 0) return messages.join("; ");
  }

  if (typeof record.message === "string") return record.message;

  return undefined;
}

export function botMessageForError(error: unknown): string {
  if (error instanceof OpenProjectError) {
    switch (error.kind) {
      case "unauthorized":
        return "Your OpenProject link needs renewing.";
      case "forbidden":
        return "You don't have permission for that in OpenProject.";
      case "not_found":
        return "That work package can't be found anymore.";
      case "conflict":
        return "Someone else just changed it; please try again.";
      case "validation":
        return error.message;
      case "unavailable":
        return "OpenProject isn't reachable right now; nothing was saved.";
      default:
        return `OpenProject returned an unexpected response (HTTP ${error.status}); nothing was saved.`;
    }
  }

  return "OpenProject isn't reachable right now; nothing was saved.";
}
