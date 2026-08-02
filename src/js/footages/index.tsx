import { App } from "./main";
import { AppProvider } from "./context/AppContext";

export function FootagesPanel() {
  return (
    <AppProvider>
      <div className="footages-root">
        <App />
      </div>
    </AppProvider>
  );
}
