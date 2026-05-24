import { Cinzel, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";

export const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jet",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const fontVars = `${cinzel.variable} ${cormorant.variable} ${jetbrains.variable}`;
