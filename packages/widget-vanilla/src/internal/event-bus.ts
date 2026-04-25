export type EventBusListener<T> = (payload: T) => void;

export class EventBus<TMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TMap, Set<EventBusListener<unknown>>>();

  on<K extends keyof TMap>(type: K, listener: EventBusListener<TMap[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as EventBusListener<unknown>);
    return () => {
      set?.delete(listener as EventBusListener<unknown>);
    };
  }

  off<K extends keyof TMap>(type: K, listener: EventBusListener<TMap[K]>): boolean {
    const set = this.listeners.get(type);
    if (!set) return false;
    return set.delete(listener as EventBusListener<unknown>);
  }

  emit<K extends keyof TMap>(type: K, payload: TMap[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Snapshot before iteration so subscribe-during-emit doesn't affect this tick
    for (const listener of [...set]) {
      try {
        (listener as EventBusListener<TMap[K]>)(payload);
      } catch (err) {
        console.error("[OpenCheckout][EventBus]", type, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
