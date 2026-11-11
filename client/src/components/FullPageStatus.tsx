/** A centered, screen-reader-announced status line (loading states). */
export function FullPageStatus({ text }: { text: string }) {
  return (
    <div className="full-page-status" role="status" aria-live="polite">
      {text}
    </div>
  );
}
