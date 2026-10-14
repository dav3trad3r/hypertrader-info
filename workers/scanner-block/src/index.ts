// Every route this Worker is bound to (see wrangler.jsonc) is a path only a
// vulnerability scanner asks for: dotfiles, PHP, WordPress, Vite's /@fs.
// Answer a tiny 404 at the edge and never touch the origin.

export default {
  fetch(): Response {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      },
    });
  },
};
