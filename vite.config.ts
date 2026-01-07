
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Garante que process.env seja minimamente definido no cliente se não houver um pollyfill
    'process.env': {}
  }
});