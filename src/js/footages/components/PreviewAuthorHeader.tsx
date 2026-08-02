import { MediaAuthor } from "../types";
import { hasAuthorDetails } from "../utils/mediaAuthor";

type PreviewAuthorHeaderProps = {
  user: MediaAuthor;
};

export default function PreviewAuthorHeader({ user }: PreviewAuthorHeaderProps) {
  if (!hasAuthorDetails(user)) return null;

  return (
    <p className="absolute bottom-2 left-2 text-[10px] font-normal text-foreground">
      <span className="text-[8px] font-extralight text-muted-foreground">Photo by</span>
      <br />
      <span className="cursor-pointer text-[9px] underline">{user.name}</span>
      {" on "}
      <span className="cursor-pointer text-[9px] underline">Unsplash</span>
    </p>
  );
}
