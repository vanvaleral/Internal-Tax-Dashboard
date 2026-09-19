self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  event.waitUntil(self.registration.showNotification(payload.title || "LMATS Consulting", {
    body: payload.body || "You have a new announcement.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || "lmats-announcement",
    renotify: true,
    data: { url: payload.url || "/demo.html?view=announcement-view" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/demo.html?view=announcement-view", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return clients.openWindow(target);
  }));
});
