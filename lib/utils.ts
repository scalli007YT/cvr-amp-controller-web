import { EventEmitter } from "events";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export class TypedEventEmitter<EventMap extends { [key: string | symbol]: unknown[] }> extends EventEmitter {
  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): boolean {
    return super.emit(event as string | symbol, ...args);
  }

  on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): this {
    super.on(event as string | symbol, listener);
    return this;
  }

  once<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): this {
    super.once(event as string | symbol, listener);
    return this;
  }

  removeListener<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): this {
    super.removeListener(event as string | symbol, listener);
    return this;
  }
}
