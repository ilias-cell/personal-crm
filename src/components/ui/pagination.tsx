import * as React from "react"
import Link from "next/link"
import { cn } from "cn"

import { LinkPending } from "@/components/link-pending"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="Страницы"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<typeof Link>

// A next/link, so switching pages stays inside the app instead of reloading it.
function PaginationLink({
  className,
  isActive,
  size = "icon",
  children,
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <Link
          aria-current={isActive ? "page" : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    >
      {children}
      <LinkPending />
    </Button>
  )
}

// An arrow with nowhere to go, on the first or the last page: looks like the link,
// but is not one, so it can be neither clicked nor reached with Tab.
function PaginationDisabled({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      role="link"
      aria-disabled="true"
      data-slot="pagination-link"
      className={cn(
        buttonVariants({ variant: "ghost", size: "default" }),
        "pointer-events-none opacity-50",
        className
      )}
      {...props}
    />
  )
}

// Without href the arrow is shown disabled.
type PaginationArrowProps = Omit<PaginationLinkProps, "href"> & {
  href?: PaginationLinkProps["href"]
  text?: string
}

function PaginationPrevious({
  className,
  text = "Назад",
  href,
  ...props
}: PaginationArrowProps) {
  const content = (
    <>
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </>
  )
  if (href === undefined) {
    return (
      <PaginationDisabled
        aria-label="Предыдущая страница"
        className={cn("pl-1.5!", className)}
      >
        {content}
      </PaginationDisabled>
    )
  }
  return (
    <PaginationLink
      href={href}
      aria-label="Предыдущая страница"
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      {content}
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Вперёд",
  href,
  ...props
}: PaginationArrowProps) {
  const content = (
    <>
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </>
  )
  if (href === undefined) {
    return (
      <PaginationDisabled
        aria-label="Следующая страница"
        className={cn("pr-1.5!", className)}
      >
        {content}
      </PaginationDisabled>
    )
  }
  return (
    <PaginationLink
      href={href}
      aria-label="Следующая страница"
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      {content}
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">Ещё страницы</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
