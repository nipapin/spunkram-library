import { MediaAuthor } from "../types";

export function hasAuthorDetails(user: MediaAuthor): boolean {
  return Boolean(user.name?.trim() || user.username || user.avatarUrl);
}
