/*
 * Static artwork exported from the Atlas Figma file into /public/atlas-ui.
 * The files are used as exported — never redrawn, recoloured or inlined — and are
 * always rendered at their own intrinsic size so proportions stay exact.
 */

type AtlasAssetProps = {
  src: string;
  width: number;
  height: number;
  /** Decorative by default: the surrounding control carries the accessible name. */
  alt?: string;
  className?: string;
};

export function AtlasAsset({ src, width, height, alt = "", className }: AtlasAssetProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size local SVG/PNG exports; next/image adds no value and would need dangerouslyAllowSVG.
    <img src={src} alt={alt} width={width} height={height} className={className} aria-hidden={alt === ""} />
  );
}

/*
 * The Logo instances in the Figma file carry an image fill that Figma itself renders as empty,
 * so on screen the prototype shows no mark — only the space it occupies. The slot keeps that
 * exact space. The exported artwork is kept in /public/atlas-ui (logo-teal.png, logo-light.png);
 * set SHOW_LOGO to true to draw it.
 */
const SHOW_LOGO = false;

export function AtlasLogo({ tone, width, height }: { tone: "teal" | "light"; width: number; height: number }) {
  if (!SHOW_LOGO) return <div aria-hidden className="shrink-0" style={{ width, height }} />;
  return <AtlasAsset src={`/atlas-ui/logo-${tone}.png`} width={width} height={height} alt="Atlas" />;
}

/** Square icon exported from Figma. */
export function AtlasIcon({ src, size, alt, className }: { src: string; size: number; alt?: string; className?: string }) {
  return <AtlasAsset src={src} width={size} height={size} alt={alt} className={className} />;
}
