import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ArtistOS',
  description: 'The operating system for an independent music career — built around Sound Vault.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
