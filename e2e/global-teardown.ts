import { stopE2eServer } from './server'

export default async function globalTeardown(): Promise<void> {
  await stopE2eServer()
}