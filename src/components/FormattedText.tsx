import type { ReactNode } from "react";

// Replies of the AI assistants (booking agent, admin copilot).
/** Bold (**x**), bullet lists and line breaks, as React nodes (no HTML). */
export function Formatted({ text }: { text: string }) {
  const inline = (s: string, key: string): ReactNode[] =>
    s
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
        {list.map((l, i) => (
          <li key={i}>{inline(l, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      return;
    }
    flush(`l${i}`);
    if (line) blocks.push(<p key={`p${i}`}>{inline(line, `p${i}`)}</p>);
  });
  flush("end");
  return <div className="space-y-1.5">{blocks}</div>;
}
