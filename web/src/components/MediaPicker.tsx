import { Camera, ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Thumb } from '@/components/Thumb';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage, uploadMedia } from '@/lib/api';

/**
 * One photo for a record: take it with the camera or pick one from the library. It uploads
 * straight away and hands back its URL; the form saves the URL with the record.
 */
export function MediaPicker({
  value,
  onChange,
  folder,
  accept = 'image/*',
  label = 'Photo',
}: {
  value?: string;
  onChange: (url: string | undefined) => void;
  /** e.g. "gear/<name>" */
  folder: string;
  accept?: string;
  label?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadMedia(file, folder));
    } catch (err) {
      setError(errorMessage(err, 'Upload failed.'));
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (library.current) library.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <Thumb url={value} alt={label} className="size-20" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => camera.current?.click()}>
            <Camera /> Take photo
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => library.current?.click()}>
            <ImagePlus /> {value ? 'Replace' : 'Choose'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange(undefined)}>
              <X /> Remove
            </Button>
          )}
        </div>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {error && <Alert variant="destructive">{error}</Alert>}
      <input ref={camera} type="file" accept={accept} capture="environment" hidden onChange={(e) => pick(e.target.files)} />
      <input ref={library} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
