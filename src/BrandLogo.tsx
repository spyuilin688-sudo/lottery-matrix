export const PRIMARY_BRAND_LOGO = "/assets/lottery/functions/NewLogo.png?v=20260816-2";

export type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span className={`shared-brand-logo ${className}`.trim()}>
      <img src={PRIMARY_BRAND_LOGO} alt="樂彩 Matrix" draggable={false} />
    </span>
  );
}
