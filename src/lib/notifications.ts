// Web notification helpers for the "Stays" mobile app. Real OS notifications are
// shown through the service worker (registration.showNotification) because mobile
// browsers don't support the `new Notification()` constructor; we fall back to it
// on desktop. Callers should always pair these with an in-app toast so the user
// still sees the message when permission is denied or unsupported (e.g. iOS Safari
// outside a home-screen PWA).

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotifyPermission {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotifyPermission;
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return "denied";
  }
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* SW registration is best-effort; in-app toasts still work without it */
  }
}

export async function showNotification(
  title: string,
  options: NotificationOptions & { data?: { url?: string } } = {},
): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  // Prefer the service-worker path (works on mobile + desktop).
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        ...options,
      });
      return true;
    } catch {
      /* fall through to the constructor */
    }
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
