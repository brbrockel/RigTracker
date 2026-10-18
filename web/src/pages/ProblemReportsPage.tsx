import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/components/people/SignInLinkDialog';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';

interface ProblemReport {
  id: string;
  title: string;
  happened: string;
  expected: string | null;
  page: string | null;
  appVersion: string | null;
  issueNumber: number | null;
  issueUrl: string | null;
  issueError: string | null;
  createdAt: string;
  personId: string | null;
  reporterName: string | null;
}

/** Admins: problems people reported, with who sent them (the public issue only has a first name). */
export function ProblemReportsPage() {
  const reports = useQuery({
    queryKey: ['bug-reports'],
    queryFn: () => api<ProblemReport[]>('/bug-reports'),
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Problem reports"
        subtitle="From “Report a problem” in the account menu. Each is filed as a public GitHub issue signed with a first name; who sent it is only here. The latest 50."
      />
      {reports.isError && <Alert variant="destructive">{errorMessage(reports.error)}</Alert>}
      {reports.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {reports.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No reports yet.</p>
      )}
      <ul className="flex flex-col gap-3">
        {reports.data?.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-1.5 p-4 text-sm">
              <p className="font-medium">{r.title}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{r.happened}</p>
              {r.expected && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  <span className="font-medium text-foreground">Expected:</span> {r.expected}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {r.personId ? (
                  <Link to={`/people/${r.personId}`} className="underline underline-offset-2">
                    {r.reporterName ?? 'Someone'}
                  </Link>
                ) : (
                  'Someone (since deleted)'
                )}{' '}
                · {formatDateTime(r.createdAt)}
                {r.page ? ` · ${r.page}` : ''}
                {r.appVersion ? ` · ${r.appVersion}` : ''}
              </p>
              {r.issueUrl ? (
                <a
                  href={r.issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  <ExternalLink className="size-3.5" aria-hidden /> Issue #{r.issueNumber}
                </a>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Not on GitHub: {r.issueError ?? 'unknown'}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
