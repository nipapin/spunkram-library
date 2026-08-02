import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { csi } from "../../lib/utils/bolt";
import { MediaAuthor } from "../types";
import { cn } from "@/lib/utils";

export { hasAuthorDetails } from "../utils/mediaAuthor";

interface AuthorInfoPopoverProps {
  user: MediaAuthor;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

function openProfileUrl(url: string) {
  csi.openURLInDefaultBrowser(url);
}

export default function AuthorInfoPopover({
  user,
  anchorEl,
  onClose,
}: AuthorInfoPopoverProps) {
  const open = Boolean(anchorEl);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const name = user.name?.trim() ?? "";
  const profileUrl = user.url?.trim() ?? "";
  const hasName = Boolean(name);
  const hasUsername = Boolean(user.username);
  const avatarOpensProfile = !hasName && Boolean(profileUrl) && Boolean(user.avatarUrl);
  const showProfileFallbackLink =
    !hasName && Boolean(profileUrl) && !user.avatarUrl && !hasUsername;
  const showNickAsProfileLink =
    !hasName && hasUsername && Boolean(profileUrl) && !user.avatarUrl;
  const showPlainNickname =
    hasUsername &&
    !showNickAsProfileLink &&
    (hasName || !profileUrl || Boolean(user.avatarUrl));

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = panelRef.current?.offsetWidth ?? 220;
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - width),
    });
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, anchorEl, onClose]);

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (profileUrl) openProfileUrl(profileUrl);
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[1000] max-w-[280px] rounded-lg border border-white/10 bg-popover p-3 text-popover-foreground shadow-lg shadow-black/40"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        {user.avatarUrl ? (
          <button
            type="button"
            onClick={avatarOpensProfile ? handleOpenProfile : undefined}
            className={cn(
              "size-10 shrink-0 overflow-hidden rounded-full border border-white/10",
              avatarOpensProfile && "cursor-pointer hover:opacity-90",
            )}
          >
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {hasName ? (
            profileUrl ? (
              <button
                type="button"
                onClick={handleOpenProfile}
                className="block text-xs font-bold text-foreground hover:opacity-90"
              >
                {name}
              </button>
            ) : (
              <span className="block text-xs font-bold text-foreground">{name}</span>
            )
          ) : null}
          {showNickAsProfileLink ? (
            <button
              type="button"
              onClick={handleOpenProfile}
              className="block text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              @{user.username}
            </button>
          ) : null}
          {showPlainNickname ? (
            <span
              className={cn(
                "block text-[10px] font-medium text-muted-foreground",
                (hasName || (user.avatarUrl && profileUrl)) && "mt-0.5",
              )}
            >
              @{user.username}
            </span>
          ) : null}
          {showProfileFallbackLink ? (
            <button
              type="button"
              onClick={handleOpenProfile}
              className="block text-xs font-bold text-foreground hover:opacity-90"
            >
              Profile
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
