"use client";

import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const DEBOUNCE_MS = 200;

// The search text lives in the URL (?q=...), so the server filters the list and the address can be shared.
export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  // The last query this input asked the router to show.
  const [requestedQuery, setRequestedQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL can change without typing here (a link to the full list, the back button).
  // Then the input follows the URL; while our own navigation is in flight it must not, or typed letters get lost.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (!isPending && urlQuery !== requestedQuery) {
      setValue(urlQuery);
      setRequestedQuery(urlQuery);
    }
  }

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function showResults(nextValue: string) {
    const query = nextValue.trim();
    setRequestedQuery(query);
    startTransition(() => {
      router.replace(query ? `/?q=${encodeURIComponent(query)}` : "/", { scroll: false });
    });
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => showResults(nextValue), DEBOUNCE_MS);
  }

  function handleClear() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setValue("");
    showResults("");
  }

  return (
    <InputGroup className="h-10" data-pending={isPending ? "" : undefined}>
      <InputGroupAddon>
        {isPending ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        name="q"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Поиск по имени"
        aria-label="Поиск по имени"
        autoComplete="off"
        enterKeyHint="search"
        className="text-base [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== "" && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Очистить поиск" onClick={handleClear}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

// Shown in the prerendered page shell until the real input can read the URL.
export function SearchInputFallback() {
  return (
    <InputGroup className="h-10">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Поиск по имени"
        aria-label="Поиск по имени"
        className="text-base"
        readOnly
      />
    </InputGroup>
  );
}
