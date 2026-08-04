/**
|--------------------------------------------------------------------------
| @name AtomX (Atom Extension)
| @author aniom
| @site https://aniom.net
| Main engine (first run) as JSX file to transfer data/control linking with JS-JSX and Application
|
*/

$._AtomExt_engine = {
	//Evaluate a file and catch the exception.
	evalFile: function (path) {
		try {
			// alert(path);
			$.evalFile(path);
		} catch (e) {
			alert("Exception:" + e);
		}
	},
	// Evaluate all the files in the given folder
	evalFiles: function (jsxFolderPath) {
		var folder = new Folder(jsxFolderPath);
		if (folder.exists) {
			var jsxFiles = folder.getFiles("*.jsx");
			for (var i = 0; i < jsxFiles.length; i++) {
				var jsxFile = jsxFiles[i];
				$._AtomExt_engine.evalFile(jsxFile);
			}
		}
	}
};

/**
 * @example
	'packObject'		: currentTempPackagePrefab.pack,
	'packInsideOptions'	: currentTempPackageInsideOptionsSets,
	'shortAppID'		: getCurSoftShortID(init_sets['appID']),
	'packFileDir'		: fsmodule.fileDirectory(currentTempPackagePrefab.pack.path)
 */
var _appTransferSets = {};

/**
 * Transfer data from JS when init ext
 * @example 
	'initSAppID'	: getCurSoftShortID(),
	'softAppData'	: softAssetsByAppID
 */
var _globalTransferInit = {};

var tempInstallationOldPack_HeaderBytes;

//#region RECURSIVE COPY PACK DATA (SYNC HERE, ASYNC IF USE VIA csInterface)
function copyPackageToAppData(transfer) {
	try {
		var source_pack_path = transfer["source"]["pack"];
		var target_pack_path = transfer["target"]["pack"];

		var source_assets_path = transfer["source"]["assets"];
		var target_assets_path = transfer["target"]["assets"];

		var source_templates_path = transfer["source"]["templates"];
		var target_templates_path = transfer["target"]["templates"];

		if (new File(source_pack_path).copy(new File(target_pack_path))) {
			//copy assets files (Panel preview items)
			copyFolder(new Folder(source_assets_path), new Folder(target_assets_path));
			copyFolder(new Folder(source_templates_path), new Folder(target_templates_path));

			return target_pack_path;
		} else {
			return false;
		}
	} catch (e) {
		return false;
	}
}

/**
 * Copy folder with files (get files from sourceFolder and copy to destination)
 * @param {Folder} sourceFolder [Folder obj] Copy folder with files FROM
 * @param {Folder} destinationFolder [Folder obj] Will copied TO
 * @return {false} Nothing return
 */
function copyFolder(sourceFolder, destinationFolder) {
	var sourceChildrenArr = sourceFolder.getFiles();
	for (var i = 0; i < sourceChildrenArr.length; i++) {
		var sourceChild = sourceChildrenArr[i];
		var destinationChildStr = destinationFolder.fsName + "/" + sourceChild.name;

		if (sourceChild instanceof File) {
			copyFile(sourceChild, new File(destinationChildStr));
		} else {
			copyFolder(sourceChild, new Folder(destinationChildStr));
		}
	}
}

/**
 * Copy one file (from - to)
 * @param {File} sourceFile File obj source
 * @param {File} destinationFile Copy sourceFile to this path and name
 */
function copyFile(sourceFile, destinationFile) {
	createFolder(destinationFile.parent);
	sourceFile.copy(destinationFile);
}

/**
 * Create folder in file system
 * @param {object} folder Folder obj (path JSX)
 */
function createFolder(folder) {
	if (folder.parent !== null && !folder.parent.exists) {
		createFolder(folder.parent);
	}
	folder.create();
}

/**
 * Create image header for JSXBIN old packs
 * @param {string} path
 */
function createImageHeaderFromBytes(path) {
	//if set create img bytes and temp bytes for old package by path
	if (path && tempInstallationOldPack_HeaderBytes) {
		var file = new File(path);
		file.encoding = "BINARY";
		if (file.open("w")) {
			file.write(tempInstallationOldPack_HeaderBytes);
			file.close();
			tempInstallationOldPack_HeaderBytes = null; //reset header bytes
			return true;
		}
	}
}

//#endregion

//#region GENERAL EXE

/**
 * Send new name of vars inside app Composers (if this extension with special tariff was stylized)
 * @param {string} newAppName
 */
function maskedTransferApp(newAppName) {
	// alert(newAppName);
	$._AtomExt_aeComposer.maskedTransferOnce(newAppName);
	$._AtomExt_ppComposer.maskedTransferOnce(newAppName);
}

/**
 * Connect with JS part - init when ext ready and loaded
 * Get vars from JS to use in future for Adobe's application handler
 * @param {*} sentTransferInit
 */
function initEngineJSX(sentTransferInit) {
	//save init data to local jsx var
	_globalTransferInit = sentTransferInit;

	//rewrite app vars (folders to new name and etc...)
	if (sentTransferInit["maskedIVE"]) {
		maskedTransferApp(sentTransferInit["maskedIVE"]["name"]);
	}

	//return old packages (from old Atom JSXBIN, if exists)
	return recoveryOlderPackages();
}

/**
 * Get JSON data from JS to set in global var and use for providing to Adobe apps
 * @param {*} globalObject
 */
function transferExeSwitchTrigger(globalObject) {
	_appTransferSets = globalObject;
}

function transferExeEngineSwitchTrigger(changeToEngineType) {
	if (changeToEngineType && _appTransferSets["packObject"]["engine"]) {
		_appTransferSets["packObject"]["engine"] = changeToEngineType;
	}
}

/**
 * Delete all files in folder
 * @param {string} pack_path Get as JSON stringify
 * @returns
 */
function deleteExtensionChildFolder(pack_path) {
	var folderToDelete = new Folder(pack_path);
	if (!folderToDelete.exists) {
		return false;
	}
	if (deleteFilesInsideFolder(folderToDelete) && deleteEmptyFoldersInsideFolder(folderToDelete)) {
		return "DELETED";
	}
	return false;
}

function deletePackageFiles(pack_path) {
	var folderToDelete = new Folder(new File(pack_path).parent);

	//if files deleted inside folders
	if (deleteFilesInsideFolder(folderToDelete)) {
		//delete empty folders
		if (deleteEmptyFoldersInsideFolder(folderToDelete)) {
			return "DELETED";
		}
	}
	return false;
}

function deleteFilesInsideFolder(sourceFolder) {
	if (!sourceFolder || !sourceFolder.exists) {
		return false;
	}
	var sourceChildrenArr = sourceFolder.getFiles();
	if (sourceChildrenArr.length > 0) {
		for (var i = 0; i < sourceChildrenArr.length; i++) {
			var sourceChild = sourceChildrenArr[i];

			if (sourceChild instanceof File) {
				if (!sourceChild.remove()) {
					return false;
				}
			} else {
				if (!deleteFilesInsideFolder(sourceChild)) {
					return false;
				}
			}
		}
	}
	return true;
}

function deleteEmptyFoldersInsideFolder(sourceFolder) {
	if (!sourceFolder || !sourceFolder.exists) {
		return false;
	}
	var sourceChildrenArr = sourceFolder.getFiles();
	if (sourceChildrenArr.length > 0) {
		for (var i = 0; i < sourceChildrenArr.length; i++) {
			var sourceChild = sourceChildrenArr[i];

			if (sourceChild instanceof Folder) {
				if (!deleteEmptyFoldersInsideFolder(sourceChild)) {
					return false;
				}
			}
		}
	}
	//remove main folder
	return sourceFolder.remove();
}

/**
 * Initialize old package when before AtomX 3.0 (encrypted via JSXBIN, js objective structure)
 * @version 2.0 coz can't return full settings (on CC17) with image bytes via JSON - need return by pieces, create images here from bytes and moved in JS side
 * @param {*} pack_path
 */
function runPackageJSXBIN(pack_path) {
	//Core based on JSXBIN encrypted
	try {
		$._AtomExt_engine.evalFile(pack_path);
		//default init - call to inside temp memory $._pack
		var init_package = $._pack.init_package("H9Jx*15xlIsJs%$Kmm2XppO198sYH%%41");
		if (init_package) {
			var package_settings = $._pack.package_settings();
			var package_structure = $._pack.package_structure();

			var fullRestructSettings = {
				//group for details - like MAIN (so equal in new and old packs)
				main: {
					name: package_settings.name,
					version: package_settings.version,
					required_app_version: package_settings.required_app_version,
					engine_pack: package_settings.engine_pack,
					inside_security: package_settings.inside_security,
					required_purchase_code: package_settings.required_purchase_code,
					cc_author_username: package_settings.cc_author_username
				},
				//without changes
				inside_option_sets: package_settings.inside_option_sets,
				//if exists stylization - refract (delete bytes, stay only hex color as object)
				stylization: package_settings.stylization ? { header_color_hex: package_settings.stylization.header_color_hex } : ""
			};

			var headerBytesReplacer = "";
			//if exists header bytes - add to temp header bytes to create image in processing of installation coz can't create in JS for old packages
			if (package_settings.stylization && package_settings.stylization.header_image_bytes) {
				tempInstallationOldPack_HeaderBytes = package_settings.stylization.header_image_bytes;
				headerBytesReplacer = "REPLACED_INTO_JSX";
			}

			return JSON.stringify({
				method: "EVAL",
				full_content: "",
				settings: fullRestructSettings,
				structure: package_structure,
				header_bytes: headerBytesReplacer,
				pack_hash: "" //DO NOT USE HASH FROM OLD PACK, COZ CAN BE WRONG WITH NEW SYSTEM  def: package_settings.pack_stamp
			});
		} else {
			return "CANT_INIT";
		}
	} catch (ex) {
		alert(ex);
	}
}

//#endregion

//#region TRANSFER APP PROVIDER

function importExAssetLibItem(paramsJson) {
	// var getCurPackName = _appTransferSets["packObject"]["name"];
	// var getCurPackAppID = _appTransferSets["packObject"]["appID"];
	var appID_checked = _globalTransferInit["initSAppID"];
	switch (appID_checked) {
		//After Effects
		case "AE":
			return $._AtomExt_externalLibAssetImporter.importToAE(paramsJson["importAs"], paramsJson["path"]);
			break;
		case "PR":
			return $._AtomExt_externalLibAssetImporter.importToPR(paramsJson["importAs"], paramsJson["path"]);
			break;
		default:
			return "NO_SUPPORT_APP";
	}
}


/**
 * Main apply item from JS to JSX Application transfer
 * @param {*} action Action type
 * @param {*} itemId Item ID
 * @param {*} itemName Item name
 * @param {*} instanceGroup instance group like: Typography-Kinetic-Basic (categories via divider -)
 * @param {*} getArguments All item arguments
 * @param {*} extraArguments Extra Arguments for current item
 */
function applyItem(action, itemId, itemName, instanceGroup, getArguments, extraArguments, disableLockTracks) {
	var getCurPackEngine = _appTransferSets["packObject"]["engine"];
	var getCurPackName = _appTransferSets["packObject"]["name"];
	var getCurPackAppID = _appTransferSets["packObject"]["appID"];

	var appID_checked = _appTransferSets["shortAppID"];

	//if not for this application
	if (appID_checked != getCurPackAppID) {
		return "NO_SUPPORT_APP";
	}

	var engineByAppID = _globalTransferInit["softAppData"][appID_checked]["engine"];
	var folderByAppID = _globalTransferInit["softAppData"][appID_checked]["folder"];

	switch (appID_checked) {
		//After Effects
		case "AE":
			//_TEST_PRESETS - AE
			if (getCurPackEngine == engineByAppID[0] || getArguments["change_engine"] == engineByAppID[0]) {
				var animation_type = extraArguments["preset_type"] || "";
				var mix_mode = extraArguments["mix_mode"] ? true : false;
				var pack_presets;

				try {
					pack_presets = $._pack.package_get_text_presets();
				} catch (ex) {
					return "REQUIRE_UPDATES"; //need write new system for other text presets types in future
				}

				return $._AtomExt_aeTextPresets.applyAndReplacePreset(animation_type, itemId, pack_presets[itemId], mix_mode);
			}

			//_COMPOSER - AE
			if (getCurPackEngine == engineByAppID[1]) {
				//send to JSX AppHandler and return to JS
				return $._AtomExt_aeComposer.applyComp(
					itemId,
					itemName,
					instanceGroup,
					getArguments,
					extraArguments,
					getFolderWithTemplateItemsJSX(folderByAppID),
					getCurPackName,
					_appTransferSets["packInsideOptions"]
				);
			}
			//_NEURO_PHOTO_ANIMATOR - AE
			if (getCurPackEngine == engineByAppID[2]) {
				//send to JSX AppHandler and return to JS
				return $._AtomExt_aeComposer.addPhotoAnimatorComp(
					action,
					getArguments,
					extraArguments,
					getFolderWithTemplateItemsJSX(folderByAppID),
					getCurPackName,
					_appTransferSets["packInsideOptions"]
				);
			}
			//_TEXT_ANIMATOR - AE
			if (getCurPackEngine == engineByAppID[3]) {
				//send to JSX AppHandler and return to JS
				return $._AtomExt_aeComposer.addTextAnimatorComp(
					action,
					getArguments,
					extraArguments,
					getFolderWithTemplateItemsJSX(folderByAppID),
					getCurPackName,
					_appTransferSets["packInsideOptions"]
				);
			}

			//_PRESET_MANAGER - AE
			if (getCurPackEngine == engineByAppID[4] || getCurPackEngine == engineByAppID[5]) {
				//send to JSX AppHandler and return to JS
				return $._AtomExt_aePresetManager.applyPreset(
					action,
					itemId,
					instanceGroup,
					getArguments,
					extraArguments,
					getFolderWithTemplateItemsJSX(folderByAppID),
					getCurPackName,
					_appTransferSets["packInsideOptions"]
				);
			}

			break;
		//Premiere Pro
		case "PR":
			//_COMPOSER - PR
			if (getCurPackEngine == engineByAppID[0]) {
				if (action == "DRAGGING") {
					//send to JSX AppHandler and return to JS
					return $._AtomExt_ppComposer.dragAndDropApply(
						itemId,
						itemName,
						instanceGroup,
						getArguments,
						extraArguments,
						getFolderWithTemplateItemsJSX(folderByAppID),
						getCurPackName,
						_appTransferSets["packInsideOptions"],
						disableLockTracks
					);
				}

				if (action == "DBLCLICK") {
					return $._AtomExt_ppComposer.doubleClickApply(
						itemId,
						itemName,
						instanceGroup,
						getArguments,
						extraArguments,
						getFolderWithTemplateItemsJSX(folderByAppID),
						getCurPackName,
						_appTransferSets["packInsideOptions"],
						disableLockTracks
					);
				}
			}
			break;
		//Illustator
		case "AI":
			break;
		//Photoshop (both PHSP/PHXS)
		case "PS":
			break;
	}
}

/**
 * Main customizing handler for items
 * @param {*} type _GET / _SET ("get" when clicked to customizer, "set" when save changed from customizer)
 * @param {*} inputContent Input data fro _SET type
 */
function customizeHandler(type, inputContent) {
	var getCurPackEngine = _appTransferSets["packObject"]["engine"];
	var getCurPackName = _appTransferSets["packObject"]["name"];
	var getCurPackAppID = _appTransferSets["packObject"]["appID"];

	var appID_checked = _appTransferSets["shortAppID"];

	//if not for this application
	if (appID_checked != getCurPackAppID) {
		return "NO_SUPPORT_APP";
	}

	var engineByAppID = _globalTransferInit["softAppData"][appID_checked]["engine"];
	var folderByAppID = _globalTransferInit["softAppData"][appID_checked]["folder"];

	switch (appID_checked) {
		//After Effects
		case "AE":
			/* GET DATA AND GEN IN HTML CUSTOMIZER */
			if (type == "_GET") {
				//_TEST_PRESETS - AE
				if (getCurPackEngine == engineByAppID[0]) {
					var callGetTextPresets = $._AtomExt_aeTextPresets.getPreset();
					if (typeof callGetTextPresets != "string") {
						return JSON.stringify(callGetTextPresets);
					} else {
						return callGetTextPresets;
					}
				}

				//_COMPOSER - AE / or _TEXT_ANIMATOR - AE
				if (getCurPackEngine == engineByAppID[1] || getCurPackEngine == engineByAppID[3]) {
					//send to JSX AppHandler and return to JS
					var callComposer = $._AtomExt_aeComposer.customizer(
						_appTransferSets["packInsideOptions"],
						false,
						getCurPackEngine == engineByAppID[3] ? true : false
					);
					if (typeof callComposer != "string") {
						return JSON.stringify(callComposer);
					} else {
						return callComposer;
					}
				}

				//_PRESET_MANAGER - AE
				if (getCurPackEngine == engineByAppID[4] || getCurPackEngine == engineByAppID[5]) {
					var callComposer = $._AtomExt_aePresetManager.customizer(_appTransferSets["packInsideOptions"], inputContent);
					if (typeof callComposer != "string") {
						return JSON.stringify(callComposer);
					} else {
						return callComposer;
					}
				}
			}

			/* UPDATE DATA FROM CUSTOMIZER */
			if (type == "_SET") {
				//_TEST_PRESETS - AE
				if (getCurPackEngine == engineByAppID[0]) {
					if (inputContent) {
						var inputType = inputContent["type"];
						var inputVal = inputContent["value"];
						var inputArg = inputContent["arg"];

						if (inputType == "remove") {
							var remove_preset = $._AtomExt_aeTextPresets.removePreset(inputVal, inputArg);
							return remove_preset;
						}
					}
				}

				//_COMPOSER - AE / or _TEXT_ANIMATOR - AE
				if (getCurPackEngine == engineByAppID[1] || getCurPackEngine == engineByAppID[3]) {
					if (inputContent) {
						var inputType = inputContent["type"];
						var inputVal = inputContent["value"];
						var inputArg = inputContent["arg"];
						var inputComp = inputContent["comp"];
						var inputPseudoProp = inputContent["valueIndex"];
						//Change Effect Property values
						if (inputType == "open_customizer") {
							return $._AtomExt_aeComposer.editCustomizer("OPENNING", inputComp, inputVal, inputArg, inputPseudoProp);
						}
						if (inputType == "edit_customizer") {
							return $._AtomExt_aeComposer.editCustomizer("EDITING", inputComp, inputVal, inputArg, inputPseudoProp);
						}
						//Edit text
						if (inputType == "update_text") {
							return $._AtomExt_aeComposer.editTextLayer(true, inputComp, inputArg, inputVal);
						}
						if (inputType == "edit_text_in_viewer") {
							return $._AtomExt_aeComposer.editTextLayer(false, inputComp, inputArg, inputVal);
						}
						if (inputType == "open_placeholder") {
							return $._AtomExt_aeComposer.openPlaceholder(inputComp);
						}
						//Toolbar - Composer Buttons
						if (inputType == "button_action") {
							return $._AtomExt_aeComposer.buttons(inputVal);
						}
					}
				}

				//_NEURO_PHOTO_ANIMATOR - AE
				if (getCurPackEngine == engineByAppID[2]) {
					return $._AtomExt_aeComposer.buttons(inputVal);
				}

				//_PRESET_MANAGER - AE
				if (getCurPackEngine == engineByAppID[4] || getCurPackEngine == engineByAppID[5]) {
					var typeAs = inputContent.type;

					$._AtomExt_aePresetManager.setupPrefs(getFolderWithTemplateItemsJSX(folderByAppID));

					if (typeAs == "check_event_layers") {
						return $._AtomExt_aePresetManager.previousSelectedLayersInvoke();
					}

					// return 0;
					if (typeAs == "edit_customizer") {
						return $._AtomExt_aeComposer.externalSetCustomizeItem(
							"EDITING",
							inputContent["comp"],
							inputContent["value"],
							inputContent["arg"],
							inputContent["valueIndex"]
						);
					}

					if (typeAs == "control_preview") {
						return $._AtomExt_aePresetManager.controlPreview(inputContent.value, inputContent.arg, inputContent.comp, inputContent.valueIndex);
					}
					if (typeAs == "control_preview_one") {
						return $._AtomExt_aePresetManager.controlPreviewOneItem(inputContent.value, inputContent.arg, inputContent.comp, inputContent.valueIndex);
					}
					if (typeAs == "button_action") {
						return $._AtomExt_aePresetManager.buttons(inputContent.value, inputContent.arg);
					}
					if (typeAs == "anchor_point_tool") {
						return $._AtomExt_aePresetManager.anchorPointTool(inputContent.value);
					}
				}
			}
			break;
		//Premiere Pro
		case "PR":
			/* GET DATA AND GEN IN HTML CUSTOMIZER */
			if (type == "_GET") {
				//_COMPOSER - PR
				if (getCurPackEngine == engineByAppID[0]) {
					//send to JSX AppHandler and return to JS
					var callComposer = $._AtomExt_ppComposer.customizer(_appTransferSets["packInsideOptions"]);

					if (typeof callComposer != "string") {
						return JSON.stringify(callComposer);
					} else {
						return callComposer; //if errors
					}
				}
			}

			/* UPDATE DATA FROM CUSTOMIZER */
			if (type == "_SET") {
				//_COMPOSER - PR
				if (getCurPackEngine == engineByAppID[0]) {
					if (inputContent) {
						var inputType = inputContent["type"];
						var inputVal = inputContent["value"];
						var inputArg = inputContent["arg"];
						var inputComp = inputContent["comp"];
						var inputValIndex = inputContent["valueIndex"];
						//send to JSX AppHandler to apply changes in extension

						if (inputType == "button_action") {
							//Toolbar - Composer Buttons
							return $._AtomExt_ppComposer.buttonActions(inputVal);
						} else {
							var callComposer = $._AtomExt_ppComposer.setCustomizeChanges(inputType, inputVal, inputArg, inputComp, inputValIndex);
							return callComposer ? callComposer : "NOT_FOUND_ITEM";
						}
					}
				}
			}
			break;
		//Illustator
		case "AI":
			break;
		//Photoshop (both PHSP/PHXS)
		case "PS":
			break;
	}
}

/**
 * Action after applying Premiere Pro project via injection
 */
function afterPPRO() {
	return $._AtomExt_ppComposer.moveFilesToFolder();
}

function devPanelEngineCallerPremierePro(numAction) {
	return $._AtomExt_ppComposer.devActions(numAction);
}

//#endregion

//#region HELPER PROVIDER FUNCTIONS

/**
 * Get folder with templates items by templates folder name for any applications
 * @param {string} templatesFolderName Like Atom After Effects/Atom Premiere Pro and etc... (get from object @var softAssetsByAppID)
 */
function getFolderWithTemplateItemsJSX(templatesFolderName) {
	//get Assets folder in pack directory
	var folder_path = new Folder(_appTransferSets["packFileDir"] + "/" + templatesFolderName + "/");
	if (folder_path.exists) {
		return folder_path.fsName;
	}
}

//#endregion

//#region RECOVERY OLD VERSION PACKAGES

/**
 * Recovery older package from AE Memory (and only when run in AE)
 * Set packages inside new Atom preferences
 * After save JSON prefs, and clear AE Memory settings with this data
 */
function recoveryOlderPackages() {
	try {
		/* Local settings storage from OLD ATOM */
		var settingsSection = "AtomExtensionSection";

		var settingsKey_installedPacks = "installedPackages";
		var settingsKey_favorites = "favoritesGlobal";
		var settingsKey_currentLoadPack = "currentLoadPackage";

		var split_sets = ["#", "*", "|"];

		//start this only if run in After Effects
		if (_globalTransferInit["initSAppID"] == "AE") {
			//get all installed package and parse in cycle
			var getInstalledPackageFAMEM = rop_getAppSetting(settingsSection, settingsKey_installedPacks);
			//if packages exists
			if (getInstalledPackageFAMEM) {
				//get current load package
				var getCurLoadPackFAMEM = rop_getAppSetting(settingsSection, settingsKey_currentLoadPack) || "";

				//get and parse all favorites (will added for each founded old package)
				var createNewFavoriteString = "";
				var getFavoritesFAMEM = rop_getAppSetting(settingsSection, settingsKey_favorites);
				if (getFavoritesFAMEM) {
					for (var k = 0; getFavoritesFAMEM.split(split_sets[2])[k]; k++) {
						var current_fav_item = getFavoritesFAMEM.split(split_sets[2])[k];
						createNewFavoriteString += current_fav_item + ":";
					}
				}

				//unload all packs before adding new
				//handlerPackagePrefs('unloadAllPacks');
				var packArrPrefs = []; //localPreferences['packages'];
				//cycle by old packages to add as new
				for (var i = 0; getInstalledPackageFAMEM.split(split_sets[1])[i]; i++) {
					var current_pack_info = getInstalledPackageFAMEM.split(split_sets[1])[i];

					var name_c = current_pack_info.split(split_sets[0])[0];
					var version_c = current_pack_info.split(split_sets[0])[1];
					var path_c = current_pack_info.split(split_sets[0])[2];
					var engine_c = current_pack_info.split(split_sets[0])[3];
					var author_c = current_pack_info.split(split_sets[0])[4];

					//if this pack not included in JSON packages than add
					packArrPrefs.push([name_c, author_c, version_c, new File(path_c).fsName, engine_c]);
				}

				//remove AE Memory data (to do not use after extension refresh)
				rop_clearAppSetting(settingsSection, settingsKey_installedPacks); //remove packages
				rop_clearAppSetting(settingsSection, settingsKey_favorites); //remove favorites
				rop_clearAppSetting(settingsSection, settingsKey_currentLoadPack); //remove current load package

				return JSON.stringify({
					oldPackArr: packArrPrefs,
					oldLoadPack: getCurLoadPackFAMEM,
					oldPackAllFavs: createNewFavoriteString
				});
			}
		}
	} catch (e) {
		alert("recoveryOlderPackages:" + e.toString());
	}
}

/**
 * Recovery Older Package - get app settings @func recoveryOlderPackages
 * @param {*} section
 * @param {*} key
 */
function rop_getAppSetting(section, key) {
	if (app.settings.haveSetting(section, key)) {
		return app.settings.getSetting(section, key);
	} else {
		return false;
	}
}

/**
 * Recovery Older Package - clear app settings @func recoveryOlderPackages
 * @param {*} section
 * @param {*} key
 */
function rop_clearAppSetting(section, key) {
	app.settings.saveSetting(section, key, ""); //set nothing as delete
}

//#endregion

//#region DEV TOOLS

function trick(obj) {
	var str = "";

	str += "PROPERTIES:";
	for (var p in obj) {
		str += "\r";
		if (typeof obj[p] === "object") {
			str += "\t" + p;
			//find in object (function)
			for (var func in obj[p]) {
				str += "--" + func;
			}
		} else {
			str += p;
		}
	}

	str += "\r\r@@@@@@@@@@@@@@@@@@@@@@@@\rMETHODS:";
	var m = obj.reflect.methods;
	for (var i = 0; i < m.length; i++) {
		str += "\r";
		str += m[i] + "()";
	}
	return str;
}

//#endregion
