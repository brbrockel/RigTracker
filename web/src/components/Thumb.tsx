import { Film, ImageOff } from 'lucide-react';
import { isVideo, mediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/** A square photo (or video) thumbnail, with a placeholder when there's none. */
export function Thumb({
  url,
  alt,
  className,
}: {
  url?: string | null;
  alt: string;
  className?: string;
}) {
  const src = mediaUrl(url);
  const box = cn('size-14 shrink-0 overflow-hidden rounded-lg bg-muted', className);
  if (!src)
    return (
      <div className={cn(box, 'flex items-center justify-center text-muted-foreground')}>
        <ImageOff className="size-5" aria-hidden />
        <span className="sr-only">No photo</span>
      </div>
    );
  if (isVideo(src))
    return (
      <div className={cn(box, 'relative')}>
        <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />
        <Film className="absolute bottom-1 right-1 size-4 text-white drop-shadow" aria-hidden />
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" className={cn(box, 'object-cover')} />;
}
