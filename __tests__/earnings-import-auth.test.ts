import { readFileSync } from 'fs'
import path from 'path'

// Guards audit #9: the earnings-import route must authenticate + rate-limit
// BEFORE it reads/parses the multipart body — otherwise it is an unauthenticated
// CPU/memory (DSR parser) endpoint. Asserted at the source level because a true
// concurrency/DoS test needs a live runtime.
const src = readFileSync(path.join(process.cwd(), 'app/api/earnings/import/route.ts'), 'utf8')

describe('earnings import — auth + rate-limit before parse (audit #9)', () => {
  it('checks auth and 401s before reading the request body', () => {
    const authIdx = src.indexOf('auth.getUser()')
    const bodyIdx = src.indexOf('request.formData()')
    expect(authIdx).toBeGreaterThan(-1)
    expect(bodyIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeLessThan(bodyIdx)
    expect(src).toContain('status: 401')
  })

  it('rate-limits (429) before the parser runs', () => {
    const rlIdx = src.indexOf('checkRateLimit(`earnings-import')
    const parseIdx = src.indexOf('parseDsrFlatFile(text)')
    expect(rlIdx).toBeGreaterThan(-1)
    expect(parseIdx).toBeGreaterThan(-1)
    expect(rlIdx).toBeLessThan(parseIdx)
    expect(src).toContain('status: 429')
  })
})
