import { getAvatarColor, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Plain markup on purpose: the list renders a thousand of these, so no client-side code per avatar.
export function ContactAvatar({
  name,
  size = "default",
  className,
}: {
  name: string;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium select-none",
        size === "lg" ? "size-14 text-lg" : "size-10 text-sm",
        getAvatarColor(name),
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
