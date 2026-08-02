import type { ReactNode } from "react";

export type ActionCardProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  comingSoon?: boolean;
  onClick?: () => void;
};

export const ActionCard = ({
  icon,
  title,
  subtitle,
  comingSoon = false,
  onClick,
}: ActionCardProps) => {
  const disabled = comingSoon;

  return (
    <button
      type="button"
      className={`action-card${disabled ? " action-card--disabled" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-disabled={disabled}
    >
      <span className="action-card__icon" aria-hidden>
        {icon}
      </span>
      <span className="action-card__content">
        <span className="action-card__title-row">
          <span className="action-card__title">{title}</span>
          {comingSoon && (
            <span className="action-card__badge">Coming Soon</span>
          )}
        </span>
        <span className="action-card__subtitle">{subtitle}</span>
      </span>
    </button>
  );
};
