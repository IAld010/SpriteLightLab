import { startE2eServer } from './server'

export default async function globalSetup(): Promise<void> {
  await startE2eServer()
}