import './globals.css'

export const metadata = {
  title: 'Medieval Tactical Battle Simulator',
  description: 'A tactical hex-based combat resolver for medieval battles',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  )
}
