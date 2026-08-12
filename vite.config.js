import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')   // '' = load all vars, not just VITE_*
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/v1/messages': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
        },
      },
    },
  }
})
