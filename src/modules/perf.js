export function coalesceFrame(callback) {
  let pending = false;
  return (...args) => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      callback(...args);
    });
  };
}
