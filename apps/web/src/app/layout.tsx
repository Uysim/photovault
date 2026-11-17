import "./globals.css";
import { Hanken_Grotesk } from "next/font/google";

const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata = { title: "PhotoVault" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
