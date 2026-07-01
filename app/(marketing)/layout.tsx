import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { Archivo } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-marketing",
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`marketing-shell ${archivo.variable}`}>
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
