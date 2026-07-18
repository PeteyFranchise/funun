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

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    worktreeIgnorePattern,
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
        paths: {
          '@/*': ['./*'],
        },
      },
    }],
  },
}

module.exports = config
