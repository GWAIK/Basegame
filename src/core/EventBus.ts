type Handler<T> = (payload: T) => void;

/** Typed publish and subscribe. on() returns a function that removes the handler. */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      (handler as Handler<Events[K]>)(payload);
    }
  }
}
