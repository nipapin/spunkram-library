/**
 * AE composer — port of legacy `ae_composer.jsx` (phase 7).
 * @ts-nocheck — ExtendScript parity; split into submodules later if needed.
 */
import { arabicEngine } from "./aeft-text-arabic";

var commentFoundData = ["ATOM_CUSTOMIZER_LAYER", "ATOM_TEXT_EDITOR_LAYER", "ATOM_TIMING_CONTROL_LAYER", "ATOM_PLACEHOLDER_LAYER", "ATOM_EXTERNAL_NULL", "ATOM_CUSTOMIZER_COMMENT_MAIN", "ATOM_CUSTOMIZER_COMMENT_TEXT"];

var markerCuePoint = "ATOM_EXTENSION_BY_ANIOM";

var root_folder_name = "Motionflow";
var root_folder_comment = "Motionflow Composer Assets";

var count_duplicate_name = 1;
var repeat_duplicate_name = "";


var exprReplaceMark = '__REPLACE__';

var expressionTR_IN_OUT = 'try{if ((thisLayer.marker.numKeys > 1 ) && (numKeys >= 2)){kValOne = key(1).value;kValTwo = key(2).value;aStart = kValTwo-kValOne;if (time < thisLayer.marker.key(2).time){linear(time, thisLayer.inPoint, thisLayer.marker.key(1).time, kValOne, aStart)}else{linear(time,thisLayer.marker.key(2).time,thisLayer.outPoint,kValTwo, key(3).value);}}else{value;}}catch(ex){value;}';

var expressionTR_IN_OUT_REVERSE = 'try{if ((thisLayer.marker.numKeys > 1 ) && (numKeys >= 2)){kValOne = key(1).value;kValTwo = key(2).value;aStart = kValTwo-kValOne;if (time < thisLayer.marker.key(2).time){linear(time, thisLayer.inPoint, thisLayer.marker.key(1).time, kValOne, aStart)}else{linear(time,thisLayer.marker.key(2).time,thisLayer.outPoint,kValTwo, kValOne);}}else{value;}}catch(ex){value;}';

var expressionTR_DURATION = 'try{start_key = key(1).value;end_key = key(2).value;linear(time, inPoint, outPoint, start_key, end_key);}catch(ex){value;}';

/* New more corrected expression for in continue (in past was problem when change layer on timeline) */
var expressionTR_IN_CONTINUE = 'try {if ((thisLayer.marker.numKeys > 0)) {kValOne = key(1).value; kValTwo = key(2).value; kValThree = key(3).value; aStart = kValTwo - kValOne; aEnd = kValThree - kValTwo;if (time > thisLayer.marker.key(1).time) {linear(time, thisLayer.marker.key(1).time, key(3).time, kValTwo, aEnd)} else {linear(time, thisLayer.inPoint, thisLayer.marker.key(1).time, kValOne, aStart) } } else {value; }} catch (ex) {value; }';//'try {if ((thisLayer.marker.numKeys > 0)) {kValOne = key(1).value; kValTwo = key(2).value; aStart = kValTwo - kValOne; if (time > thisLayer.marker.key(1).time) {linear(time, thisLayer.marker.key(1).time, outPoint, aStart, outPoint) } else {linear(time, thisLayer.inPoint, thisLayer.marker.key(1).time, kValOne, aStart) } } else {value; } } catch (ex) {value; }';

var expressionTR_LOOP_AA = 'try{duration = thisLayer.source.duration;out = ( time - key(1).time ) * __REPLACE__ % duration;if ( out >= duration - 0.0001 ){out = 0;}[ out ] }catch(ex){value;}';

var expressionTR_IN_CONTINUE_LOOP_AA = 'try {if (thisLayer.marker.numKeys > 0) {duration = thisLayer.source.duration; out = (time - key(1).time) / thisLayer.marker.key(1).time % duration; if (out >= duration - 0.0001) { out = 0; } [out]} else { value; }} catch (ex) { value; }';

var expressionTR_IN_CONTINUE_LOOP_AA_FULL_LENGTH = 'try {if (thisLayer.marker.numKeys > 0) {duration = thisLayer.source.duration; out = (time * key(2).time) / thisLayer.marker.key(1).time % duration; if (out >= duration - 0.0001) { out = 0; } [out]} else { value; }} catch (ex) { value; }';

var expressionTR_CYCLE_PINGPONG = 'try{loopOut("pingpong");}catch(e){value;}';


var expressionTR_CYCLE_OUT = 'try{loopOut();}catch(e){value;}';

var expressionTR_OFFSET_DURATION = 'try{mTime = marker.key(1).time;kOneTime = key(1).time;kSecTime = key(2).time;a = mTime - inPoint;b = outPoint - mTime;aK = kSecTime - kOneTime;bK = key(numKeys).time - kSecTime;aD = a / aK;bD = b / bK;if (time < mTime) {valueAtTime(kOneTime + (time - inPoint) / aD);}else {valueAtTime(kSecTime + (time - kSecTime) / bD);}}catch(e){value;}';

const aeComposer = {

	maskedTransferOnce: function (newValue) {
		root_folder_name = newValue;
		root_folder_comment = newValue + ' Composer Assets';
	},

	/* Engine Neuro_photo_animator */
	addPhotoAnimatorComp: function (action, args_object, extraArguments, aePath, packageName, pack_options) {
		return addCompNeuroPhotoAnimator(action, args_object, extraArguments, aePath, packageName, pack_options);
	},

	/* Engine Text_Animator */
	addTextAnimatorComp: function (action, args_object, extraArguments, aePath, packageName, pack_options) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }
		if (action == 'APPLY') {
			return addCompTextAnimator(comp, action, args_object, extraArguments, aePath, packageName, pack_options);
		} else {/* RANDOMIZE action */
			return addCompTextAnimatorForRandomizer(comp, args_object, extraArguments, packageName, pack_options);
		}

	},

	applyComp: function (itemId, itemName, itemGroup, args_object, extraArguments, aePath, packageName, pack_options) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }

		//CODE BEGIN
		return folderManager(comp, itemId, itemName, itemGroup, args_object, extraArguments, aePath, packageName, pack_options);
		//CODE END
	},
	customizer: function (customizer_option, input_data, enable_inside_controllers) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }


		//if customizer not found in user comp
		var inCurrentComp = customizerComposer(customizer_option, comp, input_data);
		if (!inCurrentComp) {
			var layer = comp.selectedLayers[0];
			if (!layer) { return "LAYER"; }

			var compLayer = layer.source;
			if (compLayer instanceof CompItem) {


				//if selected layer is comp
				var inAVLayerComp = customizerComposer(customizer_option, compLayer, input_data);
				if (!inAVLayerComp) {
					return "NO_CUSTOMIZER";
				} else {
					return inAVLayerComp;
				}

			} else {
				return "COMP_LAYER";
			}

		} else {
			/* Possible open customizer for inside compositions too (if selected layer is CompItem inside main composition) */
			var layer = comp.selectedLayers[0];
			if (enable_inside_controllers && (layer && layer.source instanceof CompItem)) {
				//if selected layer is comp
				var inAVLayerComp = customizerComposer(customizer_option, layer.source, input_data);
				if (inAVLayerComp) {
					return inAVLayerComp;
				} else {
					return inCurrentComp;
				}
			} else {
				return inCurrentComp;
			}
		}
	},
	editCustomizer: function (method, comp_info, value, fx_number, pseudo_fx_number) {

		app.beginUndoGroup("Atom - Customizer");
		//CODE BEGIN

		var comp = findInItems(comp_info, 'Composition', false, "ID");
		if (comp) {
			var getLayer = checkLayersInComp(comp, "COMMENT", commentFoundData[0]);
			if (getLayer) {

				if (method == "OPENNING") {
					if (value == "ONLY_OPEN") {
						//simple open customizer in openViewer
						checkLayersInComp(comp, "DESELECT_LAYERS");
						getLayer.selected = true;
					} else {
						checkLayersInComp(comp, "DESELECT_LAYERS");
						getLayer.Effects(Number(value)).selected = true;
					}

					comp.openInViewer();
				}

				if (method == "EDITING") {
					//If has - pseudo effect prop number to edit
					if (pseudo_fx_number) {
						getLayer.Effects(Number(fx_number)).property(Number(pseudo_fx_number)).setValue(value);
					} else {
						//Default effect - just edit first prop of the effect
						getLayer.Effects(Number(fx_number)).property(1).setValue(value);
					}
				}

			} else {
				return "NOT_FOUND_LAYER";
			}
		} else {
			return "NOT_FOUND_COMP";
		}

		//CODE END
		app.endUndoGroup();

	},
	openPlaceholder: function (comp_id) {
		var comp = findInItems(comp_id, 'Composition', false, "ID");

		if (comp) {
			//OPEN IN VIEWER
			comp.openInViewer();
		} else {
			return "NOT_FOUND_COMP";
		}
	},

	externalCustomizer: function (getLayer, compLayer, insideOptions, oneFxNumber) {
		return customizeSelectedLayer(getLayer, compLayer, insideOptions, oneFxNumber);
	},

	externalSetCustomizeItem: function (method, comp_info, value, fx_number, pseudo_fx_number) {
		app.beginUndoGroup("Atom - Customizer");
		//CODE BEGIN
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }
		var layer = comp.selectedLayers[0];
		if (!layer) { return "LAYER"; }


		if (method == "OPENNING") {
			if (value == "ONLY_OPEN") {
				//simple open customizer in openViewer
				checkLayersInComp(comp, "DESELECT_LAYERS");
				layer.selected = true;
			} else {
				checkLayersInComp(comp, "DESELECT_LAYERS");
				layer.Effects(Number(value)).selected = true;
			}

			comp.openInViewer();
		}

		if (method == "EDITING") {
			//If has - pseudo effect prop number to edit
			if (pseudo_fx_number) {
				layer.Effects(Number(comp_info)).property(Number(pseudo_fx_number)).setValue(value);
			} else {
				//Default effect - just edit first prop of the effect
				layer.Effects(Number(comp_info)).property(1).setValue(value);
			}
		}

		//CODE END
		app.endUndoGroup();
	},

	editTextLayer: function (apply_it, comp_id, layer_id, new_text) {

		app.beginUndoGroup("Atom - Edit Text Layers");
		//CODE BEGIN

		var comp = findInItems(comp_id, 'Composition', false, "ID");

		if (comp) {
			var getLayer = comp.layers[layer_id];

			if (getLayer && getLayer.comment == commentFoundData[1]) {

				if (apply_it == true) {
					//APPLY
					//getLayer.property("Text").sourceText

					var myTextDocument = new TextDocument(new_text);
					getLayer.property("Source Text").setValue(myTextDocument);

				} else {
					//OPEN IN VIEWER
					checkLayersInComp(comp, "DESELECT_LAYERS");
					getLayer.selected = true;
					comp.openInViewer();
				}

			} else {
				return "NOT_FOUND_LAYER";
			}
		} else {
			return "NOT_FOUND_COMP";
		}

		//CODE END
		app.endUndoGroup();
	},
	buttons: function (type) {

		var section = "TIMING"
		if (type == "remove_unused" || type == "remove_unused_selection" || type == "resize_items" || type == "fix_arabic_lang") {
			section = "DEFAULT";
		}

		//CODE BEGIN

		if (section == "TIMING") {
			app.beginUndoGroup("Atom - Adjust Time-Remapping");


			var comp = app.project.activeItem;
			if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }

			//if not selected layers
			if (comp.selectedLayers.length == 0) { return "LAYER"; }

			for (var i = 0; i < comp.selectedLayers.length; i++) {
				var layer = comp.selectedLayers[i];

				//disable time-remap before start
				if (layer.canSetTimeRemapEnabled == true) {
					layer.timeRemapEnabled = false;
				} else {
					return "CANNOT_SET_TIME_REMAPPING";
				}

				switch (type) {
					case 'time_remap_simple':
						setTimeRemapping(layer, 'TIME_REMAP_LAYER_DURATION');
						break;
					// case 'time_remap_in_out_double':
					// 	if(!setTimeRemapping(layer, 'TIME_REMAP_IN_OUT')){
					// 		return "NO_MARKER_DATA";
					// 	}
					// 	break;
					case 'time_remap_in_out_reverse':
						if (!setTimeRemapping(layer, 'TIME_REMAP_IN_OUT_REVERSE')) {
							return "NO_MARKER_DATA";
						}
						break;
					case 'reverse_timing':
						setTimeRemapping(layer, 'TIME_REVERSE');
						break;
					case 'time_remap_loop_aa':
						if (!setTimeRemapping(layer, 'TIME_REMAP_LOOP_AA')) {
							return "NO_MARKER_DATA";
						}
						// setTimeRemapping(layer, 'TIME_REMAP_LOOP_AA');
						break;
				}
			}



			app.endUndoGroup();
		}

		if (section == "DEFAULT") {

			switch (type) {
				case 'remove_unused':
					app.beginUndoGroup("Atom - Removing Unused [Spunkram]");
					var removeTotals = removeUnused();
					app.endUndoGroup();
					if (removeTotals > 0) {
						return "REMOVED_UNUSED_OK|" + removeTotals;
					} else {
						return "REMOVED_UNUSED_NO";
					}
					break;
				case 'remove_unused_selection':
					if (app.project.selection.length > 0) {
						app.beginUndoGroup("Atom - Removing Unused [Global]");
						var removeTotals = removeUnusedGlobal();
						app.endUndoGroup();
						if (removeTotals > 0) {
							return "REMOVED_UNUSED_OK|" + removeTotals;
						} else {
							return "REMOVED_UNUSED_NO";
						}
					} else {
						return "ITEM_SELECTION";
					}

					break;
				case 'resize_items':
					app.beginUndoGroup("Atom - Resize Items");
					var comp = app.project.activeItem;
					if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }

					//if not selected layers
					if (comp.selectedLayers.length == 0) { return "LAYER"; }



					for (var i = 0; i < comp.selectedLayers.length; i++) {
						var layer = comp.selectedLayers[i];

						//layer source as Composition
						if (layer.source instanceof CompItem) {
							var layerSource = layer.source;
							//set to source comp W/H from current comp
							layerSource.width = comp.width;
							layerSource.height = comp.height;
						} else if (layer instanceof AVLayer) {
							//change size for Footages
							applyAutoSizeForFootage(comp, layer.source, layer);
						}
					}
					app.endUndoGroup();
					break;
				case 'fix_arabic_lang':
					app.beginUndoGroup("Atom - Fix to Arabic Glyphs");
					var comp = app.project.activeItem;
					if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }

					//if not selected layers
					if ((comp.selectedLayers.length == 0) || !(comp.selectedLayers[0] instanceof TextLayer)) { return "TEXT_LAYER"; }

					//load Additional Libs with scripts and functions
					var getAdditionalArabicCore = arabicEngine;

					for (var i = 0; i < comp.selectedLayers.length; i++) {
						var layer = comp.selectedLayers[i];
						if (layer instanceof TextLayer) {
							var getTextVal = layer.property("ADBE Text Properties").property("ADBE Text Document").value.toString();
							var convertIt = getAdditionalArabicCore.convertText(getTextVal);
							convertIt = getAdditionalArabicCore.multiLine(convertIt);
							layer.property("ADBE Text Properties").property("ADBE Text Document").setValue(convertIt);
						}
					}

					app.endUndoGroup();
					break;
			}
		}

		//CODE END
	}
};


var globalRemoveUnusedTotals = 0;
function removeUnused() {

	globalRemoveUnusedTotals = 0; //reset
	for (var comp_i = app.project.numItems; comp_i >= 1; comp_i--) {

		var thisItem = app.project.item(comp_i);

		//find Atom folder
		if ((thisItem.name == root_folder_name) && (thisItem.comment == root_folder_comment) && (thisItem instanceof FolderItem)) {
			loopRemoveProjectItems(thisItem);
		}
	}

	return globalRemoveUnusedTotals;

}

function removeUnusedGlobal() {

	globalRemoveUnusedTotals = 0; //reset
	for (var comp_i = app.project.selection.length - 1; comp_i >= 0; comp_i--) {

		var thisItem = app.project.selection[comp_i];

		//find Atom folder
		if ((thisItem instanceof FolderItem)) {
			loopRemoveProjectItems(thisItem);
		} else {
			if (thisItem.usedIn.length == 0) {
				globalRemoveUnusedTotals++;
				thisItem.remove();
			}
		}
	}

	return globalRemoveUnusedTotals;

}

function loopRemoveProjectItems(structureCompStart) {
	for (var comp_i = structureCompStart.numItems; comp_i >= 1; comp_i--) {

		var thisItem = structureCompStart.item(comp_i);

		//if folder
		if (thisItem instanceof FolderItem) {
			//if folder with items - loop again
			if (thisItem.numItems > 0) {
				loopRemoveProjectItems(thisItem);
			}

		} else {
			//if unused item - remove
			if (thisItem.usedIn.length == 0) {
				globalRemoveUnusedTotals++;
				thisItem.remove();
			}
		}
	}
}

/**
 * @updated 15.04.21 - Customizer takes pseudo effects
 * @param {*} customizer_option 
 * @param {*} compLayer 
 * @param {*} input_data 
 * @returns 
 */
function customizerComposer(customizer_option, compLayer, input_data) {

	var type = customizer_option.customizer_action;
	var text_editor = customizer_option.customizer_text_editor;
	var control_range = customizer_option.customizer_control_range || {};

	//if exist customizer layer with comment - ATOM_CUSTOMIZER_LAYER
	var getLayer = checkLayersInComp(compLayer, "COMMENT", commentFoundData[0]);

	if (getLayer) {
		switch (type) {
			case "SIMPLE":

				checkLayersInComp(compLayer, "DESELECT_LAYERS");
				getLayer.selected = true;
				compLayer.openInViewer();
				return true;
				break;
			case "EDITOR":

				var currentEffectsOnLayer = getLayer.Effects;
				var compDataInto = compLayer.id; //comp id

				if (currentEffectsOnLayer.numProperties == 0) { return "NO_CONTROLS"; }

				var objectJSON_customizer = new Object();
				// alert(currentEffectsOnLayer(1).matchName);
				// return 0;
				//customizer effects
				for (var fx = 1; fx <= currentEffectsOnLayer.numProperties; fx++) {
					var hereEffect = currentEffectsOnLayer(fx);

					var set_type = false, set_values = false;

					/* Check Pseudo Effect */
					if (hereEffect.matchName.indexOf('Pseudo') != -1) {

						try {
							var parsePseudoProps = loopByPseudoEffectProperties(hereEffect);
							objectJSON_customizer[hereEffect.name.toString()] = ['pseudo', parsePseudoProps];
						} catch (error) {
							alert(error);
						}

					} else {
						/* Default Expression Controls */
						switch (hereEffect.matchName) {
							case "ADBE Slider Control":
								set_type = 'Slider';
								break;
							case "ADBE Checkbox Control":
								set_type = 'Checkbox';
								break;
							case "ADBE Point3D Control":
								set_type = 'Point3D';
								break;
							case "ADBE Point Control":
								set_type = 'Point';
								break;
							case "ADBE Color Control":
								set_type = 'Color';
								break;
							case "ADBE Angle Control":
								set_type = 'Angle';
								break;
						}

						if (set_type && set_type != 'None') {
							if (hereEffect.property(1).propertyValueType !== PropertyValueType.NO_VALUE) {
								set_values = hereEffect.property(1).value.toString()
							}
						} else {
							set_type = 'None';
						}

						objectJSON_customizer[hereEffect.name.toString()] = ['default', {
							'type': set_type,
							'data': set_values
						}];
					}
				}

				var customizerShowCommentAboutControls = [false, false];
				//NEW OPTION rev 68+ - comment for customizer panel (param comment from marker), SHOW in main customizer
				var getCustomizerMainComment = checkLayersInComp(compLayer, "COMMENT", commentFoundData[5]);
				var getCustomizerTextHolderComment = checkLayersInComp(compLayer, "COMMENT", commentFoundData[6]);
				if (getCustomizerMainComment) { customizerShowCommentAboutControls[0] = getMarkerComment(getCustomizerMainComment); }
				if (getCustomizerTextHolderComment) { customizerShowCommentAboutControls[1] = getMarkerComment(getCustomizerTextHolderComment); }

				if (text_editor) {
					var objectJSONTextAndPlaceholde = findPreMakeLayersLoop(compLayer, new Object(), new Object());
					var objectCheckedJSON_text = checkObjectExists(objectJSONTextAndPlaceholde[0]);
					var objectCheckedJSON_placeholders = checkObjectExists(objectJSONTextAndPlaceholde[1]);

					return [compDataInto, objectJSON_customizer, control_range, objectCheckedJSON_text, objectCheckedJSON_placeholders, customizerShowCommentAboutControls];
				} else {

					return [compDataInto, objectJSON_customizer, control_range, false, false, customizerShowCommentAboutControls];
				}

				//return [compDataInto, objectJSON_customizer, objectJSON_text]; //obj with fx data (compdata, effects, texts)

				break;
		}
	}
}



function customizeSelectedLayer(getLayer, compLayer, customizer_option, oneFxNumber) {
	var type = customizer_option.customizer_action;
	var text_editor = customizer_option.customizer_text_editor;
	var control_range = customizer_option.customizer_control_range || {};
	var control_hides = customizer_option.customizer_control_hide || {};

	var currentEffectsOnLayer = getLayer.Effects;
	var compDataInto = oneFxNumber; //comp id

	if (currentEffectsOnLayer.numProperties == 0) { return "NO_CONTROLS"; }

	var objectJSON_customizer = new Object();


	if (oneFxNumber) {

		var hereEffect = currentEffectsOnLayer(Number(oneFxNumber));

		var set_type = false, set_values = false;

		/* Check Pseudo Effect */
		if (hereEffect.matchName.indexOf('Pseudo') != -1) {

			try {
				var parsePseudoProps = loopByPseudoEffectProperties(hereEffect, control_hides);
				objectJSON_customizer[hereEffect.name.toString()] = ['pseudo', parsePseudoProps];
			} catch (error) {
				alert(error);
			}

		} else {
			/* Default Expression Controls */
			switch (hereEffect.matchName) {
				case "ADBE Slider Control":
					set_type = 'Slider';
					break;
				case "ADBE Checkbox Control":
					set_type = 'Checkbox';
					break;
				case "ADBE Point3D Control":
					set_type = 'Point3D';
					break;
				case "ADBE Point Control":
					set_type = 'Point';
					break;
				case "ADBE Color Control":
					set_type = 'Color';
					break;
				case "ADBE Angle Control":
					set_type = 'Angle';
					break;
			}

			if (set_type && set_type != 'None') {
				if (hereEffect.property(1).propertyValueType !== PropertyValueType.NO_VALUE) {
					set_values = hereEffect.property(1).value.toString()
				}
			} else {
				set_type = 'None';
			}

			objectJSON_customizer[hereEffect.name.toString()] = ['default', {
				'type': set_type,
				'data': set_values
			}];
		}
	} else {

		for (var fx = 1; fx <= currentEffectsOnLayer.numProperties; fx++) {

			var hereEffect = currentEffectsOnLayer(fx);

			var set_type = false, set_values = false;

			/* Check Pseudo Effect */
			if (hereEffect.matchName.indexOf('Pseudo') != -1) {

				try {
					var parsePseudoProps = loopByPseudoEffectProperties(hereEffect);
					objectJSON_customizer[hereEffect.name.toString()] = ['pseudo', parsePseudoProps];
				} catch (error) {
					alert(error);
				}

			} else {
				/* Default Expression Controls */
				switch (hereEffect.matchName) {
					case "ADBE Slider Control":
						set_type = 'Slider';
						break;
					case "ADBE Checkbox Control":
						set_type = 'Checkbox';
						break;
					case "ADBE Point3D Control":
						set_type = 'Point3D';
						break;
					case "ADBE Point Control":
						set_type = 'Point';
						break;
					case "ADBE Color Control":
						set_type = 'Color';
						break;
					case "ADBE Angle Control":
						set_type = 'Angle';
						break;
				}

				if (set_type && set_type != 'None') {
					if (hereEffect.property(1).propertyValueType !== PropertyValueType.NO_VALUE) {
						set_values = hereEffect.property(1).value.toString()
					}
				} else {
					set_type = 'None';
				}

				objectJSON_customizer[hereEffect.name.toString()] = ['default', {
					'type': set_type,
					'data': set_values
				}];
			}
		}
	}


	if (text_editor) {
		var objectJSONTextAndPlaceholde = findPreMakeLayersLoop(compLayer, new Object(), new Object());
		var objectCheckedJSON_text = checkObjectExists(objectJSONTextAndPlaceholde[0]);
		var objectCheckedJSON_placeholders = checkObjectExists(objectJSONTextAndPlaceholde[1]);

		return [compDataInto, objectJSON_customizer, control_range, objectCheckedJSON_text, objectCheckedJSON_placeholders];
	} else {
		return [compDataInto, objectJSON_customizer, control_range, false, false];
	}

	//return [compDataInto, objectJSON_customizer, objectJSON_text]; //obj with fx data (compdata, effects, texts)

}

/**
 * Parse pseudo effects
 * @param {object} currentEffect Pseudo effect with properties
 * @param {array} objectOfProps 
 */
function loopByPseudoEffectProperties(currentEffect, controlHides) {

	var pseudoObjectProperties = {};

	//loop by all properties of the effect
	for (var prop = 1; prop <= currentEffect.numProperties; prop++) {
		var set_type = false, set_values = false, has_min_max = false;
		var curProp = currentEffect.property(prop);

		/* Skip if need */
		if (controlHides && controlHides[curProp.name]) {
			continue;
		}

		/* Check prop group/prop default type */
		if (curProp.propertyType === PropertyType.PROPERTY) {
			switch (curProp.propertyValueType) {

				case PropertyValueType.OneD:
					if (curProp.hasMin && curProp.hasMax) {
						if (curProp.minValue == 0 && curProp.maxValue == 1) {
							set_type = 'Checkbox';
						} else {
							set_type = 'Slider';
						}
					} else {
						set_type = 'Angle';
					}
					break;
				case PropertyValueType.ThreeD_SPATIAL:
					set_type = 'Point3D';
					break;
				case PropertyValueType.TwoD_SPATIAL:
					set_type = 'Point';
					break;
				case PropertyValueType.COLOR:
					set_type = 'Color';
					break;
				case PropertyValueType.NO_VALUE:
				case PropertyValueType.CUSTOM_VALUE:
					set_type = 'None';
					break;
			}

			//add in object
			if (set_type && set_type != 'None') {
				set_values = curProp.value.toString();
			} else {
				set_type = 'None';
			}
			//Has min/max values to set in customizer
			if (curProp.hasMin && curProp.hasMax) {
				if (set_type != 'Color' && set_type != 'None') {
					has_min_max = [curProp.minValue, curProp.maxValue];
				}

			}

			pseudoObjectProperties[curProp.name.toString()] = {
				'type': set_type,
				'data': set_values,
				'prop_number': prop,
				'custom_ranges': has_min_max
			};
		}
	}
	return pseudoObjectProperties;
}


function checkObjectExists(object) {
	var return_data = false;
	for (var k in object) { return_data = true; }

	return return_data ? object : false;
}


// function findPlaceholderLayersLoop(currentComp, instanceObj_send){
// 	var arr_text_layers = [];

// 	for(var lx = 1; lx <= currentComp.layers.length; lx++){
// 		var curLayer = currentComp.layers[lx];

// 		if(curLayer.source instanceof CompItem && curLayer.comment == commentFoundData[3]){

// 			var getLayerDocumentText = curLayer.property("Source Text").value.toString();
// 			arr_text_layers[arr_text_layers.length] = [getLayerDocumentText, lx, currentComp.id];
// 			instanceObj_send[currentComp.name.toString()] = arr_text_layers;

// 		}else if(curLayer.source instanceof CompItem  && curLayer.comment != commentFoundData[3]){
// 			findPlaceholderLayersLoop(curLayer.source, instanceObj_send);
// 		}
// 	}

// 	return instanceObj_send;
// }

function findPreMakeLayersLoop(currentComp, instanceText_send, instancePlaceholder_send) {
	var arr_text_layers = [];

	for (var lx = 1; lx <= currentComp.layers.length; lx++) {
		var curLayer = currentComp.layers[lx];

		/* Find Text layers by comment */
		if (curLayer instanceof TextLayer && curLayer.comment == commentFoundData[1]) {

			var getLayerDocumentText = curLayer.property("Source Text").value.toString();
			arr_text_layers[arr_text_layers.length] = [getLayerDocumentText, lx, currentComp.id];
			instanceText_send[currentComp.name.toString()] = arr_text_layers;

		} else if (curLayer.source instanceof CompItem && curLayer.comment == commentFoundData[3]) {
			instancePlaceholder_send[curLayer.source.name.toString()] = curLayer.source.id;

		} else if (curLayer.source instanceof CompItem && curLayer.comment == '') {
			findPreMakeLayersLoop(curLayer.source, instanceText_send, instancePlaceholder_send);
		}
	}

	return [instanceText_send, instancePlaceholder_send];
}
/* Protector templates via FFX Presets - by request -sparta- */
function findBindProtectedLayers(currentComp, options, aeTemplateFolder) {

	for (var lx = 1; lx <= currentComp.layers.length; lx++) {
		var curLayer = currentComp.layers[lx];

		if (curLayer.comment && options.layer_bindes[curLayer.comment]) {
			curLayer.selected = true;
			curLayer.applyPreset(new File(aeTemplateFolder + '/' + options.protect_ffx_files_folder + '/' + options.layer_bindes[curLayer.comment]));
			curLayer.selected = false;
			curLayer.comment = '';
		} else if (curLayer.source instanceof CompItem) {
			findBindProtectedLayers(curLayer.source, options, aeTemplateFolder);
		}
	}
}

// function findTextLayersLoop(currentComp, instanceObj_send){
// 	var arr_text_layers = [];

// 	for(var lx = 1; lx <= currentComp.layers.length; lx++){
// 		var curLayer = currentComp.layers[lx];

// 		if(curLayer instanceof TextLayer && curLayer.comment == commentFoundData[1]){

// 			// if(curLayer.comment == commentFoundData[1]){//if exists comment
// 				var getLayerDocumentText = curLayer.property("Source Text").value.toString();
// 				arr_text_layers[arr_text_layers.length] = [getLayerDocumentText, lx, currentComp.id];
// 				instanceObj_send[currentComp.name.toString()] = arr_text_layers;
// 			// }


// 		}else if(curLayer.source instanceof CompItem){
// 			findTextLayersLoop(curLayer.source, instanceObj_send);
// 		}
// 	}

// 	return instanceObj_send;
// }

function checkLayersInComp(comp_obj, type, value) {

	var returnFoundedObj = '';
	if (comp_obj instanceof CompItem && comp_obj.layers.length > 0) {
		for (var lx = comp_obj.layers.length; lx >= 1; lx--) {
			var curLayerSel = comp_obj.layers[lx];

			switch (type) {
				case "COMMENT":
					if (curLayerSel.comment == value) { returnFoundedObj = curLayerSel; }
					break;
				case "NAME":
					if (curLayerSel.name == value) { returnFoundedObj = curLayerSel; }
					break;
				/*			case "ID":
								if(curLayerSel.name == value){returnFoundedObj = curLayerSel;}
								break;*/
				case "DESELECT_LAYERS":
					curLayerSel.selected = false;
					break;
			}
		}
	}

	return returnFoundedObj;
}

/**
 * 
 * @param {*} str 
 * @param {*} term 
 * @param {*} replacement 
 * @fixes 13.06.2020 - Problem if exists same name for comp when used thisComp.
 * @fixes 06.10.2020 - added more checks coz fixes above deprecated and wrong worked
 */
function replaceAllPointString_RegExp(str, term, replacement) {
	if (str.indexOf('thisComp.') != -1) {
		return '//CONVERTED VIA Spunkram: thisComp()\n' + str;
	} else if (str.indexOf('comp(') != -1) {
		return '//CONVERTED VIA Spunkram: comp()\n' + str.replace(new RegExp(term, 'gm'), replacement);
	} else {
		return '//CONVERTED VIA Spunkram: [no changes]\n' + str;
	}
}
function throwTweakExpression(message, stack) {
	this.message = message;
	this.name = 'ExprError';
	this.stack = stack;
}


/**
 * 
 * @param {*} propParent 
 * @param {*} oldExpression_compName 
 * @param {*} newExpression_compName 
 * @fixes 13.06.2020 - added in check: propParent.canSetEnabled for parent property
 * @fixes 06.10.2020 - problem with fix above ( && propParent.canSetEnabled) - was deleted - but in replaceAllPointString_RegExp() added more checks
 * @fixes 13.07.2023 - Layer Styles errors (idk why) - added check enabled for propParent
 */
function tweakExprsForProps(propParent, oldExpression_compName, newExpression_compName) {
	try {

		if (propParent !== null) {

			var prop, exprState, indexGroupName;

			for (var i = 1; i <= propParent.numProperties; i++) {
				prop = propParent.property(i);
				//added check: prop.canSetEnabled

				if ((prop.propertyType === PropertyType.PROPERTY) && (prop.expression !== "") && prop.canSetExpression) {
					// if (prop.expressionEnabled){
					// 	// countExp++;
					// }
					if (!propParent.enabled) {
						continue;
					}

					exprState = prop.expressionEnabled; // Keep track of expression enabled state, because updating expression will enable it

					// indexGroupName= prop.expression;

					prop.expression = replaceAllPointString_RegExp(prop.expression, oldExpression_compName, newExpression_compName);


					prop.expressionEnabled = exprState;					// Restore state


				} else if ((prop.propertyType === PropertyType.INDEXED_GROUP) || (prop.propertyType === PropertyType.NAMED_GROUP)) {

					tweakExprsForProps(prop, oldExpression_compName, newExpression_compName);
				}
			}
		}
	} catch (e) {
		// alert(e.toString(), propParent.propertyGroup().name);
		// alert(e.toString(), propParent.propertyGroup().propertyGroup().name);
		// alert(prop.propertyType === PropertyType.PROPERTY);
		alert({
			'Layer Name': propParent.propertyGroup().propertyGroup().source.name,
			'Group Name': propParent.propertyGroup().name,
			'Property Parent Name': propParent.name,
			'Index': propParent.propertyGroup().propertyGroup().index
		}.toSource());
		// throw new throwTweakExpression(e.message, {
		// 	'Layer Name': propParent.propertyGroup().propertyGroup().name,
		// 	'Group Name':  propParent.propertyGroup().name,
		// 	'Property Parent Name': propParent.name,
		// })

		/* 
		Layer: TexT 15 Warp
		group Layer Styles
		property name: color overlay
		index layer: 3

		Layer: Text 15 Stroke Warp
		group Layer Layer Styles
		property name: Stroke
		index layer: 6

		
		
		*/
	}
}


function replaceExpressionsLoop(propParent, findExpressionRegExp, replaceExpression) {
	try {

		if (propParent !== null) {

			var prop, exprState, indexGroupName;

			for (var i = 1; i <= propParent.numProperties; i++) {
				prop = propParent.property(i);
				//added check: prop.canSetEnabled

				if ((prop.propertyType === PropertyType.PROPERTY) && (prop.expression !== "") && prop.canSetExpression) {
					if (!propParent.enabled) {
						continue;
					}

					exprState = prop.expressionEnabled; // Keep track of expression enabled state, because updating expression will enable it

					// indexGroupName= prop.expression;

					// prop.expression = prop.expression.replace(regExp ? new RegExp(findExpression, 'gm') : findExpression, replaceExpression)

					prop.expression = prop.expression.replace(findExpressionRegExp, replaceExpression);


					prop.expressionEnabled = exprState;					// Restore state


				} else if ((prop.propertyType === PropertyType.INDEXED_GROUP) || (prop.propertyType === PropertyType.NAMED_GROUP)) {

					replaceExpressionsLoop(prop, findExpressionRegExp, replaceExpression);
				}
			}
		}
	} catch (e) {
		alert({
			'Layer Name': propParent.propertyGroup().propertyGroup().source.name,
			'Group Name': propParent.propertyGroup().name,
			'Property Parent Name': propParent.name,
			'Index': propParent.propertyGroup().propertyGroup().index
		}.toSource());
	}
}


/*
 * @fixes: 19.07.2019 - resolved trouble with multi-duplicates (sourceReplaceCompChildren) for GrussGott pack (same name comp into comp with same name and etc)
 *
 */

function duplicateChildrenCompositions(currentComp, targetFolder, originalFolder, arrMemory, oldCompData, preparedSceneSets_Childrens, endFixMark) {

	try {
		for (var lx = 1; lx <= currentComp.layers.length; lx++) {
			var curLayer = currentComp.layers[lx];


			//only compositions inside comp
			if (curLayer.source instanceof CompItem) {//layer source comp

				var copySourceCurLayer = curLayer.source.name;

				if (arrMemory[copySourceCurLayer]) {
					//this layer comp AVLayer founded
					//alert('current Comp ID: '+currentComp.id+'current Comp name: '+currentComp.name+'\ncopySourceCurLayer: '+copySourceCurLayer+'\narrMemory Name: '+arrMemory[copySourceCurLayer].name+'\narrMemory ID: '+arrMemory[copySourceCurLayer].id+'\ncurLayer Source ID: '+ curLayer.source.id+'\ncurLayer Source Name: '+ curLayer.source.name + '\n\ncurLayer Source ParentFolder: '+ curLayer.source.parentFolder.name+'\narrMemory ParentFolder: '+ arrMemory[copySourceCurLayer].parentFolder.name);
					if (arrMemory[copySourceCurLayer].id != curLayer.source.id && arrMemory[copySourceCurLayer].parentFolder.name != curLayer.source.parentFolder.name) {
						//if ID not equals
						sourceReplaceCompChildren(arrMemory[copySourceCurLayer], curLayer.source, copySourceCurLayer);
					} else {
						//if ID equals
						sourceReplaceCompChildren(currentComp, arrMemory[copySourceCurLayer], copySourceCurLayer);
					}
					//sourceReplaceCompChildren(currentComp, arrMemory[copySourceCurLayer], copySourceCurLayer);

				} else {
					//Create duplicate for comp AVLayer (not found in object)
					//Save in object[name] after
					var dup_this = curLayer.source.duplicate();
					dup_this.name = endFixMark ? copySourceCurLayer + endFixMark : copySourceCurLayer;
					dup_this.comment = "DUP-" + count_duplicate_name;

					//folders for comp
					if (targetFolder) { dup_this.parentFolder = targetFolder; }
					if (originalFolder) { curLayer.source.parentFolder = originalFolder; }

					//resize comp only for main
					if (preparedSceneSets_Childrens["AUTO_SIZE"]["ALL_COMPS"]) {
						var getFromThisASCT = preparedSceneSets_Childrens["AUTO_SIZE"]["ALL_COMPS"];
						dup_this.width = getFromThisASCT[0];
						dup_this.height = getFromThisASCT[1];
					}

					//change FPS to comps
					if (preparedSceneSets_Childrens["AUTO_FPS"]["ALL_COMPS"]) {
						var getFromThisASCT = preparedSceneSets_Childrens["AUTO_FPS"]["ALL_COMPS"];
						dup_this.frameDuration = getFromThisASCT;
					}

					//sourceReplaceCompChildren(currentComp, dup_this, copySourceCurLayer, oldCompData);
					sourceReplaceCompChildren(currentComp, dup_this, copySourceCurLayer);

					arrMemory[copySourceCurLayer] = dup_this;
					//cycle again inside deep comps
					duplicateChildrenCompositions(dup_this, targetFolder, originalFolder, arrMemory, oldCompData, preparedSceneSets_Childrens, endFixMark);
				}
			}

			// var layerEnabled = curLayer.enabled;
			// if(layerEnabled){curLayer.enabled = false;}//disable
			//replace exp for all layers
			tweakExprsForProps(curLayer, oldCompData[0], oldCompData[1]);
			// if(layerEnabled){curLayer.enabled = true;}//restore enabled status
		}
	} catch (error) {
		// if(error.name == 'ExprError'){

		// }
		// alert('Error: \nName:'
		// +error['name']
		// +'\nMessage: '+error['message']
		// +'\nCause: '+error['cause']
		// );
		alert(error.message, error.name);

	}
}

function sourceReplaceCompChildren(currentComp, directComp, matchLayerName) {
	for (var tli = 1; tli <= currentComp.numLayers; tli++) {
		var thisChildCompLayerInside = currentComp.layer(tli);

		if ((thisChildCompLayerInside.source instanceof CompItem) && (thisChildCompLayerInside.source.name == matchLayerName)) {
			thisChildCompLayerInside.replaceSource(directComp, true);
		}
	}
}

/**
 * OLD (NOT USED)
 * @param {*} instance_groups_string 
 * @param {*} args_object 
 * @returns 
 */
function getTemplatePathForAE(instance_groups_string, args_object) {
	/* NEW SYSTEM TO TEMPLATE PATH (FROM Spunkram 3.0) */
	var template_ae_path = '', lastGroupName = '';
	var tempArrProps = [];
	for (var i = 0; instance_groups_string.toString().split('-')[i]; i++) {
		var pathPartX = instance_groups_string.toString().split('-')[i];
		tempArrProps.push(pathPartX);
	}

	lastGroupName = tempArrProps[tempArrProps.length - 1];
	if (args_object.aep_file_name) {
		tempArrProps.pop(); //remove last arr item to set aep_file_name
		template_ae_path += tempArrProps.length >= 1 ? tempArrProps.join('/') + '/' + args_object.aep_file_name : args_object.aep_file_name;
	} else {
		template_ae_path += tempArrProps.join('/');
	}
	/* END SYSTEM TO GET PATH */

	return [template_ae_path, lastGroupName];
}


function folderManager(comp, itemId, itemName, itemGroup, args_object, extraArguments, aePath, packageName, pack_options) {

	var checkItemFileObj = "";

	var getCustomArguments = args_object.custom_args || {}; //get custom args || empty obj

	//pack arguments from item - if custom name/ or default name
	var labelColorNum = args_object.label_color_num ? Number(args_object.label_color_num) : 2;
	var itemIName = getCustomArguments.comp_name || itemName;
	var needParentFolder = args_object.parent_folder || false;
	var changeAutoSizeComp_custom = args_object.change_auto_size_composition;
	var changeDuplicateOrigin_custom = args_object.change_duplicate_origin_setting;
	var changeStartTimelinePointer = args_object.change_use_start_timeline_pointer;
	var changeLayerIndexPosition = args_object.change_layer_index_position;
	var isAudio = args_object.is_audio;
	var isFootage = args_object.is_footage;
	var isPresets = args_object.is_presets;
	var isIndividualComp = args_object.individual_comp;


	//New - filepath now is generic from JS part

	//split "/" instance groups to get full path to template

	var lastGroupName = extraArguments.last_group;
	var targetFile = new File(extraArguments.filepath); //convert string to File object

	//if audio - check target file audio
	var simplePassToImport = false;

	if (isAudio || isFootage) {
		//for footage files (audio/video/images and etc...)
		checkItemFileObj = "Footage";
		simplePassToImport = true;
	} else {
		//for compositions
		checkItemFileObj = "Composition";
		simplePassToImport = false;
	}

	try {

		//layer settings
		var custom_layer_fx = getCustomArguments.layer_fx || false;
		var custom_layer_sets = getCustomArguments.layer_sets || false;
		var custom_layer_timing = getCustomArguments.layer_timing || false;
		var custom_layer_precomp = getCustomArguments.layer_precomp || false;
		var custom_layer_blendmode = getCustomArguments.layer_blendmode || false;
		var custom_layer_null_external = getCustomArguments.layer_null_external || false;
		var custom_layer_relink_comp_marker = getCustomArguments.layer_relink_comp_marker || false;
		var custom_layer_marker = getCustomArguments.layer_marker || false;

		//if file exist - go next
		if (targetFile.exists) {


			if (isPresets) {
				var layer = comp.selectedLayers[0];
				if (!layer) { return "LAYER"; }


				//layer marker
				if (custom_layer_marker) {
					addCustomMarkers(layer, custom_layer_marker);
				}

				layer.applyPreset(targetFile);

			} else {

				var checkGlobalAtomFolder = findInItems(root_folder_name, 'Folder');
				var checkPickComposition = findInItems(itemIName, checkItemFileObj, needParentFolder, '', itemGroup);

				var compObject = checkPickComposition;


				//not found Atom Folder - create it
				if (!checkGlobalAtomFolder || !checkPickComposition) {

					if (!checkPickComposition) {
						var checkPackageFolder = findInItems(packageName, 'Folder', root_folder_name);

						//Global Folder
						if (!checkGlobalAtomFolder) {
							checkGlobalAtomFolder = app.project.items.addFolder(root_folder_name);
							checkGlobalAtomFolder.comment = root_folder_comment;
						}

						//Package Folder
						if (!checkPackageFolder) {
							checkPackageFolder = app.project.items.addFolder(packageName);
							checkPackageFolder.parentFolder = checkGlobalAtomFolder;
						}

						//Import Template
						var importedProject = app.project.importFile(new ImportOptions(targetFile));

						//for footages items
						if (simplePassToImport) {
							var footageFolderName = lastGroupName;
							if (isAudio) { footageFolderName = 'SFX_' + lastGroupName; }
							if (isFootage) { footageFolderName = 'FTG_' + lastGroupName; }

							var checkFootagePackFolder = findInItems(footageFolderName, 'Folder', packageName);

							if (!checkFootagePackFolder) {
								checkFootagePackFolder = app.project.items.addFolder(footageFolderName);
								checkFootagePackFolder.parentFolder = checkPackageFolder;
								checkFootagePackFolder.comment = itemGroup;
							}

							importedProject.parentFolder = checkFootagePackFolder;
							importedProject.name = itemIName;
						} else {
							//for compositions (imported template with folder - name of template)
							//Move to parent folder
							importedProject.parentFolder = checkPackageFolder;
							importedProject.name = lastGroupName;

							//added comment to check with same names and folder
							importedProject.comment = itemGroup;


						}
						compObject = findInItems(itemIName, checkItemFileObj, needParentFolder, '', itemGroup);
					}
				}

				//fixes to reset folder cache (trick for ae problems)
				checkGlobalAtomFolder.selected = true;

				if (compObject) {
					if (comp && comp.layers) {
						app.beginUndoGroup("Atom - Applying The Item");


						var oldSelectedLayerObjectIndexies = comp.selectedLayers.length > 0 ? comp.selectedLayers[comp.selectedLayers.length - 1] : false;



						if (custom_layer_precomp) {
							var layer = comp.selectedLayers[0];
							if (!layer) { return "LAYER"; }
						}

						//simple import without duplicates and etc... footages type files (none compositions)
						if (simplePassToImport == true) {

							//add imported footage as AVLayer to activeItem
							var curLayer = comp.layers.add(compObject);
							curLayer.label = labelColorNum;

							//auto size for footages (video/images)
							if (isFootage) {
								var autoSizeFootageAc = doAutoSizeFootageInAE(pack_options, args_object);
								if (autoSizeFootageAc == "ALL_ITEMS") {
									applyAutoSizeForFootage(comp, compObject, curLayer);
								}
							}

							//layer blendmode
							if (custom_layer_blendmode) {
								changeBlendMode(curLayer, custom_layer_blendmode);
							}

							//layer marker
							if (custom_layer_marker) {
								addCustomMarkers(curLayer, custom_layer_marker);
							}

							//layer timing
							var startLayerTiming = "";
							if (custom_layer_timing) { startLayerTiming = setTimeRemapping(curLayer, custom_layer_timing); }

							//layer start time line
							timeLinePointerSettings(comp, curLayer, pack_options, changeStartTimelinePointer, changeLayerIndexPosition, oldSelectedLayerObjectIndexies, false);

						} else {

							//for compositions items - duplicates and etc

							//duplicate current comp from original
							var oldCompName = compObject.name;
							// if(repeat_duplicate_name != oldCompName){count_duplicate_name = 1;} //refresh if new name
							// 	repeat_duplicate_name = oldCompName;


							var curDupComp = compObject.duplicate();
							//duplicate name
							// curDupComp.name = oldCompName + ' [' + getDateStamp() + ']';  //count_duplicate_name
							// compObject = curDupComp;
							var newCompNameGen = oldCompName + ' [' + getGIDByGroupName(itemGroup) + ']';
							curDupComp.name = solveDupCompName(newCompNameGen, checkGlobalAtomFolder);
							compObject = curDupComp;


							//AUTO SIZE APPLIED COMPs to Active Comp
							//changed - added custom change_auto_size_composition for group sets
							var auto_size_comp_type = new Object();
							if (pack_options.auto_size_composition != "NONE" || changeAutoSizeComp_custom) {

								//auto_size_comp_type[pack_options.auto_size_composition] = [comp.width, comp.height];

								//if exists custom change auto size and not NONE, use this. Or use default pack option
								if (changeAutoSizeComp_custom) {
									if (changeAutoSizeComp_custom != "NONE") {
										auto_size_comp_type[changeAutoSizeComp_custom] = [comp.width, comp.height];
									}
								} else {
									auto_size_comp_type[pack_options.auto_size_composition] = [comp.width, comp.height];
								}

								//resize comp only for main
								if (auto_size_comp_type["ONLY_MAIN"] || auto_size_comp_type["ALL_COMPS"]) {
									var getFromThisASCT = auto_size_comp_type["ONLY_MAIN"] ? auto_size_comp_type["ONLY_MAIN"] : auto_size_comp_type["ALL_COMPS"];
									compObject.width = getFromThisASCT[0];
									compObject.height = getFromThisASCT[1];
								}
							}


							//AUTO CHANGES FPS AS IN MAIN
							var auto_fps_changes_comp_type = new Object();
							if (pack_options.auto_fps_composition != "NONE") {
								auto_fps_changes_comp_type[pack_options.auto_fps_composition] = comp.frameDuration;

								//change fps only for main
								if (auto_fps_changes_comp_type["ONLY_MAIN"] || auto_fps_changes_comp_type["ALL_COMPS"]) {
									var getFromThisASCT = auto_fps_changes_comp_type["ONLY_MAIN"] ? auto_fps_changes_comp_type["ONLY_MAIN"] : auto_fps_changes_comp_type["ALL_COMPS"];
									compObject.frameDuration = getFromThisASCT;
								}

							}

							var preparedSceneSets_Childrens = {
								"AUTO_SIZE": auto_size_comp_type,
								"AUTO_FPS": auto_fps_changes_comp_type
							}


							var oldCompData = [oldCompName, curDupComp.name]; //old comp names (default, new)


							//children duplicates
							if (pack_options.duplicate_origin_setting != "ONLY_MAIN" || changeDuplicateOrigin_custom) {

								var set_ok = false;
								if (changeDuplicateOrigin_custom) {
									if (changeDuplicateOrigin_custom != "ONLY_MAIN") {
										set_ok = true;
									}
								} else {
									set_ok = true;
								}

								if (set_ok) {
									duplicateChildrenCompositions(curDupComp, false, false, new Object(), oldCompData, preparedSceneSets_Childrens);
								}
							}


							count_duplicate_name++; //up


							//PACK OPTIONS

							//add imported and duplicated comp AVLayer to activeItem
							var curLayer;
							// Custom layer pre-comp option
							if (custom_layer_precomp) {

								var layerPoints = [layer.inPoint, layer.outPoint, layer.time];
								var preCompLayer = app.project.items.addComp(layer.name, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate);

								if (custom_layer_precomp == 'TRANS') {
									// layer.inPoint = layerPoints[0];
									layer.startTime = layer.startTime - layerPoints[0];
									/* Copy selected layer to created pre-comp */
									layer.copyToComp(preCompLayer);
									/* Add precomp layer to previous source layer index and timing */
									var AVPrecomp = comp.layers.add(preCompLayer);
									/* Change times for main layer (replaced before) */
									AVPrecomp.moveAfter(layer);
									AVPrecomp.startTime = layerPoints[0];
									AVPrecomp.inPoint = layerPoints[0];
									AVPrecomp.outPoint = layerPoints[1];
									AVPrecomp.label = labelColorNum;
									AVPrecomp.selected = true;
									/* Remove selected layer (because already copied to pre-comp) */
									layer.remove();
									/* Inside applying scene */
									curLayer = preCompLayer.layers.add(compObject);
									curLayer.startTime = 0;
									curLayer.collapseTransformation = true;
									curLayer.label = labelColorNum;
									/* Time remapping - possible custom if defined, or default layer_duration */
									if (custom_layer_timing) {
										setTimeRemapping(curLayer, custom_layer_timing);
									} else {
										setTimeRemapping(curLayer, "TIME_REMAP_LAYER_DURATION");
									}

									//layer marker
									if (custom_layer_marker) {
										addCustomMarkers(curLayer, custom_layer_marker);
									}

								}

							} else {

								curLayer = comp.layers.add(compObject);
								curLayer.label = labelColorNum;

								//layer marker
								if (custom_layer_marker) {
									addCustomMarkers(curLayer, custom_layer_marker);
								}

								//from Spunkram 3.0.4r29
								if (custom_layer_fx) {
									var curType = custom_layer_fx[0];
									var setName = custom_layer_fx[1];
									var curVal = custom_layer_fx[2];

									var propType = '';
									switch (curType) {
										case 'Slider': propType = 'Slider Control'; break;
										case 'Checkbox': propType = 'Checkbox Control'; break;
										case 'Point': propType = 'Point Control'; break;
										case '3D Point': propType = '3D Point Control'; break;
										case 'Color': propType = 'Color Control'; break;
										case 'Angle': propType = 'Angle Control'; break;
										case 'Layer': propType = 'Layer Control'; break;
									}

									//right prop type then continue
									if (propType) {
										/* Added ADBE type for support other AE language versions */
										var newFx = curLayer.Effects.addProperty('ADBE ' + propType);
										newFx.name = setName;
										var eProp = newFx.property(1);

										//if need set default
										if (curVal) {
											//check - property has min/max value or not
											if (eProp.hasMin && eProp.hasMax) {
												if (curVal >= eProp.minValue && curVal <= eProp.maxValue) {
													eProp.setValue(curVal);
												}
											}
										}
									}
								}

								//layer auto size specially (change scaling) without changing comp sizes, only layer
								if (auto_size_comp_type["FIT_TO_COMP"]) {
									applyAutoSizeForFootage(comp, compObject, curLayer);
								}

								//layer sets
								if (custom_layer_sets) {
									for (var sets_count = 0; custom_layer_sets.split(":")[sets_count]; sets_count++) {
										var current_set_f_layer = custom_layer_sets.split(":")[sets_count].toString();

										switch (current_set_f_layer) {
											case "3D": curLayer.threeDLayer = true; break;
											case "ADJUSTMENT": curLayer.adjustmentLayer = true; break;
											case "COLLAPSE_TRANS": curLayer.collapseTransformation = true; break;
											case "MO_BLUR": curLayer.motionBlur = true; break;
										}
									}
								}

								//layer blendmode
								if (custom_layer_blendmode) {
									changeBlendMode(curLayer, custom_layer_blendmode);
								}

								//put null from composition to current composition and relink via expressions these nulls
								if (custom_layer_null_external) {
									var foundLneLayerObject;
									for (var lne = 1; lne <= curDupComp.layers.length; lne++) {
										var curLayerLne = curDupComp.layers[lne];
										if (curLayerLne.comment == commentFoundData[4]) {
											foundLneLayerObject = curLayerLne;
											break;
										}
									}

									if (foundLneLayerObject) {
										var LneNullObject = comp.layers.addNull();
										LneNullObject.name = foundLneLayerObject.name + ' - ' + curDupComp.name;
										LneNullObject.source.name = foundLneLayerObject.name + ' - ' + curDupComp.name;
										/* Set values from scene null to external null */

										// LneNullObject.property('Transform').property('Anchor Point').setValue([0,0]);
										// LneNullObject.property('Transform').property('Position').setValue([0,0]);

										/* Save parental layer if exists and set null to get absolute values of position/anchor point */
										var saveParentalLayerLne = foundLneLayerObject.parent;
										if (saveParentalLayerLne) {
											foundLneLayerObject.parent = null;
										}
										LneNullObject.property('Transform').property('Anchor Point').setValue(foundLneLayerObject.property('Transform').property('Anchor Point').value);
										LneNullObject.property('Transform').property('Position').setValue(foundLneLayerObject.property('Transform').property('Position').value);

										foundLneLayerObject.property('Transform').property('Anchor Point').expression = 'comp("' + comp.name + '").layer("' + LneNullObject.name + '").transform.anchorPoint';
										foundLneLayerObject.property('Transform').property('Position').expression = 'comp("' + comp.name + '").layer("' + LneNullObject.name + '").transform.position';


										/* Connect external null to applied scene */
										LneNullObject.parent = curLayer;

										/* Set old parental again */
										// if(saveParentalLayerLne){
										// 	foundLneLayerObject.parent = saveParentalLayerLne;
										// }
									}

								}

								/* NEW OPTION FOR ionestudio (copy market and relink marker to main composition) */
								if (custom_layer_relink_comp_marker) {

									// var foundLneLayerObject;
									// alert(curDupComp.markerProperty);

									// app.project.activeItem.selectedLayers[0].source.markerProperty.keyValue("OUT Animation").comment
									try {
										for (var key in custom_layer_relink_comp_marker) {
											if (Object.hasOwnProperty.call(custom_layer_relink_comp_marker, key)) {

												if (curDupComp.markerProperty.numKeys > 0) {
													var keyName = custom_layer_relink_comp_marker[key];
													var keyObject = curDupComp.markerProperty.keyTime(keyName);

													if (keyObject) {
														createMarker(curLayer, keyName, keyObject, "RelinkCompMarker");

														/* Replace expressions inside duplicate comp */
														for (var lne = 1; lne <= curDupComp.layers.length; lne++) {
															var curLayerLne = curDupComp.layers[lne];
															replaceExpressionsLoop(curLayerLne, /predefine_relink_atom(=?.*)\;/, 'predefine_relink_atom = comp("' + comp.name + '").layer("' + curDupComp.name + '");');
														}
														// predefine_relink_atom
													}
													/* Remove these markers */
													for (var i = curDupComp.markerProperty.numKeys; i >= 1; i--) {
														if (curDupComp.markerProperty.keyValue(i).comment == keyName) {
															curDupComp.markerProperty.removeKey(i);
														}
													}
												}
											}
										}
									} catch (error) {
										// alert(error.toString());
									}

								}


								/* Protector templates via FFX Presets - by request -sparta- */
								if (pack_options.template_protection_ffx) {
									findBindProtectedLayers(compObject, pack_options.template_protection_ffx, aePath);
								}



								//layer timing
								var startLayerTiming = "";
								if (custom_layer_timing) { startLayerTiming = setTimeRemapping(curLayer, custom_layer_timing, custom_layer_fx); }

								//layer start time line
								timeLinePointerSettings(comp, curLayer, pack_options, changeStartTimelinePointer, changeLayerIndexPosition, oldSelectedLayerObjectIndexies, startLayerTiming);


							}
						}

						app.endUndoGroup();

					} else {
						return "COMP";
					}
				} else {
					return "NO_MATCH";
				}
			}

		} else {
			return "MISSING";
		}

	} catch (error) {
		alert(error);
	}

}




/**
 * NEURO PHOTO ANIMATOR (inside COMPOSER)
 */

var savePrefixForPhotoAnimatorComps = '';
var photoAnimatorAssetsFolderName = '_Photo Animator';
var photoAnimatorTempCompObjectParentFolder = new Object();

function addCompNeuroPhotoAnimator(action, args_object, extraArguments, aePath, packageName, pack_options) {


	var checkItemFileObj = "";
	var prefixFolderName = '_NPA';
	var parentFolderComment = prefixFolderName + "-Special-Folder";



	//New - filepath now is generic from JS part

	//split "/" instance groups to get full path to template

	var getResolution = args_object.resolution;
	var customResWidth = Number(getResolution[0]) ? Number(getResolution[0]) : 1280;
	var customResHeight = Number(getResolution[1]) ? Number(getResolution[1]) : 720;
	var getImagePath = args_object.image;


	var lastGroupName = extraArguments.last_group;
	var targetFile = new File(extraArguments.filepath); //convert string to File object
	var itemIName = extraArguments.comp_name;

	//if file exist - go next
	if (targetFile.exists) {


		var checkGlobalAtomFolder = findInItems(root_folder_name, 'Folder');
		var checkPickComposition = findInItems(itemIName, "Composition", false, '', parentFolderComment);

		var compObject = checkPickComposition;

		//not found Atom Folder - create it
		if (!checkGlobalAtomFolder || !checkPickComposition) {

			if (!checkPickComposition) {
				var checkPackageFolder = findInItems(packageName, 'Folder', root_folder_name);

				//Global Folder
				if (!checkGlobalAtomFolder) {
					checkGlobalAtomFolder = app.project.items.addFolder(root_folder_name);
					checkGlobalAtomFolder.comment = root_folder_comment;
				}

				//Package Folder
				if (!checkPackageFolder) {
					checkPackageFolder = app.project.items.addFolder(packageName);
					checkPackageFolder.parentFolder = checkGlobalAtomFolder;
				}
				//Import Template
				var importedProject = app.project.importFile(new ImportOptions(targetFile));

				//for compositions (imported template with folder - name of template)
				//Move to parent folder
				importedProject.parentFolder = checkPackageFolder;
				importedProject.name = photoAnimatorAssetsFolderName;
				importedProject.comment = parentFolderComment;

				compObject = findInItems(itemIName, "Composition", false, '', parentFolderComment);
			}
		}
		//fixes to reset folder cache (trick for ae problems)
		checkGlobalAtomFolder.selected = true;

		if (compObject) {

			app.beginUndoGroup("Atom - Generate 3D Photo");

			//simple import without duplicates and etc... footages type files (none compositions)
			//for compositions items - duplicates and etc

			//duplicate current comp from original
			var oldCompName = compObject.name;
			// if(repeat_duplicate_name != oldCompName){count_duplicate_name = 1;} //refresh if new name
			// 	repeat_duplicate_name = oldCompName;


			var curDupComp = compObject.duplicate();

			var namePrefix = ' [PA]';
			var newCompNameGen = oldCompName + namePrefix;

			var getNewCompNameWithCounting = solveDupCompName(newCompNameGen, checkGlobalAtomFolder, true);

			var newCompPrefix = namePrefix + getNewCompNameWithCounting.toString().split(namePrefix)[1];

			curDupComp.name = getNewCompNameWithCounting;



			var allCompSize = new Object();
			allCompSize["ALL_COMPS"] = [customResWidth, customResHeight];
			var preparedSceneSets_Childrens = {
				"AUTO_SIZE": allCompSize,
				"AUTO_FPS": {}
			}

			var oldCompData = [oldCompName, curDupComp.name]; //old comp names (default, new)

			//duplicate all children comps
			duplicateChildrenCompositions(curDupComp, false, false, new Object(), oldCompData, preparedSceneSets_Childrens, newCompPrefix);

			savePrefixForPhotoAnimatorComps = newCompPrefix;
			photoAnimatorTempCompObjectParentFolder = compObject.parentFolder;
			//replace images
			photoAnimatorReplacePlaceholderImages(
				savePrefixForPhotoAnimatorComps,
				{ 'image': getImagePath },
				photoAnimatorTempCompObjectParentFolder
			);

			//change main comp size
			curDupComp.width = customResWidth;
			curDupComp.height = customResHeight;

			//PACK OPTIONS

			//add imported and duplicated comp AVLayer to activeItem
			// var curLayer = comp.layers.add(curDupComp);
			// curLayer.label = labelColorNum;
			curDupComp.openInViewer();

			app.endUndoGroup();

		} else {
			return "NO_MATCH";
		}

	} else {
		return "MISSING";
	}

}


/*
	TEXT ANIMATOR (include COMPOSER)

*/


function createFoldersForTextAnimatorStructure(packageName, lastGroupName, parentFolderComment, targetFile) {

	var checkGlobalAtomFolder = findInItems(root_folder_name, 'Folder');
	var checkPickFolderGroup = findInItems(lastGroupName, "Folder", false, '', parentFolderComment);

	var folderAbcItemsObject = checkPickFolderGroup;

	//not found Atom Folder - create it
	if (!checkGlobalAtomFolder || !checkPickFolderGroup) {

		if (!checkPickFolderGroup) {
			var checkPackageFolder = findInItems(packageName, 'Folder', root_folder_name);

			//Global Folder
			if (!checkGlobalAtomFolder) {
				checkGlobalAtomFolder = app.project.items.addFolder(root_folder_name);
				checkGlobalAtomFolder.comment = root_folder_comment;
			}

			//Package Folder
			if (!checkPackageFolder) {
				checkPackageFolder = app.project.items.addFolder(packageName);
				checkPackageFolder.parentFolder = checkGlobalAtomFolder;
			}

			if (targetFile) {
				//Import Template
				var importedProject = app.project.importFile(new ImportOptions(targetFile));

				//for compositions (imported template with folder - name of template)
				//Move to parent folder
				importedProject.parentFolder = checkPackageFolder;
				importedProject.name = lastGroupName;
				importedProject.comment = parentFolderComment;

				folderAbcItemsObject = importedProject;
			}

		}
	}
	//fixes to reset folder cache (trick for ae problems)
	checkGlobalAtomFolder.selected = true;
	return {
		'imported': folderAbcItemsObject,
		'packFolder': checkPackageFolder
	};
}


function createTextAnimatorComp(randomizer, importedFolder, animatorText, customArgs, pack_options, comp, createStruct, newCompSuffix) {

	var defaultLayerResize = pack_options.main_layer_resize ? pack_options.main_layer_resize : 15;
	var symbolSizePreferred = !randomizer && customArgs.layer_resize ? customArgs.layer_resize : defaultLayerResize;
	/* Create composition */
	var newComp = app.project.items.addComp(newCompSuffix, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate);
	newComp.parentFolder = createStruct.packFolder;

	var controlLayerName = 'Controller Layer';
	var controlFxNames = ['[TA] Tracking', '[TA] Symbol Size', '[TA] Position', '[TA] Scale'];

	var newCompLayers = newComp.layers;
	/* Add Main Controller */
	var controllerLayer = newCompLayers.addNull();
	controllerLayer.name = controlLayerName;
	controllerLayer.comment = commentFoundData[0];

	controllerLayer.property('Transform').property('Anchor Point').setValue([50, 50]);
	controllerLayer.property('Transform').property('Position').setValue([comp.width / 2, comp.height / 2])
	/* Slider Tracking */
	var sliderTracking = controllerLayer.Effects.addProperty('ADBE Slider Control');
	sliderTracking.name = controlFxNames[0];
	sliderTracking.property(1).setValue(70);
	/* Slider Symbol Size */
	var sliderSymbolSize = controllerLayer.Effects.addProperty('ADBE Slider Control');
	sliderSymbolSize.name = controlFxNames[1];
	sliderSymbolSize.property(1).setValue(symbolSizePreferred);
	/* Point Position */
	var pointPosition = controllerLayer.Effects.addProperty('ADBE Point Control');
	pointPosition.name = controlFxNames[2];
	pointPosition.property(1).setValue([comp.width / 2, comp.height / 2]);
	// pointPosition.property(1).setValue([comp.width - ((animatorText.length * symbolSizePreferred) / animatorText.length), comp.height/2]);


	/* Control Size */
	var sliderScale = controllerLayer.Effects.addProperty('ADBE Slider Control');
	sliderScale.name = controlFxNames[3];
	sliderScale.property(1).setValue(100);
	/* Self-expression position to control layer */
	controllerLayer.property('Transform').property('Position').expression = '//Spunkram - Text Animator\n//Self-binding Position\n\neffect("' + controlFxNames[2] + '")(1)';
	/* Self-size to control */
	controllerLayer.property('Transform').property('Scale').expression = '//Spunkram - Text Animator\n//Self-binding Scale\n\nscl = effect("' + controlFxNames[3] + '")(1);[scl, scl]';





	var userText = animatorText.toString();

	if (!randomizer) {
		var changeTextTransform = customArgs.character_style ? customArgs.character_style : pack_options.main_character_style;
		/* Text Transform Style */
		switch (changeTextTransform) {
			case "UPPERCASE":
				userText = userText.toUpperCase();
				break;
			case "LOWERCASE":
				userText = userText.toLowerCase();
				break;
		}
	}


	for (var index = 0; index < userText.length; index++) {

		var oneSign = userText[index];

		var importedFolderObj = importedFolder;
		var holdFrameForMultiplier = false;
		if (randomizer) {
			var itemObj = customArgs[index];
			oneSign = itemObj.curChar;
			importedFolderObj = randomizer[itemObj.item];

			if (itemObj.multiple) {
				holdFrameForMultiplier = itemObj.multiple;
			}
			// 	'curChar': $(this).attr('data-cur-char'),
			// 	'layerResize': $(this).attr('data-layer-resize'),
			// 	'item': $(this).attr('data-item'),
			// 	'project': $(this).attr('data-project-path'),
			// 	'multiple': parseInt($(this).attr('data-count')) > 1 ? $(this).attr('data-number') : false,
		}

		/* Whitespace */
		if (oneSign == ' ') { oneSign = 'WHITESPACE_CHAR'; }

		var signComp = findCompsByParental(oneSign, importedFolderObj);
		/* Empty Char if not found main char */
		if (!signComp) {
			oneSign = 'EMPTY_CHAR';
			signComp = findCompsByParental(oneSign, importedFolderObj);
		}

		if (signComp) {
			/* Processing */
			var addedSignLayer = newCompLayers.add(signComp);
			if (addedSignLayer) {
				/* Add Scale Expression */
				addedSignLayer.property('Transform').property('Scale').expression = '//Spunkram - Text Animator\n//Binding to Symbol Size\n\nrescaling = thisComp.layer("' + controlLayerName + '").effect("' + controlFxNames[1] + '")(1);[rescaling, rescaling]';
				/* Add Position Expression */
				addedSignLayer.property('Transform').property('Position').expression = '//Spunkram - Text Animator\n//Binding to Tracking\n\ncustom_tracking = thisComp.layer("' + controlLayerName + '").effect("' + controlFxNames[0] + '")(1)*2;cur_center = (value[0]+custom_tracking * index);[-cur_center, value[1]]';

				addedSignLayer.parent = controllerLayer;

				/* Add time-remapping */
				if (addedSignLayer.canSetTimeRemapEnabled) {
					addedSignLayer.timeRemapEnabled = true;
					var timeRemapProperty = addedSignLayer.timeRemap;

					addedSignLayer.outPoint = comp.duration;


					if (holdFrameForMultiplier) {
						timeRemapProperty.expression = 'thisComp.frameDuration * ' + holdFrameForMultiplier;
					} else {

					}

					revealModifiedProperties(timeRemapProperty);
				}
			}
		}
	}


	controllerLayer.Effects(controlFxNames[2]).property(1).setValue([((userText.length * symbolSizePreferred) * 12), comp.height / 2]);


	return newComp;
}


function addCompTextAnimatorForRandomizer(comp, args_object, extraArguments, packageName, pack_options) {

	var prefixFolderName = '[TA]';
	var parentFolderComment = prefixFolderName + "-Randomizer-Folder";

	//New - filepath now is generic from JS part

	//split "/" instance groups to get full path to template

	// var textAnimatorAssetsFolderName = '_Text Animator';
	var animatorText = extraArguments;
	var lastGroupName = 'Randomizer';
	// var targetFile = new File(extraArguments.filepath); //convert string to File object
	var labelColorNum = 2;

	var createStruct = createFoldersForTextAnimatorStructure(packageName, lastGroupName, parentFolderComment, false);

	var arrBaseProjects = {};

	/* Collect project files */
	for (var key in args_object) {
		if (args_object.hasOwnProperty.call(args_object, key)) {
			var element = args_object[key];
			arrBaseProjects[element.item] = element.project;
		}
	}

	app.beginUndoGroup("Atom - Text Animator");

	var arrBaseFolders = {};
	/* Import project files */
	for (var key in arrBaseProjects) {
		if (arrBaseProjects.hasOwnProperty.call(arrBaseProjects, key)) {
			var path = arrBaseProjects[key];

			var importedProject = app.project.importFile(new ImportOptions(path));
			//Move to parent folder
			importedProject.parentFolder = createStruct.packFolder;
			importedProject.name = lastGroupName + ' [' + key + ']';
			importedProject.comment = parentFolderComment;

			arrBaseFolders[key] = importedProject;
		}
	}

	var createdComp = createTextAnimatorComp(arrBaseFolders, createStruct.packFolder, animatorText, args_object, pack_options, comp, createStruct, prefixFolderName + ' - ' + animatorText);

	// //add imported and duplicated comp AVLayer to activeItem
	var curLayer = comp.layers.add(createdComp);
	curLayer.label = labelColorNum;

	app.endUndoGroup();
}

function addCompTextAnimator(comp, action, args_object, extraArguments, aePath, packageName, pack_options) {


	var checkItemFileObj = "";
	var prefixFolderName = '[TA]';
	var parentFolderComment = prefixFolderName + "-Special-Folder";



	//New - filepath now is generic from JS part

	//split "/" instance groups to get full path to template

	// var textAnimatorAssetsFolderName = '_Text Animator';
	var lastGroupName = extraArguments.last_group;
	var targetFile = new File(extraArguments.filepath); //convert string to File object
	var itemIName = extraArguments.comp_name;

	var animatorText = extraArguments.animator_text;

	var labelColorNum = args_object.label_color_num ? Number(args_object.label_color_num) : 2;



	var customArgs = args_object.custom_args;

	//if file exist - go next
	if (targetFile.exists) {

		createStruct = createFoldersForTextAnimatorStructure(packageName, lastGroupName, parentFolderComment, targetFile);

		var importedFolder = createStruct.imported;
		if (importedFolder) {

			app.beginUndoGroup("Atom - Text Animator");

			var createdComp = createTextAnimatorComp(false, importedFolder, animatorText, customArgs, pack_options, comp, createStruct, prefixFolderName + ' - ' + animatorText);

			//add imported and duplicated comp AVLayer to activeItem
			var curLayer = comp.layers.add(createdComp);
			curLayer.label = labelColorNum;

			app.endUndoGroup();

		} else {
			return "NO_MATCH";
		}

	} else {
		return "MISSING";
	}

}


function photoAnimatorReplacePlaceholderImages(prefixName, objTypes, assetsFolder) {

	if (!prefixName) { prefixName = savePrefixForPhotoAnimatorComps; }
	if (!assetsFolder && !photoAnimatorTempCompObjectParentFolder) {
		photoAnimatorTempCompObjectParentFolder = findInItems(photoAnimatorAssetsFolderName, 'Folder', root_folder_name);
	}


	for (var key in objTypes) {
		if (Object.hasOwnProperty.call(objTypes, key)) {

			var imageFilePath = objTypes[key];
			var placeholderCompName = '';
			switch (key) {
				case 'image': placeholderCompName = 'Image Placeholder'; break;
				case 'map': placeholderCompName = 'Map Placeholder'; break;
			}
			if (placeholderCompName && imageFilePath) {
				var compImage = findInItems(placeholderCompName + prefixName, "Composition");
				var importedImage = app.project.importFile(new ImportOptions(imageFilePath));
				importedImage.parentFolder = photoAnimatorTempCompObjectParentFolder;//add to assets folder after import

				removeAllLayerAndAddNewFootage(compImage, importedImage);
			}
		}
	}
}

function removeAllLayerAndAddNewFootage(comp, footageFilePath) {
	var compLayers = comp.layers;
	for (var i = 1; i <= compLayers.length; i++) {
		compLayers[i].remove();//remove each
	}

	var addedImageLayer = compLayers.add(footageFilePath);
	//change image size to comp
	applyAutoSizeForFootage(comp, addedImageLayer, addedImageLayer);
}


function applyAutoSizeForFootage(comp, compObject, curLayer) {
	var getItemOriginSizes = [compObject.width, compObject.height];
	var w = comp.width;
	var h = comp.height;
	var divideNumberW = getItemOriginSizes[0] / w;
	var divideNumberH = getItemOriginSizes[1] / h;
	var aspect = getItemOriginSizes[0] / getItemOriginSizes[1];

	var gfinalWidth = 100 / divideNumberW;
	var gfinalHeight = 100 / divideNumberH;
	if (w / h >= aspect) {
		curLayer.transform.scale.setValue([gfinalWidth, gfinalWidth]);
	} else {
		curLayer.transform.scale.setValue([gfinalHeight, gfinalHeight]);
	}
}

function doAutoSizeFootageInAE(packInsideOptions, argumentsPack) {
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

function timeLinePointerSettings(comp, curLayer, globalPackOptions, changeGlobalSets_timeline, changeGlobalSets_index, oldSelectedLayerObj, startLayerTiming) {
	//timeline position
	if (globalPackOptions.use_start_timeline_pointer != "NONE" || changeGlobalSets_timeline) {

		if (comp.time < comp.duration) {
			var switchSetTimelinePoint = changeGlobalSets_timeline ? changeGlobalSets_timeline : globalPackOptions.use_start_timeline_pointer;
			switch (switchSetTimelinePoint) {
				case "START_POINT": curLayer.startTime = 0; break;
				case "FOLLOW_CURSOR": curLayer.startTime = comp.time; break;
				case "IN_MARKER_POINT": if (startLayerTiming && startLayerTiming[1]) { curLayer.startTime = comp.time - startLayerTiming[1]; } break;
			}
		} else {
			curLayer.startTime = 0;
		}
	}
	//index position
	if (globalPackOptions.layer_index_position != "NONE" || changeGlobalSets_index) {

		var switchSetIndexPosition = changeGlobalSets_index ? changeGlobalSets_index : globalPackOptions.layer_index_position;
		switch (switchSetIndexPosition) {
			case "MOVE_BEGIN": curLayer.moveToBeginning(); break;
			case "MOVE_BELOW": if (oldSelectedLayerObj) { curLayer.moveAfter(oldSelectedLayerObj) }; break;
			case "MOVE_ABOVE": if (oldSelectedLayerObj) { curLayer.moveBefore(oldSelectedLayerObj) }; break;
			case "MOVE_END": curLayer.moveToEnd(); break;
		}
	}
}


function setTimeRemapping(currentLayer, type, custom_layer_fx) {

	var genExp_return = '//GENERATED VIA Spunkram BY ANIOM. https://aniom.net/\n//TYPE: ' + type + '\n';
	var getTRLayer = getTimeRemappingLayerData(currentLayer.source, 1);
	var diffSecOutPoint = 1; //def 1sec between In and Out (without action - pause)

	var isCopyMarkers = false;
	var isRemoveMarkers = false;
	if (type.toString().indexOf(':') != -1) {
		var splitTimingStr = type.toString().split(':');
		var timingType = splitTimingStr[0];
		var timingSpecialType = splitTimingStr[1];

		switch (timingSpecialType) {
			case 'COPY_MARKERS':
				isCopyMarkers = true;
				break;
			case 'REMOVE_MARKERS':
				isRemoveMarkers = true;
				break;
		}

		type = timingType;
	}

	if (!currentLayer.canSetTimeRemapEnabled) { return 0; }
	switch (type) {
		case "COPY_MARKERS":
			//add marker if exists
			if (getTRLayer) {
				//remove old markers
				removeAllMarkersFromLayer(currentLayer);

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, curMarkerComment, curMarkerTime, type);
			}
			break;
		case "TIME_REMAP_ONLY":

			//add marker if exists
			if (getTRLayer) {
				//remove old markers
				removeAllMarkersFromLayer(currentLayer);

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, curMarkerComment, curMarkerTime, type);
			}

			currentLayer.timeRemapEnabled = true;

			var timeRemapProperty = currentLayer.timeRemap;
			revealModifiedProperties(timeRemapProperty);
			break;

		case "TIME_REMAP_LAYER_DURATION":

			//add marker if exists
			if (getTRLayer) {
				//remove old markers
				removeAllMarkersFromLayer(currentLayer);

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, curMarkerComment, curMarkerTime, type);
			}

			//enable time-remapping
			currentLayer.timeRemapEnabled = true;

			var timeRemapProperty = currentLayer.timeRemap;


			//add expression to time-remapping
			if (timeRemapProperty.numKeys != 0) {
				//change duration outPoint
				currentLayer.outPoint = timeRemapProperty.keyValue(2) + currentLayer.inPoint;
				//add expressions
				timeRemapProperty.expression = genExp_return + expressionTR_DURATION;
			}

			revealModifiedProperties(timeRemapProperty);

			break;

		//ONLY IN OUT REMAPPING (fixed in v3.0.4 r31)
		case "TIME_REMAP_IN_OUT":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;


				// currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1]) + (diffSecOutPoint * 2); //duration of layer (equal from start layer to IN)
				currentLayer.outPoint = currentLayer.startTime + currentLayer.outPoint + (diffSecOutPoint);

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, 'IN', curMarkerTime + 0, type);
				createMarker(currentLayer, 'OUT', curMarkerTime + diffSecOutPoint, type);


				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					//timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_IN_OUT;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;
		//IN OUT WITH OUT REVERSE
		case "TIME_REMAP_IN_OUT_REVERSE":



			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;

				currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1] * 2) + diffSecOutPoint; //duration of layer (equal from start layer to IN)

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, 'IN', curMarkerTime + 0, type);
				createMarker(currentLayer, 'OUT', curMarkerTime + diffSecOutPoint, type);


				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					//timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_IN_OUT_REVERSE;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;



		case "TIME_REVERSE":

			var oldInPoint = currentLayer.inPoint;
			var oldOutPoint = currentLayer.outPoint;

			var totalDuration = oldOutPoint - oldInPoint;

			currentLayer.stretch = -currentLayer.stretch;
			currentLayer.startTime = totalDuration + oldInPoint;

			break;

		//ONLY IN with continue
		case "TIME_REMAP_IN_CONTINUE":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;


				currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1] * 2) + diffSecOutPoint; //duration of layer (equal from start layer to IN)

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				/* If none copy markers - set default name of marker */
				if (!isCopyMarkers) { curMarkerComment = 'IN'; }

				createMarker(currentLayer, curMarkerComment, curMarkerTime + 0, type);

				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					//timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_IN_CONTINUE;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;
		//SPECIAL LOOP (added for Alex Andrienkov)
		case "TIME_REMAP_LOOP_AA":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;
				currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1] * 2) + diffSecOutPoint; //duration of layer (equal from start layer to IN)

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				// createMarker(currentLayer, 'IN', curMarkerTime + 0, type);

				/* If none copy markers - set default name of marker */
				if (isCopyMarkers) {
					createMarker(currentLayer, curMarkerComment, curMarkerTime + 0, type);
				}



				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					// timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					//timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions

					//if added special fx to linking with expressions
					var setChangedExprs = '';
					if (custom_layer_fx) {
						setChangedExprs = expressionTR_LOOP_AA.toString().replace(exprReplaceMark, 'effect("' + custom_layer_fx[1] + '")(1)');
					} else {
						setChangedExprs = expressionTR_LOOP_AA.toString().replace(exprReplaceMark, '1'); //default timing like 1 - normal
					}

					timeRemapProperty.expression = genExp_return + setChangedExprs;
					//remove other keyframes
					// timeRemapProperty.removeKey(2);
					// timeRemapProperty.removeKey(2);
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;
		/* Added for Base Package - ionestudio */
		case "TIME_REMAP_IN_CONTINUE_LOOP_AA":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;


				currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1] * 2) + diffSecOutPoint; //duration of layer (equal from start layer to IN)

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				/* If none copy markers - set default name of marker */
				if (!isCopyMarkers) { curMarkerComment = 'IN'; }

				createMarker(currentLayer, curMarkerComment, curMarkerTime + 0, type);

				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					//timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_IN_CONTINUE_LOOP_AA;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;

		/* Added for Base Package - ionestudio */
		case "TIME_REMAP_IN_CONTINUE_LOOP_AA_FULL_LENGTH":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;

				// currentLayer.outPoint = currentLayer.startTime + (getTRLayer[1] * 2) + diffSecOutPoint; //duration of layer (equal from start layer to IN)


				var curMarkerComment = getTRLayer[0];
				var getLayerLength = currentLayer.outPoint - currentLayer.inPoint;
				var timeHalfOfLength = (getLayerLength / 2);
				var curMarkerTime = currentLayer.inPoint + timeHalfOfLength;

				// var timeHalfOfLength = (getLayerLength / 2);
				/* If none copy markers - set default name of marker */
				if (!isCopyMarkers) { curMarkerComment = 'IN'; }

				createMarker(currentLayer, curMarkerComment, curMarkerTime + 0, type);

				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {

					//add timing control key
					timeRemapProperty.setValueAtTime(curMarkerTime, timeHalfOfLength);
					//timeRemapProperty.setValueAtKey(2, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_IN_CONTINUE_LOOP_AA_FULL_LENGTH;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;
		case "TIME_REMAP_CYCLE_PINGPONG":

			//remove other markers
			removeAllMarkersFromLayer(currentLayer);

			//enable time-remapping
			currentLayer.timeRemapEnabled = true;

			var timeRemapProperty = currentLayer.timeRemap;

			//add expression to time-remapping
			if (timeRemapProperty.numKeys != 0) {
				//change duration outPoint
				currentLayer.outPoint = currentLayer.startTime + 5;
				//add expressions
				timeRemapProperty.expression = genExp_return + expressionTR_CYCLE_PINGPONG;
			}

			revealModifiedProperties(timeRemapProperty);

			break;
		case "TIME_REMAP_CYCLE_OUT":
			//remove other markers
			removeAllMarkersFromLayer(currentLayer);

			//enable time-remapping
			currentLayer.timeRemapEnabled = true;

			var timeRemapProperty = currentLayer.timeRemap;

			//add expression to time-remapping
			if (timeRemapProperty.numKeys != 0) {
				//change duration outPoint
				currentLayer.outPoint = currentLayer.startTime + 5;
				//add expressions
				timeRemapProperty.expression = genExp_return + expressionTR_CYCLE_OUT;
			}

			revealModifiedProperties(timeRemapProperty);

			break;
		//Special for BASE package AE. For stretch transitions
		//Like IN_CONTINUE, but we can control duration animation
		case "TIME_REMAP_OFFSET_DURATION":

			//add marker and timing only if exists markers
			if (getTRLayer) {

				//remove old markers
				removeAllMarkersFromLayer(currentLayer);
				//enable time-remapping
				currentLayer.timeRemapEnabled = true;

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, curMarkerComment, curMarkerTime + 0, type);

				var timeRemapProperty = currentLayer.timeRemap;

				//add expression to time-remapping
				if (timeRemapProperty.numKeys != 0) {
					//add timing control key
					timeRemapProperty.setValueAtTime(curMarkerTime, getTRLayer[1]);
					//add expressions
					timeRemapProperty.expression = genExp_return + expressionTR_OFFSET_DURATION;
				}

				revealModifiedProperties(timeRemapProperty);
			}

			break;

		case "TIME_REMAP_CUTTING":
			//add marker if exists
			if (getTRLayer) {
				//remove old markers
				removeAllMarkersFromLayer(currentLayer);

				var curMarkerComment = getTRLayer[0];
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				createMarker(currentLayer, curMarkerComment, curMarkerTime, type);


				currentLayer.timeRemapEnabled = true;

				var timeRemapProperty = currentLayer.timeRemap;

				/* Cut layer timing before market inside composition */
				currentLayer.outPoint = curMarkerTime;

				revealModifiedProperties(timeRemapProperty);
			}
			break;
		case "CUTTING_ONLY":
			//add marker if exists
			if (getTRLayer) {
				var curMarkerTime = currentLayer.inPoint + getTRLayer[1];

				currentLayer.timeRemapEnabled = true;

				var timeRemapProperty = currentLayer.timeRemap;

				/* Cut layer timing before market inside composition */
				currentLayer.outPoint = curMarkerTime;

				revealModifiedProperties(timeRemapProperty);
			}
			break;
		case "SAFE_REGION_ONLY":
			var compMarkersSource = currentLayer.source.markerProperty;
			if (compMarkersSource.numKeys > 0) {
				for (var i = compMarkersSource.numKeys; i >= 1; i--) {
					var keyTime = compMarkersSource.keyTime(i);
					var keyValue = compMarkersSource.keyValue(i);

					createProtectedRegionMarker(currentLayer, keyValue.comment, keyTime, keyValue.duration);
				}
			}
			break;

	}

	if (isRemoveMarkers) {
		removeAllMarkersFromLayer(currentLayer);
	}

	return getTRLayer ? getTRLayer : false;
}

function lookUpForSecrets(obj) {
	var str = "";
	for (var p in obj) {
		str += "\r"
		if (typeof (obj[p]) == "function") {
			str += "\t";
			str += p;
			//obj [ p ]() ;
		} else {
			str += p;
		}
	}
	return str;
}


function revealModifiedProperties(property) {
	$.sleep(200); //set sleep to correctly work
	property.selected = true;
	if (property.selected == true) {
		var numCommand = 2771; //Reveal All Modified Properties
		app.executeCommand(numCommand);
		property.selected = false;
	}
}

function changeBlendMode(layer, layer_blendmode) {

	if (layer_blendmode) {
		layer_blendmode = layer_blendmode.toString().toLowerCase();
		var blendId = BlendingMode.NORMAL;//normal
		switch (layer_blendmode) {
			//main
			case 'dissolve': blendId = BlendingMode.DISSOLVE; break;
			case 'darken': blendId = BlendingMode.DARKEN; break;
			case 'multiply': blendId = BlendingMode.MULTIPLY; break;
			case 'color burn': blendId = BlendingMode.COLOR_BURN; break;
			case 'linear burn': blendId = BlendingMode.LINEAR_BURN; break;
			case 'darker color': blendId = BlendingMode.DARKER_COLOR; break;
			//high
			case 'lighten': blendId = BlendingMode.LIGHTEN; break;
			case 'screen': blendId = BlendingMode.SCREEN; break;
			case 'color dodge': blendId = BlendingMode.COLOR_DODGE; break;
			case 'linear dodge': blendId = BlendingMode.LINEAR_DODGE; break;
			case 'lighter color': blendId = BlendingMode.LIGHTER_COLOR; break;
			//
			case 'overlay': blendId = BlendingMode.OVERLAY; break;
			case 'soft light': blendId = BlendingMode.SOFT_LIGHT; break;
			case 'hard light': blendId = BlendingMode.HARD_LIGHT; break;
			case 'vivid light': blendId = BlendingMode.VIVID_LIGHT; break;
			case 'linear light': blendId = BlendingMode.LINEAR_LIGHT; break;
			case 'pin light': blendId = BlendingMode.PIN_LIGHT; break;
			case 'hard mix': blendId = BlendingMode.HARD_MIX; break;
			//
			case 'difference': blendId = BlendingMode.DIFFERENCE; break;
			case 'exclusion': blendId = BlendingMode.EXCLUSION; break;
			case 'subtract': blendId = BlendingMode.SUBTRACT; break;
			case 'divide': blendId = BlendingMode.DIVIDE; break;
			//last
			case 'hue': blendId = BlendingMode.HUE; break;
			case 'saturation': blendId = BlendingMode.SATURATION; break;
			case 'color': blendId = BlendingMode.COLOR; break;
			case 'luminosity': blendId = BlendingMode.LUMINOSITY; break;
		}

		layer.blendingMode = blendId;
	}
}


function addCustomMarkers(curLayer, custom_layer_marker) {
	if (custom_layer_marker['Start']) {
		var curMarkerTimeIn = curLayer.inPoint + custom_layer_marker['Start'][1];
		createMarker(curLayer, custom_layer_marker['Start'][0], curMarkerTimeIn, 'CustomLayerMarker');
	}
	//add End marker
	if (custom_layer_marker['End']) {
		var curMarkerTimeOut = curLayer.outPoint - custom_layer_marker['End'][1];
		createMarker(curLayer, custom_layer_marker['End'][0], curMarkerTimeOut, 'CustomLayerMarker');
	}
}

function createMarker(currentLayer, markerName, markerTime, markerChapter) {
	var infoWebSite = "http://aniom.net";
	var infoEngineType = "_COMPOSER";

	var thisMarket = new MarkerValue(markerName, markerChapter, infoWebSite, infoEngineType, markerCuePoint);
	//add marker label color for AE v 16+ (СС18+) - label colors from CC15 (but via script possible add only from 16+)
	if (app.version.match(/\d+/) >= 16) {
		thisMarket.label = 2;
	}
	currentLayer.property("Marker").setValueAtTime(markerTime, thisMarket);
}

function createProtectedRegionMarker(currentLayer, markerName, markerTime, duration) {

	var thisMarket = new MarkerValue(markerName);
	// //add marker label color for AE v 16+ (СС18+) - label colors from CC15 (but via script possible add only from 16+)
	// if(app.version.match(/\d+/) >= 16){
	// 	thisMarket.label = 2;
	// }
	thisMarket.duration = duration;
	thisMarket.protectedRegion = true;

	currentLayer.property("Marker").setValueAtTime(markerTime, thisMarket);
}

function getMarkerComment(layer) {

	var getMarkers = layer.property("Marker");
	var comments = '';
	if (getMarkers.numKeys > 0) {
		for (var i = 1; i <= getMarkers.numKeys; i++) {
			comments += getMarkers.keyValue(i).comment + '\n';
		}
	}
	return comments;
}

function removeAllMarkersFromLayer(layer) {

	var getMarkers = layer.property("Marker");
	if (getMarkers.numKeys > 0) {
		for (var i = getMarkers.numKeys; i >= 1; i--) {
			getMarkers.removeKey(i);
		}
	}
}

function getTimeRemappingLayerData(comp_for_layer, marker_key_index) {
	var getLayer = checkLayersInComp(comp_for_layer, "COMMENT", commentFoundData[2]);

	if (getLayer) {
		var getMarker = getLayer.property("Marker");
		if (getMarker.numKeys > 0) {
			var currentMarkerLone_value = getMarker.keyValue(marker_key_index);
			var currentMarkerLone_time = getMarker.keyTime(marker_key_index);

			return [currentMarkerLone_value.comment, currentMarkerLone_time];
		}
	}
}



function findInItems(itemName, itemTypeName, parentFolder, findType, arg) {
	for (var i = app.project.numItems; i >= 1; i--) {
		var thisItem = app.project.item(i);
		var findCompTemp = thisItem.name;

		//root folder
		if (findType == "ID") {
			findCompTemp = thisItem.id;
		}

		if (findCompTemp == itemName) {

			switch (itemTypeName) {
				case "Composition":
					if (!(thisItem instanceof CompItem)) { continue; }
					break;
				case "Folder":
					if (!(thisItem instanceof FolderItem)) { continue; }
					break;
				case "Footage":
					if (!(thisItem instanceof FootageItem)) { continue; }
					break;
			}

			var continueAddLayerChecks = false;
			if (parentFolder) {
				if (thisItem.parentFolder.name == parentFolder) {
					continueAddLayerChecks = true;
				}
			} else {
				continueAddLayerChecks = true;
			}

			if (arg) {
				if (thisItem.parentFolder.comment == arg) {
					return continueAddLayerChecks ? thisItem : false;
				}
			} else {
				return continueAddLayerChecks ? thisItem : false;
			}
		}
	}
}




function findCompsByParental(itemName, parentProjectFolderObject) {

	for (var i = parentProjectFolderObject.numItems; i >= 1; i--) {
		var thisItem = parentProjectFolderObject.item(i);
		if (thisItem instanceof CompItem) {
			if (thisItem.name == itemName) {
				// arrToReturn[thisItem.name] = thisItem;
				// alert(thisItem.name);
				// return 0;
				return thisItem;
			}
		} else if (thisItem instanceof FolderItem) {
			findCompsByParental(itemName, thisItem);//recursive by inside folders
		}
	}
}


var findSameNameCompVarFromCycle = '';
/**
 * Find comp to solve duplicate names inside Root Atom Folder
 * @param {*} itemName 
 * @param {*} parentProjectFolderObject 
 * @returns 
 */
function findSameNameCompCycle(itemName, parentProjectFolderObject) {
	//
	for (var i = parentProjectFolderObject.numItems; i >= 1; i--) {
		var thisItem = parentProjectFolderObject.item(i);

		if (thisItem instanceof CompItem) {
			if (thisItem.name == itemName) {
				findSameNameCompVarFromCycle = thisItem.name;
				break;
			}
		} else if (thisItem instanceof FolderItem) {
			findSameNameCompCycle(itemName, thisItem);//recursive by inside folders
		}
	}
}

/**
 * Split and create one symbol from each category - use separator -@- (can be other, created in header.js)
 * @function instanceGroupCategoryJoinChar (from header.js)
 * @param {*} itemGroupData Example: CategoryName-@-InsideCategory-@-Inner
 */
function getGIDByGroupName(itemGroupData) {
	var createSymbolsFromGroup = '', separator = '-@-';
	for (var i = 0; itemGroupData.toString().split(separator)[i]; i++) {
		var getOneCatFrom = itemGroupData.toString().split(separator)[i].toString();
		createSymbolsFromGroup += getOneCatFrom[0]; //get one symbol from start of the word
	}
	return createSymbolsFromGroup ? createSymbolsFromGroup.toUpperCase() : '';

}

function solveDupCompName(previousCompName, parentProjectFolderObject) {
	var compNameWithNumeric = incrementName(previousCompName);
	//start recursive searching
	findSameNameCompCycle(compNameWithNumeric, parentProjectFolderObject);

	if (findSameNameCompVarFromCycle) {//exist comp with duplicate name - recursive this func to gen new prefix number and find it in comps of project
		findSameNameCompVarFromCycle = '';
		return solveDupCompName(compNameWithNumeric, parentProjectFolderObject);
	} else {//dup with same name not found - success
		return compNameWithNumeric;
	}
}

function padNum(num, size) {
	var s = "000000000" + num;
	return s.substr(s.length - size);
}

function getDateStamp() {
	D = new Date(Date(0));
	return "" + D.getDate() + "." + (D.getMonth() + 1) + "." + D.getFullYear() + "_" + D.getHours() + ":" + D.getMinutes() + ":" + D.getSeconds();
}

function incrementName(string) {
	var numberSplitRegex = /^(.*?)\[(\d+)\]$/m;
	var digitNumber = null;
	var splitNameArray = numberSplitRegex.exec(string);

	//if no numeric (first time)
	if (!splitNameArray) {
		return string + "[2]";
	} else {
		//has numeric (not first time)
		newNumber = parseInt(splitNameArray[2], 10) + 1;
		if (newNumber.toString().length > splitNameArray[2].length) {
			digitNumber = newNumber.toString().length;
		} else {
			digitNumber = splitNameArray[2].length;
		}
		newNumber = padNum(newNumber, digitNumber);
		return splitNameArray[1] + '[' + newNumber + ']';

	}
}

export const setComposerRootFolder = (name: string) => aeComposer.maskedTransferOnce(name);

export const applyComp = (
	itemId: string,
	itemName: string,
	itemGroup: string,
	args_object: unknown,
	extraArguments: unknown,
	aePath: string,
	packageName: string,
	pack_options: unknown,
) =>
	aeComposer.applyComp(
		itemId,
		itemName,
		itemGroup,
		args_object,
		extraArguments,
		aePath,
		packageName,
		pack_options,
	);

export const addTextAnimatorComp = (
	action: string,
	args_object: unknown,
	extraArguments: unknown,
	aePath: string,
	packageName: string,
	pack_options: unknown,
) => aeComposer.addTextAnimatorComp(action, args_object, extraArguments, aePath, packageName, pack_options);

export const addPhotoAnimatorComp = (
	action: string,
	args_object: unknown,
	extraArguments: unknown,
	aePath: string,
	packageName: string,
	pack_options: unknown,
) => aeComposer.addPhotoAnimatorComp(action, args_object, extraArguments, aePath, packageName, pack_options);

export const aeToolsRun = (type: string) => aeComposer.buttons(type);

