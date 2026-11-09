import { signOut } from "@/app/login/actions";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// The email of the logged-in person and «Выйти», on the right of the header. Nobody is logged in
// (the login page, «Ссылка устарела») — nothing is drawn, and the header holds only the name.
// Reads the login, so it must sit behind <Suspense>.
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* A long address is cut with an ellipsis; the whole of it is in the tooltip. */}
      <span className="min-w-0 truncate text-sm text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <form action={signOut} className="shrink-0">
        <Button type="submit" variant="outline" size="lg" className="h-9 px-3">
          Выйти
        </Button>
      </form>
      <SessionKeepAlive />
    </div>
  );
}
