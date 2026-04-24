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

  emit<K extends keyof TMap>(type: K, payload: TMap[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      (listener as EventBusListener<TMap[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
