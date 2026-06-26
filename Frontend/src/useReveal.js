import { useEffect, useState } from "react";

/**
 * Reveal a list one item at a time so the agent's tool calls / thoughts animate
 * in on stage instead of dumping all at once. Deterministic (timer-based), so
 * it never flakes during a live demo.
 *
 * @param {number} total   number of items to reveal
 * @param {object} opts
 * @param {number} opts.delay  ms between reveals (default 480)
 * @param {boolean} opts.active  start revealing when true; reset when false
 * @param {any} opts.key  changing this restarts the animation from 0
 * @returns {number} how many items are currently visible
 */
export function useReveal(total, { delay = 480, active = true, key } = {}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (!active || total === 0) return;
    let n = 0;
    setShown(1);
    n = 1;
    const id = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= total) clearInterval(id);
    }, delay);
    return () => clearInterval(id);
  }, [total, delay, active, key]);

  return shown;
}
