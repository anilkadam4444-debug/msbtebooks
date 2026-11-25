export const ADMIN_EMAILS = ["anilkadam4444@gmail.com"] as const;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}
