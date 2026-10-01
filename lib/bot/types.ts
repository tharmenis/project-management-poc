export type Channel = "web" | "repl" | "rocketchat";

export interface MessageContext {
  userId: string;
  channel: Channel;
  clientMessageId: string;
}

export interface BotAction {
  label: string;
  value: string;
}

export interface BotReply {
  text: string;
  actions?: BotAction[];
}
