import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/web-session";

const ERRORS: Record<string, string> = {
  missing: "Please paste your OpenProject API token.",
  invalid: "OpenProject rejected that token. Check it and try again.",
  failed: "I couldn't link that token. Please try again.",
};

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await currentUserId()) redirect("/");

  const params = await searchParams;
  const key = typeof params.error === "string" ? params.error : undefined;
  const error = key ? (ERRORS[key] ?? ERRORS.failed) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">OpenProject Chat Bot</h1>
        <p className="mt-2 text-sm text-gray-600">
          Link your OpenProject account to log hours by chatting.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form action="/api/link" method="post" className="flex flex-col gap-3">
        <label htmlFor="token" className="text-sm font-medium">
          OpenProject API token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Paste your token"
          className="rounded-md border border-gray-300 px-3 py-3 text-base"
        />
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-3 text-base font-medium text-white"
        >
          Link my account
        </button>
      </form>

      <p className="text-xs leading-relaxed text-gray-500">
        In OpenProject, open <strong>My account → Access tokens</strong> and create a token. It is
        stored encrypted, is never shown again, and is only used for your own requests.
      </p>
    </main>
  );
}
