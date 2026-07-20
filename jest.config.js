/** @type {import('jest').Config} */

// The `/.claude/worktrees/` ignore below was added (656a307) so that running
// the suite from the MAIN checkout doesn't double-discover test files nested
// inside other agents' isolated worktrees. That assumed jest always runs
// from the main checkout — but an executor agent's rootDir IS itself
// `.claude/worktrees/<name>/` when running from inside its own isolated
// worktree, so a plain substring match self-excludes every test file in the
// current worktree too (verified: `npx jest --listTests` returns 0 matches
// from inside a worktree with the old pattern). Fix: only ignore SIBLING
// worktree copies, never the one we are currently rooted in.
const worktreeMatch = __dirname.match(/\.claude[\\/]worktrees[\\/]([^\\/]+)/)
const currentWorktreeName = worktreeMatch ? worktreeMatch[1] : null
const worktreeIgnorePattern = currentWorktreeName
  ? `\\.claude/worktrees/(?!${currentWorktreeName}/)`
  : '/.claude/worktrees/'

// @react-pdf/renderer (first exercised by lib/vault/pdf/split-sheet.test.ts)
// ships pure ESM ("type": "module", no CJS build) across its whole
// dependency tree. Jest's default transformIgnorePatterns skips
// node_modules entirely, so `import`/`export` in these packages fails to
// parse under ts-jest's commonjs output. Route ONLY this known ESM subtree
// through babel-jest + the already-installed `next/babel` preset (which
// bundles a modules-to-commonjs transform) — everything else in
// node_modules stays untransformed, exactly as before.
const esmPdfDeps = [
  '@react-pdf',
  '@noble',
  'fontkit',
  'jay-peg',
  'linebreak',
  'png-js',
  'vite-compatible-readable-stream',
  'yoga-layout',
  'emoji-regex-xs',
  'abs-svg-path',
  'color-string',
  'color-name',
  'normalize-svg-path',
  'parse-svg-path',
  'svg-arc-to-cubic-bezier',
  'is-url',
  'js-md5',
  'browserify-zlib',
].join('|')

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    worktreeIgnorePattern,
  ],
  transformIgnorePatterns: [
    `/node_modules/(?!(${esmPdfDeps})/)`,
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2017',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        // React 18 automatic JSX runtime — needed the moment a .tsx file is
        // imported by a test (first hit: lib/vault/pdf/split-sheet.test.ts).
        // ts-jest is the only JSX transform in this pipeline (no separate
        // Babel step), so without this every .tsx import fails to parse.
        jsx: 'react-jsx',
        paths: {
          '@/*': ['./*'],
        },
      },
    }],
    [`node_modules/(${esmPdfDeps})/.*\\.m?js$`]: ['babel-jest', {
      presets: ['next/babel'],
      plugins: [require.resolve('./jest.babel-plugins.js')],
      babelrc: false,
      configFile: false,
    }],
  },
}

module.exports = config
