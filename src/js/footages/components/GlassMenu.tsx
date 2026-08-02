import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface GlassMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: (e?: React.MouseEvent | KeyboardEvent) => void;
  children: React.ReactNode;
  className?: string;
}

export default function GlassMenu({
  open,
  anchorEl,
  onClose,
  children,
  className,
}: GlassMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 160;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    let left = rect.right - menuWidth;
    let top = rect.bottom + 4;
    if (left < 8) left = 8;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 4);
    }
    setPos({ top, left });
  }, [open, anchorEl, children]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorEl?.contains(target)) return;
      onClose(e as unknown as React.MouseEvent);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(e);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "fixed z-[1000] min-w-[120px] rounded-lg border border-white/10 bg-popover p-1 text-popover-foreground shadow-lg shadow-black/40",
        className,
      )}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function GlassMenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] font-light text-foreground hover:bg-secondary",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
