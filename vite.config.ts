
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No sandbox o preview chega pelo proxy da Base44, e o header Host recebido é
// "<porta>-<id do sandbox>.$BASE44_SANDBOX_HOST_DOMAIN" (o id muda a cada
// recriação do ambiente). A lista só é ampliada com BASE44_PREVIEW_MODE === "1";
// sem a flag nada muda.
const allowedHosts = ['terminal.local'];
if (process.env.BASE44_PREVIEW_MODE === '1' && process.env.BASE44_SANDBOX_HOST_DOMAIN) {
  allowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts
  },
  define: {
    // Garante que process.env seja minimamente definido no cliente se não houver um pollyfill
    'process.env': {}
  }
});
