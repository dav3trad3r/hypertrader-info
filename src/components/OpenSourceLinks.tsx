import { REPO_URL } from '@/lib/links';

const linkClass = 'hover:text-foreground underline-offset-2 hover:underline';

export function OpenSourceLinks() {
  return (
    <>
      {' • '}
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Open source on GitHub
      </a>
      {' • '}
      <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Report a bug / Suggest a feature
      </a>
    </>
  );
}
