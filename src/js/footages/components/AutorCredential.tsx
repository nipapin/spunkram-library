import { MediaAuthor } from "../types";
import { csi } from "../../lib/utils/bolt";
import { cn } from "@/lib/utils";

interface AutorCredentialProps {
  hovered?: boolean;
  user: MediaAuthor;
}

const utm = `?utm_source=${encodeURIComponent("Gal Toolkit MAX")}&utm_medium=referral`;

export default function AutorCredential({ hovered, user }: AutorCredentialProps) {
  const handleOpenProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    csi.openURLInDefaultBrowser(`${user.url}${utm}`);
  };

  const handleOpenUnsplash = (e: React.MouseEvent) => {
    e.stopPropagation();
    csi.openURLInDefaultBrowser(`https://unsplash.com${utm}`);
  };

  return (
    <p
      className={cn(
        "absolute bottom-2 left-2 text-[10px] font-normal text-foreground transition-transform",
        hovered && "-translate-y-[30px]",
      )}
    >
      <span className="text-[8px] font-extralight text-muted-foreground">Photo by</span>
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
        onClick={handleOpenUnsplash}
        className="cursor-pointer text-[9px] underline"
      >
        Unsplash
      </button>
    </p>
  );
}
