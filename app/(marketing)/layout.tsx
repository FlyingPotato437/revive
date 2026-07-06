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
        <svg className="intro-veil-mark" viewBox="0 0 64 64" width="140" height="140" fill="none">
          <rect className="iv-box-fill" x="1" y="1" width="62" height="62" fill="#edf0ff" />
          <rect className="iv-box" x="1" y="1" width="62" height="62" stroke="#151922" strokeWidth="2" />
          <circle className="iv-ring" cx="32" cy="32" r="14" stroke="#4967f2" strokeWidth="5.5" />
          <circle className="iv-dot" cx="32" cy="32" r="4" fill="#151922" />
        </svg>
      </div>
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
