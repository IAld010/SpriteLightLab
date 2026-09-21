import { preview, type PreviewServer } from 'vite'

let server: PreviewServer | undefined

export async function startE2eServer(): Promise<void> {
  server = await preview({
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  })
}

export async function stopE2eServer(): Promise<void> {
  await server?.close()
  server = undefined
}