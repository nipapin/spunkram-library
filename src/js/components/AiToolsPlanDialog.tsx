import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { openMotionflowPricing } from "@/api/motionflow-auth";
import "./AiToolsPlanDialog.scss";

/** Blocks AI Tools on accounts without a subscription. Back leaves the screen; it does not open the tools. */
export function AiToolsPlanDialog({ onBack }: { onBack: () => void }) {
  return (
    <div className="ai-plan-gate">
      <button type="button" className="ai-plan-dialog__back" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
        Back
      </button>
      <div
        className="ai-plan-dialog"
        role="dialog"
        aria-labelledby="ai-plan-dialog-title"
      >
        <h2 id="ai-plan-dialog-title" className="ai-plan-dialog__title">
          To Continue Please Upgrade
        </h2>
        <button
          type="button"
          className="ai-plan-dialog__cta"
          onClick={() => openMotionflowPricing()}
        >
          Upgrade
          <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
