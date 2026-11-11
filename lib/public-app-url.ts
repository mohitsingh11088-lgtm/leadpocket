export function getPublicAppUrl(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);
    const isLocalDevelopmentHost =
      process.env.NODE_ENV !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (
      (url.protocol !== "https:" && !isLocalDevelopmentHost) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.endsWith(".app.github.dev") ||
      url.hostname.endsWith(".github.dev")
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
