import { defineConfig } from 'vite'
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3001,
    allowedHosts: true,
    proxy: {
      // Laravel backend during local dev (php artisan serve default port).
      // Update the target if you run Apache/Laravel on a different port.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
        // Minimum 5 minutes so slow backend/capture-app calls aren't cut off mid-dev.
        timeout: 300000,
        proxyTimeout: 300000
      }
    }
  },
  build: {
    // Build straight into the Laravel public/ folder so one Apache
    // document root serves both the SPA and the API. Run `npm run build`
    // from this folder (or use ../build-frontend.sh from the project root).
    outDir: '../public',
    emptyOutDir: false, // never wipe index.php / .htaccess / storage symlink
    assetsDir: 'assets',
  },
})

