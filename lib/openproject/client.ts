import { OpenProjectError, classifyStatus, extractErrorMessage } from "./errors";

export interface OpenProjectClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export class OpenProjectClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenProjectClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authHeader = `Basic ${Buffer.from(`apikey:${options.token}`).toString("base64")}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v3${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/hal+json",
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      throw new OpenProjectError(0, "unavailable", "Network request to OpenProject failed", cause);
    }

    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new OpenProjectError(
        response.status,
        classifyStatus(response.status),
        extractErrorMessage(data) ?? `OpenProject returned ${response.status}`,
        data,
      );
    }

    return data as T;
  }
}
