var clipboardPreview = {};


var mainPresetEffectName;
var effectHideProperties;
var globalCurFx;
var markerNames = {
	'IN': 'IN',
	'OUT': 'OUT',
	'MID': 'MID'
};
var layerMarkerMemory = [];
var clipboardRestoreMarkersOnNewLayer = {};

var marketDefSec = 1;
var fileNameFinderGroup = {};
var mainFilePresetGroup = {};

var folderTemplatesPath = '';

var selectedLayersBufferEvent = {
	'count': 0,
	'name': '',
	'index': 0
};

var insideKeyFxNums = 'fxNumbers';

$._AtomExt_aePresetManager = {

	setupPrefs: function(folderTemplates){
		folderTemplatesPath = folderTemplates;
	},
	anchorPointTool: function (direction) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }
		var layer = comp.selectedLayers[0];
		if (!layer) { return "LAYER"; }

		app.beginUndoGroup("Spunkram - Anchor Point Tool");

		switch (direction) {
			case 'top-left'	: moveAnchor(0, 0, comp, true); break;
			case 'top-mid'	: moveAnchor(1, 0, comp, true); break;
			case 'top-right': moveAnchor(2, 0, comp, true); break;
			case 'mid-left'	: moveAnchor(0, 1, comp, true); break;
			case 'mid-mid'	: moveAnchor(1, 1, comp, true); break;
			case 'mid-right': moveAnchor(2, 1, comp, true); break;
			case 'bot-left'	: moveAnchor(0, 2, comp, true); break;
			case 'bot-mid'	: moveAnchor(1, 2, comp, true); break;
			case 'bot-right': moveAnchor(2, 2, comp, true); break;
		}

		app.endUndoGroup();
	},
	buttons: function (btn_name, args) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) {
			return "COMP";
		}
		var layer = comp.selectedLayers[0];
		if (!layer) {
			return "LAYER";
		}

		var framesArg = args['frames'] || 1;

		switch (btn_name) {
			case 'add_in_marker':
			case 'add_in_marker_plus':
			case 'add_middle_marker':
			case 'add_out_marker':

				createMassMarkers(comp, btn_name);
				break;
			case 'align_in_play_head':
			case 'align_out_play_head':
			case 'shift_in_forward':
			case 'shift_in_backward':
			case 'shift_out_forward':
			case 'shift_out_backward':
			case 'stagger_layers_backward':
			case 'stagger_layers_forward':
			case 'stagger_layers_random':
				layerSequencer(comp, framesArg, btn_name);
				break;
		}
	},

	applyPreset: function (action, itemId, instanceGroup, getArguments, extraArguments, folderTemplates, packName, insideOptions) {
		

		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) { return "COMP"; }
		var layer = comp.selectedLayers[0];
		if (!layer) { return "LAYER"; }

		var getCustomArguments = getArguments.custom_args || {};

		folderTemplatesPath = folderTemplates;
		mainFilePresetGroup = insideOptions.main_preset_control;
		fileNameFinderGroup = insideOptions.file_name_finder;

		selectedLayersBufferEvent = {};
		/* Trick to solve cycle adding presets (bug in AE) */

		try {
			app.beginUndoGroup("Spunkram - Apply the Preset");
			var theLayers = comp.selectedLayers;
			for (var num = 0; num < theLayers.length; num ++) {
				
				var multiCurLayer = theLayers[num];
				/* Disable select others, select current (fix for applyPreset AE problem) */
				fixDeselectLayers(theLayers, multiCurLayer);


				layerSets(multiCurLayer, getCustomArguments);
				applyMainAnimator(multiCurLayer);

				switch (action) {
					case 'APPLY':
						var filePreset = new File(extraArguments.filepath);
						if (!filePreset.exists) {return "MISSING_PRESETS";}
						multiCurLayer.applyPreset(filePreset);
						break;
					case 'PM_BOTH':
						var fileIn, fileOut;
						if(fileNameFinderGroup){
							fileIn = fileNameFinderGroup['IN']['prefix'] + extraArguments.name + fileNameFinderGroup['IN']['suffix'] + '.ffx';
							fileOut = fileNameFinderGroup['OUT']['prefix'] + extraArguments.name + fileNameFinderGroup['OUT']['suffix'] + '.ffx';
						}else{
							fileIn = '.ffx';
							fileOut = '.ffx';
						}
						var filePresetIn = new File(extraArguments.filepath + fileIn);
						var filePresetOut = new File(extraArguments.filepath + fileOut);
	
						if (!filePresetIn.exists || !filePresetOut.exists) {return "MISSING_PRESETS";}
	
						multiCurLayer.applyPreset(filePresetIn);
						addMarkerForIn(multiCurLayer, comp, marketDefSec);
	
						multiCurLayer.applyPreset(filePresetOut);
						addMarkerForOut(multiCurLayer, comp, marketDefSec);
	
						break;
					case 'PM_IN':case 'PM_OUT':
						var filePreset = new File(extraArguments.filepath);
						if (!filePreset.exists) {return "MISSING_PRESETS";}
	
						if(action == 'PM_IN'){
							multiCurLayer.applyPreset(filePreset);
							addMarkerForIn(multiCurLayer, comp, marketDefSec);
						}else{
							multiCurLayer.applyPreset(filePreset);
							addMarkerForOut(multiCurLayer, comp, marketDefSec);
						}
						break;
				}
			}

			/* Reselect layers */
			fixDeselectLayers(theLayers);

			app.endUndoGroup();
	
		} catch (error) {
			alert(error);
		}
	},

	customizer: function (insideOptions, input_data) {
		var comp = app.project.activeItem;

		if(input_data == 'check_event_layers'){
			if(eventAutoWaitingSelectedLayers(comp)){
				return $._AtomExt_aePresetManager.customizer(insideOptions);
			}
		}else{

			if (!(comp) || !(comp instanceof CompItem)) {return "COMP";}
			var layer = comp.selectedLayers[0];
			if (!layer) {return "LAYER";}

			if(mainPreset = insideOptions.main_preset_control){
				mainPresetEffectName = mainPreset.effect_name;
			}
			if(hidePropPresets = insideOptions.customizer_control_hide){
				effectHideProperties = hidePropPresets;
			}

			/* Customize selected effect */
			if(input_data){
				selectedLayersBufferEvent = {};
				/* Deselect all fx and select current customize fx */
				parseEffects('deselectInsteadOfId', layer, input_data);
				return $._AtomExt_aeComposer.externalCustomizer(layer, comp, insideOptions, input_data);
			}else{/* Show applied presets */

				if (comp.selectedLayers.length > 1) {
					var getCustomizer = {
						'layerName': 'Multiple Layers Selected',
						'pointers': false,
						'massSelect': true
					};
					eventAutoWaitingSetup(comp.selectedLayers, true);
				} else {
					fileNameFinderGroup = insideOptions.file_name_finder;
					mainFilePresetGroup = insideOptions.main_preset_control;

					var fxCollect = parseEffects('prepareCustomizer', layer, false, true, fileNameFinderGroup);
					globalCurFx = fxCollect;
					var getCustomizer = {
						'layerName': layer.name,
						'pointers': fxCollect
					};
					eventAutoWaitingSetup(comp.selectedLayers, false);
				}
				return getCustomizer;
			}
		}
	},
	controlPreview: function (action, like, fxNumber, filePaths) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) {
			return "COMP";
		}
		var layer = comp.selectedLayers[0];
		if (!layer) {
			return "LAYER";
		}
		var theLayers = comp.selectedLayers;

		switch (action) {
			case 'PASTE':

				app.beginUndoGroup("Spunkram - Paste the Presets");

				if(!checkIsObjectItems(clipboardPreview)){return 'NO_PASTE_PRESETS';}

				if(theLayers.length > 1 && like == 'GLOBAL'){
					for (var num = 0; num < theLayers.length; num ++) {
						var multiCurLayer = theLayers[num];
						/* Disable select others, select current (fix for applyPreset AE problem) */
						fixDeselectLayers(theLayers, multiCurLayer);
						pasteFxSystemInCycle(multiCurLayer, comp, like);
						/* Restore selected layers */
						fixDeselectLayers(theLayers);
					}
				}else{
					pasteFxSystemInCycle(layer, comp, like);
				}

				app.endUndoGroup();
				break;
			case 'COPY':
				return copyFxIndexiesInCycle(layer, like, filePaths, false);

				break;
			case 'DELETE':
				app.beginUndoGroup("Spunkram - Delete Mass Preset");
				// if(!parseEffects('total', layer)){return "NO_PRESET_DELETE";}
				if(theLayers.length > 1 && like == 'GLOBAL'){
					for (var num = 0; num < theLayers.length; num ++) {
						var multiCurLayer = theLayers[num];
						/* Disable select others, select current (fix for applyPreset AE problem) */
						fixDeselectLayers(theLayers, multiCurLayer);
						clearPresets(multiCurLayer, like);
						/* Restore selected layers */
						fixDeselectLayers(theLayers);
					}
				}else{
					if(!parseEffects('total', layer)){return "NO_PRESET_DELETE";}
					clearPresets(layer, like);
				}
				app.endUndoGroup();
				break;
		}
	},
	controlPreviewOneItem: function (action, like, fxNumber, filePaths) {
		var comp = app.project.activeItem;
		if (!(comp) || !(comp instanceof CompItem)) {
			return "COMP";
		}
		var layer = comp.selectedLayers[0];
		if (!layer) {
			return "LAYER";
		}
		switch (action) {
			case 'COPY':
				return copyFxIndexiesInCycle(layer, like, filePaths, fxNumber);
				break;
			case 'DELETE':
				app.beginUndoGroup("Spunkram - Delete One Preset");

				if(!parseEffects('total', layer)){return "NO_PRESET_DELETE";}
				clearPresets(layer, like, fxNumber);
				app.endUndoGroup();
				break;
		}
	}
}


function eventAutoWaitingSetup(layers, multipleLayers){
	if(multipleLayers){
		selectedLayersBufferEvent['name'] = '';
		selectedLayersBufferEvent['index'] = 0;
		selectedLayersBufferEvent['count'] = layers.length;
	}else{
		selectedLayersBufferEvent['name'] = layers[0].name;
		selectedLayersBufferEvent['index'] = layers[0].index;
		selectedLayersBufferEvent['count'] = layers.length;
	}
}

function eventAutoWaitingSelectedLayers(comp){
	if(comp){
		var layers = comp.selectedLayers;
		if(layers.length > 0){
			/* Layers count selected */
			if(layers.length == 1){
				if(selectedLayersBufferEvent['name'] != layers[0].name || selectedLayersBufferEvent['index'] != layers[0].index || selectedLayersBufferEvent['count'] != layers.length){
					// selectedLayersBufferEvent['name'] = layers[0].name;
					// selectedLayersBufferEvent['index'] = layers[0].index;
					// selectedLayersBufferEvent['count'] = layers.length;
					eventAutoWaitingSetup(layers, false);

					return true;
				}
			}else{
				if(selectedLayersBufferEvent['count'] != layers.length){
					// selectedLayersBufferEvent['name'] = '';
					// selectedLayersBufferEvent['index'] = 0;
					// selectedLayersBufferEvent['count'] = layers.length;
					eventAutoWaitingSetup(layers, true);
					return true;
				}
			}
		}
	}
}

function fixDeselectLayers(selectedLayers, curLayer){
	for (var num = 0; num < selectedLayers.length; num ++) {
		selectedLayers[num].selected = curLayer ? false : true;
	}
	if(curLayer){curLayer.selected = true;}

}

function applyMainAnimator(layer){
	var mainPreset = mainFilePresetGroup;
	if (mainPreset) {
		var generalFile = new File(folderTemplatesPath + '/' + mainPreset.file);
		if (!generalFile.exists) {
			return "MISSING_PRESETS";
		}
		var fxName = mainPreset.effect_name;
		if (mainPreset.invoke == 'APPLY') {

			var findMainPresetFx = parseEffects('find', layer, fxName);
			/* Add Animator Fx if not found */
			if (!findMainPresetFx) {
				layer.applyPreset(generalFile);
			}
			/* If exists but, layer is 3D */
			if (findMainPresetFx && mainPreset.need_reapply == '3DLayer' && layer.threeDLayer == true) {
				layer.selected = false;
				layer.selected = true;
				parseEffects('remove', layer, fxName);
				layer.applyPreset(generalFile);
			}
		}
	}
	layer.selected = false;
	layer.selected = true;
}

function customizerPreviewControl() { }


function layerSets(layer, getCustomArguments){
	var layerAlreadySettedThreeD = false;
	if(getCustomArguments.layer_sets){
		for(var sets_count = 0; getCustomArguments.layer_sets.split(":")[sets_count]; sets_count++){
			var current_set_f_layer = getCustomArguments.layer_sets.split(":")[sets_count].toString();
			switch(current_set_f_layer){
				case "3D": 				layer.threeDLayer = true;layerAlreadySettedThreeD = true;break;
				case "ADJUSTMENT": 		layer.adjustmentLayer = true;break;
				case "COLLAPSE_TRANS": 	layer.collapseTransformation = true;break;
				case "MO_BLUR": 		layer.motionBlur = true;break;
			}
		}
	}
	return layerAlreadySettedThreeD;
}

function layerIsStill(layer){
	if(layer instanceof AVLayer){
		if(layer.source instanceof CompItem){
			return false;
		}else if(layer.source instanceof FootageItem){
			if(layer.source.mainSource.isStill){
				return true;
			}else{
				return false;
			}
		}else{
			return false;
		}
	}else{
		return true;
	}
}

function layerLenBorders(layer){
	if(Math.round((layer.outPoint - layer.inPoint)) == Math.round(layer.source.duration)){
		return 'full';
	}else{
		if(layer.inPoint == layer.startTime){
			return 'start';
		}else{
			return 'end';
		}
	}
}


function copyPasteMarkers(layer, onPaste, protectMarkerByName, compTime, type, shifts){
	if(onPaste){
		for (var i = layerMarkerMemory.length-1; i >= 0; i--) {
			var curMarkerData = layerMarkerMemory[i];
			createMarkerPm(layer, curMarkerData['name'], curMarkerData['time'], curMarkerData['label'], curMarkerData['duration'], !curMarkerData['chapter']);
		}
	}else{
		// if(!AvLayerProtectMarkerByName){AvLayerProtectMarkerByName = protectMarkerByName == 'IN' ? 'OUT' : 'IN';}
		layerMarkerMemory = [];
		var getMarkers = layer.property("Marker");
		if (getMarkers.numKeys > 0) {
			for (var i = getMarkers.numKeys; i >= 1; i--) {
				var curMarker = getMarkers.keyValue(i);
				var isStill = layerIsStill(layer);


				if(type == 'start'){
					if(isStill){/* Non protected marker - Layer without borders - shifted startTime */
						if(protectMarkerByName != curMarker.comment){
							layerMarkerMemory.push({
								'name': curMarker.comment,
								'time': getMarkers.keyTime(i),
								'duration': curMarker.duration,
								'label': curMarker.label,
								'chapter': curMarker.chapter
							});
							getMarkers.removeKey(i);
						}else{
							/* IN with duration */
							if(curMarker.comment == 'IN' && curMarker.duration > 0){
								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': getMarkers.keyTime(i),
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}
						}
					}else{
						var layerBorder = layerLenBorders(layer);
						/* Layer with borders (video/comp/...) */
						if(layerBorder == 'end'){
							if(protectMarkerByName == curMarker.comment){
								var endTime = getMarkers.keyTime(i) + (compTime - layer.inPoint);

								if(shifts == 'forward'){endTime = getMarkers.keyTime(i) + compTime;}
								if(shifts == 'backward'){endTime = getMarkers.keyTime(i) + compTime;}


								/* IN with duration */
								if(curMarker.comment == 'IN' && curMarker.duration > 0){
									var inMarkerDurTime = getMarkers.keyTime(i);
									if(!shifts){
										var checkLayerCanBeFull = layer.source.duration <= (layer.outPoint - compTime);
										if(checkLayerCanBeFull){
											inMarkerDurTime = getMarkers.keyTime(i) + (compTime - layer.inPoint);
										}
										
									}
									layerMarkerMemory.push({
										'name': curMarker.comment,
										'time': inMarkerDurTime,
										'duration': curMarker.duration,
										'label': curMarker.label,
										'chapter': curMarker.chapter
									});
									getMarkers.removeKey(i);
								}else{
									layerMarkerMemory.push({
										'name': curMarker.comment,
										'time': endTime,
										'duration': curMarker.duration,
										'label': curMarker.label,
										'chapter': curMarker.chapter
									});
									getMarkers.removeKey(i);
								}

							}
						}else if(layerBorder == 'start'){
							if(protectMarkerByName != curMarker.comment){
								var checkLayerCanBeFull = layer.source.duration <= (layer.outPoint - compTime);
								var startTime = checkLayerCanBeFull ? getMarkers.keyTime(i) - ( (layer.outPoint - compTime) - layer.source.duration) : getMarkers.keyTime(i);
								if(shifts){startTime = getMarkers.keyTime(i);}
								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': startTime,
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}else{
								if(curMarker.comment == 'IN'){
									/* IN with duration */
									if(curMarker.duration > 0){
										var inMarkerDurTime = getMarkers.keyTime(i);
										if(!shifts){
											var checkLayerCanBeFull = layer.source.duration <= (layer.outPoint - compTime);
											if(checkLayerCanBeFull){
												inMarkerDurTime = getMarkers.keyTime(i) + (compTime - layer.inPoint);
											}
											
										}
										layerMarkerMemory.push({
											'name': curMarker.comment,
											'time': inMarkerDurTime,
											'duration': curMarker.duration,
											'label': curMarker.label,
											'chapter': curMarker.chapter
										});
										getMarkers.removeKey(i);
									}
								}
							}
						}else{
							var fullTime = compTime >= layer.startTime ? getMarkers.keyTime(i) : getMarkers.keyTime(i) + (compTime - layer.inPoint);
								
							if(shifts == 'forward'){fullTime = getMarkers.keyTime(i);}
							if(shifts == 'backward'){fullTime = getMarkers.keyTime(i) + (compTime);}

							if(protectMarkerByName != curMarker.comment){

								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': fullTime,
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}else{
								/* IN with duration */
								if(curMarker.comment == 'IN' && curMarker.duration > 0){
									layerMarkerMemory.push({
										'name': curMarker.comment,
										'time': fullTime,
										'duration': curMarker.duration,
										'label': curMarker.label,
										'chapter': curMarker.chapter
									});
									getMarkers.removeKey(i);
								}
							}
						}
					}
				}else{
					if(isStill){/* Non protected marker - Layer without borders - shifted startTime */
						if(protectMarkerByName == curMarker.comment){
							var sTime = getMarkers.keyTime(i) + (compTime - layer.outPoint);
							if(shifts == 'forward'){sTime = getMarkers.keyTime(i) + (compTime);}
							if(shifts == 'backward'){sTime = getMarkers.keyTime(i) + compTime;}
							layerMarkerMemory.push({
								'name': curMarker.comment,
								'time': sTime,
								'duration': curMarker.duration,
								'label': curMarker.label,
								'chapter': curMarker.chapter
							});
							getMarkers.removeKey(i);
						}
					}else{
						var layerBorder = layerLenBorders(layer);
						/* Layer with borders (video/comp/...) */
						if(layerBorder == 'end'){
							var checkLayerCanBeFull = compTime >= (layer.inPoint + layer.source.duration);
							if(protectMarkerByName != curMarker.comment){
								var endTime = getMarkers.keyTime(i);
								if(!shifts && checkLayerCanBeFull){
									// layer.outPoint = comp.time;
									// layer.startTime += comp.time - layer.outPoint;
									if(curMarker.comment == 'IN'){
										if(curMarker.duration > 0){
											endTime = (getMarkers.keyTime(i)) + compTime - (layer.inPoint + layer.source.duration);
										}else{
											endTime = (getMarkers.keyTime(i)) + compTime - (layer.inPoint + layer.source.duration);
										}
										
									}
									
								}
								if(shifts == 'forward'){endTime = getMarkers.keyTime(i);}
								if(shifts == 'backward'){endTime = getMarkers.keyTime(i);}

								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': endTime,
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}
						}else if(layerBorder == 'start'){
							if(protectMarkerByName == curMarker.comment){
								var startTime = getMarkers.keyTime(i) + (compTime - layer.outPoint);
								if(shifts == 'forward'){startTime = getMarkers.keyTime(i) + compTime;}
								if(shifts == 'backward'){startTime = getMarkers.keyTime(i) + (compTime);}
								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': startTime,
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}
						}else{
							if(protectMarkerByName != curMarker.comment){
								var fullTime = compTime <= layer.outPoint ? getMarkers.keyTime(i) : getMarkers.keyTime(i) + (compTime - layer.outPoint);
								if(shifts == 'forward'){fullTime = getMarkers.keyTime(i) + compTime;}
								if(shifts == 'backward'){fullTime = getMarkers.keyTime(i);}
								layerMarkerMemory.push({
									'name': curMarker.comment,
									'time': fullTime,
									'duration': curMarker.duration,
									'label': curMarker.label,
									'chapter': curMarker.chapter
								});
								getMarkers.removeKey(i);
							}
						}
					}
				}
			}
		}
	}
}

function layerSequencer(comp, offset, from) {
	app.beginUndoGroup("Spunkram - Sequencer"); // starting our undo group
	try {

		var specSelectedLayersCount = comp.selectedLayers.length;
		var zeroPointC = specSelectedLayersCount+1;
		for (var layerId = comp.layers.length; layerId >= 1; layerId--) {
			var layer = comp.layer(layerId);

			if(layer.selected){
				zeroPointC--;
				if (from == 'align_in_play_head') {
					copyPasteMarkers(layer, false, 'IN', comp.time, 'start');
					var oldPoint = layer.outPoint;

					if(layerIsStill(layer)){
						layer.startTime += comp.time - layer.inPoint;
					}else{
						var layerBorder = layerLenBorders(layer);
						var checkLayerCanBeFull = layer.source.duration <= (layer.outPoint - comp.time);
						if(layerBorder == 'end'){
							if(checkLayerCanBeFull){
								layer.inPoint = comp.time;
								layer.startTime += comp.time - layer.inPoint;
							}else{
								layer.inPoint = comp.time;
							}
							
						}else{
							layer.startTime += comp.time - layer.inPoint;
						}
					}
					layer.outPoint = oldPoint;
					copyPasteMarkers(layer, true);
				}
				if (from == 'align_out_play_head') {
					copyPasteMarkers(layer, false, 'OUT', comp.time, 'end');
					var oldPoint = layer.inPoint;

					if(layerIsStill(layer)){
						layer.outPoint = comp.time;
					}else{
						var layerBorder = layerLenBorders(layer);
						var checkLayerCanBeFull = comp.time >= (layer.inPoint + layer.source.duration);
						if(layerBorder == 'start'){
							if(checkLayerCanBeFull){
								layer.outPoint = comp.time;
								layer.startTime += comp.time - layer.outPoint;
								
							}else{
								layer.outPoint = comp.time;
							}

						}else{
							layer.startTime += comp.time - layer.outPoint;
							layer.inPoint = oldPoint;
							layer.outPoint = comp.time;
						}
					}

					
					copyPasteMarkers(layer, true);
				}

				if (from == 'shift_in_forward') {
					var shift = ((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration);
					copyPasteMarkers(layer, false, 'IN', shift, 'start', 'forward');
					var oldPoint = layer.outPoint;

					if(layerIsStill(layer)){
						layer.startTime = shift + layer.startTime;
					}else{
						var layerBorder = layerLenBorders(layer);
						if(layerBorder == 'end'){
							layer.inPoint = shift + layer.inPoint;
						}else{
							// layer.startTime += comp.time - layer.inPoint;
							layer.startTime = shift + layer.startTime;
						}
					}

					layer.outPoint = oldPoint;
					copyPasteMarkers(layer, true);
				}
				if (from == 'shift_in_backward') {
					var shift = -((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration);
					copyPasteMarkers(layer, false, 'IN', shift, 'start', 'backward');
					var oldPoint = layer.outPoint;

					if(layerIsStill(layer)){
						layer.startTime = shift + layer.startTime;
					}else{
						var layerBorder = layerLenBorders(layer);
						if(layerBorder == 'end'){
							layer.inPoint = shift + layer.inPoint;
						}else{
							// layer.startTime += comp.time - layer.inPoint;
							layer.startTime = shift + layer.startTime;
						}
					}

					layer.outPoint = oldPoint;
					copyPasteMarkers(layer, true);
				}
				if (from == 'shift_out_forward') {
					
					var shift = ((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration);
					copyPasteMarkers(layer, false, 'OUT', shift, 'end', 'forward');
					var oldPoint = layer.inPoint;
					var oldOutPoint = layer.outPoint;


					if(layerIsStill(layer)){
						layer.outPoint = oldOutPoint + shift;
					}else{
						var layerBorder = layerLenBorders(layer);
						if(layerBorder == 'start'){
							layer.outPoint = oldOutPoint + shift;
						}else{
							layer.startTime += shift;
							layer.inPoint = oldPoint;
							layer.outPoint = oldOutPoint + shift;
						}
					}

					// layer.startTime = shift + layer.startTime;
					// layer.inPoint = oldPoint;
					// layer.outPoint = oldOutPoint + shift;

	
					copyPasteMarkers(layer, true);
				}
				if (from == 'shift_out_backward') {
					var shift = ((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration)
					copyPasteMarkers(layer, false, 'OUT', -shift, 'end', 'backward');
	
					var oldPoint = layer.inPoint;
					var oldOutPoint = layer.outPoint;

					if(layerIsStill(layer)){
						layer.outPoint = oldOutPoint - shift;
					}else{
						var layerBorder = layerLenBorders(layer);
						if(layerBorder == 'start'){
							layer.outPoint = oldOutPoint - shift;
						}else{
							layer.startTime -= shift;
							layer.inPoint = oldPoint;
							layer.outPoint = oldOutPoint - shift;
						}
					}

					// layer.startTime = -shift + layer.startTime;
					// layer.inPoint = oldPoint;
					// layer.outPoint = oldOutPoint - shift;


					copyPasteMarkers(layer, true);
				}
				if (from == 'stagger_layers_backward') {
					layer.startTime = -((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration) + layer.startTime;
				}
				if (from == 'stagger_layers_forward') {
					layer.startTime = ((specSelectedLayersCount - zeroPointC) * offset * comp.frameDuration) + layer.startTime;
				}
				if (from == 'stagger_layers_random') {
					layer.startTime = ((getRandomNumber(-specSelectedLayersCount, specSelectedLayersCount)) * offset * comp.frameDuration) + layer.startTime;
					// layer.startTime = ((getRandomNumber(-specSelectedLayersCount, specSelectedLayersCount)) * offset * comp.frameDuration) + layer.startTime;
				}
				
			}
			
		}
	} catch (error) {
		alert(error);
	}
	app.endUndoGroup(); //ending our undo group
}


function getRandomNumber(min, max) {
	return Math.round(Math.random() * (Math.abs(max) + Math.abs(min)) - Math.abs(min));
}



function clearPresets(layer, like, fxNumberOne) {
	try {
		globalCurFx = parseEffects('prepareCustomizer', layer, false, true, fileNameFinderGroup);
		/* Remove specified effects */

		if(fxNumberOne){
			removeFxIndexiesInCycle(layer, [fxNumberOne]);

			/* Remove marker by type if this effect is latest and already removed */
			if(collectFxAsArr(like).length == 1){
				markerExistsOrRemove(layer, markerNames[like]);
			}
			/* No another presets - remove Animator */
			if(parseEffects('total', layer) == 1){
				if(mainPresetEffectName){
					parseEffects('remove', layer, mainPresetEffectName);
					removeExpressionsFromCommonProperties(layer);
				}
			}
		}else{
			removeFxIndexiesInCycle(layer, collectFxAsArr(like));
			/* Remove all markers */
			if (like == 'GLOBAL') {
				markerExistsOrRemove(layer, [markerNames['IN'], markerNames['OUT'], markerNames['MID']]);
				/* Remove main preset if need */
				if(mainPresetEffectName){
					parseEffects('remove', layer, mainPresetEffectName);
					removeExpressionsFromCommonProperties(layer);
				}
			} else {
				markerExistsOrRemove(layer, markerNames[like]);
				/* No another presets - remove Animator */
				if(parseEffects('total', layer) == 1){
					if(mainPresetEffectName){
						parseEffects('remove', layer, mainPresetEffectName);
						removeExpressionsFromCommonProperties(layer);
					}
				}
			}
		}

		layer.selected = true;
	} catch (error) {
		alert('ClearPresets: ' + error);
	}
}


function removeExpressionsFromCommonProperties(layer){
	if(layer){
		layer.transform.anchorPoint.expression = '';
		layer.transform.position.expression = '';
		layer.transform.scale.expression = '';

		layer.transform.opacity.expression = '';

		if(layer.threeDLayer){
			layer.transform.xRotation.expression = '';
			layer.transform.yRotation.expression = '';
			layer.transform.zRotation.expression = '';
		}else{
			layer.transform.rotation.expression = '';
		}
	}

}

function collectFxAsArr(type){
	var allFxToRemove = [];
	if(type == 'GLOBAL'){
		for (var key in globalCurFx) {
			if (Object.hasOwnProperty.call(globalCurFx, key)) {
				var aniType = globalCurFx[key];
				/* Effect name and fxNumbers keys */
				for (var insideKey in aniType) {
					if (Object.hasOwnProperty.call(aniType, insideKey)) {
						var fxNameObject = aniType[insideKey];
						allFxToRemove = allFxToRemove.concat(fxNameObject[insideKeyFxNums]);
					}
				}
			}
		}
	}else{
		/* Effect name and fxNumbers keys */
		for (var insideKey in globalCurFx[type]) {
			if (Object.hasOwnProperty.call(globalCurFx[type], insideKey)) {
				var fxNameObject = globalCurFx[type][insideKey];
				allFxToRemove = allFxToRemove.concat(fxNameObject[insideKeyFxNums]);
			}
		}
	}

	return allFxToRemove.sort();
}

function removeFxIndexiesInCycle(layer, indexies){
	var effectsLeft = 0;
	for (var fx = indexies.length-1; fx >= 0; fx--) {
		if(indexies[fx]){
			var curFx = layer.Effects(Number(indexies[fx]));
			if(curFx){
				curFx.remove();
			}
			
		}else{
			effectsLeft++;
		}

	}
	return effectsLeft;
}

function copyFxIndexiesInCycle(layer, type, filePaths, oneFxNumber){
	clipboardPreview = {};
	clipboardRestoreMarkersOnNewLayer = {};
	try {
		if(type == 'GLOBAL'){
			for (var key in filePaths) {
				if (Object.hasOwnProperty.call(filePaths, key)) {
					var insideType = filePaths[key];
					if(insideType && checkIsObjectItems(insideType)){
						clipboardRestoreMarkersOnNewLayer[key] = true;
						for (var indexOfFx in insideType) {
							if (Object.hasOwnProperty.call(insideType, indexOfFx)) {
								var fxFilePath = insideType[indexOfFx];
								parsePropertiesOfFx(layer, indexOfFx, fxFilePath);
							}
						}
					}

				}
			}
		}else{
			clipboardRestoreMarkersOnNewLayer[type] = true;
			for (var indexOfFx in filePaths[type]) {
				if (Object.hasOwnProperty.call(filePaths[type], indexOfFx)) {
					var fxFilePath = filePaths[type][indexOfFx];
					if(oneFxNumber){
						if(oneFxNumber == indexOfFx){
							parsePropertiesOfFx(layer, indexOfFx, fxFilePath);
						}
					}else{
						// if(type == 'GLOBAL')
						parsePropertiesOfFx(layer, indexOfFx, fxFilePath);
					}
				}
			}
		}
	} catch (error) {
		return "RESET_CUSTOMIZER_DATA_COMPLECT";
	}
}

function parsePropertiesOfFx(layer, index, filePath){
	var currentEffect = layer.Effects(Number(index));

	var collectCopyClipboardData = {};
	for(var prop = 1; prop <= currentEffect.numProperties; prop++){
		var curProp = currentEffect.property(prop);
		if(effectHideProperties && effectHideProperties[curProp.name]){
			continue;
		}

		if(curProp.propertyValueType == PropertyValueType.NO_VALUE || curProp.propertyValueType == PropertyValueType.CUSTOM_VALUE){
			continue;
		}

		/* Check prop group/prop default type */
		if(curProp.propertyType === PropertyType.PROPERTY){
			collectCopyClipboardData[prop] = curProp.value;
		}
	}
	clipboardPreview[index] = {
		'file': filePath,
		'properties': collectCopyClipboardData,
		'threeDLayer': layer.threeDLayer
	};
}

function applyFxProperties(layer, index, setProps){
	var currentEffect = layer.Effects(Number(index));
	for(var prop = 1; prop <= currentEffect.numProperties; prop++){
		var curProp = currentEffect.property(prop);
		if(setProps[prop] != undefined){
			curProp.setValue(setProps[prop]);
		}
	}
}

function checkIsObjectItems(object){
	var exist = false;
	for (var key in object) {
		if (Object.hasOwnProperty.call(object, key)) {
			if(object[key]){
				exist = true;
				break;
			}
		}
	}
	return exist;
}

function pasteFxSystemInCycle(layer, comp, type){


	for (var key in clipboardPreview) {
		if (Object.hasOwnProperty.call(clipboardPreview, key)) {
			parseEffects('deselectAll', layer);
			var insideType = clipboardPreview[key];
			var curFile = insideType['file'];
			var curProperties = insideType['properties'];
			var layerIsThreeD = insideType['threeDLayer'];
			var lastCountFx = Number(parseEffects('total', layer) + 1);

			if(layerIsThreeD){
				layer.threeDLayer = true;
			}

			var filePreset = new File(curFile);
			if (!filePreset.exists) {return "MISSING_PRESETS";}
			layer.applyPreset(filePreset);
			// layer.selected = false;
			// layer.selected = true;

			applyFxProperties(layer, lastCountFx, curProperties);
		}
	}
	applyMainAnimator(layer);
	if(clipboardRestoreMarkersOnNewLayer[markerNames['IN']]){addMarkerForIn(layer, comp, marketDefSec);}
	if(clipboardRestoreMarkersOnNewLayer[markerNames['OUT']]){addMarkerForOut(layer, comp, marketDefSec);}
	// if(clipboardRestoreMarkersOnNewLayer[markerNames['MID']]){addMarkerForMiddle(layer, comp, marketDefSec+2);} //don't paste MID marker
}

var markerDeviderIdsSymbol = ':';

function parseEffects(method, layer, fx_name, as_object, args) {
	var currentEffectsOnLayer = layer.Effects;
	var mNameIn = markerNames['IN'];
	var mNameOut = markerNames['OUT'];
	var mNameMid = markerNames['MID'];

	if (method == 'total') {
		return currentEffectsOnLayer.numProperties;
	} else {
		var returnAs = false;
		var returnObject = {};
		/* Collect main as Objects */
		var oInArr = {}, oOutArr = {}, oMidArr = {};
		// for (var fx = 1; fx <= currentEffectsOnLayer.numProperties; fx++) {
		for (var fx = currentEffectsOnLayer.numProperties; fx >= 1; fx--) {
			var hereEffect = currentEffectsOnLayer(fx);
			if(hereEffect){
				var curFxName = hereEffect.name;
				if (method == 'collect') {
					returnObject[curFxName] = fx;
				}
				if(method == 'prepareCustomizer'){
					var originItemNameFromFx = curFxName.toString();
					if(args){
						
						if(args[mNameIn] && (args[mNameIn]['prefix'] || args[mNameIn]['suffix'])){
							var enabled = false;
							if(args[mNameIn]['prefix'] && originItemNameFromFx.indexOf(args[mNameIn]['prefix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameIn]['prefix'], '');
								enabled = true;
							}if(args[mNameIn]['suffix'] && originItemNameFromFx.lastIndexOf(args[mNameIn]['suffix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameIn]['suffix'], '');
								enabled = true;
							}
							if(enabled){presetDuplicatePrepareReturn(originItemNameFromFx, oInArr, fx);}
						}
						if(args[mNameOut] && (args[mNameOut]['prefix'] || args[mNameOut]['suffix'])){
							var enabled = false;
							if(args[mNameOut]['prefix'] && originItemNameFromFx.indexOf(args[mNameOut]['prefix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameOut]['prefix'], '');
								enabled = true;
							}
							if(args[mNameOut]['suffix'] && originItemNameFromFx.lastIndexOf(args[mNameOut]['suffix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameOut]['suffix'], '');
								enabled = true;
							}
							if(enabled){presetDuplicatePrepareReturn(originItemNameFromFx, oOutArr, fx);}
						}
						if(args[mNameMid] && (args[mNameMid]['prefix'] || args[mNameMid]['suffix'])){
							var enabled = false;
							if(args[mNameMid]['prefix'] && originItemNameFromFx.indexOf(args[mNameMid]['prefix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameMid]['prefix'], '');
								enabled = true;
							}
							if(args[mNameMid]['suffix'] && originItemNameFromFx.lastIndexOf(args[mNameMid]['suffix']) != -1){
								originItemNameFromFx = originItemNameFromFx.replace(args[mNameMid]['suffix'], '');
								enabled = true;
							}
							if(enabled){presetDuplicatePrepareReturn(originItemNameFromFx, oMidArr, fx);}
							/* Has Dups */
							// var rExec = /(.*) (\d+)/i.exec(originItemNameFromFx);
							// if(rExec){oDupMidArr[rExec[1]] = fx;}
						}
						// var rExec = /(.*) (\d+)/i.exec(originItemNameFromFx);
					}else{
						oMidArr[originItemNameFromFx] = fx;
					}
				}
				if (method == 'find') {
					if (curFxName == fx_name) {
						returnAs = true;
						break;
					}
				}
				if (method == 'match') {
					if (curFxName.indexOf(fx_name) != -1) {
						returnAs = true;
						break;
					}
				}
				if (method == 'deselectAll') {
					hereEffect.selected = false;
				}
				if(method == 'deselectInsteadOfId'){
					if (fx == fx_name) {
						hereEffect.selected = true;
					}else{
						hereEffect.selected = false;
					}
				}
				if (method == 'selectId') {
					if (fx == fx_name) {
						hereEffect.selected = true;
						break;
					}
				}
				if (method == 'remove') {
					if (curFxName == fx_name) {
						hereEffect.remove();
						returnAs = true;
						break;
					}
				}
			}
			
		}

		if(method == 'prepareCustomizer'){
			returnObject[mNameIn] = oInArr;
			returnObject[mNameOut] = oOutArr;
			returnObject[mNameMid] = oMidArr;

			return returnObject;
		}else{
			return as_object ? returnObject : returnAs;
		}

		
	}
}


function presetDuplicatePrepareReturn(originItemNameFromFx, oInArr, fx){
	var rExec = /(.*) (\d+)/i.exec(originItemNameFromFx);
	if(rExec){/* Has duplicate this preset */
		if(oInArr[rExec[1]]){
			if(oInArr[rExec[1]][insideKeyFxNums] instanceof Array){
				oInArr[rExec[1]][insideKeyFxNums].push(fx);
			}
		}else{/* First added (duplicated fx, original was deleted) */
			var addX = {};
			addX[insideKeyFxNums] = [fx];
			oInArr[rExec[1]] = addX;
		}
	}else{/* First added */
		if(oInArr[originItemNameFromFx]){
			if(oInArr[originItemNameFromFx][insideKeyFxNums] instanceof Array){
				oInArr[originItemNameFromFx][insideKeyFxNums].push(fx);
			}
		}else{
			var addX = {};
			addX[insideKeyFxNums] = [fx];
			oInArr[originItemNameFromFx] = addX;
		}
	}
}

function parseMarkerOriginIds(markerChapterString) {
	var idList = {};
	var arrIds = markerChapterString.split(markerDeviderIdsSymbol);
	for (var key in arrIds) {
		if (Object.hasOwnProperty.call(arrIds, key)) {
			idList[arrIds[key]] = true; //key+1;
		}
	}
	return idList;
}

function hasExistsMarkers(layer) {
	var getMarkers = layer.property("Marker");
	var gotMarkers = {};
	if (getMarkers.numKeys > 0) {
		for (var i = getMarkers.numKeys; i >= 1; i--) {
			var curMarker = getMarkers.keyValue(i);
			gotMarkers[curMarker.comment] = {
				'marker': {
					'time': getMarkers.keyTime(i),
					'index': i
				},
				'items': curMarker.getParameters()
			};
		}
	}
	return gotMarkers;
}


function createMarkerPm(currentLayer, markerName, markerTime, markerColor, markerWithLength, simpleMarkerNonFromExct) {
	if(!simpleMarkerNonFromExct){
		var thisMarker = new MarkerValue(markerName, "chapter", "https://aniom.net", "_PRESET_MANAGER", "Spunkram_EXTENSION_BY_ANIOM");
	}else{
		var thisMarker = new MarkerValue(markerName);
	}

	if (app.version.match(/\d+/) >= 16) {thisMarker.label = isNaN(markerColor) ? 2 : markerColor;}/* Label color for AE v16+ (СС18+) */
	if(markerWithLength && app.version.match(/\d+/) >= 15){
		thisMarker.duration = markerWithLength;
	}
	currentLayer.property("Marker").setValueAtTime(markerTime, thisMarker);
}

function removeAllMarkersFromLayer(layer) {
	var getMarkers = layer.property("Marker");
	if (getMarkers.numKeys > 0) {
		for (var i = getMarkers.numKeys; i >= 1; i--) {
			getMarkers.removeKey(i);
		}
	}
}

function checkInArrayExists(needle, haystack){
    return haystack.toString().indexOf(needle) !== -1;
}

function markerExistsOrRemove(layer, markerNameOrObjectNames, doNotRemoveIfExists, doNotTouchLengthMarker) {
	var getMarkers = layer.property("Marker");
	var returnIfExistsMarker = false;
	if (getMarkers.numKeys > 0) {
		for (var i = getMarkers.numKeys; i >= 1; i--) {
			var curMarker = getMarkers.keyValue(i);
			if (markerNameOrObjectNames && curMarker) {
				if(markerNameOrObjectNames instanceof Array){
					if(checkInArrayExists(curMarker.comment, markerNameOrObjectNames)){
						if(!doNotRemoveIfExists){
							if(doNotTouchLengthMarker && curMarker.duration){
								
							}else{
								getMarkers.removeKey(i);
							}

						}else{
							returnIfExistsMarker = true;
						}
					}
				}else{
					if (curMarker.comment == markerNameOrObjectNames) {
						if(!doNotRemoveIfExists){
							if(doNotTouchLengthMarker && curMarker.duration){
								
							}else{
								getMarkers.removeKey(i);
							}
						}else{
							returnIfExistsMarker = true;
						}
					}
				}
			}
		}
	}
	return returnIfExistsMarker;
}

function getMarkerTimes(layer, cursorTime, byName) {
	var returnLastTime = [];
	var sameCursorTime = false;
	var getMarkers = layer.property("Marker");
	if (getMarkers.numKeys > 0) {
		for (var i = 1; getMarkers.numKeys >= i; i++) {
			if (byName) {
				var curMarker = getMarkers.keyValue(i);
				if (curMarker.comment == byName) {
					var markerTime = getMarkers.keyTime(i);
					returnLastTime.push(markerTime);
					if (cursorTime == markerTime) {
						sameCursorTime = true;
					}
				}
			}
		}
	}
	return { 'arr': returnLastTime, 'same': sameCursorTime };
}

function removeSpecifiedEffects(layer, indexies) {
	for (var fx = layer.Effects.numProperties; fx >= 1; fx--) {
		if (indexies[fx]) {
			var curFx = layer.Effects(fx);
			if(curFx){
				curFx.remove();
			}
			
		}
	}
}

function moveAnchor(row, col, comp, ignoreMasks) {
	var curTime = comp.time;
	var theLayers = comp.selectedLayers;
	for (var num = 0; num < theLayers.length; num += 1) {
		var theLayer = theLayers[num];
		var noMasks = true;
		if (ignoreMasks === true) {
			noMasks = true
		} else {
			if (theLayer.mask.numProperties !== 0) {
				for (var i = 1; i <= theLayer.mask.numProperties; i += 1) {
					if (theLayer.mask(i).maskMode != MaskMode.NONE) {
						noMasks = false
					}
				}
			}
		}
		if (noMasks) {
			switch (row) {
				case 0:
					x = 0;
					break;
				case 1:
					x = theLayer
						.sourceRectAtTime(curTime, false)
						.width / 2;
					break;
				case 2:
					x = theLayer
						.sourceRectAtTime(curTime, false)
						.width;
					break;
				default:

			}
			switch (col) {
				case 0:
					y = 0;
					break;
				case 1:
					y = theLayer
						.sourceRectAtTime(curTime, false)
						.height / 2;
					break;
				case 2:
					y = theLayer
						.sourceRectAtTime(curTime, false)
						.height;
					break;
				default:

			}
			if (theLayer instanceof TextLayer || theLayer instanceof ShapeLayer) {
				x += theLayer
					.sourceRectAtTime(curTime, false)
					.left;
				y += theLayer
					.sourceRectAtTime(curTime, false)
					.top;
			}
		} else {
			var xBounds = Array();
			var yBounds = Array();
			var numMasks = theLayer.mask.numProperties;
			for (var f = 1; f <= numMasks; f += 1) {
				var numVerts = theLayer
					.mask(f)
					.maskShape
					.value
					.vertices
					.length;
				if (theLayer.mask(f).maskMode == MaskMode.NONE) {
					continue;
				}
				for (var j = 0; j < numVerts; j += 1) {
					var curVerts = theLayer
						.mask(f)
						.maskShape
						.valueAtTime(curTime, false)
						.vertices[j];
					xBounds.push(curVerts[0]);
					yBounds.push(curVerts[1]);
				}
			}
			xBounds
				.sort(function (a, b) {
					return a - b;
				});
			yBounds.sort(function (a, b) {
				return a - b;
			});
			var xl = xBounds.shift();
			var xh = xBounds.pop();
			var yl = yBounds.shift();
			var yh = yBounds.pop();
			if (theLayer instanceof TextLayer || theLayer instanceof ShapeLayer) {
				var xl2 = theLayer
					.sourceRectAtTime(curTime, false)
					.left;
				var xh2 = xl2 + theLayer
					.sourceRectAtTime(curTime, false)
					.width;
				var yl2 = theLayer
					.sourceRectAtTime(curTime, false)
					.top;
				var yh2 = yl2 + theLayer
					.sourceRectAtTime(curTime, false)
					.height;
				if (xl < xl2) {
					xl = xl2
				}
				if (xh > xh2) {
					xh = xh2
				}
				if (yl < yl2) {
					yl = yl2
				}
				if (yh > yh2) {
					yh = yh2
				}
			}
			switch (row) {
				case 0:
					x = xl;
					break;
				case 1:
					x = xl + ((xh - xl) / 2);
					break;
				case 2:
					x = xh;
					break;
				default:

			}
			switch (col) {
				case 0:
					y = yl;
					break;
				case 1:
					y = yl + ((yh - yl) / 2);
					break;
				case 2:
					y = yh;
					break;
				default:

			}
		}
		if (theLayer.anchorPoint.isTimeVarying) {
			var theComp = app.project.activeItem;
			theLayer
				.anchorPoint
				.setValueAtTime(theComp.time, [x, y]);
		} else {
			var curAnchor = theLayer.anchorPoint.value;
			var xMove = (x - curAnchor[0]) * (theLayer.scale.value[0] / 100);
			var yMove = (y - curAnchor[1]) * (theLayer.scale.value[1] / 100);
			var posEx = false;
			if (theLayer.position.expressionEnabled) {
				theLayer.position.expressionEnabled = false;
				posEx = true;
			}
			var dupLayer = theLayer.duplicate();
			var oldParent = theLayer.parent;
			dupLayer.moveToEnd();
			if (dupLayer.scale.isTimeVarying) {
				dupLayer
					.scale
					.setValueAtTime(app.project.activeItem.time, [100, 100])
			} else {
				dupLayer
					.scale
					.setValue([100, 100])
			}
			theLayer.parent = dupLayer;
			theLayer
				.anchorPoint
				.setValue([x, y]);
			if (theLayer.position.isTimeVarying) {
				var numKeys = theLayer.position.numKeys;
				for (var k = 1; k <= numKeys; k += 1) {
					curPos = theLayer
						.position
						.keyValue(k);
					curPos[0] += xMove;
					curPos[1] += yMove;
					theLayer
						.position
						.setValueAtKey(k, curPos);
				}
			} else {
				curPos = theLayer.position.value;
				theLayer
					.position
					.setValue([
						curPos[0] + xMove,
						curPos[1] + yMove,
						curPos[2]
					]);
			}
			theLayer.parent = oldParent;
			if (posEx) {
				theLayer.position.expressionEnabled = true
			}
			dupLayer.remove();
		}
	}
}






//#region CREATE MARKERS


function createMassMarkers(comp, from) {
	app.beginUndoGroup("Spunkram - Add the markers");

	try {
		for (var layerId = comp.selectedLayers.length - 1; layerId >= 0; layerId--) {
			var curLayer = comp.selectedLayers[layerId];
			if (from == 'add_in_marker') {
				addMarkerForIn(curLayer, comp);
			}
			if (from == 'add_in_marker_plus'){
				addMarkerForInPlus(curLayer, comp);
			}
			if (from == 'add_middle_marker') {
				addMarkerForMiddle(curLayer, comp);
			}
			if (from == 'add_out_marker') {
				addMarkerForOut(curLayer, comp);
			}
		}
	} catch (error) {
		alert(error);
	}
	app.endUndoGroup(); //ending our undo group
}

/**
 * Add Middle marker (with difference 1 seconds if same cursor timing, or after last MIDDLE marker with same 1 sec different)
 * @param {Object} curLayer Selected Layer
 * @param {Object} comp Active Composition
 * @param {Integer|null} customMarkerTime Custom Marker Time (default used cursor time)
 */
function addMarkerForMiddle(curLayer, comp, customMarkerTime){
	var markerTime = comp.time;
	var lastMarkerTime = getMarkerTimes(curLayer, comp.time, markerNames['MID']);
	var markerArr = lastMarkerTime.arr;
	var markerSameTime = lastMarkerTime.same;
	if (markerArr.length > 0) {
		if (Math.abs(comp.time - markerArr[0]) < 1 || Math.abs(comp.time - markerArr[markerArr.length]) < 1 || markerSameTime) {
			markerTime = markerArr[markerArr.length - 1] + 1;
		}
	}
	createMarkerPm(curLayer, markerNames['MID'], customMarkerTime ? customMarkerTime : markerTime, 11, 1);
}

/**
 * Add OUT marker (remove previous marker if exists, and set a new one on the current cursor time)
 * @param {Object} curLayer Selected Layer
 * @param {Object} comp Active Composition
 * @param {Integer|null} customMarkerTime Custom Marker Time (default used cursor time)
 */
function addMarkerForOut(curLayer, comp, customMarkerTime){
	var existsMarker = markerExistsOrRemove(curLayer, markerNames['OUT'], customMarkerTime);
	if(!existsMarker){createMarkerPm(curLayer, markerNames['OUT'], customMarkerTime ? curLayer.outPoint - customMarkerTime : comp.time, 1);}
}
/**
 * Add IN marker (remove previous marker if exists, and set a new one on the current cursor time)
 * @param {Object} curLayer Selected Layer
 * @param {Object} comp Active Composition
 * @param {Integer|null} customMarkerTime Custom Marker Time (default used cursor time)
 */
function addMarkerForIn(curLayer, comp, customMarkerTime){
	var existsMarker = markerExistsOrRemove(curLayer, markerNames['IN'], customMarkerTime, true);
	if(!existsMarker){createMarkerPm(curLayer, markerNames['IN'], customMarkerTime ? curLayer.inPoint + customMarkerTime : comp.time, 9);}
}
/**
 * Add IN+ length marker (do not remove previous marker)
 * @param {Object} curLayer Selected Layer
 * @param {Object} comp Active Composition
 * @param {Integer|null} customMarkerTime Custom Marker Time (default used cursor time)
 */
 function addMarkerForInPlus(curLayer, comp, customMarkerTime){
	createMarkerPm(curLayer, markerNames['IN'], customMarkerTime ? curLayer.inPoint + customMarkerTime : comp.time, 2, 1)
}

//#endregion