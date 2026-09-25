import { createFileRoute, redirect } from "@tanstack/react-router";

// The public booking portal is /web. /reservar is kept only so old links and
// bookmarks keep working.
export const Route = createFileRoute("/reservar")({
  beforeLoad: () => {
    throw redirect({ to: "/web", replace: true });
  },
});
