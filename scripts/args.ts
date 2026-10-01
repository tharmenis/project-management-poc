export interface ParsedArgs {
  flags: Record<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set([
  "token",
  "name",
  "user",
  "base-url",
  "display-name",
  "file",
  "provider",
  "model",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      flags[key] = rest.join("=");
      continue;
    }

    const next = argv[i + 1];
    if (VALUE_FLAGS.has(withoutPrefix) && next !== undefined && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      i += 1;
    } else {
      flags[withoutPrefix] = "true";
    }
  }

  return { flags, positionals };
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
