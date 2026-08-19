/**
 * Premiere composer toolbar actions — port of legacy `pp_composer.buttonActions`.
 * @ts-nocheck
 */

const kPProPrivateProjectMetadataURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";

const getExternalObjectXMP = (projectItem: ProjectItem) => {
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (ExternalObject.AdobeXMPScript !== undefined) {
    const xmpBlob = projectItem.getProjectMetadata();
    return new XMPMeta(xmpBlob);
  }
};

const parseByComponentsMGT = (clip: TrackItem, callbackPropCycle: (prop: ComponentParam) => void) => {
  const getComponent = clip.getMGTComponent();
  if (getComponent) {
    const params = getComponent.properties;
    for (let z = 0; z < params.numItems; z++) {
      callbackPropCycle(params[z]);
    }
  }
};

const resizerClipObject = (clipObject: TrackItem, sizeObject: number[]) => {
  let clipSizes: number[] | undefined;
  const XMPC = getExternalObjectXMP(clipObject.projectItem);
  if (XMPC) {
    const xmpColumnPointer = "Column.Intrinsic.VideoInfo";
    if (XMPC.doesPropertyExist(kPProPrivateProjectMetadataURI, xmpColumnPointer)) {
      const getVideoInfo = XMPC.getProperty(kPProPrivateProjectMetadataURI, xmpColumnPointer);
      const tstringSplit = getVideoInfo.toString().split("x");
      clipSizes = [parseInt(tstringSplit[0], 10), parseInt(tstringSplit[1], 10)];
    }
  }
  if (!clipSizes) return;

  const itemComponents = clipObject.components;
  for (let a = 0; a < itemComponents.numItems; a++) {
    const fx = itemComponents[a];
    if (fx.displayName === "Motion") {
      for (let b = 0; b < fx.properties.numItems; b++) {
        const prop = fx.properties[b];
        if (prop.displayName === "Scale") {
          const w = sizeObject[0];
          const h = sizeObject[1];
          const divideNumberW = clipSizes[0] / w;
          const divideNumberH = clipSizes[1] / h;
          const aspect = clipSizes[0] / clipSizes[1];
          if (w / h >= aspect) {
            prop.setValue(prop.getValue() / divideNumberW, true);
          } else {
            prop.setValue(prop.getValue() / divideNumberH, true);
          }
        }
      }
    }
  }
};

const fitClipScaleToSeq = (clipObject: TrackItem, thisSequence: Sequence) => {
  let getMogrtOriginSizes: number[] | undefined;
  const mogrtXMP = getExternalObjectXMP(clipObject.projectItem);
  if (mogrtXMP) {
    const xmpColumnPointer = "Column.Intrinsic.VideoInfo";
    if (mogrtXMP.doesPropertyExist(kPProPrivateProjectMetadataURI, xmpColumnPointer)) {
      const getVideoInfo = mogrtXMP.getProperty(kPProPrivateProjectMetadataURI, xmpColumnPointer);
      const tstringSplit = getVideoInfo.toString().split("x");
      getMogrtOriginSizes = [parseInt(tstringSplit[0], 10), parseInt(tstringSplit[1], 10)];
    }
  }
  if (!getMogrtOriginSizes) return;

  const itemComponents = clipObject.components;
  for (let a = 0; a < itemComponents.numItems; a++) {
    const fx = itemComponents[a];
    if (fx.displayName === "Motion") {
      for (let b = 0; b < fx.properties.numItems; b++) {
        const prop = fx.properties[b];
        if (prop.displayName === "Scale") {
          const w = thisSequence.frameSizeHorizontal;
          const h = thisSequence.frameSizeVertical;
          const divideNumberW = getMogrtOriginSizes[0] / w;
          const divideNumberH = getMogrtOriginSizes[1] / h;
          const aspect = getMogrtOriginSizes[0] / getMogrtOriginSizes[1];
          if (w / h >= aspect) {
            prop.setValue(prop.getValue() / divideNumberW, true);
          } else {
            prop.setValue(prop.getValue() / divideNumberH, true);
          }
        }
      }
    }
  }
};

const toolbarResizer = (): string => {
  const activeSequence = app.project.activeSequence;
  if (!activeSequence) return "SEQUENCE";
  const getSequenceSettings = activeSequence.getSettings();
  const sequenceRes = [getSequenceSettings.videoFrameWidth, getSequenceSettings.videoFrameHeight];

  for (let vti = 0; vti < activeSequence.videoTracks.numTracks; vti++) {
    for (let clipsIndex = 0; clipsIndex < activeSequence.videoTracks[vti].clips.numItems; clipsIndex++) {
      const curClip = activeSequence.videoTracks[vti].clips[clipsIndex];
      if (!curClip.isSelected()) continue;
      if (curClip.isMGT()) {
        parseByComponentsMGT(curClip, (prop) => {
          if (prop.displayName === "Width" && prop.getValue()) {
            prop.setValue(activeSequence.frameSizeHorizontal, true);
          }
          if (prop.displayName === "Height" && prop.getValue()) {
            prop.setValue(activeSequence.frameSizeVertical, true);
          }
        });
      } else if (curClip.projectItem.isAdjustmentLayer() || curClip.projectItem.isSequence()) {
        resizerClipObject(curClip, sequenceRes);
      } else {
        fitClipScaleToSeq(curClip, activeSequence);
      }
    }
  }
  return "RESIZED";
};

export const pproToolsRun = (type: string): string => {
  switch (type) {
    case "consolidate_dups":
      app.project.consolidateDuplicates();
      return "CONSOLITED_ITEMS_PR";
    case "clear_source_monitor":
      app.sourceMonitor.closeAllClips();
      return "SOURCE_CLIPS_CLOSED";
    case "resize_items":
      return toolbarResizer();
    default:
      return "UNKNOWN_TOOL";
  }
};
