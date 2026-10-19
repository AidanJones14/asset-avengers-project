import { defineConfig } from 'vite';

// Relative API URLs work in both development and the Docker Nginx container.
// These are server addresses only; no database credentials enter the browser.
export default defineConfig({
  appType: 'mpa',
  plugins: [{
    name: 'staff-clean-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/(admin|analyst)(\.html|\/)?$/);
        const section = url.pathname.match(/^\/(admin\/(orders|clients|disputes|actions|reports)|analyst\/reports)$/);
        if (section) {
          req.url = `/${url.pathname.split('/')[1]}.html${url.search}`;
          return next();
        }
        if (!match) return next();
        if (match[2]) {
          res.writeHead(308, { Location: `/${match[1]}${url.search}` });
          return res.end();
        }
        req.url = `/${match[1]}.html${url.search}`;
        next();
      });
    },
  }],
  build: { rolldownOptions: { input: { admin: 'admin.html', analyst: 'analyst.html' } } },
  server: {
    proxy: {
      '/api': { target: process.env.INTERNAL_API_URL || 'http://127.0.0.1:8085' },
      '/auth': { target: process.env.AUTH_API_URL || 'http://127.0.0.1:3000' },
    },
  },
});
