// Type shim for static SVG imports (e.g. @lobehub/icons-static-svg/*.svg).
// Next.js resolves these to a static image at build time; tsc needs a type.
declare module "*.svg" {
  import type { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
