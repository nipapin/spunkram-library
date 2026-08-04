$._AtomExt_aeTextPresets = {

    removePreset: function(select_type, number_preset){
		var comp = app.project.activeItem;
		if(!(comp) || !(comp instanceof CompItem)){return "COMP";}
		var layer = comp.selectedLayers[0];
		if(!layer || !(layer instanceof TextLayer)){return "TEXT_LAYER";}

		app.beginUndoGroup("Atom - Removing Text Preset");
			//CODE BEGIN


			switch(select_type){
				case "IN":case "OUT": 

					var get_exist_presets_str = '';
					getAndRemoveTextPreset(layer, select_type, number_preset);//remove animators/masks
					var get_marker_data = getAndRemoveMarker(layer, select_type, true, number_preset);

					if(get_marker_data){
						var marker_arr_presets = get_marker_data[select_type][0];
						if(number_preset){
							get_exist_presets_str = markerEachPresets("COLLECT_STRING_REMOVE", marker_arr_presets, number_preset);//get string from marker pieces old
						}
						
						var get_old_time_markers = get_marker_data[select_type][1];//set time as old marker

						//create new marker for mix mode (removing preset from multiple presets in alone marker)
						if(get_exist_presets_str && get_exist_presets_str != number_preset){
							createMarker(layer, select_type, select_type, get_old_time_markers, get_exist_presets_str);
						}
						
						
					}
					break;
				case "BOTH":
					//animators
					getAndRemoveTextPreset(layer, 'IN', number_preset);//remove animators/masks
					getAndRemoveTextPreset(layer, 'OUT', number_preset);//remove animators/masks
					//markers
					getAndRemoveMarker(layer, 'IN', false, number_preset);
					getAndRemoveMarker(layer, 'OUT', false, number_preset);
					//masks
					//getAndRemoveMask(layer, true);
					break;
			}
			//CODE END
		app.endUndoGroup();
    },

    getPreset: function(){
		var comp = app.project.activeItem;
		if(!(comp) || !(comp instanceof CompItem)){return "COMP";}
		var layer = comp.selectedLayers[0];
		if(!layer || !(layer instanceof TextLayer)){return "TEXT_LAYER";}

		//getAndRemoveTextPreset(layer);
		return getAndRemoveMarker(layer);

    },

    applyAndReplacePreset: function(select_type, preset_id, preset_line, use_mix_mode){
		var comp = app.project.activeItem;
		if(!(comp) || !(comp instanceof CompItem)){return "COMP";}
		var layer = comp.selectedLayers[0];
		if(!layer || !(layer instanceof TextLayer)){return "TEXT_LAYER";}

		app.beginUndoGroup("Atom - Applying Text Preset");
			//CODE BEGIN

			//MIX SETS
			var mix_mode_preset_id = '';
			if(use_mix_mode){mix_mode_preset_id = preset_id;}

			switch(select_type){
				case "IN":case "OUT": 


					var get_old_time_markers = '', get_exist_presets_str = '';
					getAndRemoveTextPreset(layer, select_type, mix_mode_preset_id);//remove animator by type
					var get_marker_data = getAndRemoveMarker(layer, select_type, true, mix_mode_preset_id);

					if(get_marker_data){
						if(use_mix_mode){
							get_exist_presets_str = markerEachPresets("COLLECT_STRING_SET", get_marker_data[select_type][0], mix_mode_preset_id);//get string from marker pieces old
						}
						
						get_old_time_markers = get_marker_data[select_type][1];//set time as old marker
					}

					createTextPreset(layer, select_type, preset_id, get_old_time_markers, preset_line, get_exist_presets_str);//apply text preset
					
					break;
				case "BOTH":

					var get_old_time_markers_IN = '', get_old_time_markers_OUT = '', get_exist_presets_str_IN = '', get_exist_presets_str_OUT = '';

					getAndRemoveTextPreset(layer, 'IN', mix_mode_preset_id);//remove animator by type
					getAndRemoveTextPreset(layer, 'OUT', mix_mode_preset_id);//remove animator by type

					var get_marker_data_IN = getAndRemoveMarker(layer, 'IN', true, mix_mode_preset_id);
					var get_marker_data_OUT = getAndRemoveMarker(layer, 'OUT', true, mix_mode_preset_id);

					if(get_marker_data_IN){
						if(use_mix_mode){
							get_exist_presets_str_IN = markerEachPresets("COLLECT_STRING_SET", get_marker_data_IN["IN"][0], mix_mode_preset_id);//get string from marker pieces old
						}
						
						get_old_time_markers_IN = get_marker_data_IN["IN"][1];//set time as old marker
					}

					if(get_marker_data_OUT){
						if(use_mix_mode){
							get_exist_presets_str_OUT = markerEachPresets("COLLECT_STRING_SET", get_marker_data_OUT["OUT"][0], mix_mode_preset_id);//get string from marker pieces old
						}
						
						get_old_time_markers_OUT = get_marker_data_OUT["OUT"][1];//set time as old marker
					}

					//getAndRemoveMask(layer, true);

					createTextPreset(layer, 'IN', preset_id, get_old_time_markers_IN, preset_line, get_exist_presets_str_IN);//apply text preset
					createTextPreset(layer, 'OUT', preset_id, get_old_time_markers_OUT, preset_line, get_exist_presets_str_OUT);//apply text preset
					break;
			}

			//collapse groups
			layer.Text.property("Source Text").selected = true;
			if(layer.Text.property("Source Text").selected == true){
				var numCommand = 2771; //Reveal All Modified Properties
				app.executeCommand(numCommand);
				app.executeCommand(numCommand);
				layer.Text.property("Source Text").selected = false;
			}
			//CODE END
		app.endUndoGroup();
    }
};

		var dChar = ["@", ":", ",", "*", "|", "#"];
		var closedChars = ["{", "}"];
		var dLine = ["~NEXT_ANIMATOR:", "@ANIMATOR_PROPERTIES~", "@ANIMATOR_SELECTOR~", "~TEXT_PATH_OPTIONS:", "~TEXT_MORE_OPTIONS:", "~MASKS_SETS:"];

		var animatorDChar = ["[", "]"];

		var constName_animator = "AtomAnimator_";
		var constName_selector = "AtomSelector_";
		var constName_mask = "AtomTextMask_main";

		var markerName_chapter_split_devider = "|";
		var markerName_cuePointName = "ATOM_EXTENSION_BY_ANIOM";
		var markerName_frameTarget = "_TEXT_PRESETS";


		//selectors matchnames
		var selector_base_range = [
			'ADBE Text Percent Start', //Start
			'ADBE Text Percent End', //End
			'ADBE Text Percent Offset', //Offset

			'ADBE Text Range Units', //Units
			'ADBE Text Range Type2', //Based On
			'ADBE Text Selector Mode', //Mode
			'ADBE Text Selector Max Amount', //Amount
			'ADBE Text Range Shape', //Shape
			'ADBE Text Selector Smoothness', //Smoothness
			'ADBE Text Levels Max Ease', //Ease High
			'ADBE Text Levels Min Ease', //Ease Low
			'ADBE Text Randomize Order', //Randomize Order
			'ADBE Text Random Seed' //Random Seed
		];

		var selector_base_expressible = [
			'ADBE Text Expressible Amount', //Amount
			'ADBE Text Range Type2' //Based On
		];

		var selector_base_wiggly = [
			'ADBE Text Wiggly Min Amount', //Min Amount
			'ADBE Text Wiggly Random Seed', //Random Seed
			'ADBE Text Wiggly Lock Dim', //Lock Dimensions
			'ADBE Text Selector Mode', //Mode
			'ADBE Text Temporal Freq', //Wiggles/Second
			'ADBE Text Wiggly Max Amount', //Max Amount
			'ADBE Text Range Type2', //Based On
			'ADBE Text Spatial Phase', //Spatial Phase
			'ADBE Text Character Correlation', //Correlation
			'ADBE Text Temporal Phase' //Temporal Phase
		];

		//text options matchnames
		var text_path_options = [
			'ADBE Text Path', //Path
			'ADBE Text Reverse Path', //Reverse Path
			'ADBE Text Perpendicular To Path', //Perpendicular To Path
			'ADBE Text Force Align Path', //Force Alignment
			'ADBE Text First Margin', //First Margin
			'ADBE Text Last Margin', //Last Margin
		];

		var text_more_options = [
			'ADBE Text Anchor Point Option', //Anchor Point Grouping
			'ADBE Text Anchor Point Align', //Grouping Alignment
			'ADBE Text Render Order', //Fill & Stroke
			'ADBE Text Character Blend Mode', //Inter-Character Blending
		];

		var text_masks_args = [
			"vertices",
			"inTangents",
			"outTangents",
			"closed"
		];



		//MAIN
		//MARKERS
		function createMarker(currentLayer, marker_anim_type, marker_effc_name, marker_effc_time, preset_number){
			var setValueAtTime_pointer;
			if(marker_anim_type == "IN"){setValueAtTime_pointer = currentLayer.inPoint + marker_effc_time;} //IN
			if(marker_anim_type == "OUT"){setValueAtTime_pointer = currentLayer.outPoint - marker_effc_time;} //OUT

			var chapterPresetInfo = preset_number + markerName_chapter_split_devider + marker_anim_type; //format: 235|IN - num

			var newMarker = new MarkerValue(marker_effc_name, chapterPresetInfo ,"http://aniom.net", markerName_frameTarget, markerName_cuePointName);

			currentLayer.marker.setValueAtTime(setValueAtTime_pointer, newMarker);
		}

		function markerEachPresets(type, data, number_preset){
			var devider_presets_mix = ",";


			if(type == "SPLIT_OBJECT"){
				var arr_presets = new Object();

				if(data.indexOf(devider_presets_mix) != -1){
					for(var num = 0; data.split(devider_presets_mix)[num]; num++){

						var preset_num_this = data.split(devider_presets_mix)[num];
						if(number_preset != preset_num_this){
							arr_presets[preset_num_this] = true;
						}
						
					}
				}else{
					//if no splits - only one preset
					arr_presets[data] = true;
				}

				return arr_presets;
			}

			if(type == "COLLECT_STRING_SET"){
				var temp_arr_presets = [];


				for(each_preset in data){
					temp_arr_presets[temp_arr_presets.length] = each_preset;
				}

				if(number_preset){
					temp_arr_presets[temp_arr_presets.length] = number_preset;
				}



				return temp_arr_presets.join(devider_presets_mix);
			}

			if(type == "COLLECT_STRING_REMOVE"){
				var temp_arr_presets = [];

				for(each_preset in data){
					temp_arr_presets[temp_arr_presets.length] = each_preset;
				}

				return temp_arr_presets.join(devider_presets_mix);

			}
		}

		function getAndRemoveMarker(currentLayer, remove_type, return_relative_time, number_preset){
			var returnData = new Object();
			var cMarker = currentLayer.marker;
			for(var i = cMarker.numKeys; i >= 1; i--){
				var currentMarker_Value = cMarker.keyValue(i);
				var currentMarker_Time = cMarker.keyTime(i);

				//if our markers
				if(currentMarker_Value.cuePointName == markerName_cuePointName && currentMarker_Value.frameTarget == markerName_frameTarget){
					var num_preset = currentMarker_Value.chapter.toString().split(markerName_chapter_split_devider)[0];
					var type_preset = currentMarker_Value.chapter.toString().split(markerName_chapter_split_devider)[1];

					var num_preset_array = markerEachPresets("SPLIT_OBJECT", num_preset, number_preset);

					if(return_relative_time){
						if(remove_type == "IN"){currentMarker_Time = currentMarker_Time - currentLayer.inPoint;}
						if(remove_type == "OUT"){currentMarker_Time = currentLayer.outPoint - currentMarker_Time;}
					}

					if(remove_type){
						if(remove_type == type_preset){
							returnData[type_preset] = [num_preset_array, currentMarker_Time];//save old info about deleted

							cMarker.removeKey(i);
						}
					}else{

						returnData[type_preset] = [num_preset_array, currentMarker_Time];//save info about all our markers
					}
				}
			}

			if(remove_type){
				if(returnData[remove_type]){
					return returnData;
				}
			}else{
				return returnData;
			}

/*			if(returnData[remove_type]){ //returnData[remove_type]
				return returnData;
			}else{
				return false;
			}*/
			
		}


		function getAndRemoveMask(layer, remove_masks){
			var masks = layer("Masks");

			var mask_data = '';
			//masks
			for(var mask_i = masks.numProperties; mask_i >= 1; mask_i--){
				var cur_mask = masks(mask_i);

				mask_data = cur_mask.name;

				if(remove_masks){
					if(cur_mask.name == constName_mask){
						cur_mask.remove();
					}
				}
			}
			

			return mask_data;
		}


		function getAndRemoveTextPreset(layer, animation_type_remove, preset_number){

			var grpText = layer("Text");
			var grpAnimator = grpText("Animators");

			var arr_animators_used = new Object();

			//animators
			for(var animator_cycle = grpAnimator.numProperties; animator_cycle >= 1; animator_cycle--){
				var cuAnimator = grpAnimator(animator_cycle);//current animator

				if(cuAnimator.name.toString().indexOf(constName_animator) != -1){
					var get_params = animatorNameCompact("SPLIT", cuAnimator.name);

					var animator_name = get_params[0];//cuAnimator.name.toString().split(animatorDChar[0])[0].split(animatorDChar[1])[0]; //animator name without type
					var animator_type = get_params[1];//cuAnimator.name.toString().split(animatorDChar[0])[1].split(animatorDChar[1])[0]; //animator type
					var animator_number_preset = get_params[2];

					//get animators by types
					if(animator_type == "IN"){arr_animators_used[animator_type] = true;}
					if(animator_type == "OUT"){arr_animators_used[animator_type] = true;}

					if(animation_type_remove){
						//remove animators
						if(animator_type == animation_type_remove){
							if(preset_number){//if preset number need
								if(animator_number_preset == preset_number){
									cuAnimator.remove();
								}
							}else{
								cuAnimator.remove();
							}
						}
					}
				}
			}

			return arr_animators_used;
		}

		function animatorNameCompact(type, arguments_){

			var devider_ = "-";

			if(type == "CREATE"){
				var index_num = arguments_[0];
				var animation_type = arguments_[1];
				var number_preset = arguments_[2];

				return constName_animator + index_num + animatorDChar[0] + animation_type + animatorDChar[1] + devider_ + number_preset;
			}

			if(type == "SPLIT"){
				var global_devider_main = arguments_.toString().split(devider_)[0];

				var animator_number_preset = arguments_.toString().split(devider_)[1];
				var animator_name = global_devider_main.split(animatorDChar[0])[0].split(animatorDChar[1])[0]; //animator name without type
				var animator_type = global_devider_main.split(animatorDChar[0])[1].split(animatorDChar[1])[0]; //animator type

				return [animator_name, animator_type, animator_number_preset];
			}
		}


		function createTextPreset(layer, animation_type, number_preset, marker_time, preset_line_as_string, custom_marker_preset_value){
			var masks = layer("Masks");
			var grpText = layer("Text");
			var grpPathOptions = grpText("Path Options");
			var grpMoreOptions = grpText("More Options");
			var grpAnimator = grpText("Animators");

			//add marker pointer to control time
			//def data inPoint/outPoint
			if(!marker_time){marker_time = 1.35;}

			var set_marker_preset_id = custom_marker_preset_value ? custom_marker_preset_value : number_preset;
			createMarker(layer, animation_type, animation_type, marker_time, set_marker_preset_id);


			//LINES BY PRESETS

				var thisPresetLine = preset_line_as_string;//preset line

				var dimension = thisPresetLine.split(dLine[0])[0];//2D/3D

				//3D Per Char - 2D/3D
				if(dimension == '3D'){
					layer.threeDPerChar = true;
				}else{
					//layer.threeDPerChar = false;
					//not OFF threeD, only ON
				}

				var animator_path_options = '', anim_masks = '';

				//Alone Path Options
				if(thisPresetLine.indexOf(dLine[3]) != -1){animator_path_options = thisPresetLine.split(dLine[3])[1];}

				//Alone Mask Sets
				if(thisPresetLine.indexOf(dLine[5]) != -1){anim_masks = thisPresetLine.split(dLine[5])[1];}

				//Path Options and Mask Sets
				if((thisPresetLine.indexOf(dLine[3]) != -1) && (thisPresetLine.indexOf(dLine[5]) != -1)){//find Masks and Path Options properties
					animator_path_options = thisPresetLine.split(dLine[3])[1].split(dLine[5])[0];//Path Options
					anim_masks = thisPresetLine.split(dLine[3])[1].split(dLine[5])[1];//Mask Sets
				}

				//ANIMATORS
				//by All Animators
				for(var anim_i = 1; thisPresetLine.split(dLine[0])[anim_i]; anim_i++){
					var animator = thisPresetLine.split(dLine[0])[anim_i]; //Current Animator
						var _b_animator_selectors = animator.split(dLine[1])[0]; //Animator Selectors
						var _s_animator_global = animator.split(dLine[1])[1]; //Properties/Path Options/Masks

					var animator_properties = _s_animator_global.split(dLine[3])[0].split(dLine[5])[0];

					var animators = grpAnimator.addProperty("ADBE Text Animator"); //add animator
						//animators.name = constName_animator + anim_i + animatorDChar[0]+animation_type+animatorDChar[1];
						animators.name = animatorNameCompact("CREATE", [anim_i, animation_type, number_preset]);

					//SELECTORS
					//by All Selectors
					for(var sel_i = 1; _b_animator_selectors.split(dLine[2])[sel_i]; sel_i++){
						
						var selector = _b_animator_selectors.split(dLine[2])[sel_i]; //Current Selector
						var selector_type = selector.split(dChar[0])[0];
						var selector_options = selector.split(dChar[0])[1];

						var _addAnimatorSelector = animators.Selectors.addProperty(selector_type);//add selector
							_addAnimatorSelector.name = constName_selector + sel_i;

						//SELECTOR OPTIONS
						//by Selector Properties
						for(var selOpt_i = 0; selector_options.split(dChar[3])[selOpt_i]; selOpt_i++){
							var one_sel_option = selector_options.split(dChar[3])[selOpt_i];
							var one_sel_opt_name = one_sel_option.split(dChar[1])[0];
							var one_sel_opt_value = one_sel_option.split(dChar[1])[1];

							setAnimation_Expressions(_addAnimatorSelector, one_sel_opt_name, one_sel_opt_value, selector_type, animation_type);//add options for selector
						}

						//HERE ACT WITH SELECTORS
						//ADD PROPERTY WITH type SELECTOR AND options
					}
					
					//PROPERTIES
					//by Animator Properties
					for(var prop_i = 0; animator_properties.split(dChar[3])[prop_i]; prop_i++){

						var one_property = animator_properties.split(dChar[3])[prop_i];
						var one_prop_name = one_property.split(dChar[1])[0];
						var one_prop_value = one_property.split(dChar[1])[1];

						var _addAnimatorProperty = animators.Properties.addProperty(one_prop_name);//add property to animator
						setAnimation_Expressions(_addAnimatorProperty, one_prop_name, one_prop_value, "already_added_property", animation_type);

						//HERE ACT WITH PROPERTIES
						//ADD PROPERTY WITH name AND values
					}
				}

				//outside Animators

				//MASKS (should be before Path Options)
				//work with masks if mask enabled
				if(anim_masks){
					//check exist our mask
					for(var mask_i = 1; masks.numProperties >= mask_i; mask_i++){
						var curMaskProp = masks(mask_i);
						if(curMaskProp.name == constName_mask){
							curMaskProp.remove();//remove if found other mask
						}
					}

					var create_new_mask = true;
					if(create_new_mask){
						var _addMask = masks.addProperty("ADBE Mask Atom");
							_addMask.name = constName_mask;
						setAnimationMask_Keyframes(anim_masks, _addMask.property("Mask Path"));
					}
				}


				//PATH OPTIONS
				//by Path Options Properties
				if(animator_path_options){
					for(var po_i = 0; animator_path_options.split(dChar[3])[po_i]; po_i++){
						var path_option_property = animator_path_options.split(dChar[3])[po_i];
						var path_option_property_name = path_option_property.split(dChar[1])[0];
						var path_option_property_value = path_option_property.split(dChar[1])[1];

						setAnimation_Expressions(grpPathOptions, path_option_property_name, path_option_property_value, "", animation_type);
					}
				}
		}


		function setAnimation_Expressions(layer_obj, line_name, line_val, command_line, animation_type){
			var lo_obj_current = ''; //global property object
			var arr_datas = [];
			var arr_times = [];
			var arr_names = '';

			var an_out_is = false;

			switch(command_line){
				case "ADBE Text Selector":
					if(line_name != selector_base_range[0] && line_name != selector_base_range[1] && line_name != selector_base_range[2]){
						lo_obj_current = layer_obj.property("ADBE Text Range Advanced").property(line_name);

					}else{
						lo_obj_current = layer_obj.property(line_name);
					}
					break;
				case "already_added_property":
					lo_obj_current = layer_obj;
					break;
				default: lo_obj_current = layer_obj.property(line_name);
			}

			for(var skey_f = 0; line_val.split(dChar[5])[skey_f]; skey_f++){
				var global_c_line = line_val.split(dChar[5])[skey_f];

				var checkWhatToSet = checkSetValues(global_c_line);
				if(checkWhatToSet instanceof Array){
					var convertToSet = convertValue_toPropertyValueType(checkWhatToSet[1]);
					arr_datas[arr_datas.length] = convertToSet;
					arr_times[arr_times.length] = checkWhatToSet[0];
					arr_names = line_name;

				}else{
					//without animations
					var convertToSet = convertValue_toPropertyValueType(checkWhatToSet);
					lo_obj_current.setValue(convertToSet);
				}
			}

			//add expression
			if(lo_obj_current.canSetExpression && lo_obj_current.propertyType === PropertyType.PROPERTY && arr_names == line_name){
				var default_val = arr_datas[arr_datas.length-1];
				var in_val = arr_datas[0];
				var time_stamp_start = arr_times[0];
				var time_stamp_end = arr_times[arr_times.length-1];

				lo_obj_current.expression = generateExpression_toMarkers(animation_type, default_val, in_val, default_val, time_stamp_start, time_stamp_end);
			}
			
		}

		function generateExpression_toMarkers(get_type, default_val, in_val, out_val, time_start, time_end){

			////TIME CONTENT
			//created variables for content timing

			var inTime_int1 = time_start, inTime_int2 = time_end+'/2.35';//numbers
			var inTime_head1 = 'inPoint', inTime_head2 = 'marker.key(activeIn).time';

			var outTime_int1 = time_start, outTime_int2 = time_end+'/2.35';//numbers
			var outTime_head1 = 'marker.key(activeOut).time', outTime_head2 = 'outPoint';
			
			//connected to marker (set time_end to 1 as max value for sample)
			if(time_end >= 1){
				time_end = 1;
				inTime_int2 = 0;
				outTime_int1 = 0;

				//out animation to up one frame - faster
				outTime_int2 = 0.06;
			}

			//between inPoint and Marker (stretch)
			if(time_start != 0 && time_end != 1){
				inTime_int2 = time_end;
				outTime_int2 = time_end;
			}

			if(time_start > 0 && time_end > 0){
				outTime_int1 = -time_start;//+'/-2';
			}
			////END TIME CONTENT



			//convert values to expession sets (number to number, scale to [x,y,z] and etc...)
			default_val = convertValue_toPropertyValueType(default_val, "exp_any_prop").toString();
			in_val = convertValue_toPropertyValueType(in_val, "exp_any_prop").toString();
			out_val = convertValue_toPropertyValueType(out_val, "exp_any_prop").toString();


			//prepare expression to connect
			var genExp_return = '//GENERATED VIA ATOM EXTENSION BY ANIOM\n';

			genExp_return += "try{"; //try

				//main checks - get markers
				genExp_return += 'activeIn = 0;activeOut = 0;';
				genExp_return += 'mcpn = "'+markerName_cuePointName+'";';
				genExp_return += 'for(var i = 1; i <= marker.numKeys; i++){';
				genExp_return += 'if(marker.key(i).comment == "IN" && marker.key(i).cuePointName == mcpn){activeIn = i;}';
				genExp_return += 'if(marker.key(i).comment == "OUT" && marker.key(i).cuePointName == mcpn){activeOut = i;}';
				genExp_return += '}';

				genExp_return += '\n';//add header of exp
				if(get_type == "IN"){
					genExp_return += 'inTime_int1 = '+ inTime_int1 +';';
					genExp_return += 'inTime_int2 = '+ inTime_int2 +';';
					genExp_return += 'if(activeIn){linear(time, ('+inTime_head1+'+inTime_int1), ('+inTime_head2+'-inTime_int2), '+in_val+', '+out_val+');}else{'+default_val+'}';
				}else if(get_type == "OUT"){
					genExp_return += 'outTime_int1 = '+ outTime_int1 +';';
					genExp_return += 'outTime_int2 = '+ outTime_int2 +';';
					genExp_return += 'if(activeOut){linear(time, ('+outTime_head1+'-outTime_int1), ('+outTime_head2+'-outTime_int2), '+out_val+', '+in_val+');}else{'+default_val+'}';
				}

			genExp_return += "}catch(ex){}"; //catch

			return genExp_return;
			
		}

		function checkMaskProp_getKeyframes(here_obj_chars){


			var opt_name = here_obj_chars.split(dChar[1])[0];
			var opt_value = here_obj_chars.split(dChar[1])[1];
				var opt_value_prepared = opt_value.split(closedChars[0])[1].split(closedChars[1])[0];//without { }

			//give parameters for each property of mask
			var arr_times = [];
			var arr_val_data = []

			for(var skey_f = 0; opt_value_prepared.split(dChar[5])[skey_f]; skey_f++){
				var global_c_line = opt_value_prepared.split(dChar[5])[skey_f];

				var checkWhatToSet = checkSetValues(global_c_line);
				if(checkWhatToSet instanceof Array){
					//time & value
					arr_times[arr_times.length] = checkWhatToSet[0];
					arr_val_data[arr_val_data.length] = checkWhatToSet[1];
					
				}else{
					arr_val_data[arr_val_data.length] = checkWhatToSet;
				}

			}

			return [arr_times, arr_val_data];
		}


		function setAnimationMask_Keyframes(prop_mask, mask_obj){

			
			var mVertices = checkMaskProp_getKeyframes(prop_mask.split(dChar[3])[0]);
			var mInTangents = checkMaskProp_getKeyframes(prop_mask.split(dChar[3])[1]);
			var mOutTangents = checkMaskProp_getKeyframes(prop_mask.split(dChar[3])[2]);
			var mClosed = checkMaskProp_getKeyframes(prop_mask.split(dChar[3])[3]);



			var cVerLength = mVertices[0].length;

			if(cVerLength > 0){
				for(var b = 0; cVerLength-1 >= b; b++){

					var tempShapeObj = new Shape();
					tempShapeObj.vertices = convertMaskData_toArrEvals(mVertices[1][b]);
					tempShapeObj.inTangents = convertMaskData_toArrEvals(mInTangents[1][b]);
					tempShapeObj.outTangents = convertMaskData_toArrEvals(mOutTangents[1][b]);
					tempShapeObj.closed = mClosed[1][b];

					mask_obj.setValueAtTime(mVertices[0][b], tempShapeObj);//add value Shape Mask
				}
			}else{

				var tempShapeObj = new Shape();
				tempShapeObj.vertices = convertMaskData_toArrEvals(mVertices[1]);
				tempShapeObj.inTangents = convertMaskData_toArrEvals(mInTangents[1]);
				tempShapeObj.outTangents = convertMaskData_toArrEvals(mOutTangents[1]);
				tempShapeObj.closed = mClosed[1];

				mask_obj.setValue(tempShapeObj);//add value Shape Mask
			}
		}

		function convertValue_toPropertyValueType(enter, command){
			//hacks - bad variant
			var return_val = '';
			//value if alone set as NUMBER, not STRING
			if(isNaN(Number(enter)) == false){
				return_val = Number(enter);
			}else{
				switch(command){
					case "exp_any_prop":
						return_val = "["+enter.toString()+"]";
						break;
					default:
						return_val = eval("["+enter.toString()+"]");
				}
			}

			return return_val;
		}

		function convertMaskData_toArrEvals(enter){
			return eval("["+enter.toString()+"]");
		}

		function checkSetValues(data){
			//setValuesAtTimes
			if(data.indexOf(dChar[4]) != -1){
				var get_value = data.split(dChar[4])[0];
				var get_time = data.split(dChar[4])[1];

				return [get_time, get_value];
			}else{
				//default setValue
				return data;
			}
		}