import Link from 'next/link'
import { SignOutButton } from '@/components/auth/SignOutButton'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default function IndustryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/opportunities" className="text-sm font-semibold tracking-tight text-white">
            Funūn <span className="text-white/40">for Industry</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-white/60">
            <Link href="/opportunities" className="transition hover:text-white">
              Opportunities
            </Link>
            <Link href="/opportunities/new" className="transition hover:text-white">
              Post
            </Link>
            {!DEMO && <SignOutButton />}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
