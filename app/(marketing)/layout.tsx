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
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(!sessionStorage.getItem('rv-intro')){sessionStorage.setItem('rv-intro','1');document.documentElement.setAttribute('data-rv-intro','')}}catch(e){}",
        }}
      />
      <div className="intro-veil" aria-hidden="true">
        <svg className="intro-veil-mark" viewBox="0 0 120 120" width="120" height="120" fill="none">
          <circle className="iv-fill" cx="60" cy="60" r="41.5" fill="#2946cf" />
          <circle className="iv-ring" cx="60" cy="60" r="46" stroke="#4967f2" strokeWidth="9" />
          <circle className="iv-dot" cx="60" cy="60" r="7" fill="#151922" />
        </svg>
      </div>
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
