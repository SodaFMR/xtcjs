// Simple static file server for development
// All conversion happens client-side - this just serves the files

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    
    // Default to index.html
    if (path === '/') {
      path = '/index.html';
    }
    
    // Determine content type
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    
    const ext = path.substring(path.lastIndexOf('.'));
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    try {
      const file = Bun.file(`${import.meta.dir}${path}`);
      const exists = await file.exists();
      
      if (!exists) {
        return new Response('Not Found', { status: 404 });
      }
      
      return new Response(file, {
        headers: {
          'Content-Type': contentType,
        },
      });
    } catch (error) {
      return new Response('Internal Server Error', { status: 500 });
    }
  },
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         CBZ to XTC Converter - Frontend Server            ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${server.port}                 ║
║                                                           ║
║  All conversion happens in your browser!                  ║
║  No files are uploaded to any server.                     ║
╚═══════════════════════════════════════════════════════════╝
`);
