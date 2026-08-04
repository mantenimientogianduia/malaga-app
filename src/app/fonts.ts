import localFont from "next/font/local";

export const plexSans = localFont({
  src: "./fonts/ibm-plex-sans.woff2",
  variable: "--font-plex-sans",
  weight: "100 800",
  display: "swap",
});

export const plexMono = localFont({
  src: "./fonts/ibm-plex-mono.woff2",
  variable: "--font-plex-mono",
  weight: "500",
  display: "swap",
});

export const instrumentSerif = localFont({
  src: [
    {
      path: "./fonts/instrument-serif.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/instrument-serif-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
});
