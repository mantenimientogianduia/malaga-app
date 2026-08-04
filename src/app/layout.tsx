import type { Metadata } from "next";
import { plexSans, plexMono, instrumentSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Malaga Soft",
  description: "ERP de producción y stock para la heladería Gianduia Málaga",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${plexSans.variable} ${plexMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
