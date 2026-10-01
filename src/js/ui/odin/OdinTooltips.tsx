import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function OdinTooltips() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useEffect(() => {
    const show = (event: Event) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".odin-app [data-tooltip]")
          : null;
      setTarget(element);
    };
    const hide = () => setTarget(null);
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", hide);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);
  useLayoutEffect(() => {
    if (!target || !tip.current) return;
    const rect = target.getBoundingClientRect();
    const bounds = tip.current.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(
      gap,
      Math.min(
        rect.left + rect.width / 2 - bounds.width / 2,
        window.innerWidth - bounds.width - gap,
      ),
    );
    const top = Math.max(
      gap,
      Math.min(
        rect.top >= bounds.height + gap * 2
          ? rect.top - bounds.height - gap
          : rect.bottom + gap,
        window.innerHeight - bounds.height - gap,
      ),
    );
    setPosition({ left, top });
    const previous = target.getAttribute("aria-describedby");
    target.setAttribute(
      "aria-describedby",
      [previous, "odin-tooltip"].filter(Boolean).join(" "),
    );
    return () => {
      if (previous) target.setAttribute("aria-describedby", previous);
      else target.removeAttribute("aria-describedby");
    };
  }, [target]);
  return target?.dataset.tooltip
    ? createPortal(
        <div
          id="odin-tooltip"
          ref={tip}
          role="tooltip"
          className="odin-tooltip"
          style={position}
        >
          {target.dataset.tooltip}
        </div>,
        document.body,
      )
    : null;
}
