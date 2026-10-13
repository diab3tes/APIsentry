import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Allow importing ../sample_data/large_batch_sample.json
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:5000' },
  },
})
