import "./globals.css";
import type {Metadata} from "next";
export const metadata:Metadata={title:"Goldar — Digital Jewelry Atelier",description:"An extraordinary space for digital jewelry"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
