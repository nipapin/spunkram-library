

var folderPathAEObj = {};
var folderPathPRObj = {};
var folderName = "Ex Assets Lib";

var localExFolderDirAE = null;
var localExFolderDirPR = null;
$._AtomExt_externalLibAssetImporter = {

	maskedTransferOnce: function(newValue){
		root_folder_name = newValue;
		root_folder_comment = newValue + ' Composer Assets';
	},
	importToAE: function(typeImportTo, path){
		var targetFile = new File(path); //convert string to File object

	

		localExFolderDirAE = findBinAE(folderName, 'Folder');
		
		if(!localExFolderDirAE){
			localExFolderDirAE = app.project.items.addFolder(folderName);
		}

		app.beginUndoGroup("Atom - Import Lib Asset");

		/* Default import to project only */
		if(typeImportTo == 0){
			var importedProject = app.project.importFile(new ImportOptions(targetFile));
			importedProject.parentFolder = checkFootagePackFolder;
			importedProject.selected = true;
		}

		/* Import to active comp */
		if(typeImportTo == 1){
			var comp = app.project.activeItem;
			if(!(comp) || !(comp instanceof CompItem)){return "COMP";}

			var importedProject = app.project.importFile(new ImportOptions(targetFile));
			importedProject.parentFolder = localExFolderDirAE;
			importedProject.selected = false;
			var curLayer = comp.layers.add(importedProject);
			curLayer.startTime = comp.time;

		}
		app.endUndoGroup();
		//CODE END
	},
	importToPR: function(typeImportTo, path){
		var targetFile = path; //convert string to File object
			var project = app.project;
		var isAudio = false;
		localExFolderDirPR = findBinPR(project.rootItem, folderName);

		if(!localExFolderDirPR){
			localExFolderDirPR = project.rootItem.createBin(folderName);
		}

		if(typeImportTo == 0){
			
			project.importFiles([targetFile], true, localExFolderDirPR, false);
			// checkFootagePackFolder.select();
		}

		/* Import to active comp */
		if(typeImportTo == 1){

			var activeSeq = project.activeSequence;
			if (!activeSeq) {
				return "SEQUENCE";
			}
			project.importFiles([targetFile], true, localExFolderDirPR, false);
			var fileNameWithExtension = path.indexOf('/') != -1 ? path.split(/[\/]/).pop() : path.split(/[\\]/).pop();

			var getImportedItem = getChildrenItems(localExFolderDirPR, fileNameWithExtension, ProjectItemType.CLIP);
	
			if(!getImportedItem){
				return "SEQUENCE";
			}
			var setSequenceTrackType = isAudio ? activeSeq.audioTracks : activeSeq.videoTracks;

	

			var getDurOfFootageInTicks = getImportedItem.getOutPoint().ticks - getImportedItem.getInPoint().ticks;
			// var indexes = getTrackSelectedToApply(activeSeq.videoTracks);
			var indexiesYTrack = $._AtomExt_ppComposer.outside_setPlacesForTracks(0, [1,1], getDurOfFootageInTicks);

			setSequenceTrackType[indexiesYTrack[0]].insertClip(getImportedItem, activeSeq.getPlayerPosition());
			getImportedItem.select();

		}
		
	}
};


function getTrackSelectedToApply(trackObject){
	for (var vti = 0; vti < trackObject.numTracks; vti++) {
		if (trackObject[vti].isTargeted()) {
			return vti;
		}
	}
}

function getChildrenItems(whereFindItem, itemName, itemType) {
	//set rootItem path if not found
	if (!whereFindItem) { whereFindItem = app.project.rootItem; }
	//search children inside root
	for (var j = 0; j < whereFindItem.children.numItems; j++) {
		var curItem = whereFindItem.children[j];
		
		if (curItem.type == itemType && curItem.name == itemName) {
			return curItem;
			
		} else {
			if (curItem.type === ProjectItemType.BIN) {
				getChildrenItems(curItem, itemName, itemType);
			}
		}
	}
}

function findBinPR(parentBin, binName) {
	var findedBin = null;
	for (var i = 0; i < parentBin.children.numItems; i++) {
		if (parentBin.children[i].name == binName) {
			findedBin = parentBin.children[i];
		}
	}
	return findedBin;
}


function findBinAE(itemName, itemTypeName, parentFolder, findType, arg){
	for (var i = app.project.numItems; i >= 1; i--){
		var thisItem = app.project.item(i);
		var findCompTemp = thisItem.name;

		//root folder
		if(findType == "ID"){
			findCompTemp = thisItem.id;
		}

		if(findCompTemp == itemName){

			switch(itemTypeName){
				case "Composition":
					if(!(thisItem instanceof CompItem)){continue;}
					break;
				case "Folder":
					if(!(thisItem instanceof FolderItem)){continue;}
					break;
				case "Footage":
					if(!(thisItem instanceof FootageItem)){continue;}
					break;
			}

			var continueAddLayerChecks = false;
			if(parentFolder){
				if(thisItem.parentFolder.name == parentFolder){
					continueAddLayerChecks = true;
				}
			}else{
				continueAddLayerChecks = true;
			}

			if(arg){
				if(thisItem.parentFolder.comment == arg){
					return continueAddLayerChecks ? thisItem : false;
				}
			}else{
				return continueAddLayerChecks ? thisItem : false;
			}
		}
	}
}




function applyAutoSizeForFootage(comp, compObject, curLayer){
	var getItemOriginSizes = [compObject.width, compObject.height];
	var w = comp.width;
	var h = comp.height;
	var divideNumberW = getItemOriginSizes[0] / w;
	var divideNumberH = getItemOriginSizes[1] / h;
	var aspect = getItemOriginSizes[0]/getItemOriginSizes[1];

	var gfinalWidth = 100 / divideNumberW;
	var gfinalHeight = 100 / divideNumberH;
	if(w / h >= aspect){
		curLayer.transform.scale.setValue([gfinalWidth, gfinalWidth]);
	}else{
		curLayer.transform.scale.setValue([gfinalHeight, gfinalHeight]);
	}
}

function doAutoSizeFootageInAE(packInsideOptions, argumentsPack){
	if(packInsideOptions.auto_size_footage || argumentsPack.change_auto_size_footage){

		//if exists change this param - AS MAIN
		if(argumentsPack.change_auto_size_footage){
			if(argumentsPack.change_auto_size_footage != "NONE"){
				return argumentsPack.change_auto_size_footage;
			}
		}else{
			//if no - use global as MAIN
			if(packInsideOptions.auto_size_footage != "NONE"){
				return packInsideOptions.auto_size_footage;
			}
		}
	}
	return false;
}



