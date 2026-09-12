import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MARINEX Dashboard',
  description: 'Autonomous Maritime Intelligence & Ocean Response',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
