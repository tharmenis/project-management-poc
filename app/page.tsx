import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/web-session";
import { ChatPanel } from "./chat-panel";

export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect("/link");

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h1 className="text-base font-semibold">OpenProject Chat Bot</h1>
        <form action="/api/logout" method="post">
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </header>
      <ChatPanel />
    </main>
  );
}
