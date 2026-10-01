// ─── Marketing artifact pipeline tests ─────────────────────────────────────
// Quick task 260930-ibp. No jsdom exists in this repo (jest.config.js is
// testEnvironment: 'node'), so nothing here pretends to observe rendering.
// These are pure string-transformation and set-reconciliation tests against
// small hand-built fixtures — never against the real bench page (it is
// gitignored and changes constantly) and never through a parser/serializer.

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
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
  absoluteSiteUrl,
  assertOccurrences,
  buildHeadMetadata,
  countOccurrences,
  HEAD_LOCAL_ASSET_PATHS,
  IMAGE_ERROR_LISTENER,
  injectNoncePlaceholder,
  NONCE_PLACEHOLDER,
  ARTIFACT_OUTPUT_PATH,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  PRODUCTION_CANONICAL_URL,
  removeAllMatches,
  removeBetween,
  removeExactly,
  replaceExactly,
  rewriteAssetPaths,
  stripCssComments,
  stripHtmlComments,
  stripHtmlCssJsComments,
  stripJsComments,
  TWITTER_CARD_TYPE,
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

describe('head metadata — rich link preview and icons', () => {
  describe('absoluteSiteUrl', () => {
    it('joins a root-relative path onto the production canonical url', () => {
      expect(absoluteSiteUrl('/marketing/og.jpg')).toBe('https://www.funun.studio/marketing/og.jpg')
    })

    it('never produces a doubled slash once the scheme is stripped', () => {
      const url = absoluteSiteUrl('/marketing/og.jpg')
      const withoutScheme = url.replace(/^https?:\/\//, '')
      expect(withoutScheme).not.toContain('//')
    })

    it('starts with PRODUCTION_CANONICAL_URL, proving the host has one source', () => {
      expect(OG_IMAGE_URL.startsWith(PRODUCTION_CANONICAL_URL)).toBe(true)
    })
  })

  describe('buildHeadMetadata', () => {
    const block = buildHeadMetadata()

    it('contains exactly one each of the new image/icon tags', () => {
      expect(countOccurrences(block, 'og:image"')).toBe(1)
      expect(countOccurrences(block, 'og:image:width')).toBe(1)
      expect(countOccurrences(block, 'og:image:height')).toBe(1)
      expect(countOccurrences(block, 'og:image:alt')).toBe(1)
      expect(countOccurrences(block, 'twitter:image')).toBe(1)
      expect(countOccurrences(block, 'rel="icon"')).toBe(1)
      expect(countOccurrences(block, 'rel="apple-touch-icon"')).toBe(1)
    })

    it('declares the large-image twitter card and never the summary card', () => {
      expect(block).toContain(`<meta name="twitter:card" content="${TWITTER_CARD_TYPE}">`)
      expect(TWITTER_CARD_TYPE).toBe('summary_large_image')
      expect(block).not.toContain('<meta name="twitter:card" content="summary">')
    })

    it('matches the real og.jpg dimensions (1200x630)', () => {
      expect(OG_IMAGE_WIDTH).toBe('1200')
      expect(OG_IMAGE_HEIGHT).toBe('630')
      expect(block).toContain(`content="${OG_IMAGE_WIDTH}"`)
      expect(block).toContain(`content="${OG_IMAGE_HEIGHT}"`)
    })

    it('carries the owner-approved alt text verbatim', () => {
      expect(block).toContain(OG_IMAGE_ALT)
    })

    it('every local asset path referenced resolves to an existing file under public/', () => {
      expect(HEAD_LOCAL_ASSET_PATHS.length).toBeGreaterThan(0)
      for (const path of HEAD_LOCAL_ASSET_PATHS) {
        expect(existsSync(join('public', path))).toBe(true)
      }
    })
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

  // ─── rich link preview + favicon (quick task 261001-rlp) ────────────────
  // Sliced to the head block (start of file to the first <style) so a stray
  // match 1890 lines deep in the body cannot make any of these pass.
  const styleIdx = html.indexOf('<style')
  const headSlice = artifactExists ? html.slice(0, styleIdx) : ''

  it('isolates a non-empty head slice ending before the first <style tag', () => {
    expect(styleIdx).toBeGreaterThan(0)
    expect(headSlice.length).toBeGreaterThan(0)
  })

  it('still carries all 17 PROHIBITED_LITERALS at 0 -- length asserted first so a silently shortened list cannot print green', () => {
    expect(PROHIBITED_LITERALS.length).toBe(17)
    expect(verifyArtifact(html, manifest)).toEqual([])
  })

  it('contains exactly one each of the new image/icon tags in the head', () => {
    // og:image" (closing quote) isolates the property itself from its three
    // sub-properties, which all contain "og:image" as a bare prefix.
    expect(countOccurrences(headSlice, 'og:image"')).toBe(1)
    expect(countOccurrences(headSlice, 'og:image:width')).toBe(1)
    expect(countOccurrences(headSlice, 'og:image:height')).toBe(1)
    expect(countOccurrences(headSlice, 'og:image:alt')).toBe(1)
    expect(countOccurrences(headSlice, 'twitter:image')).toBe(1)
    expect(countOccurrences(headSlice, 'rel="icon"')).toBe(1)
    expect(countOccurrences(headSlice, 'rel="apple-touch-icon"')).toBe(1)
    // Pinned relationship, not dodged: the bare prefix is exactly 4 because
    // og:image:width/height/alt each contain "og:image" as a prefix.
    expect(countOccurrences(headSlice, 'og:image')).toBe(4)
  })

  it('declares the large-image twitter card and never ships the summary card', () => {
    expect(headSlice).toContain(`<meta name="twitter:card" content="${TWITTER_CARD_TYPE}">`)
    expect(html).not.toContain('<meta name="twitter:card" content="summary">')
  })

  it('resolves every head image/icon URL to a file that exists under public/', () => {
    const ogImageMatch = headSlice.match(/<meta property="og:image" content="([^"]+)">/)
    const twitterImageMatch = headSlice.match(/<meta name="twitter:image" content="([^"]+)">/)
    const iconHrefs = [...headSlice.matchAll(/<link rel="([^"]*)" href="([^"]+)"/g)]
      .filter(([, rel]) => rel.includes('icon'))
      .map(([, , href]) => href)

    expect(ogImageMatch).not.toBeNull()
    expect(twitterImageMatch).not.toBeNull()

    const rawUrls = [ogImageMatch![1], twitterImageMatch![1], ...iconHrefs]
    // Non-empty-set guard: an empty extracted set would make the resolution
    // loop below pass vacuously, which is the exact failure mode the old
    // "nothing to point at" comment existed to avoid.
    expect(rawUrls.length).toBeGreaterThan(0)

    const toPublicRelative = (url: string): string => {
      if (/^https?:\/\//.test(url)) {
        expect(url.startsWith(PRODUCTION_CANONICAL_URL)).toBe(true)
        return `/${url.slice(PRODUCTION_CANONICAL_URL.length)}`
      }
      return url
    }

    const relativePaths = rawUrls.map(toPublicRelative)
    for (const path of relativePaths) {
      expect(existsSync(join('public', path))).toBe(true)
    }

    const normalizedExtracted = Array.from(new Set(relativePaths)).sort()
    const normalizedExpected = Array.from(new Set(HEAD_LOCAL_ASSET_PATHS)).sort()
    expect(normalizedExtracted).toEqual(normalizedExpected)
  })

  // ─── Quick task 261001-cmt: permanent post-strip assertions ────────────
  // These run against the COMMITTED, comment-free artifact on every CI run
  // (the tokenizer itself is proven in isolation by the describe blocks
  // above; this section proves sanitize()'s wiring of it is still correct).

  it('the single <script> body parses with node --check, proven with a positive control', () => {
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)
    expect(scriptMatch).not.toBeNull()
    const body = scriptMatch![1]
    expect(body.length).toBeGreaterThan(1000)

    const okFile = join(tmpdir(), `cmt-script-check-${process.pid}-ok.js`)
    const badFile = join(tmpdir(), `cmt-script-check-${process.pid}-bad.js`)
    try {
      writeFileSync(okFile, body)
      expect(() => execFileSync(process.execPath, ['--check', okFile], { stdio: 'pipe' })).not.toThrow()

      // Positive control: a parse check that cannot fail is not a check.
      // Drop the script's final closing brace to unbalance it.
      const lastBraceIdx = body.lastIndexOf('}')
      expect(lastBraceIdx).toBeGreaterThan(-1)
      const corrupted = body.slice(0, lastBraceIdx) + body.slice(lastBraceIdx + 1)
      writeFileSync(badFile, corrupted)
      expect(() => execFileSync(process.execPath, ['--check', badFile], { stdio: 'pipe' })).toThrow()
    } finally {
      for (const f of [okFile, badFile]) {
        if (existsSync(f)) unlinkSync(f)
      }
    }
  })

  it('D-06 leak literals all count 0, including the date-stamped .md filename the .planning/ prefix ban misses (F-03a)', () => {
    // Length asserted first, same discipline as the PROHIBITED_LITERALS
    // guard below -- a silently shortened list must not be able to print
    // green. These five literals plus the regex pattern are in addition to
    // (not a replacement for) the 17 PROHIBITED_LITERALS verify-marketing-
    // artifact.ts already checks.
    const leakLiterals = [
      'lib/sync-library/agreement.ts',
      'lib/deals/catalog-sample.ts',
      'lib/tools/splitsheet.ts',
      'components/selects-player/SelectsPlayer.tsx',
      'counsel/BD',
      '4-8 weeks',
    ]
    expect(leakLiterals.length).toBe(6)
    for (const literal of leakLiterals) {
      expect(countOccurrences(html, literal)).toBe(0)
    }
    // F-03a: the verifier's ".planning/" prefix ban does not catch a BARE
    // internal planning filename shipped beside it -- assert the date-
    // stamped-.md shape directly instead. Never assert on the word
    // "exclusivity" alone (F-03b): it also appears in legitimate, visible
    // FAQ copy.
    const dateStampedMdRe = /\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md/g
    expect(html.match(dateStampedMdRe)).toBeNull()
  })

  it('is comment-free by two independent methods: the tokenizer counts and dumb regexes agreeing', () => {
    // Dumb, tokenizer-independent regexes. F-02 proves their preconditions
    // hold for this specific input (no legitimate "<!--" in the file, no
    // legitimate "/*" inside <style>, no legitimate "/*" or "//" inside the
    // single <script> body) -- a dumb regex is wrong in general, but this is
    // a real cross-check because its failure mode differs from the
    // tokenizer's.
    expect(countOccurrences(html, '<!--')).toBe(0)

    const styleBodies = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
    expect(styleBodies.length).toBe(2)
    for (const css of styleBodies) {
      expect(countOccurrences(css, '/*')).toBe(0)
    }

    const scriptBodies = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(scriptBodies.length).toBe(1)
    for (const js of scriptBodies) {
      expect(countOccurrences(js, '/*')).toBe(0)
      expect(countOccurrences(js, '//')).toBe(0)
    }
  })

  it('still carries the four JS regex literals, the nonce placeholder exactly once, and all six art: strings (3 with &mdash;)', () => {
    expect(countOccurrences(html, '__CSP_NONCE_PLACEHOLDER__')).toBe(1)

    for (const literal of ['/&/g', '/</g', '/"/g', '/\\s+/']) {
      expect(countOccurrences(html, literal)).toBeGreaterThanOrEqual(1)
    }

    const artMatches = html.match(/art:'[^']*'/g) ?? []
    expect(artMatches.length).toBe(6)
    const mdashCount = artMatches.filter((m) => m.includes('&mdash;')).length
    expect(mdashCount).toBe(3)
  })

  it('manifest shape: 50 assets, 7 fonts, nonceScriptCount 1', () => {
    expect(manifest.assets.length).toBe(50)
    expect(manifest.fonts.length).toBe(7)
    expect(manifest.nonceScriptCount).toBe(1)
  })
})

// CodeQL js/bad-tag-filter: the nonce regex was lowercase-only, so <SCRIPT>
// would have been skipped. HTML tag names are case-insensitive; a sanitizer
// that only handles the casing its current input happens to use is a filter
// that works by luck. Today's frozen source is all lowercase — that is a fact
// about one revision, not a guarantee.
describe('injectNoncePlaceholder — tag casing (CodeQL js/bad-tag-filter)', () => {
  it('nonces lowercase, uppercase and mixed-case script tags alike', () => {
    const html = '<script>a</script><SCRIPT>b</SCRIPT><Script type="x">c</Script>'
    const { html: out, count } = injectNoncePlaceholder(html)
    expect(count).toBe(3)
    expect((out.match(/nonce="/g) ?? []).length).toBe(3)
  })

  it('does not double-nonce a tag that already has one', () => {
    const { count } = injectNoncePlaceholder('<script nonce="x">a</script>')
    expect(count).toBe(1)
  })
})

// ─── Quick task 261001-cmt: the comment tokenizer ───────────────────────────
// Every fixture below is a small hand-built string, never the real bench
// page (gitignored, changes constantly) and never routed through an HTML
// parser/serializer — exactly the house style of the primitives above.
// `sanitize()` is not wired to any of this yet (Task 2); these tests prove
// the tokenizer in isolation first.

describe('stripJsComments', () => {
  describe('regex-literal vs string/division traps (F-02)', () => {
    it('does not let a double-quote inside a regex literal open a string', () => {
      const input = 'esc(/"/g)'
      const result = stripJsComments(input)
      expect(result.js).toBe(input)
      expect(result.lineComments).toBe(0)
      expect(result.blockComments).toBe(0)
    })

    it('does not let a single-quote inside a regex literal open a string', () => {
      const input = "x(/'/g)"
      expect(stripJsComments(input).js).toBe(input)
    })

    it('does not let a backtick inside a regex literal open a template literal', () => {
      const input = 'x(/`/g)'
      expect(stripJsComments(input).js).toBe(input)
    })

    it('does not let a / inside a regex character class close the regex', () => {
      const input = 'const r = /[/]/g;'
      expect(stripJsComments(input).js).toBe(input)
    })

    it('opens a regex after a comma, an equals sign, a colon, and the return keyword', () => {
      const cases = [
        'f(a, /x/, b);',
        'let r = /x/;',
        '({a: /x/});',
        'function g(){ return /x/; }',
      ]
      for (const input of cases) {
        expect(stripJsComments(input).js).toBe(input)
      }
    })

    it('treats / as division (never regex) after a closing paren or an identifier/number', () => {
      // If either were misclassified as regex-opening, the scanner would
      // run to end-of-input looking for a closing delimiter that does not
      // exist and throw — so this test is a real behavioral check, not
      // just a byte-identity assertion.
      const cases = ['const q = (a + b) / c;', 's/2;']
      for (const input of cases) {
        expect(stripJsComments(input).js).toBe(input)
      }
    })
  })

  describe('comment-content traps — quotes/backticks inside comments (F-02)', () => {
    it('does not open a string on an apostrophe inside a line comment', () => {
      const input = "// the Writer's Room alone"
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.js).toBe('')
    })

    it('does not open a string on a double quote inside a line comment', () => {
      const input = '// he said "no"'
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.js).toBe('')
    })

    it('does not open a template literal on a backtick inside a line comment', () => {
      const input = '// the `beta:` field'
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.js).toBe('')
    })

    it('a line comment containing /* is not read as opening a block comment', () => {
      const input = '// see /* not a block */'
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.blockComments).toBe(0)
      expect(result.js).toBe('')
    })

    it('a block comment containing // does not terminate early as a line comment', () => {
      const input = '/* contains // not a line comment */'
      const result = stripJsComments(input)
      expect(result.blockComments).toBe(1)
      expect(result.lineComments).toBe(0)
      expect(result.js).toBe(' ')
    })

    it('// inside each quote style survives, byte-identical', () => {
      for (const input of ["'a // b'", '"a // b"', '`a // b`']) {
        const result = stripJsComments(input)
        expect(result.js).toBe(input)
        expect(result.lineComments).toBe(0)
      }
    })

    it('/* inside each quote style survives, byte-identical', () => {
      for (const input of ["'a /* b'", '"a /* b"', '`a /* b`']) {
        const result = stripJsComments(input)
        expect(result.js).toBe(input)
        expect(result.blockComments).toBe(0)
      }
    })

    it('strips a comment inside a template substitution without touching the literal text', () => {
      const input = '`x ${ a /* c */ + b } y`'
      const result = stripJsComments(input)
      expect(result.blockComments).toBe(1)
      expect(result.js).not.toContain('/*')
      expect(result.js.startsWith('`x ${')).toBe(true)
      expect(result.js.endsWith('} y`')).toBe(true)
      expect(result.js).toContain('a')
      expect(result.js).toContain('+ b')
    })

    it('does not end a single-quoted string on an escaped quote', () => {
      const input = "code(); var s = 'it\\'s'; done();"
      expect(stripJsComments(input).js).toBe(input)
    })

    it('does not end a double-quoted string on an escaped quote', () => {
      const input = 'code(); var s = "say \\"hi\\""; done();'
      expect(stripJsComments(input).js).toBe(input)
    })
  })

  describe('whitespace policy (D-03)', () => {
    it('keeps the trailing newline after a line comment (ASI)', () => {
      const input = 'code();// tail\nmore();'
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.js).toBe('code();\nmore();')
    })

    it('handles a trailing line comment with no newline at end of file', () => {
      const input = 'code();// tail'
      const result = stripJsComments(input)
      expect(result.lineComments).toBe(1)
      expect(result.js).toBe('code();')
    })

    it('collapses a multi-line block comment to a single newline', () => {
      const input = 'before/* one\ntwo */after'
      const result = stripJsComments(input)
      expect(result.blockComments).toBe(1)
      expect(result.js).toBe('before\nafter')
    })

    it('collapses a single-line block comment to a single space so adjacent tokens never merge', () => {
      const input = 'a/*x*/b'
      const result = stripJsComments(input)
      expect(result.blockComments).toBe(1)
      expect(result.js).toBe('a b')
    })
  })

  describe('unterminated input throws (D-08)', () => {
    it('throws on an unterminated block comment', () => {
      expect(() => stripJsComments('a /* not closed')).toThrow(/unterminated/i)
    })

    it('throws on an unterminated single-quoted string', () => {
      expect(() => stripJsComments("var s = 'not closed")).toThrow(/unterminated/i)
    })

    it('throws on an unterminated regex literal', () => {
      expect(() => stripJsComments('var r = /not closed')).toThrow(/unterminated/i)
    })

    it('throws on an unterminated template literal', () => {
      expect(() => stripJsComments('`not closed')).toThrow(/unterminated/i)
    })
  })

  describe('idempotence', () => {
    it('produces byte-identical output across two calls with the same input', () => {
      const input = '// a\nf();/* b */g();'
      const once = stripJsComments(input)
      const twiceFromSameInput = stripJsComments(input)
      expect(once.js).toBe(twiceFromSameInput.js)
    })

    it('reports all-zero counts on a second pass over already-stripped output', () => {
      const input = '// a\nf();/* b */g();'
      const first = stripJsComments(input)
      const second = stripJsComments(first.js)
      expect(second.lineComments).toBe(0)
      expect(second.blockComments).toBe(0)
      expect(second.js).toBe(first.js)
    })
  })
})

describe('stripCssComments', () => {
  it('does not treat a comment-looking string as a comment', () => {
    const input = "content:'/* not a comment */'"
    const result = stripCssComments(input)
    expect(result.blockComments).toBe(0)
    expect(result.css).toBe(input)
  })

  it('does not interpret // inside an unquoted url() token as anything special', () => {
    const input = 'background:url(data:image/svg+xml;base64,aa//bb)'
    const result = stripCssComments(input)
    expect(result.blockComments).toBe(0)
    expect(result.css).toBe(input)
  })

  it('does not open a string on a quote inside a CSS comment', () => {
    const input = "before/* a 'quoted' word */after"
    const result = stripCssComments(input)
    expect(result.blockComments).toBe(1)
    expect(result.css).toBe('beforeafter')
  })

  it('a nested-looking comment ends at the first close marker', () => {
    const input = 'before/* /* nested-looking */after'
    const result = stripCssComments(input)
    expect(result.blockComments).toBe(1)
    expect(result.css).toBe('beforeafter')
  })

  it('throws on an unterminated CSS comment', () => {
    expect(() => stripCssComments('a { color: red } /* not closed')).toThrow(/unterminated/i)
  })
})

describe('stripHtmlComments', () => {
  it('removes an HTML comment and leaves a doctype declaration untouched', () => {
    const input = '<!DOCTYPE html><html><!-- note --><body></body></html>'
    const result = stripHtmlComments(input)
    expect(result.comments).toBe(1)
    expect(result.markup).toBe('<!DOCTYPE html><html><body></body></html>')
  })

  it('throws on an unterminated HTML comment', () => {
    expect(() => stripHtmlComments('<!-- never closed')).toThrow(/unterminated/i)
  })
})

describe('stripHtmlCssJsComments', () => {
  it('never looks inside a <script> raw-text region for an HTML comment', () => {
    const input = "<script>var s='<!-- not a comment -->';</script>"
    const result = stripHtmlCssJsComments(input)
    expect(result.html).toBe(input)
    expect(result.counts.htmlComments).toBe(0)
    expect(result.counts.scriptRegions).toBe(1)
  })

  it('does not let --> inside JS terminate anything', () => {
    const input = "<script>var s='a --> b';</script>"
    const result = stripHtmlCssJsComments(input)
    expect(result.html).toBe(input)
  })

  it('recognises <SCRIPT>, <Style> and <script nonce="x"> regardless of casing/attributes', () => {
    const input =
      '<SCRIPT>a();//c\n</SCRIPT><Style>.a{color:red}/*c*/</Style><script nonce="x">b();</script>'
    const result = stripHtmlCssJsComments(input)
    expect(result.counts.scriptRegions).toBe(2)
    expect(result.counts.styleRegions).toBe(1)
    expect(result.counts.jsLineComments).toBe(1)
    expect(result.counts.cssBlockComments).toBe(1)
  })

  it('throws when a <script type="text/template"> body is fed to the JS stripper (D-08)', () => {
    const input = '<script type="text/template"><div>{{x}}</div></script>'
    expect(() => stripHtmlCssJsComments(input)).toThrow(/text\/template|not a JS type/i)
  })

  it('does not throw for <script type="module">', () => {
    const input = '<script type="module">import x from "y";//c\n</script>'
    expect(() => stripHtmlCssJsComments(input)).not.toThrow()
  })

  it('throws on an unclosed <style> tag', () => {
    expect(() => stripHtmlCssJsComments('<style>.a{color:red}')).toThrow(/unclosed|unterminated/i)
  })

  it('returns exactly the known comment counts for a fixture built to have them', () => {
    const input =
      '<!-- h1 --><div>x</div><!-- h2 -->' +
      '<style>/* c1 */a{}/* c2 */</style>' +
      '<script>//l1\n//l2\nf();/* b1 */g();</script>'
    const result = stripHtmlCssJsComments(input)
    expect(result.counts.htmlComments).toBe(2)
    expect(result.counts.cssBlockComments).toBe(2)
    expect(result.counts.jsLineComments).toBe(2)
    expect(result.counts.jsBlockComments).toBe(1)
    expect(result.counts.scriptRegions).toBe(1)
    expect(result.counts.styleRegions).toBe(1)
  })

  it('is idempotent: a second pass is a no-op and reports all-zero counts', () => {
    const input = '<!-- h --><style>/* c */a{}</style><script>//l\nf();</script>'
    const first = stripHtmlCssJsComments(input)
    const second = stripHtmlCssJsComments(first.html)
    expect(second.html).toBe(first.html)
    expect(second.counts).toEqual({
      htmlComments: 0,
      cssBlockComments: 0,
      jsLineComments: 0,
      jsBlockComments: 0,
      scriptRegions: 1,
      styleRegions: 1,
    })
  })
})
