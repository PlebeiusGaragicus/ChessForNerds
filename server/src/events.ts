import type { AiEvent, PublicMatchState } from "../../shared/types.js";

type Listener = (event: string, payload: unknown) => void;

let nextEventId = 1;

export class EventHub {
  private readonly listeners = new Set<Listener>();
  private readonly aiEvents: AiEvent[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publishMatch(state: PublicMatchState): void {
    this.publish("match", state);
  }

  publishAi(type: AiEvent["type"], message: string): AiEvent {
    const event: AiEvent = {
      id: String(nextEventId++),
      type,
      message,
      createdAt: new Date().toISOString()
    };
    this.aiEvents.push(event);
    if (this.aiEvents.length > 100) {
      this.aiEvents.shift();
    }
    this.publish("ai-event", event);
    return event;
  }

  getAiEvents(): AiEvent[] {
    return [...this.aiEvents];
  }

  clearAiEvents(): void {
    this.aiEvents.length = 0;
  }

  private publish(event: string, payload: unknown): void {
    for (const listener of this.listeners) {
      listener(event, payload);
    }
  }
}
