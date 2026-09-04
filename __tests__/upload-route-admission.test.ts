import { readFileSync } from 'fs'
import path from 'path'

const routes = [
  'app/api/contracts/verify/route.ts',
  'app/api/profile/avatar/route.ts',
  'app/api/vault/[projectId]/assets/route.ts',
  'app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts',
]

describe('application-buffered upload routes', () => {
  it.each(routes)('%s authenticates before parsing and uses durable admission', route => {
    const source = readFileSync(path.join(process.cwd(), route), 'utf8')
    const authIndex = source.indexOf('.auth.getUser()')
    const admissionIndex = source.indexOf('parseAdmittedFormData(')
    expect(authIndex).toBeGreaterThan(-1)
    expect(admissionIndex).toBeGreaterThan(authIndex)
  })
})
