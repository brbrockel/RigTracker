import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** A real checkbox with a screen-reader label and a comfortable tap target. */
export function SelectBox({
  label,
  checked,
  indeterminate = false,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label
      className={cn(
        'relative z-10 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center print:hidden',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 cursor-pointer accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sr-only">{label}</span>
    </label>
  );
}
