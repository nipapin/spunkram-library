import { MediaAuthor } from "../types";
import { csi } from "../../lib/utils/bolt";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";

interface AutorCredentialProps {
  hovered?: boolean;
  user: MediaAuthor;
  provider?: "unsplash" | "pexels";
}

const utm = `?utm_source=${encodeURIComponent(BRAND.displayName)}&utm_medium=referral`;

export default function AutorCredential({ hovered, user, provider = "unsplash" }: AutorCredentialProps) {
  const providerName = provider === "pexels" ? "Pexels" : "Unsplash";
  const providerUrl = provider === "pexels" ? "https://pexels.com" : "https://unsplash.com";
  const mediaLabel = provider === "pexels" ? "Video by" : "Photo by";

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    csi.openURLInDefaultBrowser(`${user.url}${utm}`);
  };

  const handleOpenProvider = (e: React.MouseEvent) => {
    e.stopPropagation();
    csi.openURLInDefaultBrowser(`${providerUrl}${utm}`);
  };

  return (
    <p
      className={cn(
        "absolute bottom-2 left-2 text-[10px] font-normal text-foreground transition-transform",
        hovered && "-translate-y-[30px]",
      )}
    >
      <span className="text-[8px] font-extralight text-muted-foreground">{mediaLabel}</span>
      <br />
      <button
        type="button"
        onClick={handleOpenProfile}
        className="cursor-pointer text-[9px] underline"
      >
        {user.name}
      </button>
      {" on "}
      <button
        type="button"
        onClick={handleOpenProvider}
        className="cursor-pointer text-[9px] underline"
      >
        {providerName}
      </button>
    </p>
  );
}
