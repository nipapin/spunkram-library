(function (thisObj) {// ----- EXTENDSCRIPT INCLUDES ------ //"object"!=typeof JSON&&(JSON={}),function(){"use strict";var rx_one=/^[\],:{}\s]*$/,rx_two=/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,rx_three=/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,rx_four=/(?:^|:|,)(?:\s*\[)+/g,rx_escapable=/[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,rx_dangerous=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta,rep;function f(t){return t<10?"0"+t:t}function this_value(){return this.valueOf()}function quote(t){return rx_escapable.lastIndex=0,rx_escapable.test(t)?'"'+t.replace(rx_escapable,function(t){var e=meta[t];return"string"==typeof e?e:"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+t+'"'}function str(t,e){var r,n,o,u,f,a=gap,i=e[t];switch(i&&"object"==typeof i&&"function"==typeof i.toJSON&&(i=i.toJSON(t)),"function"==typeof rep&&(i=rep.call(e,t,i)),typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";if(gap+=indent,f=[],"[object Array]"===Object.prototype.toString.apply(i)){for(u=i.length,r=0;r<u;r+=1)f[r]=str(r,i)||"null";return o=0===f.length?"[]":gap?"[\n"+gap+f.join(",\n"+gap)+"\n"+a+"]":"["+f.join(",")+"]",gap=a,o}if(rep&&"object"==typeof rep)for(u=rep.length,r=0;r<u;r+=1)"string"==typeof rep[r]&&(o=str(n=rep[r],i))&&f.push(quote(n)+(gap?": ":":")+o);else for(n in i)Object.prototype.hasOwnProperty.call(i,n)&&(o=str(n,i))&&f.push(quote(n)+(gap?": ":":")+o);return o=0===f.length?"{}":gap?"{\n"+gap+f.join(",\n"+gap)+"\n"+a+"}":"{"+f.join(",")+"}",gap=a,o}}"function"!=typeof Date.prototype.toJSON&&(Date.prototype.toJSON=function(){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null},Boolean.prototype.toJSON=this_value,Number.prototype.toJSON=this_value,String.prototype.toJSON=this_value),"function"!=typeof JSON.stringify&&(meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},JSON.stringify=function(t,e,r){var n;if(gap="",indent="","number"==typeof r)for(n=0;n<r;n+=1)indent+=" ";else"string"==typeof r&&(indent=r);if(rep=e,e&&"function"!=typeof e&&("object"!=typeof e||"number"!=typeof e.length))throw new Error("JSON.stringify");return str("",{"":t})}),"function"!=typeof JSON.parse&&(JSON.parse=function(text,reviver){var j;function walk(t,e){var r,n,o=t[e];if(o&&"object"==typeof o)for(r in o)Object.prototype.hasOwnProperty.call(o,r)&&(void 0!==(n=walk(o,r))?o[r]=n:delete o[r]);return reviver.call(t,e,o)}if(text=String(text),rx_dangerous.lastIndex=0,rx_dangerous.test(text)&&(text=text.replace(rx_dangerous,function(t){return"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})),rx_one.test(text.replace(rx_two,"@").replace(rx_three,"]").replace(rx_four,"")))return j=eval("("+text+")"),"function"==typeof reviver?walk({"":j},""):j;throw new SyntaxError("JSON.parse")})}();// ---------------------------------- //// ----- EXTENDSCRIPT PONYFILLS -----function __objectFreeze(obj) { return obj; }// ---------------------------------- //var config = {
  id: "com.spunkramassets.cep"};

var ns = config.id;

var GAL_TOOLKIT_MAX_STOCK_ASSETS$1 = 'Spunkram Stock Assets';
var getFolderByName$1 = function getFolderByName(parent, name) {
  for (var i = 1; i <= parent.numItems; i++) {
    var item = parent.item(i);
    if (item.name === name && item instanceof FolderItem) {
      return item;
    }
  }
  var newFolder = app.project.items.addFolder(name);
  newFolder.parentFolder = parent;
  return newFolder;
};
var getFileName$1 = function getFileName(url) {
  var sepIdx = -1;
  for (var k = url.length - 1; k >= 0; k--) {
    if (url[k] === '/' || url[k] === '\\') {
      sepIdx = k;
      break;
    }
  }
  return sepIdx >= 0 ? url.substring(sepIdx + 1) : url;
};
var findItemByPath$1 = function findItemByPath(folder, url) {
  var fileName = getFileName$1(url);
  for (var i = 1; i <= folder.numItems; i++) {
    if (folder.item(i).name === fileName) return folder.item(i);
  }
  return null;
};
var importFileToFolder = function importFileToFolder(url, folder) {
  var importOptions = new ImportOptions(new File(url));
  var imported = app.project.importFile(importOptions);
  imported.parentFolder = folder;
  return imported;
};
var importByDestination$1 = {
  project: function project(url, _duration) {
    var assetsFolder = getFolderByName$1(app.project.rootFolder, GAL_TOOLKIT_MAX_STOCK_ASSETS$1);
    if (!findItemByPath$1(assetsFolder, url)) {
      importFileToFolder(url, assetsFolder);
    }
  },
  timeline: function timeline(url, _duration) {
    var assetsFolder = getFolderByName$1(app.project.rootFolder, GAL_TOOLKIT_MAX_STOCK_ASSETS$1);
    var importedItem = findItemByPath$1(assetsFolder, url);
    if (!importedItem) {
      importedItem = importFileToFolder(url, assetsFolder);
    }
    var activeComp = app.project.activeItem;
    if (!(activeComp instanceof CompItem)) {
      alert('No active composition found');
      return;
    }
    activeComp.layers.add(importedItem);
  }
};
var importMedia$1 = function importMedia(url, destination, duration) {
  if (destination === 'project') {
    importByDestination$1.project(url, duration);
  } else {
    importByDestination$1.timeline(url, duration);
  }
};

var aeft = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  importMedia: importMedia$1
});

var GAL_TOOLKIT_MAX_STOCK_ASSETS = 'Spunkram Stock Assets';
var getFolderByName = function getFolderByName(folder, name) {
  for (var i = 0; i < folder.children.numItems; i++) {
    var item = folder.children[i];
    if (item.name === name && item.type === ProjectItemType.BIN) {
      return item;
    }
  }
  var newFolder = folder.createBin(name);
  return newFolder;
};
var isFreeAtPosition = function isFreeAtPosition(track, position, duration) {
  var numClips = track.clips.numItems;
  if (numClips === 0) return true;
  var end = position + duration;
  for (var i = 0; i < numClips; i++) {
    var clipStart = track.clips[i].start.seconds;
    var clipEnd = track.clips[i].end.seconds;
    if (clipStart < end && clipEnd > position) return false;
  }
  return true;
};
var getFreeTrack = function getFreeTrack(sequence, position, duration) {
  for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
    if (isFreeAtPosition(sequence.videoTracks[i], position, duration)) {
      return {
        videoTrack: i,
        audioTrack: Math.min(i, sequence.audioTracks.numTracks - 1)
      };
    }
  }
  app.enableQE();
  var qeSequence = qe.project.getActiveSequence();
  var videoIdx = sequence.videoTracks.numTracks;
  var audioIdx = sequence.audioTracks.numTracks;
  qeSequence.addTracks(1, videoIdx, 1, 1, audioIdx);
  return {
    videoTrack: videoIdx,
    audioTrack: audioIdx
  };
};
var getFileName = function getFileName(url) {
  var sepIdx = -1;
  for (var k = url.length - 1; k >= 0; k--) {
    if (url[k] === '/' || url[k] === '\\') {
      sepIdx = k;
      break;
    }
  }
  return sepIdx >= 0 ? url.substring(sepIdx + 1) : url;
};
var findItemByPath = function findItemByPath(folder, url) {
  var fileName = getFileName(url);
  for (var i = 0; i < folder.children.numItems; i++) {
    if (folder.children[i].name === fileName) return folder.children[i];
  }
  return null;
};
var importByDestination = {
  project: function project(url, _duration) {
    var assetsFolder = getFolderByName(app.project.rootItem, GAL_TOOLKIT_MAX_STOCK_ASSETS);
    if (!findItemByPath(assetsFolder, url)) {
      app.project.importFiles([url], true, assetsFolder, false);
    }
  },
  timeline: function timeline(url, duration) {
    var assetsFolder = getFolderByName(app.project.rootItem, GAL_TOOLKIT_MAX_STOCK_ASSETS);
    var importedItem = findItemByPath(assetsFolder, url);
    if (!importedItem) {
      app.project.importFiles([url], true, assetsFolder, false);
      importedItem = findItemByPath(assetsFolder, url);
    }
    if (!importedItem) {
      alert('No imported item found');
      return;
    }
    var activeSequence = app.project.activeSequence;
    if (!activeSequence) {
      alert('No active sequence found');
      return;
    }
    var playerPosition = activeSequence.getPlayerPosition();
    var _getFreeTrack = getFreeTrack(activeSequence, playerPosition.seconds, duration),
      videoTrack = _getFreeTrack.videoTrack;
      _getFreeTrack.audioTrack;
    activeSequence.videoTracks[videoTrack].overwriteClip(importedItem, playerPosition.seconds);
  }
};
var importMedia = function importMedia(url, destination, duration) {
  if (destination === 'project') {
    importByDestination.project(url, duration);
  } else {
    importByDestination.timeline(url, duration);
  }
};

var ppro = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  importMedia: importMedia
});

var host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name

var getAppNameSafely = function getAppNameSafely() {
  var compare = function compare(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  var exists = function exists(a) {
    return typeof a !== "undefined";
  };
  var isBridgeTalkWorking = typeof BridgeTalk !== "undefined" && typeof BridgeTalk.appName !== "undefined";
  if (isBridgeTalkWorking) {
    return BridgeTalk.appName;
  } else if (app) {
    
    if (exists(app.name)) {
      
      var name = app.name;
      if (compare(name, "photoshop")) return "photoshop";
      if (compare(name, "illustrator")) return "illustrator";
      if (compare(name, "audition")) return "audition";
      if (compare(name, "bridge")) return "bridge";
      if (compare(name, "indesign")) return "indesign";
    }
    
    if (exists(app.appName)) {
      
      var appName = app.appName;
      if (compare(appName, "after effects")) return "aftereffects";
      if (compare(appName, "animate")) return "animate";
    }
    
    if (exists(app.path)) {
      
      var path = app.path;
      if (compare(path, "premiere")) return "premierepro";
    }
    
    if (exists(app.getEncoderHost) && exists(AMEFrontendEvent)) {
      return "ame";
    }
  }
  return "unknown";
};
switch (getAppNameSafely()) {
  case "aftereffects":
  case "aftereffectsbeta":
    host[ns] = aeft;
    break;
  case "premierepro":
  case "premiereprobeta":
    host[ns] = ppro;
    break;
}
// prettier-ignore

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
//# sourceMappingURL=index.js.map
})(this);