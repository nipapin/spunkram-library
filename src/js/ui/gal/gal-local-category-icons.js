import { jsx as _jsx } from "react/jsx-runtime";
import chartPieSvg from "@/assets/category-icons/chart-pie.svg?raw";
import contrastSvg from "@/assets/category-icons/contrast.svg?raw";
import layoutPanelTopSvg from "@/assets/category-icons/layout-panel-top.svg?raw";
import mapPinSvg from "@/assets/category-icons/map-pin.svg?raw";
import messageCircleCheckSvg from "@/assets/category-icons/message-circle-check.svg?raw";
import squaresSubtractSvg from "@/assets/category-icons/squares-subtract.svg?raw";
import timerSvg from "@/assets/category-icons/timer.svg?raw";
import toggleRightSvg from "@/assets/category-icons/toggle-right.svg?raw";
import typeSvg from "@/assets/category-icons/type.svg?raw";
import webhookSvg from "@/assets/category-icons/webhook.svg?raw";
import y2kSvg from "@/assets/category-icons/y2k.svg?raw";
function LocalSvgIcon({ svg, className, }) {
    const html = svg.replace(/^\s*<\?xml[^?]*\?>\s*/i, "");
    return (_jsx("span", { className: className, "aria-hidden": true, dangerouslySetInnerHTML: { __html: html } }));
}
function localIcon(svg) {
    return function GalLocalCategoryIcon({ className }) {
        return _jsx(LocalSvgIcon, { svg: svg, className: className });
    };
}
export const TimerIcon = localIcon(timerSvg);
export const MapPinIcon = localIcon(mapPinSvg);
export const WebhookIcon = localIcon(webhookSvg);
export const ToggleRightIcon = localIcon(toggleRightSvg);
export const ContrastIcon = localIcon(contrastSvg);
export const SquaresSubtractIcon = localIcon(squaresSubtractSvg);
export const Y2kIcon = localIcon(y2kSvg);
export const LayoutPanelTopIcon = localIcon(layoutPanelTopSvg);
export const MessageCircleCheckIcon = localIcon(messageCircleCheckSvg);
export const TypeIcon = localIcon(typeSvg);
export const ChartPieIcon = localIcon(chartPieSvg);
