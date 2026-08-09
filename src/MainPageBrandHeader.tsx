import "./main-page-brand-header.css";

type MainPageBrandHeaderProps = {
  className?: string;
};

export function MainPageBrandHeader({
  className = "",
}: MainPageBrandHeaderProps) {
  return (
    <header
      className={`main-page-brand-header ${className}`.trim()}
      data-testid="main-page-brand-header"
    >
      <img
        className="main-page-brand-logo"
        src="/assets/lottery/brand-logo-transparent-processed.png"
        alt="樂彩 Matrix"
        draggable={false}
      />
    </header>
  );
}
