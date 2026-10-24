import { getInitials } from "@/lib/format";
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
        "flex shrink-0 items-center justify-center rounded-full border bg-field font-serif text-muted-foreground select-none",
        size === "lg" ? "size-14 text-xl" : "size-10 text-sm",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
