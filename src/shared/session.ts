const EMAIL_KEY = "userEmail";

export function getUserEmail(): string | null {
    return localStorage.getItem(EMAIL_KEY);
}

export function signIn(email: string): void {
    localStorage.setItem(EMAIL_KEY, email);
}

export function signOut(): void {
    localStorage.removeItem(EMAIL_KEY);
}

    