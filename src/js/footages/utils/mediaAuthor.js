export function hasAuthorDetails(user) {
    return Boolean(user.name?.trim() || user.username || user.avatarUrl);
}
