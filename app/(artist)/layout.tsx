import Link from 'next/link'
import { SignOutButton } from '@/components/auth/SignOutButton'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-white">
            ArtistOS
          </Link>
          <nav className="flex items-center gap-6 text-sm text-white/60">
            <Link href="/dashboard" className="transition hover:text-white">
              Dashboard
            </Link>
            <Link href="/vault" className="transition hover:text-white">
              Sound Vault
            </Link>
            {!DEMO && <SignOutButton />}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
