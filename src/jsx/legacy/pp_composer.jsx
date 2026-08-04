/**
 * BIG UPDATES 27.08.2020
 * ATOMX 3.0.1x9
 */

var assetsFolderName = "Spunkram";

var TICKS_PER_SECONDS = 254016000000;

var PROJECT_ITEM_TYPE = {
  CLIP: 1,
  BIN: 2,
  MEDIA: 4,
  ROOT: 3,
};

var isWin = File.fs === "Windows";

var strNewSeqEndfixPart = "";

var tempStoringSequenceIDs = {};

var previousSequences = {};

var tempTargetedTracks = {
  video: {},
  audio: {},
};

//time position devider - for transitions (save timing before applied project to again use it after)
var timePositionDivider = null;

var projectFolders = {
  main: false,
  pack: false,
  main_category: false,
  category: false,
  project: false,
};

var projectNumCounter = 0;

ProjectLinker = {
  _groups: [],
  _currentIndex: null,
  _currentProjPath: null,
  _currentQEProj: null,
  _tempBin: null,
};
var self = ProjectLinker;

//XMP vars
var kPProPrivateProjectMetadataURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
var namefield = "Column.Intrinsic.Name";
var tapename = "Column.Intrinsic.TapeName";
var desc = "Column.PropertyText.Description";
var logNote = "Column.Intrinsic.LogNote";

//rename sequences
var logNoteSpecialComment = "AtomPPRes_c";
var sequenceNumCounter = 1;

var tempImportedSeqName = "";

$._copyPasteSystem = {
  ptxPath: "",
  externalLibrary: null,
  adjustmentSequenceID: "3a45aee6-1051-4dc5-855c-0727c6171cb7",
  overrideStartTrack: -1,
  appPrefs: {},
  nf: function (num) {
    return num < 10 ? "0" + num : num;
  },
  initializeLibrary: function (libraryBasePath, platform) {
    try {
      const ext = platform === 'win' ? '.dll' : '.bundle';
      const path = platform === 'win'
        ? [libraryBasePath, 'bin', platform, "Motionflow" + ext].join('/')
        : [libraryBasePath, "Motionflow" + ext].join('/');
      $._copyPasteSystem.externalLibrary = new ExternalObject("lib:" + path);
      return JSON.stringify({ ready: true });
    } catch (err) {
      return JSON.stringify({ ready: false, error: [err.message, err.line].join("\n") });
    }
  },
  executeCommand: function (command) {
    qe.project.getActiveSequence().makeCurrent();
    $._copyPasteSystem.externalLibrary.execute(command);
  },
  getProjectPath: function () {
    return app.project.path;
  },
  saveAppPrefs: function () {
    this.appPrefs = {
      "BE.Prefs.General.MetadataPropertyLinking": app.properties.getProperty("BE.Prefs.General.MetadataPropertyLinking"),
      "ImportProjectDialog.CreateFolderState": app.properties.getProperty("ImportProjectDialog.CreateFolderState"),
      "BE.Project.CreateDupesOnImportPropertyKey": app.properties.getProperty("BE.Project.CreateDupesOnImportPropertyKey"),
    };
  },
  setAppPrefs: function () {
    app.properties.setProperty("BE.Prefs.General.MetadataPropertyLinking", true, false, true);
    app.properties.setProperty("ImportProjectDialog.CreateFolderState", false, false, true);
    app.properties.setProperty("BE.Project.CreateDupesOnImportPropertyKey", true, false, true);
  },
  restoreAppPrefs: function () {
    app.properties.setProperty(
      "BE.Prefs.General.MetadataPropertyLinking",
      this.appPrefs["BE.Prefs.General.MetadataPropertyLinking"],
      false,
      true
    );
    app.properties.setProperty(
      "ImportProjectDialog.CreateFolderState",
      this.appPrefs["ImportProjectDialog.CreateFolderState"],
      false,
      true
    );
    app.properties.setProperty(
      "BE.Project.CreateDupesOnImportPropertyKey",
      this.appPrefs["BE.Project.CreateDupesOnImportPropertyKey"],
      false,
      true
    );
  },
  getAppPrefs: function () {
    app.enableQE();
    var version = app.version.split('.')[0];
    var language = qe.language;
    return JSON.stringify({ version: version, language: language, appPath: app.path });
  },
  getMetadata: function () {
    this.getAuthorFolder();
    var sequence = app.project.activeSequence;
    if (!sequence) {
      alert("Please select sequence first");
      return null;
    }

    this.saveAppPrefs();
    this.setAppPrefs();

    return JSON.stringify({
      name: sequence.name,
      sequenceID: sequence.sequenceID,
      resolution: [sequence.frameSizeHorizontal, sequence.frameSizeVertical],
    });
  },
  checkForDuplicatesOfAuthorFolder: function () {
    var root = app.project.rootItem;
    var increment = 1;
    function traverseFolder(folder) {
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === PROJECT_ITEM_TYPE.BIN) {
          if (child.name === assetsFolderName && folder.type !== PROJECT_ITEM_TYPE.ROOT) {
            child.name = assetsFolderName + " " + increment++;
          }
          if (child.children.length > 0) {
            traverseFolder(child);
          }
        }
      }
    }
    traverseFolder(root);
  },
  isSelectedItemExists: function (presetName) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      if (this.compareStrings(app.project.sequences[i].name, presetName)) {
        return true;
      }
    }
    return false;
  },
  getSelectedItem: function (presetName) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      if (this.compareStrings(app.project.sequences[i].name, presetName)) {
        return app.project.sequences[i].sequenceID;
      }
    }
    return null;
  },
  importSelectedItem: function (projectPath) {
    try {
      this.saveAppPrefs();
      this.setAppPrefs();
      this.getAuthorFolder();
      var galFolderSnapshot = {};

      for (var i = 0; i < this.authorFolder.children.length; i++) {
        child = this.authorFolder.children[i];
        galFolderSnapshot[child.treePath] = true;
      }

      app.project.importFiles([projectPath], true, this.insertionBin, false);

    } catch (err) {
      return "Error: " + err.message + " at line " + err.line;
    } finally {
      this.restoreAppPrefs();
      return "Project imported";
    }
  },
  isResolutionExists: function (resolution) {
    if (!this.adjusmentsFolder) return false;
    for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
      var child = this.adjusmentsFolder.children[i];
      if (child.name === resolution) {
        return true;
      }
    }
    return false;
  },
  collectClipsPreset: function (presetSequenceID) {
    app.project.openSequence(presetSequenceID);
    var qePresetSequence = qe.project.getActiveSequence();
    var presetSequence = app.project.activeSequence;
    qePresetSequence.removeEmptyVideoTracks();
    var clips = [];
    for (var i = 0, numTracks = presetSequence.videoTracks.numTracks; i < numTracks; i++) {
      var track = presetSequence.videoTracks[i];
      for (var j = 0; j < track.clips.numItems; j++) {
        clips.push(track.clips[j]);
      }
    }
    for (var i = 0, numTracks = presetSequence.audioTracks.numTracks; i < numTracks; i++) {
      var track = presetSequence.audioTracks[i];
      for (var j = 0; j < track.clips.numItems; j++) {
        clips.push(track.clips[j]);
      }
    }
    qePresetSequence.makeCurrent();
    presetSequence.setSelection(clips);
  },
  getCutPoint: function (markers) {
    if (markers.length > 0) {
      return markers[0].start.seconds;
    }
    return 0;
  },
  importAdjustmentSequence: function (ptxPath, resolution) {
    try {
      this.getAuthorFolder();
      if (!this.adjusmentsFolder) return "Adjustment folder not found.";
      for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
        var child = this.adjusmentsFolder.children[i];
        if (child.name === resolution) {
          return "Already Exist";
        }
      }

      var sequenceStore = {};

      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        sequenceStore[app.project.sequences[i].sequenceID] = true;
      }

      this.saveAppPrefs();
      this.setAppPrefs();

      var root = app.project.rootItem;

      for (var i = 0; i < root.children.length; i++) {
        var child = root.children[i];
        if (child.type === PROJECT_ITEM_TYPE.BIN && child.name === assetsFolderName) {
          root = child;
          break;
        }
      }

      app.project.importFiles([ptxPath + resolution + ".prproj"], true, this.adjusmentsFolder, false);

      this.restoreAppPrefs();

      var importedSequence = null;

      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (!sequenceStore[app.project.sequences[i].sequenceID]) {
          importedSequence = app.project.sequences[i];
          break;
        }
      }

      if (!importedSequence) {
        throw new Error("Adjustment sequence was not imported. If the problem persists, please contact support");
      }

      var importedAdjustment = importedSequence.videoTracks[0].clips[0].projectItem;

      if (!importedAdjustment) {
        throw new Error("Adjustment sequence was not imported. If the problem persists, please contact support");
      }

      importedAdjustment.name = resolution;
      importedAdjustment.moveBin(this.adjusmentsFolder);

      app.project.deleteSequence(importedSequence);

      for (var i = 0; i < this.authorFolder.children.length; i++) {
        var child = this.authorFolder.children[i];
        if (child.type === PROJECT_ITEM_TYPE.BIN && child.children.length === 0) {
          child.deleteBin();
        }
      }
      return "Imported adjustment sequence";
    } catch (err) {
      alert("importAdjustmentSequence: " + [err.message, err.line].join("\n"));
      return "Error: " + err.message + " at line " + err.line;
    }
  },
  importColorMatteSequence: function (ptxPath, resolution) {
    try {
      var cmName = 'cm_' + resolution;
      this.getAuthorFolder();
      if (!this.adjusmentsFolder) return "Adjustment folder not found.";
      for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
        var child = this.adjusmentsFolder.children[i];
        if (child.name === cmName) {
          return "Already Exist";
        }
      }

      var sequenceStore = {};

      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        sequenceStore[app.project.sequences[i].sequenceID] = true;
      }

      this.saveAppPrefs();
      this.setAppPrefs();

      app.project.importFiles([ptxPath + cmName + ".prproj"], true, this.adjusmentsFolder, false);

      this.restoreAppPrefs();

      var importedSequence = null;

      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        if (!sequenceStore[app.project.sequences[i].sequenceID]) {
          importedSequence = app.project.sequences[i];
          break;
        }
      }

      if (!importedSequence) {
        throw new Error("Color Matte sequence was not imported. If the problem persists, please contact support");
      }

      var importedAdjustment = importedSequence.videoTracks[0].clips[0].projectItem;

      if (!importedAdjustment) {
        throw new Error("Color Matte sequence was not imported. If the problem persists, please contact support");
      }

      importedAdjustment.name = cmName;
      importedAdjustment.moveBin(this.adjusmentsFolder);

      app.project.deleteSequence(importedSequence);

      for (var i = 0; i < this.authorFolder.children.length; i++) {
        var child = this.authorFolder.children[i];
        if (child.type === PROJECT_ITEM_TYPE.BIN && child.children.length === 0) {
          child.deleteBin();
        }
      }
      return "Imported color matte sequence";
    } catch (err) {
      alert("importColorMatteSequence: " + [err.message, err.line].join("\n"));
      return "Error: " + err.message + " at line " + err.line;
    }
  },
  prepareToPastePreset: function (sequenceID) {
    try {
      var presetSize = this.getPresetSize(app.project.activeSequence);
      var cutPoint = this.getCutPoint(app.project.activeSequence.markers);
      app.project.activeSequence.close();
      app.project.openSequence(sequenceID);
      var activeSequence = app.project.activeSequence;
      var savePlayerPosition = activeSequence.getPlayerPosition();
      var offsetPlayerPosition = savePlayerPosition.seconds - cutPoint + presetSize.startOffset;

      var wholePart = Math.floor(offsetPlayerPosition);
      var decimalPart = offsetPlayerPosition - wholePart;
      var a = wholePart * TICKS_PER_SECONDS;
      var b = Math.round(decimalPart * TICKS_PER_SECONDS);
      activeSequence.setPlayerPosition(a + b + "");
      var tracks = this.findTargetTrackIndex(activeSequence, presetSize);
      this.saveTracksTargeting(activeSequence, tracks);
      qe.project.getActiveSequence().makeCurrent();
      return JSON.stringify({ tracks: tracks, savePlayerPosition: savePlayerPosition.ticks });
    } catch (err) {
      alert(err.message + "\n" + err.line);
      return "Error: " + err.message + " at line " + err.line;
    }
  },
  detouchPreset: function (arguments) {
    try {
      var activeSequence = app.project.activeSequence;
      var selection = activeSequence.getSelection();
      var adjustment = this.findAdjustment(arguments.resolution);
      for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        if (item.mediaType === "Video" && item.projectItem && item.isAdjustmentLayer()) {
          var savename = item.name;
          item.projectItem = adjustment;
          item.name = savename;
        }
        if (item.mediaType === "Audio" && arguments.removeAudio) {
          item.remove(0, 0);
        }
      }
      for (var i = 0; i < activeSequence.videoTracks.numTracks; i++) {
        activeSequence.videoTracks[i].setLocked(Number(this.locks.video[i]));
      }
      for (var i = 0; i < activeSequence.audioTracks.numTracks; i++) {
        activeSequence.audioTracks[i].setLocked(Number(this.locks.audio[i]));
      }
      activeSequence.setPlayerPosition(arguments.savePlayerPosition);
      qe.project.getActiveSequence().makeCurrent();
      this.restoreTracksTargeting(activeSequence);
      this.resizeTransition();
    } catch (err) {
      alert("Error: " + err.message + " at line " + err.line);
      return "Error: " + err.message + " at line " + err.line;
    }
  },
  findAdjustment: function (resolution) {
    var adjustment = null;
    for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
      var child = this.adjusmentsFolder.children[i];
      if (child.isAdjustmentLayer() && child.name === resolution) {
        adjustment = child;
        break;
      }
    }

    return adjustment;
  },
  compareStrings: function (a, b) {
    var prepareA = a.toLowerCase().replace(/^\s+|\s+$/g, "");
    var prepareB = b.toLowerCase().replace(/^\s+|\s+$/g, "");
    return prepareA === prepareB;
  },
  resolveMissingFootages: function (assetsPath, presetName) {
    var footages = this.findMissingFootages();
    var sep = isWin ? "\\" : "/";
    for (var i = 0; i < footages.length; i++) {
      var footage = footages[i];
      var footageMedia = footage.getMediaPath();
      var footageSeparate = footageMedia.indexOf("\\") > -1 ? "\\" : "/";
      var footageName = footageMedia.split(footageSeparate).pop();
      if (footage.canChangeMediaPath()) {
        footage.changeMediaPath(assetsPath + sep + footageName);
      }
      if (footageName.indexOf(".aegraphic") !== -1 && footageName.indexOf(presetName) !== -1) {
        footage.changeMediaPath(assetsPath + sep + footageName, true);
      }
    }
  },
  findMissingFootages: function (overrideBin) {
    var result = [];
    function searchMedia(projectItem) {
      for (var i = 0; i < projectItem.children.length; i++) {
        var child = projectItem.children[i];
        if (child.type == PROJECT_ITEM_TYPE.CLIP && child.isOffline() && !child.isSequence() && !child.isAdjustmentLayer()) {
          result.push(child);
        }
        if (child.type == PROJECT_ITEM_TYPE.BIN) {
          searchMedia(child);
        }
      }
    }

    searchMedia(overrideBin ? overrideBin : this.insertionBin);
    return result;
  },
  getPresetSize: function (sequence) {
    var size = {
      width: { video: 0, audio: 0 },
      height: { video: 0, audio: 0 },
      startOffset: 0,
    };
    var vStart = Infinity;
    var vEnd = -Infinity;
    var aStart = Infinity;
    var aEnd = -Infinity;

    for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
      var track = sequence.videoTracks[i];
      var clips = track.clips;
      if (clips.numItems > 0) {
        size.height.video++;
        for (var j = 0; j < clips.numItems; j++) {
          var clip = clips[j];
          vStart = Math.min(clip.start.seconds, vStart);
          vEnd = Math.max(clip.end.seconds, vEnd);
        }
      }
    }
    for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
      var track = sequence.audioTracks[i];
      var clips = track.clips;
      if (clips.numItems > 0) {
        size.height.audio++;
        for (var j = 0; j < clips.numItems; j++) {
          var clip = clips[j];
          aStart = Math.min(clip.start.seconds, aStart);
          aEnd = Math.max(clip.end.seconds, aEnd);
        }
      }
    }
    size.width.video = vEnd - vStart;
    size.width.audio = aEnd - aStart;
    size.startOffset = Math.min(vStart, aStart);
    return size;
  },
  getAuthorFolder: function () {
    var root = app.project.rootItem;
    var found = false;
    for (var i = 0; i < root.children.length; i++) {
      var atom = root.children[i];
      if (atom.name === assetsFolderName && atom.type === PROJECT_ITEM_TYPE.BIN) {
        this.authorFolder = atom;
        for (var j = 0; j < atom.children.length; j++) {
          var child = atom.children[j];
          if (child.name === assetsFolderName + " Adjustments") {
            this.adjusmentsFolder = child;
            found = true;
            break;
          }
        }
        if (!found) {
          this.adjusmentsFolder = atom.createBin(assetsFolderName + " Adjustments");
          break;
        }
      }
    }
  },
  setInsertionBin: function (lastFolder) {
    this.insertionBin = lastFolder;
  },
  trackIsAvailable: function (track, regionStart, regionEnd) {
    if (track.isLocked()) return false;
    for (var j = 0; j < track.clips.numItems; j++) {
      var clip = track.clips[j];
      if (clip.start.seconds < regionEnd && clip.end.seconds > regionStart) {
        return false;
      }
    }
    return true;
  },
  findFreeTrackIndex: function (tracks, size, sequence, type) {
    var regionStart = sequence.getPlayerPosition().seconds;
    var regionEnd = regionStart + size.width[type];
    var isOverrideStartTrack = this.overrideStartTrack > -1;

    var freeTracks = 0;
    var startIndex = type === "video" && isOverrideStartTrack ? this.overrideStartTrack : -1;

    for (var i = 0; i < tracks; i++) {
      if (this.trackIsAvailable(sequence[type + "Tracks"][i], regionStart, regionEnd)) {
        if (startIndex === -1) {
          startIndex = i;
        }
        freeTracks++;

        if (freeTracks === size.height[type]) {
          var result = startIndex + (type === "video" && isOverrideStartTrack ? this.overrideStartTrack : 0);
          this.overrideStartTrack = -1;
          return result;
        }
      } else {
        freeTracks = 0;
        startIndex = -1;
      }
    }
    this.overrideStartTrack = -1;
    var tracksToAdd = size.height[type] - freeTracks;

    type === "video"
      ? qe.project.getActiveSequence().addTracks(tracksToAdd, sequence[type + "Tracks"].numTracks, 0)
      : qe.project.getActiveSequence().addTracks(0, 0, 1, tracksToAdd, sequence[type + "Tracks"].numTracks);

    return sequence[type + "Tracks"].numTracks - size.height[type];
  },
  findTargetTrackIndex: function (sequence, size) {
    var totalVideoTracks = sequence.videoTracks.numTracks;
    var totalAudioTracks = sequence.audioTracks.numTracks;

    return {
      videoTrackIndex: this.findFreeTrackIndex(totalVideoTracks, size, sequence, "video"),
      audioTrackIndex: this.findFreeTrackIndex(totalAudioTracks, size, sequence, "audio"),
    };
  },
  saveTracksTargeting: function (sequence, tracks) {
    var targetings = { video: [], audio: [] };
    var locks = { video: [], audio: [] };
    for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
      var track = sequence.videoTracks[i];
      locks.video.push(track.isLocked());
      if (i < tracks.videoTrackIndex) {
        track.setLocked(1);
      }
      targetings.video.push(track.isTargeted());
      track.setTargeted(false, true);
    }
    for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
      var track = sequence.audioTracks[i];
      locks.audio.push(track.isLocked());
      if (i < tracks.audioTrackIndex) {
        track.setLocked(1);
      }
      targetings.audio.push(track.isTargeted());
      track.setTargeted(false, true);
    }
    this.tracksTargeting = targetings;
    this.locks = locks;
  },
  restoreTracksTargeting: function (sequence) {
    for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
      var track = sequence.videoTracks[i];
      if (this.tracksTargeting.video[i]) {
        track.setTargeted(this.tracksTargeting.video[i], true);
      }
    }
    for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
      var track = sequence.audioTracks[i];
      if (this.tracksTargeting.audio[i]) {
        track.setTargeted(this.tracksTargeting.audio[i], true);
      }
    }
  },
  loadAdjustment: function (supressWarnings) {
    var activeSequence = app.project.activeSequence;
    if (!activeSequence) return;
    var resolution = [activeSequence.frameSizeHorizontal, activeSequence.frameSizeVertical].join("x");
    var adjustment = null;
    for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
      var child = this.adjusmentsFolder.children[i];
      if (child.isAdjustmentLayer() && child.name === resolution) {
        adjustment = child;
        break;
      }
    }

    if (!adjustment) {
      if (!supressWarnings) {
        alert(
          [
            "loadAdjustment:\nAdjustment with resolution",
            resolution,
            " not found\nPlease apply again\nIf the problem persists, please contact support",
          ].join(" ")
        );
      }
      return null;
    }

    return adjustment;
  },
  loadColorMatte: function (supressWarnings) {
    var activeSequence = app.project.activeSequence;
    if (!activeSequence) return;
    var resolution = [activeSequence.frameSizeHorizontal, activeSequence.frameSizeVertical].join("x");
    var cmName = 'cm_' + resolution;
    var colormatte = null;
    for (var i = 0; i < this.adjusmentsFolder.children.length; i++) {
      var child = this.adjusmentsFolder.children[i];
      if (child.name === cmName) {
        colormatte = child;
        break;
      }
    }

    if (!colormatte) {
      if (!supressWarnings) {
        alert(
          [
            "loadAdjustment:\nAdjustment with resolution",
            resolution,
            " not found\nPlease apply again\nIf the problem persists, please contact support",
          ].join(" ")
        );
      }
      return null;
    }

    return colormatte;
  },
  getResolution: function () {
    try {
      this.getAuthorFolder();
      if (!this.adjusmentsFolder) return;
      var activeSequence = app.project.activeSequence;
      if (!activeSequence) return;
      this.resolution = [activeSequence.frameSizeHorizontal, activeSequence.frameSizeVertical];
      return JSON.stringify({
        resolution: this.resolution.join(","),
        isResolutionExists: this.isResolutionExists(),
      });
    } catch (e) {
      return [e.message, "at", e.line].join(" ");
    }
  },
  resizeTransition: function () {
    var activeSequence = app.project.activeSequence;
    if (!activeSequence) return;
    var selectedClips = activeSequence.getSelection();
    var selectedClipsLength = selectedClips.length;
    var supressWarnings = false;
    for (var i = 0; i < selectedClipsLength; i++) {
      try {
        var clip = selectedClips[i];
        if (clip.mediaType !== "Video" || !clip.projectItem) continue;
        if (clip.isAdjustmentLayer() && clip.projectItem.isAdjustmentLayer()) {
          var adjustment = this.loadAdjustment(supressWarnings);
          if (!adjustment) {
            supressWarnings = true;
            continue;
          }
          var clipName = clip.name;
          clip.projectItem = adjustment;
          clip.name = clipName;
        }
        if (!clip.isAdjustmentLayer() && clip.projectItem.isAdjustmentLayer()) {
          var colormatte = this.loadColorMatte(supressWarnings);
          if (!colormatte) {
            supressWarnings = true;
            continue;
          }
          var clipName = clip.name;
          clip.projectItem = colormatte;
          clip.name = clipName;
        }
        if (clip.isMGT()) {
          for (var j = clip.components.numItems - 1; j >= 0; j--) {
            var component = clip.components[j];
            if (component.matchName !== "AE.ADBE Capsule") continue;
            var props = component.properties;
            var widthProp, heightProp;
            for (var k = props.numItems - 1; k >= 0; k--) {
              if (props[k].displayName === "Width") {
                widthProp = props[k];
              }
              if (props[k].displayName === "Height") {
                heightProp = props[k];
              }
            }
          }
          if (widthProp && heightProp) {
            widthProp.setValue(activeSequence.frameSizeHorizontal, true);
            heightProp.setValue(activeSequence.frameSizeVertical, true);
          } else {
            var scaleProp, apProp;
            for (var j = 0; j < clip.components.numItems; j++) {
              var component = clip.components[j];
              if (component.matchName !== "AE.ADBE Motion") continue;
              var props = component.properties;
              for (var k = props.numItems - 1; k >= 0; k--) {
                if (props[k].displayName === "Scale") {
                  scaleProp = props[k];
                }
                if (props[k].displayName === "Anchor Point") {
                  apProp = props[k];
                }
              }
            }
            if (scaleProp && apProp) {
              if (ExternalObject.AdobeXMPScript == undefined) {
                ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
              }
              var PPRO_PRIVATE_NS = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
              var xmp = new XMPMeta(clip.projectItem.getProjectMetadata());
              var videoInfo = xmp.getProperty(PPRO_PRIVATE_NS, "Column.Intrinsic.VideoInfo").value;
              var chunks = videoInfo.split(" ");
              var width = Number(chunks[0]);
              var height = Number(chunks[2]);
              var clipAR = width / height;
              var seqAR = activeSequence.frameSizeHorizontal / activeSequence.frameSizeVertical;
              if (clipAR > seqAR) {
                scaleProp.setValue((activeSequence.frameSizeVertical / height) * 100, true);
              } else {
                scaleProp.setValue((activeSequence.frameSizeHorizontal / width) * 100, true);
              }
            }
          }
        }

      } catch (e) {
        alert(e.message + "\n" + e.line);
      }
    }
  },
  createStructure: function (packName, groups) {
    var treePath = [assetsFolderName, packName];

    for (var i = 0; i < groups.length; i++) {
      treePath.push(groups[i]);
    }

    var parentFolder = app.project.rootItem;
    var lastFolder = null;
    for (var i = 0; i < treePath.length; i++) {
      var folderName = treePath[i];
      var found = false;
      for (var j = 0; j < parentFolder.children.numItems; j++) {
        var child = parentFolder.children[j];
        if (child && child.type === ProjectItemType.BIN && child.name === folderName) {
          parentFolder = child;
          lastFolder = child;
          found = true;
          break;
        }
      }
      if (!found) {
        var newFolder = parentFolder.createBin(folderName);
        parentFolder = newFolder;
        lastFolder = newFolder;
      }
    }
    this.setInsertionBin(lastFolder);
    return "STRUCTURE_CREATED";
  },
  findPlaceholderClip: function (sequence, name) {
    for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
      for (var j = 0; j < sequence.videoTracks[i].clips.numItems; j++) {
        var clip = sequence.videoTracks[i].clips[j];
        if (clip.name === name) {
          return clip;
        }
      }
    }
    return null;
  },
  removeHelper: function (placeholder) {
    try {
      var activeSequence = app.project.activeSequence;
      if (!activeSequence) return;
      var placeholder = this.findPlaceholderClip(activeSequence, placeholder);
      this.overrideStartTrack = placeholder.parentTrackIndex - 1;
      activeSequence.setPlayerPosition(placeholder.start.ticks);
      var tempBin = app.project.rootItem.createBin("temporary_bin");
      placeholder.projectItem.moveBin(tempBin);
      tempBin.deleteBin();
    } catch (e) {
      alert(e.message + "\n" + e.line);
    }
  },
  focusActiveSequence: function () {
    qe.project.getActiveSequence().makeCurrent();
    return "FOCUSED_ACTIVE_SEQUENCE";
  },
};

$._AtomExt_ppComposer = {
  disableLockTracks: false,
  maskedTransferOnce: function (newValue) {
    assetsFolderName = newValue;
  },

  outside_setPlacesForTracks: setPlacesForTracks,

  devActions: function (num) {
    try {
      switch (num) {
        case 1:
          var durTicks = 0;
          var durSeconds = 0;
          var activeSequence = app.project.activeSequence;
          for (var vti = 0; vti < activeSequence.videoTracks.numTracks; vti++) {
            for (var clipsIndex = 0; clipsIndex < activeSequence.videoTracks[vti].clips.numItems; clipsIndex++) {
              var curClip = activeSequence.videoTracks[vti].clips[clipsIndex];
              if (curClip && curClip.isSelected()) {
                //get ticks
                durTicks = curClip.end.ticks - curClip.start.ticks;
                //get seconds
                // durSeconds = curClip.end.seconds - curClip.start.seconds;
              }
            }
          }
          return durTicks;
          break;
        case 2:
          var durTicks = 0;
          var durSeconds = 0;
          var activeSequence = app.project.activeSequence;

          for (var vti = 0; vti < activeSequence.videoTracks.numTracks; vti++) {
            for (var clipsIndex = 0; clipsIndex < activeSequence.videoTracks[vti].clips.numItems; clipsIndex++) {
              var curClip = activeSequence.videoTracks[vti].clips[clipsIndex];
              if (curClip && curClip.isSelected()) {
                //get ticks
                durTicks += curClip.end.ticks - curClip.start.ticks;
                //get seconds
                // durSeconds += curClip.end.seconds - curClip.start.seconds;
              }
            }
          }
          return durTicks;
          break;
        case 3:
          break;
      }
    } catch (e) {
      return "UNKNOWN_ERROR|" + "DEV: " + e;
    }
  },

  exportProjectDev: function (format_file_type) {
    try {
      var curProjectSelection = getCurrentProjectSelection();

      var getProjectInfoFromSel = app.getProjectFromViewID(curProjectSelection);
      var getProjectPath = getProjectInfoFromSel.path;
      var getProjectName = getProjectInfoFromSel.name;

      //find in sequence by name for next actions
      var sequenceOverwrite = getMultipleSelectedSequence(getCurrentProjectSelection(), true);

      //error checks

      if (!sequenceOverwrite.length) {
        return "DEV_NO_SELECTION_SEQ";
      }

      var filepaths_saves = [];
      //loop selection sequences
      for (var i = 0; i < sequenceOverwrite.length; i++) {
        var tSeq = sequenceOverwrite[i];
        var tSeqName = tSeq.name;

        var seqExportPath = getProjectPath.split(getProjectName)[0] + tSeqName.replace(/[:\/\\*?"<>|]/gi, "") + "." + format_file_type;
        tSeq.exportAsProject(seqExportPath);

        filepaths_saves.push(seqExportPath);
      }
      return JSON.stringify(filepaths_saves);
    } catch (e) {
      return "UNKNOWN_ERROR|" + "DEV_E_SEQ: " + e;
    }
  },

  moveFilesToFolder: function () {
    try {
      if (timePositionDivider) {
        app.project.activeSequence.setPlayerPosition(timePositionDivider.ticks);
      }
      var activeSequence = app.project.activeSequence;
      var fileBin = false;
      var previousNodeID = false;
      var newNumOfClips = 0;
      var videoPixelRatio = app.project.activeSequence.getSettings().videoPixelAspectRatio.split(":");

      if (!projectFolders.main || !tempImportedSeqName) {
        return false;
      }

      fileBin = projectFolders.project;
      for (var vti = 0; vti < activeSequence.videoTracks.numTracks; vti++) {
        for (var clipsIndex = 0; clipsIndex < activeSequence.videoTracks[vti].clips.numItems; clipsIndex++) {
          var curClip = activeSequence.videoTracks[vti].clips[clipsIndex];
          if (curClip.isSelected()) {
            // alert(curClip.inPoint.seconds);
            curClip.projectItem.setOverridePixelAspectRatio(Number(videoPixelRatio[0]), Number(videoPixelRatio[1]));
            curClip.projectItem.moveBin(fileBin);
            if (
              (curClip.projectItem.name.indexOf("Adjustment") != -1 && !previousNodeID) ||
              (previousNodeID != curClip.projectItem.nodeId && curClip.projectItem.isSequence())
            ) {
              previousNodeID = curClip.projectItem.nodeId;
              setPixelRatioForNest(videoPixelRatio, fileBin);
            }
          }
          newNumOfClips++;
        }
      }
      for (var ati = 0; ati < activeSequence.audioTracks.numTracks; ati += 1) {
        for (var clipsIndex = 0; clipsIndex < activeSequence.audioTracks[ati].clips.numItems; clipsIndex += 1) {
          var curClipA = activeSequence.audioTracks[ati].clips[clipsIndex];
          if (curClipA.isSelected()) {
            curClipA.projectItem.moveBin(fileBin);
          }
        }
      }
      if (!this.disableLockTracks) {
        resetTargetedOrLockedSystem(activeSequence, "video");
        resetTargetedOrLockedSystem(activeSequence, "audio");
      }

      // alert('OldItems: '+ projectNumCounter + '\nNewItems: ' + newNumOfClips);
      // if (chachedFile) {
      // 	chachedFile.remove();
      // 	chachedFile = false;
      // }

      // ProjectLinker.end();
      if (projectNumCounter >= newNumOfClips) {
        projectNumCounter = 0;
        return "NO_ACCESS";
      }
      // alert('oldNums: ' + projectNumCounter + '\n\nnewNums: ' + newNumOfClips);
      /* 			if (projectNumCounter == newNumOfClips) {
        projectNumCounter = 0;
        return "NO_ACCESS";
      } */

      projectNumCounter = 0;
    } catch (e) {
      if (!this.disableLockTracks) {
        resetTargetedOrLockedSystem(activeSequence, "video");
        resetTargetedOrLockedSystem(activeSequence, "audio");
      }
      // return "UNKNOWN_ERROR|"+'MOVE_FILES: '+e;
      // alert(e.toString() + "\nScript File: " + File.decode(e.fileName).replace(/^.*[\|\/]/, "") + "\nFunction: " + arguments.callee.name + "\nError on Line: " + e.line.toString());
    }
  },

  testPP: function () {
    /* 		var success = app.bind('onActiveSequenceSelectionChanged', function(){
          var seq = app.project.activeSequence;
          if (seq){
            var sel = seq.getSelection();
            if (sel && (sel !== "Connection to object lost")){
              alert(sel.length + ' track items selected in ' + app.project.activeSequence.name + '.');
              for (var i = 0; i < sel.length; i++) {
                if (sel[i].name !== 'anonymous') {
                  alert('Selected item ' + (i + 1) + ' == ' + sel[i].name + '.');
                }
              }
            } else {
              alert('No clips selected.');
            }
          } else {
            alert('No active sequence.');
          }
        }); */
  },

  customizer: function (insidePackOptions) {
    var control_range = insidePackOptions.customizer_control_range || {};

    var project = app.project;
    var activeSequence = project.activeSequence;
    if (!activeSequence) {
      return "SEQUENCE";
    }

    var objectJSON_customizer = {};
    var objectJSON_text_fields = {};

    var setSequenceTrackType = activeSequence.videoTracks;

    var getMogrtOriginSizes = [];
    //find pseudo image on timeline - to get videoTrack object
    stopSeqSearchMain: for (var j = 0; j < setSequenceTrackType.numTracks; j++) {
      var curTrack = setSequenceTrackType[j];
      var curTrackClips = curTrack.clips;
      for (var c = 0; c < curTrackClips.numItems; c++) {
        var curItemOnTimeline = curTrackClips[c];

        //find pseudo image name on timeline in clips
        if (curItemOnTimeline.isSelected()) {
          var getComponent = curItemOnTimeline.getMGTComponent();

          if (getComponent) {
            //get XMP data of file
            getMogrtOriginSizes = getMOGRT_Sizes(curItemOnTimeline.projectItem);

            var params = getComponent.properties;
            var dupNamesIndexDef = 1;
            var dupNamesIndexText = 1;

            // alert(params[1].displayName);
            // alert(params[1].getValue() === undefined);
            // return 0;

            for (var z = 0; z < params.numItems; z++) {
              var curParam = params[z];
              var curParamName = curParam.displayName.toString();
              var curParamVal = curParam.getValue();

              //check if this item as Group from CC2020+
              //if true - skip it
              if (/.{8}-.{4}-.{4}-.{4}-.{12}/m.test(curParamVal)) {
                continue;
              }

              var set_type = "",
                set_values = "";
              switch (typeof curParamVal) {
                //only text layers
                case "string":
                  //fixes for PR CC2020 - string only if exists displayName
                  if (curParamName.length > 0) {
                    //special check for group texts in PR CC2020
                    if (curParamVal) {
                      set_type = "Text";
                      set_values = JSON.parse(curParamVal)["textEditValue"];
                    }
                  }

                  break;
                //sliders/colors
                case "number":
                  //if length > 12 and not found dot (as devider point) = color, convert as colors
                  if (curParamVal.toString().length > 12 && curParamVal.toString().indexOf(".") == -1) {
                    set_type = "Color";
                    set_values = curParam.getColorValue();
                  } else {
                    //sliders
                    set_type = "Slider";
                    set_values = curParamVal;
                    //fix counting for slider (problem when used one indexing for color and slider)
                    if (!objectJSON_customizer[curParamName]) {
                      dupNamesIndexDef = 1;
                    }
                  }

                  break;
                //checkboxes
                case "boolean":
                  set_type = "Checkbox";
                  set_values = curParamVal;
                  break;

                //doublue values (scale/positions) from CC20+
                case "object":
                  //same values - like Scale
                  set_type = "Point";
                  var newX = Math.round(curParamVal[0] * getMogrtOriginSizes[0]);
                  var newY = Math.round(curParamVal[1] * getMogrtOriginSizes[1]);
                  set_values = [newX, newY];
                  break;
              }

              //if no name then set type instead name
              if (curParamName == "") {
                curParamName = set_type;
              }

              //add params to object
              if (set_type == "Text") {
                //TEXT - if name duplicates - add custom cycle index
                if (objectJSON_text_fields[curParamName]) {
                  curParamName += " " + dupNamesIndexText;
                  dupNamesIndexText++;
                }

                objectJSON_text_fields[curParamName] = [z, set_values];
              } else {
                //EFFECTS - if name duplicates - add custom cycle index
                if (objectJSON_customizer[curParamName]) {
                  curParamName += " " + dupNamesIndexDef;
                  dupNamesIndexDef++;
                }

                objectJSON_customizer[curParamName] = [z, set_type, set_values];
              }
            }
            //send params to JS customizer
            var textObjData = checkObjectExists(objectJSON_text_fields);
            return [curItemOnTimeline.name, objectJSON_customizer, control_range, textObjData];
          } else {
            return "NOT_MGT_COMPONENT";
          }
          break stopSeqSearchMain;
        }
      }
    }
    //if no returns before it
    return "SELECT_VIDEO_TRACKS";
  },

  setCustomizeChanges: function (inputType, inputVal, inputArg, inputComp, inputValIndex) {
    var project = app.project;
    var activeSequence = project.activeSequence;
    if (!activeSequence) {
      return "SEQUENCE";
    }

    var setSequenceTrackType = activeSequence.videoTracks;

    var updateUI = true;

    // alert(inputType);

    var getMogrtOriginSizes = [];

    //find pseudo image on timeline - to get videoTrack object
    stopSeqSearchMain: for (var j = 0; j < setSequenceTrackType.numTracks; j++) {
      var curTrack = setSequenceTrackType[j];
      var curTrackClips = curTrack.clips;
      for (var c = 0; c < curTrackClips.numItems; c++) {
        var curItemOnTimeline = curTrackClips[c];

        //find pseudo image name on timeline in clips
        if (curItemOnTimeline.isSelected()) {
          if (curItemOnTimeline.name.toString() == inputComp.toString()) {
            var getComponent = curItemOnTimeline.getMGTComponent();

            if (getComponent) {
              //get sizes
              getMogrtOriginSizes = getMOGRT_Sizes(curItemOnTimeline.projectItem);

              var params = getComponent.properties;
              //cycle by parameters
              for (var z = 0; z < params.numItems; z++) {
                var curParam = params[z];

                //found arg number
                if (z == inputArg) {
                  //find type
                  switch (inputType) {
                    case "Slider":
                      //if used special param for Slider (like arr)
                      if (inputValIndex == "double") {
                        var newX = Number(inputVal) / getMogrtOriginSizes[0];
                        var newY = Number(inputVal) / getMogrtOriginSizes[1];
                        curParam.setValue([newX, newY], updateUI);
                      } else {
                        curParam.setValue(Number(inputVal), updateUI);
                      }
                      break;
                    case "Checkbox":
                      curParam.setValue(Boolean(inputVal), updateUI);
                      break;
                    case "Color":
                      curParam.setColorValue(1, inputVal[0], inputVal[1], inputVal[2], updateUI);
                      break;
                    case "Text":
                      var getVal = curParam.getValue();

                      var parsedTextDoc = JSON.parse(getVal);
                      parsedTextDoc["textEditValue"] = inputVal;
                      //fixed for Premiere Pro CC 2020 (need also add length of text in individual param)
                      if (parsedTextDoc["fontTextRunLength"]) {
                        //should be in array
                        parsedTextDoc["fontTextRunLength"][0] = inputVal.toString().length;
                      }

                      curParam.setValue(JSON.stringify(parsedTextDoc), updateUI);
                      break;

                    //Point - new for MOGRT CC 2020
                    case "Point":
                      var newX = Number(inputVal) / getMogrtOriginSizes[0];
                      var newY = Number(inputVal) / getMogrtOriginSizes[1];

                      var arrNew = [newX, newY];
                      var curValX = curParam.getValue();
                      if (inputValIndex == 1) {
                        arrNew = [newX, curValX[1]];
                      }
                      if (inputValIndex == 2) {
                        arrNew = [curValX[0], newY];
                      }
                      curParam.setValue(arrNew, updateUI);
                      break;
                  }
                  return true;
                }
              }
            } else {
              return "NOT_MGT_COMPONENT";
            }

            break stopSeqSearchMain;
          } else {
            return "OTHER_ITEM_OPTIONS";
          }
        }
      }
    }
  },

  buttonActions: function (type) {
    switch (type) {
      case "consolidate_dups":
        app.project.consolidateDuplicates();
        return "CONSOLITED_ITEMS_PR";
        break;
      case "clear_source_monitor":
        app.sourceMonitor.closeAllClips();
        return "SOURCE_CLIPS_CLOSED";
        break;
      case "resize_items":
        return toolbar_Resizer();
        break;
    }
  },

  doubleClickApply: function (
    itemId,
    itemName,
    instanceGroup,
    argumentsPack,
    extraArguments,
    folderPath,
    packName,
    packInsideOptions,
    preLockTracks
  ) {
    var itemCType = extraArguments["ctype"];
    if (itemCType === "FULL_PROJECT") {
      try {
        $._copyPasteSystem.createStructure(packName, extraArguments["groups"], itemName);
        return "APPLIED_PROJECT";
      } catch (err) {
        return "Error: " + err.message + " at line " + err.line;
      }
    }

    this.disableLockTracks = preLockTracks;
    try {
      if (!argumentsPack.custom_args) {
        argumentsPack.custom_args = {};
      }

      var curMethodAsDrag = false;
      var project = app.project;
      var activeSeq = project.activeSequence;
      if (!activeSeq) {
        return "SEQUENCE";
      }

      var dragIObject = {
        track: 0,
        trackNum: 2,

        clip: 0,
        clipNum: 0,
        clipStartTicks: 0,
        clipEndTicks: 0,
      };

      //need prefix for names to fix problem with FOOTAGES (don't works when item same name on timeline for footages)
      var itemNamePrefix = "-";

      var itemLastGrp = extraArguments["last_grp"];
      var itemFilepath = extraArguments["file_path"];
      var itemCType = extraArguments["ctype"];
      var dndName = extraArguments["placeholder"];
      var sequenceSpeed = extraArguments["sequenceSpeed"];

      var isAudio = false;
      if (itemCType == "AUDIO") {
        isAudio = true;
      }

      /* GET VIDEOTRACK TO OVERWRITE CLIP */
      var setSequenceTrackType = isAudio ? activeSeq.audioTracks : activeSeq.videoTracks; //by video or audio tracks

      //add sets to di-object
      dragIObject.clipStartTicks = activeSeq.getPlayerPosition();

      //auto size sequence option
      var useAutoSizeForSeq = doAutoSizeSequence(packInsideOptions, argumentsPack);

      //auto size for footages
      var useAutoSizeForFootages = doAutoSizeFootageInPR(packInsideOptions, argumentsPack);

      var useCustomBlendMode = argumentsPack.custom_args.layer_blendmode ? argumentsPack.custom_args.layer_blendmode : false;

      var useGroupResizeProperties = argumentsPack.group_resize_properties ? argumentsPack.group_resize_properties : false;
      var mogrtTransitionSystem = argumentsPack.mogrt_transition_system ? argumentsPack.mogrt_transition_system : false;

      var aeTransitionSystem = argumentsPack.ae_transition_system ? argumentsPack.ae_transition_system : false;

      //enable QE and import project via CopyPaste injection
      app.enableQE();
      /* DO OTHER SCRIPT ACTIONS */
      switch (itemCType) {
        case "PROJECT":
          prepareStructure(packName, extraArguments["groups"], itemLastGrp, itemName);
          var response = addProject(
            curMethodAsDrag,
            itemName,
            itemFilepath,
            dragIObject.clipStartTicks,
            dragIObject.trackNum,
            useAutoSizeForSeq,
            sequenceSpeed,
            argumentsPack.custom_args,
            preLockTracks
          );
          if (response) {
            return response;
          }

          break;
        case "MOGRT": //MOGRT
          if (mogrtTransitionSystem) {
            prepareStructureMogrtTransitions(packName, "Placeholders");
          } else {
            prepareStructure(packName, extraArguments["groups"], itemLastGrp);
          }
          var mgerr = addMOGRT(
            curMethodAsDrag,
            itemName,
            activeSeq,
            dragIObject,
            itemFilepath,
            useAutoSizeForSeq,
            useGroupResizeProperties,
            mogrtTransitionSystem,
            argumentsPack.custom_args,
            useCustomBlendMode
          );
          if (mgerr) {
            return mgerr;
          } //return errors
          break;
        //Join audio and footage
        case "AUDIO": //WAV, MP3
        case "FOOTAGE": //JPG, PNG, MP4, MOV
          //create struct folder
          prepareStructure(packName, extraArguments["groups"], itemLastGrp);
          app.project.importFiles([itemFilepath], true, projectFolders.category, false);
          var getImportedItem = getChildrenItems(projectFolders.category, dndName, ProjectItemType.CLIP);

          //get free tracks to add our clip into
          var getDurOfFootageInTicks = getImportedItem.getOutPoint().ticks - getImportedItem.getInPoint().ticks;
          var indexes = setPlacesForTracks(0, [1, 1], getDurOfFootageInTicks);
          if (typeof indexes != "object") {
            return "DEBUG|" + indexes;
          }
          var trackNumberToFootage = isAudio ? indexes[1] : indexes[0];

          //insert clip by our indexies
          setSequenceTrackType[trackNumberToFootage].insertClip(getImportedItem, activeSeq.getPlayerPosition());

          //AUTO SIZE AND OTHERS OPTIONS
          //auto size for footage - fit scale to seq
          if (useAutoSizeForFootages == "ALL_ITEMS" || useCustomBlendMode) {
            //find object on timeline
            var curTrack = setSequenceTrackType[trackNumberToFootage];
            for (var c = 0; c < curTrack.clips.numItems; c++) {
              var curClip = curTrack.clips[c];
              if (curClip.name == getImportedItem.name) {
                //change blendmode
                if (useCustomBlendMode) {
                  changeBlendMode(curClip, useCustomBlendMode);
                }
                //change size for footage
                if (useAutoSizeForFootages == "ALL_ITEMS") {
                  curClip.name = itemNamePrefix + curClip.name; //rename (add prefix only for footages/audio)
                  fitClipScaleToSeq(curClip, activeSeq);
                }
                break;
              }
            }
          }
          break;
      }
    } catch (ex) {
      return "UNKNOWN_ERROR|" + "DCLICK: " + ex + " at line " + ex.line;
    }
  },

  dragAndDropApply: function (
    itemId,
    itemName,
    instanceGroup,
    argumentsPack,
    extraArguments,
    folderPath,
    packName,
    packInsideOptions,
    preLockTracks
  ) {
    var itemCType = extraArguments["ctype"];
    if (itemCType === "FULL_PROJECT") {
      try {
        $._copyPasteSystem.createStructure(packName, extraArguments["groups"], itemName);
        $._copyPasteSystem.removeHelper(extraArguments["placeholder"]);
        return "APPLIED_PROJECT";
      } catch (err) {
        return "Error: " + err.message + " at line " + err.line;
      }
    }
    this.disableLockTracks = preLockTracks;
    try {
      if (!argumentsPack.custom_args) {
        argumentsPack.custom_args = {};
      }

      var curMethodAsDrag = true;
      var project = app.project;
      var activeSeq = project.activeSequence;
      if (!activeSeq) {
        return "SEQUENCE";
      }

      var dragIObject = {
        track: 0,
        trackNum: 0,

        clip: 0,
        clipNum: 0,
        clipStartTicks: 0,
        clipEndTicks: 0,
      };

      //need prefix for names to fix problem with FOOTAGES (don't works when item same name on timeline for footages)
      var itemNamePrefix = "-";

      var itemLastGrp = extraArguments["last_grp"];
      var itemFilepath = extraArguments["file_path"];
      var itemCType = extraArguments["ctype"];
      var dndName = extraArguments["placeholder"];
      var sequenceSpeed = extraArguments["sequenceSpeed"];

      var removePseudoDND = true;
      var isAudio = false;

      if (itemCType == "FOOTAGE") {
        removePseudoDND = false; //unset remove dnd object
      }

      if (itemCType == "AUDIO") {
        isAudio = true;
        removePseudoDND = false; //unset remove dnd object
      }

      /* FIND PSEUDO DRAG AND DROP IMAGE ON TIMELINE TO SAVE IN OBJECT DATA */
      var setSequenceTrackType = isAudio ? activeSeq.audioTracks : activeSeq.videoTracks; //by video or audio tracks
      stopSeqSearchMain: for (var j = 0; j < setSequenceTrackType.numTracks; j++) {
        var curTrack = setSequenceTrackType[j];
        var curTrackClips = curTrack.clips;
        //clips loop
        for (var c = 0; c < curTrackClips.numItems; c++) {
          var curItemOnTimeline = curTrackClips[c];
          //find pseudo image name on timeline in clips
          if (curItemOnTimeline.name == dndName) {
            //tracks
            dragIObject.track = curTrack;
            dragIObject.trackNum = j + 1;

            //clips
            dragIObject.clip = curItemOnTimeline;
            dragIObject.clipStartTicks = curItemOnTimeline.start.ticks;
            dragIObject.clipEndTicks = curItemOnTimeline.end.ticks;
            break stopSeqSearchMain;
          }
        }
      }

      if (dragIObject.trackNum == 0) {
        //fix problem with FOOTAGES (don't works when item same name on timeline for footages)
        if (isAudio) {
          return "WRONG_TRACK_AUDIO";
        } else {
          return "WRONG_TRACK_VIDEO";
        }
      }

      /* REMOVE DRAG AND DROP PSEUDO IMAGE [except footages/audio] */
      if (removePseudoDND && dragIObject.clip) {
        //create trash folder for dnd object
        var trashExtraFolder = app.project.rootItem.createBin("ATOMX_E_" + Math.round(Math.random(100) * 999));
        //move dnd image to this folder
        dragIObject.clip.projectItem.moveBin(trashExtraFolder);
        //delete this folder includes all elements inside
        trashExtraFolder.deleteBin();
      }

      //auto size for seq/mogrt
      var useAutoSizeForSeq = doAutoSizeSequence(packInsideOptions, argumentsPack);
      //auto size for footages
      var useAutoSizeForFootages = doAutoSizeFootageInPR(packInsideOptions, argumentsPack);

      var useCustomBlendMode = argumentsPack.custom_args.layer_blendmode ? argumentsPack.custom_args.layer_blendmode : false;

      var useGroupResizeProperties = argumentsPack.group_resize_properties ? argumentsPack.group_resize_properties : false;

      var mogrtTransitionSystem = argumentsPack.mogrt_transition_system ? argumentsPack.mogrt_transition_system : false;

      //enable QE and import project via CopyPaste injection
      app.enableQE();
      /* DO OTHER SCRIPT ACTIONS */
      switch (itemCType) {
        case "FULL_PROJECT":
        case "PROJECT": //PPROJ in XML Struct
          //auto size sequence option

          //create struct folder with extras project name
          prepareStructure(packName, extraArguments["groups"], itemLastGrp, itemName);
          //enable QE and import project via CopyPaste injection

          var response = addProject(
            curMethodAsDrag,
            itemName,
            itemFilepath,
            dragIObject.clipStartTicks,
            dragIObject.trackNum,
            useAutoSizeForSeq,
            sequenceSpeed,
            argumentsPack.custom_args,
            preLockTracks
          );
          if (response) {
            return response;
          }
          break;
        case "MOGRT": //MOGRT
          if (mogrtTransitionSystem) {
            prepareStructureMogrtTransitions(packName, "Placeholders");
          } else {
            prepareStructure(packName, extraArguments["groups"], itemLastGrp);
          }

          var mgerr = addMOGRT(
            curMethodAsDrag,
            itemName,
            activeSeq,
            dragIObject,
            itemFilepath,
            useAutoSizeForSeq,
            useGroupResizeProperties,
            mogrtTransitionSystem,
            argumentsPack.custom_args,
            useCustomBlendMode
          );
          if (mgerr) {
            return mgerr;
          } //return errors
          break;
        //Join audio and footage in one
        case "AUDIO": //WAV, MP3
        case "FOOTAGE": //JPG, PNG, MP4, MOV
          //create struct folder
          prepareStructure(packName, extraArguments["groups"], itemLastGrp);
          //Move footage file to pack folder
          dragIObject.clip.name = itemNamePrefix + dragIObject.clip.name; //rename (add prefix only for footages/audio)
          dragIObject.clip.projectItem.moveBin(projectFolders.category);

          //AUTO SIZE AND OTHERS OPTIONS
          //auto size for footage - fit scale to seq
          if (useAutoSizeForFootages == "ALL_ITEMS") {
            fitClipScaleToSeq(dragIObject.clip, activeSeq);
          }
          //change blendmode
          if (useCustomBlendMode) {
            changeBlendMode(dragIObject.clip, useCustomBlendMode);
          }

          break;
      }
    } catch (ex) {
      return "UNKNOWN_ERROR|" + "DND: " + ex;
    }
  },
};

function changeBlendMode(clip, layer_blendmode) {
  var blendModeArg = layer_blendmode;
  if (blendModeArg) {
    blendModeArg = blendModeArg.toString().toLowerCase();
    var blendId = 18; //normal
    switch (blendModeArg) {
      //main
      case "dissolve":
        blendId = 6;
        break;
      case "darken":
        blendId = 3;
        break;
      case "multiply":
        blendId = 17;
        break;
      case "color burn":
        blendId = 1;
        break;
      case "linear burn":
        blendId = 13;
        break;
      case "darker color":
        blendId = 4;
        break;
      //high
      case "lighten":
        blendId = 11;
        break;
      case "screen":
        blendId = 22;
        break;
      case "color dodge":
        blendId = 2;
        break;
      case "linear dodge":
        blendId = 14;
        break;
      case "lighter color":
        blendId = 12;
        break; //or linear as in AE
      //
      case "overlay":
        blendId = 19;
        break;
      case "soft light":
        blendId = 23;
        break;
      case "hard light":
        blendId = 8;
        break;
      case "vivid light":
        blendId = 24;
        break;
      case "linear light":
        blendId = 15;
        break;
      case "pin light":
        blendId = 20;
        break;
      case "hard mix":
        blendId = 9;
        break;
      //
      case "difference":
        blendId = 5;
        break;
      case "exclusion":
        blendId = 7;
        break;
      case "subtract":
        blendId = 25;
        break;
      case "divide":
        blendId = 26;
        break;
      //last
      case "hue":
        blendId = 10;
        break;
      case "saturation":
        blendId = 21;
        break;
      case "color":
        blendId = 0;
        break;
      case "luminosity":
        blendId = 16;
        break;
    }

    parseByComponents(clip, "Opacity", function (prop) {
      if (prop.displayName == "Blend Mode") {
        prop.setValue(blendId, true);
      }
    });
  }
}

function parseByComponentsMGT(clip, callbackPropCycle) {
  var getComponent = clip.getMGTComponent();
  if (getComponent) {
    var params = getComponent.properties;
    //cycle by parameters
    for (var z = 0; z < params.numItems; z++) {
      var curParam = params[z];
      callbackPropCycle(curParam);
    }
  }
}

function parseByComponents(clip, propertyParentName, callbackPropCycle) {
  var itemComponents = clip.components;
  for (var a = 0; a < itemComponents.numItems; a++) {
    var fx = itemComponents[a];

    if (fx.displayName == propertyParentName) {
      for (var b = 0; b < fx.properties.numItems; b++) {
        var prop = fx.properties[b];

        callbackPropCycle(prop);
        // if(prop.displayName == "Scale"){
        // 	var curScale = prop.getValue();
        // 	var w = sizeObject[0];
        // 	var h = sizeObject[1];
        // 	var divideNumberW = clipSizes[0] / w;
        // 	var divideNumberH = clipSizes[1] / h;
        // 	var aspect = clipSizes[0]/clipSizes[1];

        // 	if(w / h >= aspect){
        // 		prop.setValue(prop.getValue() / divideNumberW);
        // 	}else{
        // 		prop.setValue(prop.getValue() / divideNumberH);
        // 	}

        // }
      }
      break;
    }
  }
}

function doAutoSizeSequence(packInsideOptions, argumentsPack) {
  if (packInsideOptions.auto_size_sequence || argumentsPack.change_auto_size_sequence) {
    //if exists change this param - AS MAIN
    if (argumentsPack.change_auto_size_sequence) {
      if (argumentsPack.change_auto_size_sequence != "NONE") {
        return argumentsPack.change_auto_size_sequence;
      }
    } else {
      //if no - use global as MAIN
      if (packInsideOptions.auto_size_sequence != "NONE") {
        return packInsideOptions.auto_size_sequence;
      }
    }
  }
  return false;
}

function doAutoSizeFootageInPR(packInsideOptions, argumentsPack) {
  if (packInsideOptions.auto_size_footage || argumentsPack.change_auto_size_footage) {
    //if exists change this param - AS MAIN
    if (argumentsPack.change_auto_size_footage) {
      if (argumentsPack.change_auto_size_footage != "NONE") {
        return argumentsPack.change_auto_size_footage;
      }
    } else {
      //if no - use global as MAIN
      if (packInsideOptions.auto_size_footage != "NONE") {
        return packInsideOptions.auto_size_footage;
      }
    }
  }
  return false;
}

//#region MAIN SYSTEM CORE

function getMOGRT_Sizes(clipProjectItem) {
  var mogrtXMP = getExternalObjectXMP(clipProjectItem);
  if (mogrtXMP) {
    var xmpColumnPointer = "Column.Intrinsic.VideoInfo";
    var checkExistsVideoInfo = mogrtXMP.doesPropertyExist(kPProPrivateProjectMetadataURI, xmpColumnPointer);
    if (checkExistsVideoInfo) {
      var getVideoInfo = mogrtXMP.getProperty(kPProPrivateProjectMetadataURI, xmpColumnPointer);
      var tstringSplit = getVideoInfo.toString().split("x");
      return [parseInt(tstringSplit[0]), parseInt(tstringSplit[1])]; //already parsed sizes
    }
  }
}

function toolbar_Resizer() {
  alert(_appTransferSets);
  var activeSequence = app.project.activeSequence;
  var getSequenceSettings = activeSequence.getSettings();
  var previousNodeID = false;
  var videoPixelRatio = getSequenceSettings.videoPixelAspectRatio.split(":");

  var sequenceRes = [getSequenceSettings.videoFrameWidth, getSequenceSettings.videoFrameHeight];

  // videoPixelRatio = [9, 16];

  //ALL TRACKS
  for (var vti = 0; vti < activeSequence.videoTracks.numTracks; vti++) {
    //ALL CLIPS
    for (var clipsIndex = 0; clipsIndex < activeSequence.videoTracks[vti].clips.numItems; clipsIndex++) {
      var curClip = activeSequence.videoTracks[vti].clips[clipsIndex];
      if (curClip.isSelected()) {
        /* Is MOGRT Transition system */
        if (curClip.isMGT()) {
          parseByComponentsMGT(curClip, function (prop) {
            if (prop.displayName == "Width" && prop.getValue()) {
              prop.setValue(activeSequence.frameSizeHorizontal, true);
            }
            if (prop.displayName == "Height" && prop.getValue()) {
              prop.setValue(activeSequence.frameSizeVertical, true);
            }
          });
        } else {
          if (curClip.projectItem.isAdjustmentLayer() || curClip.projectItem.isSequence()) {
            resizerClipObject(curClip, sequenceRes);
          } else {
            fitClipScaleToSeq(curClip, activeSequence);
          }
        }
      }
    }
  }

  return "RESIZED";
}

function resizerClipObject(clipObject, sizeObject) {
  //get Meta Data from clip object
  var clipSizes;
  var XMPC = getExternalObjectXMP(clipObject.projectItem);
  if (XMPC) {
    var xmpColumnPointer = "Column.Intrinsic.VideoInfo";
    var checkExistsVideoInfo = XMPC.doesPropertyExist(kPProPrivateProjectMetadataURI, xmpColumnPointer);
    if (checkExistsVideoInfo) {
      var getVideoInfo = XMPC.getProperty(kPProPrivateProjectMetadataURI, xmpColumnPointer);
      var tstringSplit = getVideoInfo.toString().split("x");
      clipSizes = [parseInt(tstringSplit[0]), parseInt(tstringSplit[1])]; //already parsed sizes
    }
  }

  var itemComponents = clipObject.components;
  for (var a = 0; a < itemComponents.numItems; a++) {
    var fx = itemComponents[a];

    if (fx.displayName == "Motion") {
      for (var b = 0; b < fx.properties.numItems; b++) {
        var prop = fx.properties[b];

        if (prop.displayName == "Scale") {
          var curScale = prop.getValue();
          var w = sizeObject[0];
          var h = sizeObject[1];
          var divideNumberW = clipSizes[0] / w;
          var divideNumberH = clipSizes[1] / h;
          var aspect = clipSizes[0] / clipSizes[1];

          if (w / h >= aspect) {
            prop.setValue(prop.getValue() / divideNumberW, true);
          } else {
            prop.setValue(prop.getValue() / divideNumberH, true);
          }
        }
      }
    }
  }
}

function getActiveProject() {
  try {
    seq = app.project.activeSequence;
  } catch (ex) {
    throw new Error("Can't get the active sequence.");
  }
  try {
    seqTreePath = seq.projectItem.treePath;
  } catch (ex) {
    throw new Error("Can't get the active sequence item.");
  }
  for (var i = 0; i < app.projects.numProjects; i += 1) {
    var proj = app.projects[i];
    if (seqTreePath.indexOf(proj.name) === 1) {
      return proj;
    }
  }
  return null;
}

function setPixelRatioForNest_Resizer(videoPixelRatio) {
  try {
    var finded = false;
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var seq = app.project.sequences[i];
      if (!previousSequences[seq.sequenceID]) {
        app.project.openSequence(seq.sequenceID);
        finded = true;
        break;
      }
    }

    var videoTracks = app.project.activeSequence.videoTracks;
    for (var vti = 0; vti < videoTracks.numTracks; vti += 1) {
      for (var clipsIndex = 0; clipsIndex < videoTracks[vti].clips.numItems; clipsIndex += 1) {
        var curClip = videoTracks[vti].clips[clipsIndex];
        curClip.projectItem.setOverridePixelAspectRatio(Number(videoPixelRatio[0]), Number(videoPixelRatio[1]));
      }
    }

    if (finded) {
      app.project.activeSequence.close();
    }
  } catch (e) {
    // alert(e.toString() + "\nScript File: " + File.decode(e.fileName).replace(/^.*[\|\/]/, "") + "\nFunction: " + arguments.callee.name + "\nError on Line: " + e.line.toString());
  }
}

function setPixelRatioForNest(videoPixelRatio, newBin) {
  try {
    var finded = false;
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var seq = app.project.sequences[i];
      if (!previousSequences[seq.sequenceID]) {
        app.project.openSequence(seq.sequenceID);
        finded = true;
        break;
      }
    }
    for (var vti = 0; vti < app.project.activeSequence.videoTracks.numTracks; vti += 1) {
      for (var clipsIndex = 0; clipsIndex < app.project.activeSequence.videoTracks[vti].clips.numItems; clipsIndex += 1) {
        var curClip = app.project.activeSequence.videoTracks[vti].clips[clipsIndex];
        curClip.projectItem.setOverridePixelAspectRatio(Number(videoPixelRatio[0]), Number(videoPixelRatio[1]));
        curClip.projectItem.moveBin(newBin);
      }
    }
    if (finded) {
      app.project.activeSequence.close();
    }
  } catch (e) {
    // alert(e.toString() + "\nScript File: " + File.decode(e.fileName).replace(/^.*[\|\/]/, "") + "\nFunction: " + arguments.callee.name + "\nError on Line: " + e.line.toString());
  }
}

/**
 * Get arr tracks with selected items
 * @param {Object} setSequenceTrackType videoTracks / or audioTracks of sequence
 * @returns Array with tracks numbers
 */
function selectedClipsOnTracks(setSequenceTrackType) {
  var usedTracks = {};
  var hasSelectedClips = false;
  var foundActiveTrack = false;
  for (var vti = 0; vti < setSequenceTrackType.numTracks; vti++) {
    if (setSequenceTrackType[vti].isTargeted()) {
      foundActiveTrack = true;
    }

    if (setSequenceTrackType[vti].clips.numItems) {
      for (var clipsIndex = 0; clipsIndex < setSequenceTrackType[vti].clips.numItems; clipsIndex++) {
        var curClip = setSequenceTrackType[vti].clips[clipsIndex];
        if (curClip && curClip.isSelected()) {
          usedTracks[vti] = true;
          hasSelectedClips = true;
          if (!setSequenceTrackType[vti].isTargeted()) {
            foundActiveTrack = true;
            setSequenceTrackType[vti].setTargeted(true, true);
          }
        }
      }
    }
  }
  return {
    has_selected: hasSelectedClips,
    track_selected_clips: usedTracks,
    active_tracks: foundActiveTrack,
  };
}

function switchOffTargetedTracks(trackObject, exceptTrackIds) {
  for (var vti = 0; vti < trackObject.numTracks; vti++) {
    if (trackObject[vti].isTargeted()) {
      if (exceptTrackIds) {
        if (!exceptTrackIds[vti]) {
          trackObject[vti].setTargeted(false, true);
        }
      } else {
        trackObject[vti].setTargeted(false, true);
      }
    }
  }
}

function unlinkAndRemoveAudioTrack(sequence, clipName, cursorPosition) {
  // Using linkSelection/unlinkSelection calls, panels can remove just the audio (or video) of a given clip.
  var curTrack = sequence.audioTracks;
  for (var vti = 0; vti < curTrack.numTracks; vti++) {
    if (curTrack[vti].clips.numItems) {
      var clips = curTrack[vti].clips;
      for (var i = 0; i < clips.numItems; i++) {
        var clip = clips[i];
        if (
          clip &&
          clip.name == clipName &&
          cursorPosition.seconds >= clip.start.seconds &&
          clip.end.seconds >= cursorPosition.seconds
        ) {
          clip.setSelected(true, true);
          sequence.unlinkSelection();
          clip.remove(true, true);
        }
      }
    }
  }
}

function findBin(parentBin, binName) {
  var findedBin = null;
  for (var i = 0; i < parentBin.children.numItems; i++) {
    if (parentBin.children[i].name == binName) {
      findedBin = parentBin.children[i];
    }
  }
  if (!findedBin) {
    parentBin.createBin(binName);
    findedBin = findBin(parentBin, binName);
  }
  return findedBin;
}

function prepareStructure(packName, mainCategoriesArr, categoryName, isProjectName) {
  //create Main Folder if not exists
  projectFolders.main = findBin(app.project.rootItem, assetsFolderName);
  //folder for pack content
  projectFolders.pack = findBin(projectFolders.main, packName);
  //new option - global folder for next cats
  projectFolders.main_category = findBin(projectFolders.pack, mainCategoriesArr[0]);
  //folder for current menu directory
  projectFolders.category = findBin(projectFolders.main_category, categoryName);
  //folder for project files
  if (isProjectName) {
    projectFolders.project = findBin(projectFolders.category, isProjectName);
  }

  return true;
}

function prepareStructureMogrtTransitions(packName, categoryName) {
  var prepareName = "Atom " + categoryName + " [" + packName + "]";
  //create Main Folder if not exists
  projectFolders.projectSequences = findBin(app.project.rootItem, prepareName);

  return true;
}

//modified by nipapin
function setTargetedOrLockedSystem(sequence, trackNumber, type, state, preLockTracks) {
  if (preLockTracks) return;
  var getTrackObject = type == "video" ? sequence.videoTracks[trackNumber] : sequence.audioTracks[trackNumber];
  /* If CC22 (22.5) and above - setTarget is not available */
  if (app.version >= "22.4") {
    var locked = state ? 0 : 1;
    tempTargetedTracks[type][trackNumber] = locked;
    getTrackObject.setLocked(locked);
  } else {
    getTrackObject.setTargeted(state, true);
  }
}

//modified by nipapin
function resetTargetedOrLockedSystem(sequence, type) {
  if (app.version >= "22.4") {
    var getTrackObject = type == "video" ? sequence.videoTracks : sequence.audioTracks;
    for (var i = 0; i < getTrackObject.numTracks; i++) {
      /* Unlocked if have in var data */
      if (tempTargetedTracks[type][i]) {
        getTrackObject[i].setLocked(0);
      }
    }
    /* Reset var with this type */
    tempTargetedTracks[type] = {};
  }
}

function addProject(
  methodAsDrag,
  dndItemName,
  file,
  clipTimingStart,
  trackNum,
  doAutoSizeSeq,
  sequenceSpeed,
  customArgs,
  preLockTracks
) {
  //if no custom_args in pack (even with []) - bug fix
  if (!customArgs) {
    customArgs = {};
  }

  //sequences (need 14 - CC20 to use sequences prproj files)
  if (app.version < "14") {
    return "PROJECT_NOT_SUPPORTED";
  }

  try {
    tempImportedSeqName = dndItemName; //set temp name to import

    // app.bind("onProjectChanged", ProjectLinker.onProjectChanged);
    app.enableQE();
    // ProjectLinker.start();

    previousSequences = {};
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var seq = app.project.sequences[i];
      previousSequences[seq.sequenceID] = true;
    }

    if (methodAsDrag && clipTimingStart) {
      app.project.activeSequence.setPlayerPosition(clipTimingStart);
    }

    var clipOffset = customArgs.timing_offset_ticks ? customArgs.timing_offset_ticks : 0;
    var tracksHeightUsed = customArgs.tracks_used ? customArgs.tracks_used : [1, 1];
    var clipDuration = customArgs.duration_ticks ? customArgs.duration_ticks : false;
    // var nonSeamlessTransition 	= customArgs.transition_non_seamless || false;

    //var indexes = [trackNum - 1, trackNum - 1];
    var indexes = setPlacesForTracks(clipOffset, tracksHeightUsed, clipDuration, sequenceSpeed);

    //if method via drag - set position from pseudo img for video tracks, and free track if has audio
    if (methodAsDrag) {
      indexes[0] = trackNum - 1;
    }

    //set tracks to insert (copy&paste from injection) to places
    for (var i = 0; i < app.project.activeSequence.videoTracks.numTracks; i++) {
      // app.project.activeSequence.videoTracks[i].setTargeted(i >= indexes[0], true);
      setTargetedOrLockedSystem(app.project.activeSequence, i, "video", i >= indexes[0], preLockTracks);
      projectNumCounter = app.project.activeSequence.videoTracks[i].clips.numItems;
    }
    for (var i = 0; i < app.project.activeSequence.audioTracks.numTracks; i++) {
      // app.project.activeSequence.audioTracks[i].setTargeted(i >= indexes[1], true);
      setTargetedOrLockedSystem(app.project.activeSequence, i, "audio", i >= indexes[1], preLockTracks);
    }

    if (app.version.match(/^14\.1\./)) {
      var activeSequence = app.project.activeSequence;
      var activeProject = getActiveProject();
      app.project.activeSequence.close();
      activeProject.openSequence(activeSequence.sequenceID);
    } else {
      qe.project.getActiveSequence().makeCurrent();
    }

    // ProjectLinker.end();

    var replyExec = {
      code: "APPLIED_PROJECT",
      size:
        doAutoSizeSeq == "ONLY_SEQ" || doAutoSizeSeq == "ALL_ITEMS"
          ? [0, 0, app.project.activeSequence.frameSizeHorizontal, app.project.activeSequence.frameSizeVertical]
          : false,
    };

    // qe.project.init();

    return JSON.stringify(replyExec);
  } catch (e) {
    return "UNKNOWN_ERROR|" + "PROJECT: " + e;
    //alert(e.toString() + "\nScript File: " + File.decode(e.fileName).replace(/^.*[\|\/]/, "") + "\nFunction: " + arguments.callee.name + "\nError on Line: " + e.line.toString());
  }
}

function showMessageSDK(message) {
  app.setSDKEventMessage(message, "info");
}

function appVersionSameOrHigher(compareVersion) {
  var curParts = String(app.version).split(".");
  var cmpParts = String(compareVersion).split(".");
  var len = Math.max(curParts.length, cmpParts.length);

  for (var i = 0; i < len; i++) {
    var c = curParts[i] !== undefined && curParts[i] !== "" ? +curParts[i] : 0;
    var v = cmpParts[i] !== undefined && cmpParts[i] !== "" ? +cmpParts[i] : 0;
    if (c > v) return true; // выше
    if (c < v) return false; // ниже
  }
  return true; // равны → истина
}

function addMOGRT(
  methodDraggable,
  itemName,
  thisSequence,
  dataObjectClip,
  filePath,
  doAutoSizeSeq,
  useGroupResizeProps,
  mogrtTransitionSystem,
  customArgs,
  useCustomBlendMode
) {

  if (!customArgs) {
    customArgs = {};
  }

  //MOGRT Version Premiere Type (need 13.4.1 to use MOGRT files)
  //app.version < "13.1.4"
  if (!appVersionSameOrHigher("13.1.4")) {
    return "MOGRT_NOT_SUPPORTED";
  }

  //get data
  var timeLinkSeconds = dataObjectClip.clipStartTicks || thisSequence.getPlayerPosition().ticks;

  var videoTrackOffsetMG = dataObjectClip.trackNum - 1;
  var audioTrackOffsetMG = videoTrackOffsetMG;

  var projectPath = new File(filePath);
  if (!projectPath.exists) {
    return "NO_MOGRT";
  }

  var mogrtSwitcherType = customArgs.mogrt_switcher_param || false;
  //if double click - find place to add
  if (!methodDraggable) {
    var clipDuration = customArgs.duration_ticks || false;
    var clipOffset = customArgs.timing_offset_ticks || 0;
    var getCurSequenceTiming = thisSequence.getPlayerPosition();

    if (mogrtTransitionSystem) {
      var oldInPointOfSeq = thisSequence.getInPoint();
      var oldOutPointOfSeq = thisSequence.getOutPoint();

      var subSequenceName = "[" + thisSequence.frameSizeHorizontal + "x" + thisSequence.frameSizeVertical + "] " + itemName;

      var offsetSec = getSecondsByTicks(clipOffset);
      var clipDurInSec = getSecondsByTicks(clipDuration);
      var getTicksOfferDur = getCurSequenceTiming.ticks - clipOffset;
      var offsetClipDurPoint = getSecondsByTicks(getTicksOfferDur);
      /* Fixed - if cursor from 0 or less than offset */
      if (offsetClipDurPoint <= 0) {
        offsetClipDurPoint = 0;
      }
      /* Change sequence In / Out point Mark */
      thisSequence.setInPoint(offsetClipDurPoint);
      thisSequence.setOutPoint(offsetClipDurPoint + clipDurInSec);

      /* Find free space to add MOGRT & subsequence (2 heigth up for tracks) */
      var curFreeSpace = setPlacesForTracks(clipOffset, [2, 1], clipDuration);

      videoTrackOffsetMG = curFreeSpace[0];
      audioTrackOffsetMG = curFreeSpace[1];

      if (clipOffset) {
        //get updated timeline current (updated in setPlaceForTracks)
        timeLinkSeconds = thisSequence.getPlayerPosition().ticks;
        //return old current timeline point after offset
        if (timePositionDivider) {
          thisSequence.setPlayerPosition(timePositionDivider.ticks);
        }
        /* Fixed MOGRT position */
        if (offsetClipDurPoint <= 0) {
          timeLinkSeconds = 0;
        }
      }

      /* Has Selected clips - if not then control via Target Tracks by user */
      var getVideoTracksSelectedClips = selectedClipsOnTracks(thisSequence.videoTracks);
      if (getVideoTracksSelectedClips.has_selected) {
        /* Disable user target tracks - to create subsequence and restore it in future */
        switchOffTargetedTracks(thisSequence.videoTracks, getVideoTracksSelectedClips.track_selected_clips);
      }
      // If not targeted tracks - set zero track as default
      if (!getVideoTracksSelectedClips.active_tracks) {
        thisSequence.videoTracks[0].setTargeted(true, true);
      }

      var newSeq = thisSequence.createSubsequence(false);
      newSeq.name = subSequenceName;
      newSeq.projectItem.setColorLabel(7);

      /* Move to folder */
      newSeq.projectItem.moveBin(projectFolders.projectSequences);

      for (var i = 0; i < thisSequence.videoTracks.numTracks; i++) {
        setTargetedOrLockedSystem(thisSequence, i, "video", i >= curFreeSpace[0]);
      }
      // return "UNKNOWN_ERROR|"+isTrackFree(thisSequence.audioTracks[2], getTicksOfferDur, getTicksOfferDur + clipDuration);
      /* Block all audio tracks to prevent problem with clip audio track replacement */

      for (var i = 0; i < thisSequence.audioTracks.numTracks; i++) {
        var curAudioTrack = thisSequence.audioTracks[i];
        var paramEquals = !curAudioTrack.clips.numItems;
        if (curAudioTrack.clips.numItems && i >= videoTrackOffsetMG) {
          paramEquals = isTrackFree(curAudioTrack, getTicksOfferDur, getTicksOfferDur + clipDuration);
        }
        setTargetedOrLockedSystem(thisSequence, i, "audio", paramEquals);
      }

      thisSequence.videoTracks[videoTrackOffsetMG].insertClip(newSeq.projectItem, offsetClipDurPoint);

      /* Create marker on sequence */
      newSeq.projectItem.getMarkers().createMarker(offsetSec);
      /* Remove audio from sequence */
      // unlinkAndRemoveAudioTrack(thisSequence, subSequenceName, thisSequence.getPlayerPosition());
      /* New track index for MOGRT */
      videoTrackOffsetMG += 1;

      // resetTargetedOrLockedSystem(thisSequence, 'audio');
      /* Remove audio track for clip */
      // unlinkAndRemoveAudioTrack(thisSequence, subSequenceName, offsetClipDurPoint);
      /* Back old sequences workarea */
      thisSequence.setInPoint(oldInPointOfSeq);
      thisSequence.setOutPoint(oldOutPointOfSeq);
    } else {
      var curFreeSpace = setPlacesForTracks(clipOffset, [1, 1], clipDuration);
      videoTrackOffsetMG = curFreeSpace[0];
      audioTrackOffsetMG = curFreeSpace[1];
      //Works time Offset for MOGRT (AtomX 3.1+)
      if (clipOffset) {
        //get updated timeline current (updated in setPlaceForTracks)
        timeLinkSeconds = thisSequence.getPlayerPosition().ticks;
        //return old current timeline point after offset
        if (timePositionDivider) {
          thisSequence.setPlayerPosition(timePositionDivider.ticks);
        }
      }

      for (var i = 0; i < thisSequence.videoTracks.numTracks; i++) {
        setTargetedOrLockedSystem(thisSequence, i, "video", i >= curFreeSpace[0]);
      }
      for (var i = 0; i < thisSequence.audioTracks.numTracks; i++) {
        setTargetedOrLockedSystem(thisSequence, i, "audio", i >= curFreeSpace[1]);
      }
    }
  }

  var newMGT_object = thisSequence.importMGT(
    projectPath.fsName, //import mogrt path
    timeLinkSeconds, //set in time seconds
    videoTrackOffsetMG, //video track offset
    audioTrackOffsetMG //audio track offset
  );

  if (!newMGT_object) {
    return "CANT_ADD_MOGRT";
  }

  if (projectFolders.category) {
    newMGT_object.projectItem.moveBin(projectFolders.category);
  }

  if (!methodDraggable) {
    resetTargetedOrLockedSystem(thisSequence, "video");
    resetTargetedOrLockedSystem(thisSequence, "audio");
  }

  // OPTIMIZE to future -  Now Can't relink after unlink (group bad version - cant edit mogrt after)
  //Fixed - In PR 25+ mogrt can't edit via Properties (has old data between select next mogrt)
  // if (appVersionSameOrHigher("25.3")) {
  // 	relinkMogrt(newMGT_object, thisSequence);
  // }
  relinkMogrt(newMGT_object, thisSequence);

  // return "CANT_ADD_MOGRT";

  if (mogrtTransitionSystem) {
    var markerPointOnMogrt = newMGT_object.projectItem.getMarkers().createMarker(offsetSec);
    markerPointOnMogrt.name = "Transition point";
  }

  //change blendmode
  if (useCustomBlendMode) {
    changeBlendMode(newMGT_object, useCustomBlendMode);
  }

  //import mogrt object and set to timeline

  //do auto-size for mogrt if picked
  if (doAutoSizeSeq == "ONLY_MOGRT" || doAutoSizeSeq == "ALL_ITEMS") {
    fitClipScaleToSeq(newMGT_object, thisSequence);
  }

  //do auto-resize by properties in mogrts
  if (useGroupResizeProps) {
    // return "UNKNOWN_ERROR|"+'MOVE_FILES: '+newMGT_object.getMGTComponent().properties[6].displayName;
    parseByComponentsMGT(newMGT_object, function (prop) {
      // Check and set Width
      if (useGroupResizeProps["Width"]) {
        if (prop.displayName == "Width" && prop.getValue() == useGroupResizeProps["Width"]) {
          prop.setValue(thisSequence.frameSizeHorizontal, true);
        }
      }
      //Check and set Height
      if (useGroupResizeProps["Height"]) {
        if (prop.displayName == "Height" && prop.getValue() == useGroupResizeProps["Height"]) {
          prop.setValue(thisSequence.frameSizeVertical, true);
        }
      }

      if (mogrtSwitcherType) {
        mogrtSwitcherParams(mogrtSwitcherType, prop);
        // if(prop.displayName == mogrtSwitcherType[0]){
        // 	prop.setValue(mogrtSwitcherType[1], true);
        // }
      }
    });
  } else {
    /* Mogrt Switch if param above if disabled */
    if (mogrtSwitcherType) {
      parseByComponentsMGT(newMGT_object, function (prop) {
        mogrtSwitcherParams(mogrtSwitcherType, prop);
        // if(prop.displayName == mogrtSwitcherType[0]){
        // 	prop.setValue(mogrtSwitcherType[1], true);
        // }
      });
    }
  }

  // qe.project.init();

  return "APPLIED_MOGRT";
}

function relinkMogrt(clip, sequence) {
  // 1) найти все связанные элементы
  var items = [clip];
  if (clip.getLinkedItems) {
    var linked = clip.getLinkedItems();
    if (linked && linked.length) {
      for (var i = 0; i < linked.length; i++) {
        items.push(linked[i]);
      }
    }
  }

  // 2) сначала unlink
  for (var v = 0; v < items.length; v++) {
    items[v].setSelected(1, 0);
  }

  sequence.unlinkSelection();

  // 3) выделяем снова (по отдельности — теперь они уже разлинкованы)
  for (var v = 0; v < items.length; v++) {
    items[v].setSelected(1, 0);
  }

  // 4) link
  // return sequence.linkSelection(); // true если успех
}

function mogrtSwitcherParams(paramsObject, prop) {
  for (var key in paramsObject) {
    if (Object.hasOwnProperty.call(paramsObject, key)) {
      var oneParam = paramsObject[key];
      if (prop.displayName == key) {
        prop.setValue(oneParam, true);
      }
    }
  }
}

function fitClipScaleToSeq(clipObject, thisSequence) {
  //get mogrt original resolution via XMP data
  var getMogrtOriginSizes;
  var mogrtXMP = getExternalObjectXMP(clipObject.projectItem);
  if (mogrtXMP) {
    var xmpColumnPointer = "Column.Intrinsic.VideoInfo";
    var checkExistsVideoInfo = mogrtXMP.doesPropertyExist(kPProPrivateProjectMetadataURI, xmpColumnPointer);
    if (checkExistsVideoInfo) {
      var getVideoInfo = mogrtXMP.getProperty(kPProPrivateProjectMetadataURI, xmpColumnPointer);
      var tstringSplit = getVideoInfo.toString().split("x");
      getMogrtOriginSizes = [parseInt(tstringSplit[0]), parseInt(tstringSplit[1])]; //already parsed sizes
    }
  }

  var itemComponents = clipObject.components;
  for (var a = 0; a < itemComponents.numItems; a++) {
    var fx = itemComponents[a];

    if (fx.displayName == "Motion") {
      for (var b = 0; b < fx.properties.numItems; b++) {
        var prop = fx.properties[b];

        if (prop.displayName == "Scale") {
          var w = thisSequence.frameSizeHorizontal;
          var h = thisSequence.frameSizeVertical;
          var divideNumberW = getMogrtOriginSizes[0] / w;
          var divideNumberH = getMogrtOriginSizes[1] / h;
          var aspect = getMogrtOriginSizes[0] / getMogrtOriginSizes[1];
          if (w / h >= aspect) {
            prop.setValue(prop.getValue() / divideNumberW, true);
          } else {
            prop.setValue(prop.getValue() / divideNumberH, true);
          }
        }
      }
    }
  }
}

//#endregion

//#region Sequence Tracks

function getSecondsByTicks(ticks) {
  var tickPerSeconds = 254016000000;
  return ticks / tickPerSeconds;
}

function getTicksBySeconds(seconds) {
  var tickPerSeconds = 254016000000;
  return seconds * tickPerSeconds;
}

/**
 * All in Ticks
 * @param {*} durationOffset
 * @param {*} trackHeightUsed
 * @param {*} customClipDuration
 */
function setPlacesForTracks(durationOffset, trackHeightUsed, clipDuration, sequenceSpeed) {
  var vHeight = trackHeightUsed[0];
  var aHeight = trackHeightUsed[1];
  if (!durationOffset) {
    durationOffset = 0;
  }

  var videoTracks = app.project.activeSequence.videoTracks;
  var audioTracks = app.project.activeSequence.audioTracks;
  var maxCountTrack = Math.max(videoTracks.numTracks, audioTracks.numTracks);

  //set default cursor position on timeline (will be using after all methods)
  // timePositionDivider = app.project.activeSequence.getPlayerPosition();

  var currentPos = app.project.activeSequence.getPlayerPosition();
  if (!currentPos) {
    currentPos = {
      seconds: 0,
      ticks: 0,
    };
  }
  // if(isMogrtStartPlayerPosition){
  // 	currentPos = isMogrtStartPlayerPosition;
  // }
  //set default cursor position on timeline (will be using after all methods)
  timePositionDivider = currentPos;

  var newPosition = currentPos.ticks;

  //set player position
  if (newPosition > 0) {
    if (sequenceSpeed && parseInt(sequenceSpeed) != 100) {
      //has speed for project sequence item
      var durOffetAsSeconds = getSecondsByTicks(durationOffset);
      var offsetFTicks = getTicksBySeconds(durOffetAsSeconds * (100 / parseInt(sequenceSpeed)));
      newPosition = currentPos.ticks - offsetFTicks;
    } else {
      newPosition = currentPos.ticks - durationOffset;
    }

    app.project.activeSequence.setPlayerPosition(newPosition.toString());
  } else {
    newPosition = 0; //reset this param IMPORTANT to correcly add place in start (0 seconds timing)
  }

  //set arr place for video and audio
  var videoFree = Array(maxCountTrack + vHeight);
  for (var v = 0; v < videoFree.length; v++) {
    videoFree[v] = true;
  }
  var audioFree = Array(maxCountTrack + aHeight);
  for (var a = 0; a < audioFree.length; a++) {
    audioFree[a] = true;
  }

  //default timing for clipDuration
  if (!clipDuration) {
    clipDuration = getTicksBySeconds(1);
  }

  //find place
  for (var vV = 0; vV < videoTracks.numTracks; vV++) {
    videoFree[vV] = isTrackFree(videoTracks[vV], newPosition, newPosition + clipDuration);
  }
  for (var aA = 0; aA < audioTracks.numTracks; aA++) {
    audioFree[aA] = isTrackFree(audioTracks[aA], newPosition, newPosition + clipDuration);
  }

  //next
  var vIndex = undefined;
  var aIndex = undefined;
  for (var i = 0; i < videoTracks.numTracks; i++) {
    var availebleVideo = true;
    for (var j = 0; j < vHeight; j++) {
      if (!videoFree[i + j]) {
        availebleVideo = false;
        break;
      }
    }
    if (availebleVideo) {
      vIndex = i;
      break;
    }
  }

  if (vIndex == undefined) {
    vIndex = videoTracks.numTracks;
  }
  for (var i = 0; i < audioTracks.numTracks; i++) {
    var availebleAudio = true;
    for (var j = 0; j < aHeight; j++) {
      if (!audioFree[i + j]) {
        availebleAudio = false;
        break;
      }
    }
    if (availebleAudio) {
      aIndex = i;
      break;
    }
  }
  if (aIndex == undefined) {
    aIndex = audioTracks.numTracks;
  }
  if (vIndex + vHeight > videoTracks.numTracks || aIndex + aHeight > audioTracks.numTracks) {
    var vTracksToAdd = 0;
    vTracksToAdd = Math.max(0, vIndex + vHeight - videoTracks.numTracks);
    var vAddIndex = videoTracks.numTracks;
    var aTracksToAdd = 0;
    aTracksToAdd = Math.max(0, aIndex + aHeight - audioTracks.numTracks);
    var aAddIndex = audioTracks.numTracks;
    var aTrackType = 1;
    qe.project.init();
    var seqId = app.project.activeSequence.sequenceID;
    var seq = findQESeqInBinRec(qe.project, seqId);
    seq.addTracks(vTracksToAdd, vAddIndex, aTracksToAdd, aTrackType, aAddIndex, 0, 0);
  }
  return [vIndex, aIndex];
}

function isTrackFree(track, startTime, endTime) {
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (startTime < clip.end.ticks && clip.start.ticks < endTime) {
      return false;
    }
  }
  return true;
}

function isTrackFreeBySeconds(track, startTime, endTime) {
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (startTime < clip.end.seconds && clip.start.seconds < endTime) {
      return false;
    }
  }
  return true;
}

function findQESeqInBinRec(bin, seqId) {
  if (!bin) {
    return null;
  }
  for (var i = 0; i < bin.numSequenceItems; i += 1) {
    var seq = bin.getSequenceAt(i);
    if (seq.guid == seqId) {
      return seq;
    }
  }
  for (var j = 0; j < bin.numBins; j += 1) {
    var childSeq = findQESeqInBinRec(bin.getBinAt(j), seqId);
    if (childSeq) {
      return childSeq;
    }
  }
  return null;
}

//#endregion

/**
 * Get All effects with properties and animation from clip
 * @param {*} clip Object of clip
 */
function grabber(clip) {
  var reto = []; //array to possible duplicate names
  //each effect
  for (var a = 0; a < clip.components.numItems; a++) {
    var fx = clip.components[a];
    var _props = {};

    for (var b = 0; b < fx.properties.numItems; b++) {
      var prop = fx.properties[b];
      if (prop.display != "") {
        try {
          if (prop.getKeys()) {
            var curKV_arr = [];
            for (var tk = 0; tk < prop.getKeys().length; tk++) {
              var curTime = prop.getKeys()[tk].seconds; //ticks or seconds
              var curValue = prop.getValueAtTime(curTime);
              var curKeyEaseType = 1;

              curKV_arr.push([curTime, curValue, curKeyEaseType]); // time, value, interpolation
            }
            // _props[prop.displayName] = curKV;
            _props[prop.displayName] = {
              isKeys: true,
              keys: curKV_arr,
            };
          } else {
            var setKeys = prop.getValue();
            _props[prop.displayName] = {
              isKeys: false,
              keys: setKeys,
            };
          }
        } catch (e) {
          continue;
        }
      }
    }

    reto.push({
      name: fx.displayName,
      props: _props,
    });
  }
  return reto;
}

/**
 * Sync all effects to layer (works from other function in cycle)
 * @param {*} effectObj Fx Object
 * @param {*} settings Main settings Object
 */
function syncFxPlease(effectObj, settings) {
  var fxObjProps = effectObj.properties;
  for (var a = 0; a < fxObjProps.numItems; a++) {
    var curFxProp = fxObjProps[a];

    try {
      if (settings[curFxProp.displayName] !== null) {
        var propSets = settings[curFxProp.displayName];
        var pIsKeys = propSets.isKeys;
        var pKeys = propSets.keys;

        if (curFxProp.displayName == "Blend Mode" && pKeys == 0) {
          continue;
        }

        if (pIsKeys) {
          //with keyframes
          if (!curFxProp.isTimeVarying()) {
            curFxProp.setTimeVarying(true);
          }
          for (var tk = 0; tk < pKeys.length; tk++) {
            var pam = pKeys[tk];
            var pam_timing = pam[0];
            var pam_value = pam[1];
            var pam_keyInterpolation = pam[2];

            curFxProp.addKey(pam_timing); //key with time (value we add in next step)
            curFxProp.setValueAtKey(pam_timing, pam_value); //add value to this key (by time)

            var iptEase = 5;
            if (tk == 0) {
              iptEase = 2;
            }
            if (tk == pKeys.length - 1) {
              iptEase = 3;
            }
            curFxProp.setInterpolationTypeAtKey(pam_timing, 5); //0, 1, 2, 3, 5 (4 HOLD)
            // curFxProp.setInterpolationTypeAtKey(pam_timing, iptEase); //0, 1, 2, 3, 5 (4 HOLD)
          }
        } else {
          curFxProp.setValue(pKeys);
          //fixes
          if (curFxProp.displayName == "Blend Mode" && pKeys == 0) {
            curFxProp.setValue(0);
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
}

/**
 * Set effects from settings to clip
 * @param {*} clip Clip object
 * @param {*} grabPrefab Grab Data Object with sets
 */
function fxSetter(clip, grabPrefab) {
  if (!clip || !grabPrefab) {
    return "NO_CLIP_OR_GRABPREFAB";
  }
  var cap = clip.components;
  for (var a = 0; a < cap.numItems; a++) {
    var fx_object = cap[a];
    for (var b = 0; b < grabPrefab.length; b++) {
      if (fx_object.displayName == grabPrefab[b].name) {
        syncFxPlease(fx_object, grabPrefab[b].props);
      }
    }
  }
}

/**
 * Check object (used for customizer to check objects massives)
 * @param {*} object
 */
function checkObjectExists(object) {
  var return_data = false;
  for (var k in object) {
    return_data = true;
  }

  return return_data ? object : false;
}

function lockAllSequenceTracks(sequence) {
  for (var a = 0; a < sequence.videoTracks.numTracks; a++) {
    sequence.videoTracks[a].setLocked();
  }
  for (var b = 0; b < sequence.audioTracks.numTracks; b++) {
    sequence.audioTracks[b].setLocked();
  }
}

function findPrevIncrementName(string, endfix) {
  var numberSplitRegex = /^(.*?) - ATOMX_(\d+)$/gm;
  var digitNumber = null;
  var specialPrefix = endfix; //" - ATOMX_";
  var splitNameArray = numberSplitRegex.exec(string);
  if (splitNameArray) {
    return splitNameArray[0];
  }
}
function incrementName(string, endfix) {
  var numberSplitRegex = /^(.*?) - ATOMX_(\d+)$/gm;
  var digitNumber = null;
  var specialPrefix = endfix; //" - ATOMX_";
  var splitNameArray = numberSplitRegex.exec(string);
  if (!splitNameArray) {
    // if there was no digit at the end of name, add _v2 to the new sequence name
    strNewSeqEndfixPart = specialPrefix + "2"; //save in temp
    return string + specialPrefix + "2";
  } else {
    newNumber = parseInt(splitNameArray[2], 10) + 1;
    if (newNumber.toString().length > splitNameArray[2].length) {
      digitNumber = newNumber.toString().length;
    } else {
      digitNumber = splitNameArray[2].length;
    }
    newNumber = padNum(newNumber, digitNumber);

    strNewSeqEndfixPart = specialPrefix + newNumber; //save in temp
    return splitNameArray[1] + specialPrefix + newNumber;
  }
}

function padNum(num, size) {
  var s = "000000000" + num;
  return s.substr(s.length - size);
}

/**
 * Get one one hierarchy level chilren items (Comp/Folders)
 * @param {*} whereFindItem Where is find obj. Default: app.project.rootItem
 * @param {string} itemName What we find - name
 * @param {number} itemType 2 (folder/bin) [ProjectItemType.BIN] / 1 - (footage/sequence/comp)
 * @return {*} Found item object
 */
function getChildrenItems(whereFindItem, itemName, itemType) {
  //set rootItem path if not found
  if (!whereFindItem) {
    whereFindItem = app.project.rootItem;
  }
  //search children inside root
  for (var j = 0; j < whereFindItem.children.numItems; j++) {
    var curItem = whereFindItem.children[j];

    if (curItem.type === itemType && curItem.name === itemName) {
      return curItem;
    } else {
      if (curItem.type === ProjectItemType.BIN) {
        getChildrenItems(curItem, itemName, itemType);
      }
    }
  }
}

function getExternalObjectXMP(projectItem) {
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (ExternalObject.AdobeXMPScript !== undefined) {
    // safety-conscious!
    var xmpBlob = projectItem.getProjectMetadata();
    return new XMPMeta(xmpBlob);
  }
}

function setSequenceMetadataBC(projectItemChildren) {
  var xmp = getExternalObjectXMP(projectItemChildren);
  if (xmp) {
    var checkExistLogNote = xmp.doesPropertyExist(kPProPrivateProjectMetadataURI, logNote);

    //if not found logNote - clean sequence without duplicate
    if (!checkExistLogNote) {
      //add logNote comment
      xmp.setProperty(kPProPrivateProjectMetadataURI, logNote, logNoteSpecialComment);

      var arrayUpdatesMeta = [];
      arrayUpdatesMeta[arrayUpdatesMeta.length] = logNote;

      var xmpSerialize = xmp.serialize();
      projectItemChildren.setProjectMetadata(xmpSerialize, arrayUpdatesMeta);
      return true;
    }
  }
}

function deselectAllClips(activeSequence) {
  if (activeSequence) {
    for (var videoTracksIndex = 0; videoTracksIndex < activeSequence.videoTracks.numTracks; videoTracksIndex++) {
      for (var clipsIndex = 0; clipsIndex < activeSequence.videoTracks[videoTracksIndex].clips.numItems; clipsIndex += 1) {
        activeSequence.videoTracks[videoTracksIndex].clips[clipsIndex].setSelected(0, 0);
      }
    }
  }
}

function findPlaceToInsertClip(tracks, importedClip) {
  try {
    var importIndex = {};
    var prevImportIndex = {};

    var mogrtStart = importedClip.start.seconds;
    var mogrtEnd = importedClip.end.seconds;

    for (var i = 0; i < tracks.numTracks; i++) {
      var cTrack = tracks[i];
      var alreadyFalse = false;
      if (cTrack.clips.numItems == 0) {
        importIndex.i = i;
        importIndex.j = -1;
        // importIndex.firstFree = true;
      } else {
        for (var j = 0; j < cTrack.clips.numItems; j++) {
          var cTrackClip = cTrack.clips[j];
          var cTrackClipStart = cTrackClip.start.seconds;
          var cTrackClipEnd = cTrackClip.end.seconds;
          if (
            (mogrtStart < cTrackClipStart && mogrtEnd <= cTrackClipStart) ||
            (mogrtStart > cTrackClipStart && mogrtStart >= cTrackClipEnd)
          ) {
            if (cTrack.clips[j + 1]) {
              if (mogrtStart < cTrack.clips[j + 1].start.seconds && mogrtEnd < cTrack.clips[j + 1].start.seconds) {
                if (cTrack.clips[j - 1]) {
                  if (mogrtStart > cTrack.clips[j - 1].start.seconds && mogrtEnd > cTrack.clips[j - 1].end.seconds) {
                    importIndex.i = i;
                    importIndex.j = j;
                    prevImportIndex.i = i;
                    prevImportIndex.j = j;
                  }
                }
              } else {
                if (importIndex.i == i) {
                  importIndex = prevImportIndex;
                }
              }
            } else {
              if (!alreadyFalse) {
                importIndex.i = i;
                importIndex.j = j;
              }
            }
          } else {
            alreadyFalse = true;
          }
        }
      }
    }
  } catch (e) {
    alert("x: " + e);
  }
  return importIndex;
}

function findLoopInProjectBy(i, containingBin, type, custom_data) {
  //types: CLIP, BIN, ROOT, or FILE.
  for (var j = i; j < containingBin.children.numItems; j++) {
    var currentChild = containingBin.children[j];
    if (currentChild) {
      //if it's folder
      if (currentChild.type == 2) {
        // BIN = 2
        findLoopInProjectBy(0, currentChild, type, custom_data); // warning; recursion!
      } else {
        switch (type) {
          case "sequenceDupRename":
            //if sequence - rename it
            if (currentChild.isSequence()) {
              var smdbc = setSequenceMetadataBC(currentChild);
              if (smdbc) {
                currentChild.name = currentChild.name + " - " + sequenceNumCounter;
              }
            }
            break;
        }
      }
    }
  }
}

/**
 * Find and get sequence by name/nodeId/any
 * also can add properties: sequenceID, id - diffirent type it's not nodeId
 * @param {string} search_by type
 * @param {string} prop_name name
 * @param {string} prop_nodeId seq.projectItem.nodeId
 */
function getSequenceBy(search_by, prop_name, prop_nodeId) {
  var sequence_object_return;
  var project_seq = app.project.sequences;
  for (var k = 0; k < project_seq.numSequences; k++) {
    var curSeq = project_seq[k];

    switch (search_by) {
      case "name":
        if (prop_name == curSeq.name) {
          return curSeq;
        }
        break;
      case "nodeId":
        if (prop_nodeId == curSeq.projectItem.nodeId) {
          return curSeq;
          Selected;
        }
        break;
      case "all":
        if (prop_name == curSeq.name && prop_nodeId == curSeq.projectItem.nodeId) {
          return curSeq;
        }
        break;
    }
  }
}

function manuallyNestDuplicator() {
  var prefixFileExportSeqName = "ATOMX_";
  var endfixItemTemplateSeqName = " - ATOMX_";
  var activeProjectID = getViewIdActiveProject();
  var projectByID = app.getProjectFromViewID(activeProjectID);

  //find in sequence by name for next actions
  var sequenceOverwrite = getSelectedSequence(activeProjectID);

  //error checks
  if (!sequenceOverwrite || sequenceOverwrite == "NO_SELECTED") {
    return "SELECT_SEQ_IN_PROJECT";
  }
  if (sequenceOverwrite == "MULTI_SELECTED") {
    return "SELECT_ONLY_ONE_SEQ";
  }

  //fine - next
  if (sequenceOverwrite) {
    var selSeqName = sequenceOverwrite.name;
    var seqExportPath =
      projectByID.path.split(projectByID.name)[0] + prefixFileExportSeqName + selSeqName.replace(/[:\/\\*?"<>|]/gi, "") + ".prproj";

    //first applying - export project
    if (!new File(seqExportPath).exists || !tempStoringSequenceIDs[selSeqName]) {
      sequenceOverwrite.exportAsProject(seqExportPath);
      //save in temp to don't load in this session
      tempStoringSequenceIDs[selSeqName] = sequenceOverwrite.sequenceID;
    }
    //set new name to possible add without consolidates
    //open saved sequence project to rewrite names (to in future will added as new with nest sequences)
    app.openDocument(seqExportPath, true, true, true);
    var curProject = app.projects[0];
    exportedSeqRenamer(curProject.rootItem, endfixItemTemplateSeqName);
    curProject.save();
    curProject.closeDocument(0, 0);

    // binPath.createBin(newSeqName);
    // var findBin = getItemByName(binPath, newSeqName, ProjectItemType.BIN);
    app.project.rootItem.select(); //select to import sequence inside automatically
    projectByID.importSequences(seqExportPath, [sequenceOverwrite.sequenceID]);

    return "DUP_NEST_SUCCESS";
  }
}

/**
 * find parent of sequence
 * @usage getParent(app.project.activeSequence.projectItem, app.project.rootItem)
 * @param {*} item
 * @param {*} base
 */
function getParent(item, base) {
  var path = item.treePath;
  for (var i = 0; i < base.children.numItems; i++) {
    if (base.children.type == ProjectItemType.BIN) {
      var foundItem = getParent(item, base.children);
      if (foundItem) {
        return foundItem;
      }
    } else if (base.children.nodeId === item.nodeId) return base;
  }
  return false;
}

//#region KEYFRAMES AND EFFECTS

/**
 * Apply Effects from Object base to clips in sequence
 * @param {*} clonedSeq Sequence to apply videoTrack->clip fx
 */
function applyFXSettings(clonedSeq, fxBase, originSeq, testAct) {
  // alert(fxBase[clonedSeq.name].toSource());
  for (var v = 0; v < originSeq.videoTracks.numTracks; v++) {
    var curTrack = originSeq.videoTracks[v];
    var curTrackClips = curTrack.clips;
    //search item on index track

    for (var c = 0; c < curTrackClips.numItems; c++) {
      var curItemOnTimeline = curTrackClips[c];
      if (curItemOnTimeline) {
        var effects = curItemOnTimeline.components;

        /* 					if(curItemOnTimeline.name != clonedSeq.name){
                    return false;
                  } */

        if (fxBase[curItemOnTimeline.name]) {
          //find fx to need create (can't set before adding)
          var arrNotFoundFx = {};
          for (var b = 0; b < effects.numItems; b++) {
            if (effects[b]) {
              arrNotFoundFx[effects[b].displayName] = true;
              setPropertyKeys(effects[b], fxBase[curItemOnTimeline.name]);
            }
          }

          // alert(fxBase[curItemOnTimeline.name].toSource());
          // alert(testAct.name);

          // var clip = qe.project.getActiveSequence().getVideoTrackAt(v).getItemAt(c);
          var clip = testAct.getVideoTrackAt(0).getItemAt(0);
          if (clip) {
            alert(testAct.name);
            clip.addVideoEffect(qe.project.getVideoEffectByName("Twirl"));
          }

          // alert(clip.name, testAct.name);
        }

        // alert(arrNotFoundFx.toSource(), clonedSeq.name);

        /* 						for (var propG in fxBase) {
                      if (fxBase.hasOwnProperty(propG)) {
                        var propContent = fxBase[propG];
      	
                        if(propG == curItemOnTimeline.name){
                          for (var G in propContent) {
                            if (propContent.hasOwnProperty(G)) {
                              // alert(effects +'\n'+ G+'\n'+ propContent+'\n'+ v+'\n'+ c+'\n'+ originSeq+'\n'+ propContent, clonedSeq.name);
                              // addEffect(effects, G, propContent, v, c, originSeq, propContent);
                              app.enableQE();
                              var clip = qe.project.getActiveSequence().getVideoTrackAt(v).getItemAt(c);
                              clip.addVideoEffect(qe.project.getVideoEffectByName(G));
                            }
                          }
                        	
                        }
                      	
      	
                      }
                    } */

        // alert(fxBase.toSource(), fxName);
        fxBase = {}; //reset fx base on new clip
      }
    }
  }
}

/**
 * Create effect on clip with QE DOM mode
 * @param {*} clipComponents
 * @param {string} fxName
 * @param {*} propContent
 * @param {number} trackNum
 * @param {number} clipNum
 */
function addEffect(clipComponents, fxName, propContent, trackNum, clipNum, clonedSeq, fxBase) {
  //var clip = qe.project.getSequenceAt(clonedSeq.projectItem.id).getVideoTrackAt(trackNum).getItemAt(clipNum);
  // trackNum = trackNum > 0 ? Number(trackNum + 1) : 0;
  // clipNum = clipNum > 0 ? Number(clipNum + 1) : 0;

  var clip = qe.project.getActiveSequence().getVideoTrackAt(trackNum).getItemAt(clipNum);

  if (clip) {
    //alert(fxBase[clonedSeq.name].toSource(), clonedSeq.name);

    clip.addVideoEffect(qe.project.getVideoEffectByName(fxName));

    var tempObj = {};
    tempObj[fxName] = fxBase;

    for (var b = 0; b < clipComponents.numItems; b++) {
      setPropertyKeys(clipComponents[b], fxBase);
    }
  }
}

/**
 * Add keyframe to clip properties
 * @param {*} c_effect
 * @param {*} sets_object
 */
function setPropertyKeys(c_effect, sets_object) {
  for (var a = 0; a < c_effect.properties.numItems; a++) {
    try {
      //find global group prop
      if (sets_object[c_effect.displayName]) {
        var cfx_prop = c_effect.properties[a];
        if (cfx_prop.displayName != " ") {
          var prop_data = sets_object[c_effect.displayName][cfx_prop.displayName];
          //alert(prop_data);
          if (prop_data) {
            if (typeof prop_data === "object") {
              //more prop val (array)
              if (prop_data[0].toString().indexOf("|") != -1) {
                if (!cfx_prop.isTimeVarying()) {
                  cfx_prop.setTimeVarying(true);
                }

                for (var sp = 0; prop_data[0].toString().split("|")[sp]; sp++) {
                  var curValPiece = prop_data[0].toString().split("|")[sp].split("#");
                  var curValPiece_2 = prop_data[1].toString().split("|")[sp].split("#");

                  cfx_prop.addKey(Number(curValPiece[0])); //key with time (value we add in next step)
                  cfx_prop.setValueAtKey(Number(curValPiece[0]), [Number(curValPiece[1]), Number(curValPiece_2[1])], true); //add value to this key (by time)
                }
              } else {
                cfx_prop.setValue([Number(prop_data[0]), Number(prop_data[1])], 1);
              }
            } else {
              //one array prop val
              if (prop_data.toString().indexOf("|") != -1) {
                //with keyframes
                if (!cfx_prop.isTimeVarying()) {
                  cfx_prop.setTimeVarying(true);
                }

                for (var sp = 0; prop_data.toString().split("|")[sp]; sp++) {
                  var curValPiece = prop_data.toString().split("|")[sp].split("#");
                  var curTime = Number(curValPiece[0]);
                  var curVal = Number(curValPiece[1]);

                  cfx_prop.addKey(curTime); //key with time (value we add in next step)
                  cfx_prop.setValueAtKey(curTime, curVal, true); //add value to this key (by time)
                }
              } else {
                //just value
                cfx_prop.setValue(prop_data, 1);
              }
            }
          }
        }
      }
    } catch (e) {
      alert(e);
    }
  }
}

/**
 * Get and save effects from clip to use in future (clone fx to new clips)
 * @param {*} clip
 */
function getEffectInfoFromClip(clip, dupSequence) {
  var fxArr = {};
  var returnGlobalSync = {};
  //each effect
  for (var a = 0; a < clip.components.numItems; a++) {
    var fx = clip.components[a];
    fxArr = {};
    //fxArr.push(fx.displayName);

    //each property at effect
    for (var b = 0; b < fx.properties.numItems; b++) {
      var prop = fx.properties[b];
      if (prop.display != "") {
        try {
          if (prop.getKeys()) {
            var curKV = "";
            for (var tk = 0; tk < prop.getKeys().length; tk++) {
              var curTime = prop.getKeys()[tk].seconds; //ticks or seconds
              var curValue = prop.getValueAtTime(curTime);
              // fxArr.push(curTime + '#' + curValue);
              curKV += curTime + "#" + curValue + "|";
            }
            fxArr[prop.displayName] = curKV;
          } else {
            // fxArr.push(prop.getValue());
            fxArr[prop.displayName] = prop.getValue();
          }
        } catch (e) {
          continue;
        }
      }
    }

    //returnGlobalSync[fx.displayName] = fxArr;
    returnGlobalSync[fx.displayName] = fxArr;
  }
  var returnFullObj = {};
  returnFullObj[dupSequence.name] = returnGlobalSync;
  return returnFullObj;
}

//#endregion

//#region DUPLICATOR MAIN

/**
 * Get special data object by diff types
 * @return {*} date/time_join/datetime
 */
function getDateTime() {
  var a = new Date(),
    e = a.getDate(),
    f = a.getMonth() + 1,
    h = a.getHours(),
    d = a.getMinutes(),
    i = a.getSeconds();
  if (e < 10) {
    e = "0" + e;
  }
  if (f < 10) {
    f = "0" + f;
  }
  if (h < 10) {
    h = "0" + h;
  }
  if (d < 10) {
    d = "0" + d;
  }
  if (i < 10) {
    i = "0" + i;
  }
  var c = e + "/" + f + "/" + a.getFullYear(),
    b = h + d + i,
    g = "Exported " + c + " @ " + b;
  return {
    date: c,
    time_join: b,
    datetime: g,
  };
}

/**
 * Get ViewID by active project
 * @return {*} project by ID
 */
function getViewIdActiveProject() {
  var curProjViews = app.getProjectViewIDs();

  if (curProjViews) {
    for (var b = 0; b < app.projects.numProjects; b++) {
      var c = app.getProjectFromViewID(curProjViews[b]);
      if (c) {
        if (c.documentID === app.project.documentID) {
          return curProjViews[b];
        }
      }
    }
  }
}

/**
 * New system in AtomX 3.0.1 - full works
 */
function getCurrentProjectSelection(whatNeedGet) {
  var curProjViews = app.getProjectViewIDs();
  if (curProjViews) {
    for (var b = 0; b < app.projects.numProjects; b++) {
      if (app.getProjectFromViewID(curProjViews[b]).name === app.project.name) {
        return curProjViews[b];
      }
    }
  }
}

/**
 * Get item by name inside projecItem in loop
 * @param {*} projItem
 * @param {*} name
 * @param {*} type
 */
function getItemByName(projItem, name, type) {
  for (var b = 0; b < projItem.children.numItems; b++) {
    var e = projItem.children[b];
    if (e.type === type && e.name === name) {
      return e;
    } else {
      if (e.type === ProjectItemType.BIN) {
        getItemByName(e, name, type);
      }
    }
  }
}

/**
 * Get current selected sequence in active project
 * @param {*} f view project
 */
function getSelectedSequence(f) {
  var b = app.getProjectViewSelection(f);
  if (b != undefined) {
    if (b.length === 0 || !b[0].isSequence()) {
      return "NO_SELECTED";
    } else {
      if (b.length > 1) {
        return "MULTI_SELECTED";
      } else {
        var d = app.project.sequences,
          a = b[0];
        for (var c = 0; c < d.numSequences; c++) {
          var e = d[c];
          if (e.projectItem.nodeId === a.nodeId && e.projectItem.treePath === a.treePath) {
            return e;
          }
        }
      }
    }
  }
}

/**
 * Get multiple current selected sequence in active project
 * @param {*} f view project
 */
function getMultipleSelectedSequence(f, getAsSequences) {
  var seqArr = [];
  var b = app.getProjectViewSelection(f);
  if (b != undefined) {
    if (b.length > 0) {
      for (var c = 0; c <= b.length - 1; c++) {
        var curSeq = b[c];
        //add in arr only if sequence

        if (getAsSequences) {
          var seqa = app.project.sequences;
          for (var i = 0; i < seqa.numSequences; i++) {
            var seqOne = seqa[i];
            if (seqOne.projectItem.nodeId === curSeq.nodeId && seqOne.projectItem.treePath === curSeq.treePath) {
              seqArr.push(seqOne);
            }
          }
        } else {
          //default get as projectItem
          if (curSeq.isSequence()) {
            seqArr.push(curSeq);
          }
        }
      }
    }
    return seqArr;
  }
}

/**
 * rename after names inside exported folder (to in next time non-consolidated sequences)
 * @param {*} mainObjItem projectItem
 * @param {string} endfix endfix str
 */
function exportedSeqRenamer(mainObjItem, prefix) {
  for (var m = 0; m < mainObjItem.children.numItems; m++) {
    var curItem = mainObjItem.children[m];
    //rename only sequences
    if (curItem.type === ProjectItemType.CLIP) {
      curItem.name = incrementName(curItem.name, prefix);
    } else {
      //recurse loop start if item is folder
      if (curItem.type === ProjectItemType.BIN) {
        exportedSeqRenamer(curItem, prefix);
      }
    }
  }
}

//#endregion
