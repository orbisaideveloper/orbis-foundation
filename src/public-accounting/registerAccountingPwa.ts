type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, "register">;

type AccountingPwaEnvironment = {
  pathname?: string;
  production?: boolean;
  serviceWorker?: ServiceWorkerRegistrar | null;
};

function normalizedPathname(pathname: string): string {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === "/") end -= 1;
  return pathname.slice(0, end) || "/";
}

export async function registerAccountingPwa(
  environment: AccountingPwaEnvironment = {},
): Promise<ServiceWorkerRegistration | null> {
  const production = environment.production ?? import.meta.env.PROD;
  const pathname =
    environment.pathname ??
    (typeof window === "undefined" ? "/" : window.location.pathname);
  const serviceWorker =
    environment.serviceWorker !== undefined
      ? environment.serviceWorker
      : typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker
        : null;

  if (
    !production ||
    normalizedPathname(pathname) !== "/accounting" ||
    !serviceWorker
  ) {
    return null;
  }

  try {
    return await serviceWorker.register("/accounting-sw.js", {
      scope: "/accounting",
    });
  } catch {
    return null;
  }
}
