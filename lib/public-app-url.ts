const productionAppUrl = "https://leadpocket.vercel.app";

export function getPublicAppUrl(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) {
    return process.env.NODE_ENV === "production" ? productionAppUrl : null;
  }

  try {
    const url = new URL(configuredUrl);
    const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname
    );
    const isLocalDevelopmentHost =
      process.env.NODE_ENV !== "production" && isLocalHost;

    if (
      (url.protocol !== "https:" && !isLocalDevelopmentHost) ||
      (isLocalHost && !isLocalDevelopmentHost) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.endsWith(".app.github.dev") ||
      url.hostname.endsWith(".github.dev")
    ) {
      return process.env.NODE_ENV === "production"
        ? productionAppUrl
        : null;
    }

    return url.origin;
  } catch {
    return process.env.NODE_ENV === "production" ? productionAppUrl : null;
  }
}
