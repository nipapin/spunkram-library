import { jsx as _jsx } from "react/jsx-runtime";
import { App } from "./main";
import { AppProvider } from "./context/AppContext";
export function FootagesPanel() {
    return (_jsx(AppProvider, { children: _jsx("div", { className: "footages-root", children: _jsx(App, {}) }) }));
}
