import { Camera, Film, ImagePlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Photos and videos chosen for a record that doesn't exist yet: the form uploads them right
 * after it creates the record (see uploadAll). Shows local previews; the first is the cover.
 */
export function PendingMedia({
  files,
  onChange,
  disabled,
  title = 'Photos and videos',
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  title?: string;
}) {
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () =>
      files.map((f) => ({
        file: f,
        video: f.type.startsWith('video/'),
        url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '',
      })),
    [files],
  );
  useEffect(
    () => () => {
      for (const p of previews) if (p.url) URL.revokeObjectURL(p.url);
    },
    [previews],
  );

  function pick(input: HTMLInputElement) {
    const picked = [...(input.files ?? [])];
    input.value = '';
    if (picked.length) onChange([...files, ...picked]);
  }

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            disabled={disabled}
            onClick={() => camera.current?.click()}
          >
            <Camera /> Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            disabled={disabled}
            onClick={() => library.current?.click()}
          >
            <ImagePlus /> Add photos or videos
          </Button>
        </div>
      </div>
      {previews.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previews.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="relative">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {p.url &&
                  (p.video ? (
                    <video src={p.url} muted playsInline className="size-full object-cover" />
                  ) : (
                    <img src={p.url} alt="" className="size-full object-cover" />
                  ))}
                {p.video && (
                  <Film
                    className="absolute bottom-1 right-1 size-4 text-white drop-shadow"
                    aria-hidden
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 size-8 rounded-full bg-background/80"
                aria-label={`Remove ${p.file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {files.length
          ? `${files.length} to upload when you save. The first is the cover.`
          : 'Optional. They upload when you save.'}
      </p>
      <input
        ref={library}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="pending-media-input"
        onChange={(e) => pick(e.currentTarget)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.currentTarget)}
      />
    </section>
  );
}
