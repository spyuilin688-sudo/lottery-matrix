function parsePushPayload(event) {
  try {
    const payload = event.data?.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function safePwaPath(value) {
  if (typeof value !== "string") return "/";

  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = typeof payload.title === "string" ? payload.title : "";
  const body = typeof payload.body === "string" ? payload.body : "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      data: { url: safePwaPath(payload.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePwaPath(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const sameOriginClient = clientList.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOriginClient && typeof sameOriginClient.focus === "function") {
        return sameOriginClient.focus();
      }

      return self.clients.openWindow(url);
    }),
  );
});
