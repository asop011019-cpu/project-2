import { useCallback, useEffect, useRef, useState } from "react";
export function useCurtain() {
  const [curtain, setCurtain] = useState(false);
  const active = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const transition = useCallback((change: () => void) => {
    if (active.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      change();
      return;
    }
    active.current = true;
    setCurtain(true);
    timers.current.push(setTimeout(change, 470));
    timers.current.push(
      setTimeout(() => {
        setCurtain(false);
        active.current = false;
      }, 980),
    );
  }, []);
  return { curtain, transition };
}
