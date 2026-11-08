import type { Href } from "expo-router";

/**
 * Where a guest screen sends someone right after they get a session. Signing
 * up sets "/verify-email" before the request, because GuestOnly redirects as
 * soon as the session appears, before the screen's own navigation runs.
 */
let pending: Href | null = null;

export function setPostAuthRoute(route: Href | null) {
  pending = route;
}

export function peekPostAuthRoute() {
  return pending;
}
