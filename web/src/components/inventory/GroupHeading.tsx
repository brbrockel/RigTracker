/** The small heading over a group: its name and how many are in it. */
export function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      {label}{' '}
      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
        {count}
      </span>
    </h2>
  );
}
