//import { Inter } from 'next/font/google'
import './globals.css'

import Image from "next/image"

//const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Elforbrug',
  description: 'Følg elforbruget på Hedelands Veteranbane',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests"></meta> */}
      </head>
      <body>
        {children}
        <footer className="mt-4">
          <div className="container d-flex justify-content-center">
            <img src="/sort_navnetræk_hedelands_veteranbane_flipped.png" />
          </div>
        </footer>
      </body>
    </html>
  )
}
