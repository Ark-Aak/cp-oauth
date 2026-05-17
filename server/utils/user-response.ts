export function getUserDisplayName(user: {
    username: string;
    displayName?: string | null;
}): string {
    return user.displayName?.trim() || user.username;
}

export function createAuthUserResponse(user: {
    id: string;
    username: string;
    displayName?: string | null;
    email: string;
}) {
    return {
        id: user.id,
        username: getUserDisplayName(user),
        handle: user.username,
        displayName: user.displayName || null,
        email: user.email
    };
}
