import Image from "next/image";

export interface ScreenshotProps {
  /** Caminho relativo a /public, ex.: "/img/agenda/visao-geral.png". */
  src: string;
  /** Texto alternativo (acessibilidade). Obrigatorio. */
  alt: string;
  /** Largura intrinseca em px (default 1280). */
  width?: number;
  /** Altura intrinseca em px (default 720). */
  height?: number;
  /** Legenda opcional exibida abaixo da imagem. */
  caption?: string;
}

/**
 * Wrapper de next/image para screenshots da documentacao.
 * Coloque os arquivos em docs-site/public/img/ e referencie via <Screenshot src="/img/..." alt="..." />.
 * O assetPrefix /docs garante que a imagem resolva corretamente atras do rewrite Multi-Zones.
 */
export function Screenshot({
  src,
  alt,
  width = 1280,
  height = 720,
  caption,
}: ScreenshotProps) {
  return (
    <figure className="my-6 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full"
        sizes="(max-width: 768px) 100vw, 768px"
      />
      {caption ? (
        <figcaption className="border-t border-fd-border px-4 py-2 text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
