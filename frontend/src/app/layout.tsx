import "./globals.css";
import type {Metadata} from "next";
export const metadata:Metadata={title:"Goldar — Interactive Jewelry Windows",description:"Touch-free jewelry try-on for shop window displays"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
