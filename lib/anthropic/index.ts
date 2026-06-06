import Anthropic from '@anthropic-ai/sdk'
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const MODEL = 'claude-sonnet-4-20250514'
export const MAX_TOKENS = 2000
