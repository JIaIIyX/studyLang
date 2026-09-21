import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  '/api': {
    target: 'http://localhost:5174',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: 'localhost',
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/')
          if (norm.includes('node_modules')) {
            if (norm.includes('react-dom') || norm.includes('react-router') || /\/react\//.test(norm)) {
              return 'vendor-react'
            }
            if (norm.includes('lucide-react')) return 'vendor-icons'
            return 'vendor'
          }
          if (norm.includes('/src/lib/homework')) return 'lib-homework'
          if (
            norm.includes('/src/lib/tutorQuiz') ||
            norm.includes('/src/lib/tutor.ts') ||
            norm.includes('/src/lib/llmTasks') ||
            norm.includes('/src/lib/practiceTags') ||
            norm.includes('/src/lib/quizCatalog') ||
            norm.includes('/src/lib/quizChoices') ||
            norm.includes('/src/lib/quizOptions') ||
            norm.includes('/src/lib/quizReply')
          ) {
            return 'lib-tutor'
          }
          if (norm.includes('/src/lib/partner') || norm.includes('/src/lib/virtualization')) {
            return 'lib-partner'
          }
        },
      },
    },
  },
})
