"use client";

import { useEffect, useState } from "react";

const FORMATS: Record<"date" | "time", Intl.DateTimeFormatOptions> = {
  date: { month: "short", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" }
};

type ClientDateProps = {
  value: string;
  format: keyof typeof FORMATS;
};

// Formats a timestamp on the client only. The server (and the first client
// render) emit an empty <time>, so the displayed text can never differ between
// server and client. This avoids hydration mismatches when the server timezone
// differs from the visitor's — e.g. a UTC server in production vs. a local browser.
export function ClientDate({ value, format }: ClientDateProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(new Intl.DateTimeFormat("en", FORMATS[format]).format(new Date(value)));
  }, [value, format]);

  return (
    <time dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}
