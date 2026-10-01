"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BotAction, BotReply } from "@/lib/bot/types";

interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  actions?: BotAction[];
}

export function ChatPanel() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const appendReplies = useCallback((replies: BotReply[]) => {
    if (replies.length === 0) return;
    setMessages((previous) => [
      ...previous,
      ...replies.map((reply) => ({
        id: crypto.randomUUID(),
        role: "bot" as const,
        text: reply.text,
        actions: reply.actions,
      })),
    ]);
  }, []);

  const loadMyDay = useCallback(async () => {
    try {
      const response = await fetch("/api/my-day");
      if (response.status === 401) {
        router.push("/link");
        return;
      }
      const data = (await response.json()) as { replies?: BotReply[] };
      appendReplies(data.replies ?? []);
    } catch {
      // The opening message is best effort; the page is still usable.
    }
  }, [appendReplies, router]);

  const myDayLoaded = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoking effects in development,
    // which would post the opening "my day" message twice.
    if (myDayLoaded.current) return;
    myDayLoaded.current = true;
    void loadMyDay();
  }, [loadMyDay]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setInput("");
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: trimmed },
    ]);
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId: crypto.randomUUID(), text: trimmed }),
      });
      if (response.status === 401) {
        router.push("/link");
        return;
      }
      const data = (await response.json()) as { replies?: BotReply[] };
      appendReplies(data.replies ?? []);
    } catch {
      appendReplies([{ text: "Something went wrong sending that. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {message.text}
              {message.actions && message.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.actions.map((action) => (
                    <button
                      key={`${action.label}-${action.value}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(action.value)}
                      className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {busy ? (
          <p aria-live="polite" className="text-sm text-gray-400">
            …
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-gray-200 p-4"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          placeholder="Type a message"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-3 text-base disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-gray-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
