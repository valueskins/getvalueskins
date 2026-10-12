/**
 * Where realtime events go. `transitionDeal` and the services have no `ctx`, so, like `db` and
 * `logger`, the emitter is a module-level value. It does nothing until `attachRealtime` installs
 * the Socket.io one, so `createApp` and every test that does not start a socket server are
 * untouched. Tests install a recording fake and reset it afterwards.
 */
export interface Realtime {
  emit(room: string, event: string, payload: unknown): void;
}

const noop: Realtime = { emit() {} };

let current: Realtime = noop;

export function setRealtime(realtime: Realtime | null): void {
  current = realtime ?? noop;
}

export function getRealtime(): Realtime {
  return current;
}
