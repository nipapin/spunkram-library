import { company, displayName, version } from "../../../shared/shared";
import { dropDisable } from "./cep";
const flyoutMenuXml = () => `<Menu>
  <MenuItem Id="info" Label="${displayName} ${version}" Enabled="false" Checked="false"/>
  <MenuItem Id="website" Label="by ${company}" Enabled="false" Checked="false"/>
  <MenuItem Label="---" />
  <MenuItem Id="refresh" Label="Refresh" Enabled="true" Checked="false"/>
  </Menu>`;
const buildFlyoutMenu = () => {
    window.__adobe_cep__.invokeSync("setPanelFlyoutMenu", flyoutMenuXml());
    const flyoutHandler = (event) => {
        let menuId;
        if (typeof event.data === "string") {
            try {
                menuId = JSON.parse(event.data.replace(/\$/g, "").replace(/\=2/g, ":")).menuId;
            }
            catch (e) {
                console.error(e);
            }
        }
        else {
            menuId = event.data.menuId;
        }
        if (menuId === "refresh") {
            location.reload();
        }
    };
    window.__adobe_cep__.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", flyoutHandler);
};
const buildContextMenu = () => {
    const menuObj = {
        menu: [
            {
                label: "Reload",
                enabled: true,
                checked: false,
                checkable: false,
                id: "c-0",
                callback: () => {
                    location.reload();
                },
            },
            {
                label: "Force Reload",
                enabled: true,
                checked: false,
                checkable: false,
                id: "c-1",
                callback: () => {
                    try {
                        window.cep_node?.process?.abort?.();
                    }
                    catch {
                        location.reload();
                    }
                },
            },
        ],
    };
    window.__adobe_cep__.invokeAsync("setContextMenuByJSON", JSON.stringify(menuObj), (e) => {
        menuObj.menu.find((m) => m.id === e)?.callback();
    });
};
export const initializeCEP = () => {
    buildFlyoutMenu();
    buildContextMenu();
    dropDisable();
};
