import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// All login requests (asking for a link, opening it, the session check) are served by Better Auth.
export const { GET, POST } = toNextJsHandler(auth);
