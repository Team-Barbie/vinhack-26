import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  plugins: [
    {
      name: 'gaze-log-dump',
      configureServer(server) {
        server.middlewares.use('/__gaze-log', (req, res, next) => {
          if (req.method !== 'POST') {
            next()
            return
          }
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(Buffer.from(c)))
          req.on('end', () => {
            const file = path.resolve(process.cwd(), 'gaze-look-log.json')
            fs.writeFileSync(file, Buffer.concat(chunks))
            res.statusCode = 204
            res.end()
          })
        })
      },
    },
  ],
})
