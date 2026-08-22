import config from "../../cep.config";
import { BRAND } from "../../brands.config";

export const ns = config.id;
export const company = config.zxp.org;
export const displayName = config.displayName;
export const version = config.version;

/** Project-panel bin for caption assets */
export const captionsBinName = BRAND.captionsBin;

/** Project-panel bin for style MOGRT / AEP presets */
export const stylesBinName = BRAND.stylesBin;
