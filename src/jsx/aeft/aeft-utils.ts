export const forEachLayer = (
  comp: CompItem,
  callback: (item: Layer, index: number) => void
) => {
  const len = comp.numLayers;
  for (let i = 1; i < len + 1; i++) {
    callback(comp.layers[i], i);
  }
};

export const forEachComp = (
  folder: FolderItem | Project,
  callback: (item: CompItem, index: number) => void
) => {
  const len = folder.numItems;
  let comps: CompItem[] = [];
  for (let i = 1; i < len + 1; i++) {
    const item = folder.items[i];
    if (item instanceof CompItem) {
      comps.push(item);
    }
  }
  for (let i = 0; i < comps.length; i++) {
    let comp = comps[i];
    callback(comp, i);
  }
};

export const compFromFootage = (item: FootageItem): CompItem => {
  return app.project.items.addComp(
    item.name,
    item.width,
    item.height,
    item.pixelAspect,
    item.duration,
    item.frameRate
  );
};

export const getProjectDir = () => {
  app.project.file;
  if (app.project.file !== null) {
    return app.project.file.parent;
  } else {
    return "";
  }
};

export const getActiveComp = () => {
  if (app.project.activeItem instanceof CompItem === false) {
    app.activeViewer?.setActive();
  }
  return app.project.activeItem as CompItem;
};

// Project Item Helpers

// следующее свободное имя для captions-композиции: "{base} Captions N" —
// project.items в AE плоский (включает содержимое папок), так что перебираем его целиком
export const getNextCaptionsName = (project: Project, base: string): string => {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^" + escaped + " Captions (\\d+)$");
  let max = 0;
  for (let i = 1; i <= project.numItems; i++) {
    const match = pattern.exec(project.items[i].name);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return base + " Captions " + (max + 1);
};

export const getItemByName = (parent: FolderItem, name: string) => {
  for (var i = 0; i < parent.numItems; i++) {
    const item = parent.items[i + 1];
    if (item.name === name) {
      return item;
    }
  }
};

// Metadata helpers

export const setAeMetadata = (propName: string, propValue: any) => {
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (!app.project || !ExternalObject.AdobeXMPScript || !XMPMeta) return;
  const prefix = "xmp:";
  const uri = XMPMeta.getNamespaceURI(prefix);
  const newPropName = prefix + propName;
  let metadata = new XMPMeta(app.project.xmpPacket);
  metadata.setProperty(uri, newPropName, propValue.toString());
  app.project.xmpPacket = metadata.serialize();
};

export const getAeMetadata = (propName: string) => {
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (!app.project || !ExternalObject.AdobeXMPScript || !XMPMeta) return;
  const prefix = "xmp:";
  const uri = XMPMeta.getNamespaceURI(prefix);
  const newPropName = prefix + propName;
  const metadata = new XMPMeta(app.project.xmpPacket);
  return metadata.getProperty(uri, newPropName);
};

/**
 * Scale a layer to cover the active composition (Beta `applyAutoSizeForFootage`).
 * `source` must expose `.width` / `.height` (FootageItem, CompItem, or AVLayer).
 */
export const fitLayerScaleToComp = (
  comp: CompItem,
  source: { width: number; height: number },
  layer: AVLayer,
): boolean => {
  try {
    const originW = Number(source.width);
    const originH = Number(source.height);
    const compW = Number(comp.width);
    const compH = Number(comp.height);
    if (!originW || !originH || !compW || !compH) return false;

    const divideW = originW / compW;
    const divideH = originH / compH;
    if (!divideW || !divideH || !isFinite(divideW) || !isFinite(divideH)) {
      return false;
    }

    const sourceAspect = originW / originH;
    const compAspect = compW / compH;
    const scale =
      compAspect >= sourceAspect ? 100 / divideW : 100 / divideH;
    if (!isFinite(scale)) return false;
    layer.transform.scale.setValue([scale, scale]);
    return true;
  } catch (e) {
    return false;
  }
};
