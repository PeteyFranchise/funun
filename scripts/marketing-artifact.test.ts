// ─── Marketing artifact pipeline tests ─────────────────────────────────────
// Quick task 260930-ibp. No jsdom exists in this repo (jest.config.js is
// testEnvironment: 'node'), so nothing here pretends to observe rendering.
// These are pure string-transformation and set-reconciliation tests against
// small hand-built fixtures — never against the real bench page (it is
// gitignored and changes constantly) and never through a parser/serializer.

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
} from './marketing-assets'

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
