import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rotate4 — The Gravity Flip Game',
  description: 'Connect 4 meets gravity — place a piece on an opponent\'s and the whole board rotates.',
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00f5ff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-base text-slate-100 font-mono antialiased">
        {children}
      </body>
    </html>
  )
}
