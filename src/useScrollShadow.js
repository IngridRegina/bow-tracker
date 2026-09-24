import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/* Scroll-shadow plumbing shared by the wide tables (ScrollTable) and the bar
   charts. Returns props to spread onto two elements: a non-scrolling wrapper
   (which carries the edge shadows via .bt-scroll-shadow) and the scroller
   inside it. A shadow is painted on whichever edge still has content beyond it
   and fades out once there is nothing more that way — so it reads as "there is
   more to scroll to" and, at the end, stops claiming there is. */
export function useScrollShadow() {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Recheck after every render — data, range and flow all change the content's
  // width — and whenever the viewport resizes.
  useLayoutEffect(update);
  useEffect(() => {
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return {
    wrapperProps: {
      "data-scroll-left": edges.left || undefined,
      "data-scroll-right": edges.right || undefined,
    },
    scrollProps: { ref, onScroll: update },
  };
}
