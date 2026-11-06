import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// A small muted label with a group name: in list rows, on "Пора связаться" and in the card.
export function GroupBadge({ className, ...props }: React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant="secondary"
      className={cn("h-6 bg-muted px-2 text-13 font-normal text-muted-foreground", className)}
      {...props}
    />
  );
}
