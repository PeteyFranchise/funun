// ─── Marketing artifact pipeline tests ─────────────────────────────────────
// Quick task 260930-ibp. No jsdom exists in this repo (jest.config.js is
// testEnvironment: 'node'), so nothing here pretends to observe rendering.
// These are pure string-transformation and set-reconciliation tests against
// small hand-built fixtures — never against the real bench page (it is
// gitignored and changes constantly) and never through a parser/serializer.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeSha256,
  expandSelArtPaths,
  extractLiteralFontPaths,
  extractLiteralImagePaths,
  extractSelSlugs,
  getStaticImageCandidateSet,
  parseHarAssetPaths,
  reconcileAssetSets,
  verifyFrozenSource,
  FROZEN_LINE_COUNT,
  FROZEN_SHA256,
  MANIFEST_PATH,
  type MarketingManifest,
} from './marketing-assets'
import {
  assertOccurrences,
  countOccurrences,
  IMAGE_ERROR_LISTENER,
  injectNoncePlaceholder,
  NONCE_PLACEHOLDER,
  ARTIFACT_OUTPUT_PATH,
  removeAllMatches,
  removeBetween,
  removeExactly,
  replaceExactly,
  rewriteAssetPaths,
} from './build-marketing-artifact'
import { verifyArtifact, PROHIBITED_LITERALS } from './verify-marketing-artifact'

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'marketing-sanitizer')
const fixture = (name: string): string => readFileSync(join(FIXTURE_DIR, name), 'utf8')

// ─── Task 1: marketing-assets.ts ────────────────────────────────────────

describe('verifyFrozenSource', () => {
  it('matches when content hashes to the frozen sha256 and has the frozen line count', () => {
    // Build a fixture whose sha256 and line count are computed, then assert
    // verifyFrozenSource agrees with those independently-derived values
    // rather than hardcoding a fixture designed to match FROZEN_SHA256
    // (which would make the test tautological). Line count follows `wc -l`
    // semantics (count of newline characters), matching how the plan's own
    // gate is verified — not String.split('\n').length, which is always one
    // higher for content with a trailing newline.
    const fixture = 'line one\nline two\nline three\n'
    const result = verifyFrozenSource(fixture)
    expect(result.sha256).toBe(computeSha256(fixture))
    expect(result.lineCount).toBe(3)
    expect(result.matches).toBe(false) // not the real frozen content
  })

  it('reports mismatches for content that differs from the frozen baseline', () => {
    const result = verifyFrozenSource('not the frozen file at all')
    expect(result.matches).toBe(false)
    expect(result.sha256).not.toBe(FROZEN_SHA256)
    expect(result.lineCount).not.toBe(FROZEN_LINE_COUNT)
  })
})

describe('extractLiteralImagePaths', () => {
  it('finds every literal img/ reference and dedupes repeats', () => {
    const html = `
      <img src="img/face-01.jpg">
      <img src="img/face-01.jpg">
      <div style="background:url(img/composer-bach.jpg)"></div>
      shot:'img/tool-antenna-vault-to-brief.png',
    `
    expect(extractLiteralImagePaths(html)).toEqual([
      'img/composer-bach.jpg',
      'img/face-01.jpg',
      'img/tool-antenna-vault-to-brief.png',
    ])
  })

  it('ignores non-image extensions and non-img paths', () => {
    const html = `<script src="js/img/not-really.js"></script><a href="/img">no ext</a>`
    expect(extractLiteralImagePaths(html)).toEqual([])
  })
})

describe('extractLiteralFontPaths', () => {
  it('finds every literal fonts/ woff2 reference', () => {
    const html = `
      src:url(fonts/inter-400.woff2) format('woff2');
      src:url(fonts/grand-hotel-400.woff2) format('woff2');
    `
    expect(extractLiteralFontPaths(html)).toEqual([
      'fonts/grand-hotel-400.woff2',
      'fonts/inter-400.woff2',
    ])
  })
})

describe('extractSelSlugs / expandSelArtPaths', () => {
  it('parses the SEL array declaration and returns the slug from each row', () => {
    const html = `
      const SEL=[
        ['Paper','paper','3:24'],
        ['Moonlight','moonlight','3:41'],
        ['Midnight Ride','midnight-ride','2:58'],
        ['Golden Hour','golden-hour','4:05'],
      ];
      (function buildSelects(){})();
    `
    expect(extractSelSlugs(html)).toEqual(['paper', 'moonlight', 'midnight-ride', 'golden-hour'])
    expect(expandSelArtPaths(extractSelSlugs(html))).toEqual([
      'img/art/paper.jpg',
      'img/art/moonlight.jpg',
      'img/art/midnight-ride.jpg',
      'img/art/golden-hour.jpg',
    ])
  })

  it('returns an empty array when no SEL declaration is present', () => {
    expect(extractSelSlugs('<div>no sel array here</div>')).toEqual([])
  })
})

describe('getStaticImageCandidateSet', () => {
  it('unions literal image paths with the SEL-expanded art paths, deduped', () => {
    const html = `
      <img class="sel-cover" src="img/art/paper.jpg" alt="">
      const SEL=[
        ['Paper','paper','3:24'],
        ['Moonlight','moonlight','3:41'],
      ];
      + '<img src="img/art/'+slug+'.jpg" alt="">'
    `
    // 'paper' appears both as a literal and via SEL expansion — must not
    // duplicate. 'moonlight' only exists via SEL expansion.
    expect(getStaticImageCandidateSet(html)).toEqual(['img/art/moonlight.jpg', 'img/art/paper.jpg'])
  })
})

describe('parseHarAssetPaths', () => {
  it('keeps same-origin image/font entries, strips query strings and the /marketing/ prefix', () => {
    const har = {
      log: {
        entries: [
          {
            request: { url: 'http://127.0.0.1:4321/marketing/img/face-01.jpg?v=3' },
            response: { content: { mimeType: 'image/jpeg' } },
          },
          {
            request: { url: 'http://127.0.0.1:4321/marketing/fonts/inter-400.woff2' },
            response: { content: { mimeType: 'font/woff2' } },
          },
          // non-asset entry (the HTML document itself) must be excluded
          {
            request: { url: 'http://127.0.0.1:4321/marketing.html' },
            response: { content: { mimeType: 'text/html' } },
          },
        ],
      },
    }
    expect(parseHarAssetPaths(har)).toEqual(['fonts/inter-400.woff2', 'img/face-01.jpg'])
  })

  it('returns an empty array for a HAR with no entries', () => {
    expect(parseHarAssetPaths({})).toEqual([])
  })
})

describe('reconcileAssetSets', () => {
  it('passes when every observed path is explained by the static candidate set', () => {
    const result = reconcileAssetSets(
      ['img/face-01.jpg', 'fonts/inter-400.woff2'],
      ['img/face-01.jpg'],
      ['fonts/inter-400.woff2'],
    )
    expect(result.ok).toBe(true)
    expect(result.unaccounted).toEqual([])
  })

  it('fails and names the offender when a browser-observed path has no static explanation', () => {
    const result = reconcileAssetSets(
      ['img/face-01.jpg', 'img/mystery-construction-site.jpg'],
      ['img/face-01.jpg'],
      [],
    )
    expect(result.ok).toBe(false)
    expect(result.unaccounted).toEqual(['img/mystery-construction-site.jpg'])
  })
})

// ─── Task 2: build-marketing-artifact.ts primitives ─────────────────────
// No HTML parser is used anywhere in this file or the module under test.
// Every case below is anchored string replacement against small,
// hand-built fixtures — proving the primitives fail closed exactly the way
// the real sanitize() pipeline depends on them to.

describe('removeBetween', () => {
  it('removes the bench toolbar div and leaves surrounding markup byte-identical', () => {
    const input = fixture('bench-toolbar.html')
    const output = removeBetween(input, '<div class="bench">', '</div>', 'bench toolbar div')
    expect(output).not.toContain('Bench 02')
    expect(output).not.toContain('<div class="bench">')
    expect(output).toContain('<p>BEFORE-MARKER content that must survive byte-identical.</p>')
    expect(output).toContain('<p>AFTER-MARKER content that must survive byte-identical.</p>')
    // everything outside the removed span is untouched, not just present
    const before = input.slice(0, input.indexOf('<div class="bench">'))
    const after = input.slice(input.indexOf('</div>') + '</div>'.length)
    expect(output.startsWith(before)).toBe(true)
    expect(output.endsWith(after)).toBe(true)
  })

  it('throws rather than removing to end-of-file when the end marker is absent', () => {
    const input = fixture('missing-end-marker.html')
    expect(() => removeBetween(input, '<div class="bench">', '</div>', 'bench toolbar div')).toThrow(
      /end anchor not found/,
    )
  })

  it('throws rather than removing an arbitrary occurrence when the start anchor appears twice', () => {
    const input = fixture('duplicate-anchor.html')
    expect(() => removeBetween(input, '<div class="bench">', '</div>', 'bench toolbar div')).toThrow(
      /expected 1 occurrence/,
    )
  })
})

describe('assertOccurrences / countOccurrences', () => {
  it('counts overlapping-free literal occurrences correctly', () => {
    expect(countOccurrences('aXaXa', 'a')).toBe(3)
    expect(countOccurrences('no match here', 'zzz')).toBe(0)
  })

  it('throws with a message naming the expected and actual count', () => {
    expect(() => assertOccurrences('a a a', 'a', 1, 'letter a')).toThrow(/expected 1.*found 3/)
  })
})

describe('removeExactly / replaceExactly', () => {
  it('removes a single-occurrence token, leaving the rest untouched', () => {
    const input = '<a class="navsignin" href="/signin" data-authopen>Sign in</a>'
    const output = removeExactly(input, ' data-authopen', 'data-authopen attribute')
    expect(output).toBe('<a class="navsignin" href="/signin">Sign in</a>')
  })

  it('throws when the token is absent', () => {
    expect(() => removeExactly('<a href="/signin">Sign in</a>', ' data-authopen', 'label')).toThrow(
      /expected 1/,
    )
  })

  it('replaces a single-occurrence token with the given replacement', () => {
    const input = '<title>Funūn bench 02 — marketing page</title>'
    const output = replaceExactly(input, input, '<title>Production title</title>', 'title')
    expect(output).toBe('<title>Production title</title>')
  })
})

describe('removeAllMatches', () => {
  it('removes every match once the count matches expectations', () => {
    const input = '<p class="flag">a</p>mid<p class="flag reveal">b</p>end'
    const output = removeAllMatches(input, /<p class="flag[^"]*">[\s\S]*?<\/p>/g, 2, '.flag paragraphs')
    expect(output).toBe('midend')
  })

  it('throws when the observed count does not match the expected count', () => {
    const input = '<p class="flag">a</p>only one here'
    expect(() =>
      removeAllMatches(input, /<p class="flag[^"]*">[\s\S]*?<\/p>/g, 2, '.flag paragraphs'),
    ).toThrow(/expected 2 match\(es\), found 1/)
  })

  it('requires the global flag on the supplied regex', () => {
    expect(() => removeAllMatches('x', /x/, 1, 'label')).toThrow(/global flag/)
  })
})

describe('rewriteAssetPaths', () => {
  it('prefixes relative img/ and fonts/ paths, leaving absolute paths and anchors untouched', () => {
    const input =
      '<img src="img/x.jpg" alt=""><style>@font-face{src:url(fonts/inter-400.woff2)}</style>' +
      '<a href="/signin">Sign in</a><a href="#anchor">Jump</a>'
    const { html, paths } = rewriteAssetPaths(input)
    expect(html).toContain('src="/marketing/img/x.jpg"')
    expect(html).toContain('url(/marketing/fonts/inter-400.woff2)')
    expect(html).toContain('href="/signin"')
    expect(html).toContain('href="#anchor"')
    expect(paths).toEqual(['/marketing/fonts/inter-400.woff2', '/marketing/img/x.jpg'])
  })

  it('rewrites the SEL-array img/art/ concatenation prefix used for slugs with no full literal path', () => {
    const input = '+ \'<img src="img/art/\'+slug+\'.jpg" alt="">\''
    const { html } = rewriteAssetPaths(input)
    expect(html).toBe('+ \'<img src="/marketing/img/art/\'+slug+\'.jpg" alt="">\'')
  })

  it('does not double-prefix an already-rewritten path', () => {
    const input = 'src="/marketing/img/x.jpg"'
    const { html } = rewriteAssetPaths(input)
    expect(html).toBe(input)
  })
})

describe('onerror removal and image-error listener injection (F2)', () => {
  // Mirrors the exact regex the sanitizer runs internally, rather than
  // importing a private constant -- consistent with how rewriteAssetPaths'
  // tests above build their own inline fixtures against the exported
  // primitive rather than reaching into pipeline-internal anchors.
  const ONERROR_RE = / onerror="this\.remove\(\)"/g

  it('removes both onerror="this.remove()" occurrences regardless of what follows them', () => {
    // The two real call sites differ in what comes right after the
    // attribute -- one closes a JS string literal (no ">"), the other
    // closes the <img> tag itself (ends in ">") -- so the fixture covers
    // both shapes rather than assuming they behave identically.
    const input =
      '\'<img src="a.jpg" alt="" loading="lazy" onerror="this.remove()"\'' +
      ' + \'<img src="b.jpg" alt="" loading="lazy" onerror="this.remove()">\''
    const result = removeAllMatches(input, ONERROR_RE, 2, 'test onerror removal')
    expect(result).not.toContain('onerror')
    expect(result).toContain('\'<img src="a.jpg" alt="" loading="lazy"\'')
    expect(result).toContain('+ \'<img src="b.jpg" alt="" loading="lazy">\'')
  })

  it('throws rather than silently leaving one behind when the observed count drifts', () => {
    const onlyOne = ' onerror="this.remove()"'
    expect(() => removeAllMatches(onlyOne, ONERROR_RE, 2, 'test')).toThrow(/expected 2/)
  })

  it('injects a capture-phase document-level error listener right after the ASSET_V declaration', () => {
    const declaration = "const ASSET_V='202609271636';"
    const input = declaration + '\nfunction next(){}'
    const injected = replaceExactly(
      input,
      declaration,
      declaration + IMAGE_ERROR_LISTENER,
      'test injection',
    )
    expect(injected).toContain("document.addEventListener('error'")
    // capture phase (the 3rd, `true` argument) -- 'error' does not bubble,
    // so a bubble-phase listener on document would never see it.
    expect(injected).toContain(", true);")
    expect(injected).toContain('e.target instanceof HTMLImageElement')
    expect(injected.indexOf("addEventListener('error'")).toBeGreaterThan(
      injected.indexOf('ASSET_V'),
    )
    // registered before the next statement in the script runs
    expect(injected.indexOf('function next')).toBeGreaterThan(
      injected.indexOf("addEventListener('error'"),
    )
  })
})

describe('injectNoncePlaceholder', () => {
  it('inserts the placeholder on every surviving <script> tag and returns the count', () => {
    const input = '<script>a()</script><p>mid</p><script>b()</script>'
    const { html, count } = injectNoncePlaceholder(input)
    expect(count).toBe(2)
    expect(countOccurrences(html, `<script nonce="${NONCE_PLACEHOLDER}"`)).toBe(2)
    expect(html).toContain('a()</script>')
    expect(html).toContain('b()</script>')
  })

  it('returns count 0 when no script tag is present', () => {
    const { count } = injectNoncePlaceholder('<p>no scripts here</p>')
    expect(count).toBe(0)
  })
})

describe('idempotence', () => {
  it('produces byte-identical output across two calls with the same input', () => {
    const input = fixture('bench-toolbar.html')
    const once = removeBetween(input, '<div class="bench">', '</div>', 'bench toolbar div')
    const twiceFromSameInput = removeBetween(input, '<div class="bench">', '</div>', 'bench toolbar div')
    expect(once).toBe(twiceFromSameInput)
  })
})

// ─── Task 2: verify-marketing-artifact.ts ────────────────────────────────

describe('verifyArtifact', () => {
  const emptyManifest: MarketingManifest = {
    sourceSha256: 'irrelevant-for-this-test',
    harCapturedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    fonts: [],
  }

  it('fails independently for every prohibited literal in a deliberately-dirty fixture', () => {
    const dirty = fixture('dirty-verifier.html')
    const violations = verifyArtifact(dirty, emptyManifest)
    // one assertion per literal, so a failure names the offender -- assert
    // each configured literal produced its own violation line, not just
    // that the overall check failed.
    for (const literal of PROHIBITED_LITERALS) {
      const hasViolation = violations.some((v) => v.includes(literal))
      expect(hasViolation).toBe(true)
    }
  })

  it('passes clean input with no violations', () => {
    const clean =
      '<html><body><main><p style="padding-top:0">clean</p></main>' +
      'main{padding-top:44px}' +
      '<body data-bg="black" data-hero="stream">' +
      `<script nonce="${NONCE_PLACEHOLDER}">ok()</script></body></html>`
    const manifest: MarketingManifest = { ...emptyManifest, nonceScriptCount: 1 }
    expect(verifyArtifact(clean, manifest)).toEqual([])
  })

  it('flags a referenced asset path that is absent from the manifest', () => {
    const html = '<img src="/marketing/img/not-in-manifest.jpg">'
    const violations = verifyArtifact(html, emptyManifest)
    expect(violations.some((v) => v.includes('not-in-manifest.jpg'))).toBe(true)
  })

  it('flags any inline event-handler attribute independently of the literal list (F2)', () => {
    const dirty = fixture('dirty-verifier.html')
    const violations = verifyArtifact(dirty, emptyManifest)
    expect(violations.some((v) => v.includes('onerror'))).toBe(true)
  })

  it('does not flag a document-level addEventListener registration as an inline handler', () => {
    const clean =
      '<html><body><main><p style="padding-top:0">clean</p></main>' +
      'main{padding-top:44px}' +
      '<body data-bg="black" data-hero="stream">' +
      `<script nonce="${NONCE_PLACEHOLDER}">` +
      "document.addEventListener('error', function(e){ e.target.remove(); }, true);" +
      '</script></body></html>'
    const manifest: MarketingManifest = { ...emptyManifest, nonceScriptCount: 1 }
    expect(verifyArtifact(clean, manifest)).toEqual([])
  })

  it('does not false-positive on non-event attributes that merely start with "on" (content=, font=, controls=)', () => {
    const clean =
      '<html><body><main>' +
      '<meta name="x" content="y"><span style="font:1em">t</span><audio controls="controls">' +
      '</main>' +
      'main{padding-top:44px}' +
      '<body data-bg="black" data-hero="stream">' +
      `<script nonce="${NONCE_PLACEHOLDER}">ok()</script></body></html>`
    const manifest: MarketingManifest = { ...emptyManifest, nonceScriptCount: 1 }
    expect(verifyArtifact(clean, manifest)).toEqual([])
  })
})

// ─── Assertions over the real generated artifact ─────────────────────────
// These do not touch the gitignored bench source -- they read the
// COMMITTED output (assets/marketing/landing.html), which is what CI has.
// Skipped gracefully if the artifact has not been generated in this
// checkout yet (e.g. a from-scratch clone before Task 1/2 first run).

const artifactExists = existsSync(ARTIFACT_OUTPUT_PATH)
const describeIfArtifact = artifactExists ? describe : describe.skip

describeIfArtifact('the real generated artifact', () => {
  const html = artifactExists ? readFileSync(ARTIFACT_OUTPUT_PATH, 'utf8') : ''
  const manifest: MarketingManifest = artifactExists
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as MarketingManifest)
    : ({} as MarketingManifest)

  it('passes the verifier with zero violations', () => {
    expect(verifyArtifact(html, manifest)).toEqual([])
  })

  it('records a nonceScriptCount in the manifest', () => {
    expect(manifest.nonceScriptCount).toBeGreaterThan(0)
  })

  it('preserves main{padding-top:44px} and the body data attributes', () => {
    expect(html).toContain('main{padding-top:44px}')
    expect(html).toContain('<body data-bg="black" data-hero="stream">')
  })

  it('never leaves the nonce placeholder token missing a surrounding <script nonce=...> tag', () => {
    const scriptCount = countOccurrences(html, '<script')
    const noncedCount = countOccurrences(html, `<script nonce="${NONCE_PLACEHOLDER}"`)
    expect(scriptCount).toBe(noncedCount)
    expect(scriptCount).toBeGreaterThan(0)
  })

  it('carries zero inline onerror attributes and a capture-phase replacement instead (F2)', () => {
    expect(html).not.toContain('onerror=')
    expect(html.match(/\bon[a-z]+="/g) ?? []).toEqual([])
    expect(html).toContain("document.addEventListener('error'")
    expect(html).toContain(', true);')
    expect(html).toContain('e.target instanceof HTMLImageElement')
  })
})
