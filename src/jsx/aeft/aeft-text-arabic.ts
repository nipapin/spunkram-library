/**
 * Arabic text shaping for AE composer — port of legacy `additional.jsx`.
 * @ts-nocheck — legacy algorithm; replace when ae_composer is ported (phase 6).
 */

//#region ADDITIONAL PART OF SCRIPTS
var arabicEngine = new Object();

//Special characters
arabicEngine.spec_char = ['\n','\n\r',' ','-','.'];
//Left brackets
arabicEngine.left_brackets = ['(','{','[','<','«'];
//Right brackets
arabicEngine.right_brackets = [')','}',']','>','»'];
//arabicEngine.tashkeel
arabicEngine.tashkeel = ['َ','ً','ِ','ٍ','ُ','ٌ','ّ'];
//
arabicEngine.noncon = ['ا','ة','د','ذ','ر','ز','و','ى','ؤ','ء','أ','إ','آ','ﮊ','ﭐ','ﮂ','ﮄ','ﮈ','ﮆ','ﮊ','ﮌ','ﮞ','ﮤ','ﯠ','ﯢ','ﯗ','ﯙ','ﯛ','ﯞ','ﮮ','ﮰ','ﻵ','ﻷ','ﻹ','ﻻ'];
//Isolated form
arabicEngine.form_0 =  ['ا'     ,'ب'     ,'ة'     ,'ت'     ,'ث'	   ,'ج'     ,'ح'     ,'خ'     ,'د'     ,'ذ'     ,'ر'     ,'ز'     ,'س'     ,'ش'     ,'ص'     ,'ض'     ,'ط'     ,'ظ'     ,'ع'     ,'غ'     ,'ف'     ,'ق'     ,'ك'     ,'ل'     ,'م'     ,'ن'     ,'ه'     ,'و'     ,'ي'     ,'ى'     ,'ؤ'     ,'ئ'     ,'أ'     ,'إ'     ,'آ'     ,'ﭐ'     ,'پ'     ,'چ'     ,'ژ'     ,'گ'     ,'ی'     ,'ک'     ,'ﭦ'     ,'ﭞ'     ,'ﭒ'     ,'ﭖ'     ,'ﭢ'     ,'ﭚ'     ,'ﭲ'     ,'ﭶ'     ,'ﭺ'     ,'ﭾ'     ,'ﮈ'     ,'ﮄ'     ,'ﮂ'     ,'ﮆ'     ,'ﮌ'     ,'ﮊ'     ,'ﭪ'     ,'ﭮ'     ,'ﯓ'     ,'ﮒ'     ,'ﮚ'     ,'ﮖ'     ,'ﮞ'     ,'ﮠ'     ,'ﮪ'     ,'ﮤ'     ,'ﮦ'     ,'ﯠ'     ,'ﯙ'     ,'ﯗ'     ,'ﯛ'     ,'ﯢ'     ,'ﯞ'     ,'ﯼ'     ,'ﯤ'     ,'ﮮ'     ,'ﮰ'     ,'ﻵ'     ,'ﻷ'     ,'ﻹ'     ,'ﻻ'     ,'ـ'     ,'ء'     ];
//Final form
arabicEngine.form_1 =  ['\uFE8E','\uFE90','\uFE94','\uFE96','\uFE9A','\uFE9E','\uFEA2','\uFEA6','\uFEAA','\uFEAC','\uFEAE','\uFEB0','\uFEB2','\uFEB6','\uFEBA','\uFEBE','\uFEC2','\uFEC6','\uFECA','\uFECE','\uFED2','\uFED6','\uFEDA','\uFEDE','\uFEE2','\uFEE6','\uFEEA','\uFEEE','\uFEF2','\uFEF0','\uFE86','\uFE8A','\uFE84','\uFE88','\uFE82','\uFB51','\uFB57','\uFB7B','\uFB8B','\uFB93','\uFBFD','\uFB8F','\uFB67','\uFB5F','\uFB53','\uFB57','\uFB63','\uFB5B','\uFB73','\uFB77','\uFB7B','\uFB7F','\uFB89','\uFB85','\uFB83','\uFB87','\uFB8D','\uFB8B','\uFB6B','\uFB6F','\uFBD4','\uFB93','\uFB9B','\uFB97','\uFB9F','\uFBA1','\uFBAB','\uFBA5','\uFBA7','\uFBE1','\uFBDA','\uFBD8','\uFBDC','\uFBE3','\uFBDF','\uFBFD','\uFBE5','\uFBAF','\uFBB1','\uFEF6','\uFEF8','\uFEFA','\uFEFC','\u0640','\u0621'];
//Initial form
arabicEngine.form_2 =  ['\uFE8D','\uFE91','\uFE94','\uFE97','\uFE9B','\uFE9F','\uFEA3','\uFEA7','\uFEA9','\uFEAB','\uFEAD','\uFEAF','\uFEB3','\uFEB7','\uFEBB','\uFEBF','\uFEC3','\uFEC7','\uFECB','\uFECF','\uFED3','\uFED7','\uFEDB','\uFEDF','\uFEE3','\uFEE7','\uFEEB','\uFEED','\uFEF3','\uFEEF','\uFE85','\uFE8B','\uFE83','\uFE87','\uFE81','\uFB50','\uFB58','\uFB7C','\uFB8A','\uFB94','\uFBFE','\uFB90','\uFB68','\uFB60','\uFB54','\uFB58','\uFB64','\uFB5C','\uFB74','\uFB78','\uFB7C','\uFB80','\uFB88','\uFB84','\uFB82','\uFB86','\uFB8C','\uFB8A','\uFB6C','\uFB70','\uFBD5','\uFB94','\uFB9C','\uFB98','\uFB9E','\uFBA2','\uFBAC','\uFBA4','\uFBA8','\uFBE0','\uFBD9','\uFBD7','\uFBDB','\uFBE2','\uFBDE','\uFBFE','\uFBE6','\uFBAE','\uFBB0','\uFEF5','\uFEF7','\uFEF9','\uFEFB','\u0640','\u0621'];
//Medial form
arabicEngine.form_3 =  ['\uFE8E','\uFE92','\uFE94','\uFE98','\uFE9C','\uFEA0','\uFEA4','\uFEA8','\uFEAA','\uFEAC','\uFEAE','\uFEB0','\uFEB4','\uFEB8','\uFEBC','\uFEC0','\uFEC4','\uFEC8','\uFECC','\uFED0','\uFED4','\uFED8','\uFEDC','\uFEE0','\uFEE4','\uFEE8','\uFEEC','\uFEEE','\uFEF4','\uFEF0','\uFE86','\uFE8C','\uFE84','\uFE88','\uFE82','\uFB51','\uFB59','\uFB7D','\uFB8B','\uFB95','\uFBFF','\uFB91','\uFB69','\uFB61','\uFB55','\uFB59','\uFB65','\uFB5D','\uFB75','\uFB79','\uFB7D','\uFB81','\uFB89','\uFB85','\uFB83','\uFB87','\uFB8D','\uFB8B','\uFB6D','\uFB71','\uFBD6','\uFB95','\uFB9D','\uFB99','\uFB9F','\uFBA3','\uFBAD','\uFBA5','\uFBA9','\uFBE1','\uFBDA','\uFBD8','\uFBDC','\uFBE3','\uFBDF','\uFBFF','\uFBE7','\uFBAE','\uFBB1','\uFEF6','\uFEF8','\uFEFA','\uFEFC','\u0640','\u0621'];


arabicEngine.check_con = function(ch){
	var indx = false;
	for(m=0;m<arabicEngine.form_0.length;m++){
		if(ch==arabicEngine.form_0[m])
		indx=true;
	}
	for(k=0;k<arabicEngine.noncon.length;k++){
		if(ch==arabicEngine.noncon[k])
		indx=false;
	}
	return indx;
}

arabicEngine.tashkeel = function(ch){
	var indx = false;
	var n;
	for(n=0;n<arabicEngine.form_0.length;n++){
		if(ch==arabicEngine.tashkeel[n])
		indx=true;
	}
	return indx;
}
arabicEngine.index_of = function(arr,ch){
	var indx = -1;
	for(j=0;j<arr.length;j++){
		if(ch==arr[j])
		indx=j;
	}
	return indx;
}

arabicEngine.multiLine = function(con_text){
	var push="",pop="",cur="";
	for(g=0;g<con_text.length;g++){
		cur = con_text[g];
		if(cur == '\n' || con_text.charCodeAt(g) == 13){
			push='\n\r'+pop+push;
			pop="";
			}
		else
			pop+=cur;
		}
	return con_text=pop+push;
}


arabicEngine.convertText = function(inTxt){

    var conTxt = "",temp = "",temp2 = "";
    var cur=-1,nxt=-1,prv=-1;
    for(i=1;i<inTxt.length+1;i++){
        
        if(i > 1){
                nxt = inTxt[inTxt.length-(i-1)];
                if(arabicEngine.tashkeel(nxt))
                    nxt = inTxt[inTxt.length-(i-2)];
            }
        else
            nxt = -1;
        cur = inTxt[inTxt.length-i];
        //alert(cur+" *** "+ conTxt);
        if(i < inTxt.length){
            prv = inTxt[inTxt.length-(i+1)];
            if(arabicEngine.tashkeel(prv))
                    prv = inTxt[inTxt.length-(i+2)];
            }
        else
            prv = -1;

        var indx_cur = arabicEngine.index_of(arabicEngine.form_0,cur);

        if(indx_cur < 0 ){
            if(inTxt.charCodeAt (inTxt.length-i) == 8204)
                continue;
                
            if(arabicEngine.index_of (arabicEngine.left_brackets, cur) >= 0)
                cur = arabicEngine.right_brackets[arabicEngine.index_of (arabicEngine.left_brackets, cur)];
            else if(arabicEngine.index_of (arabicEngine.right_brackets, cur) >= 0)
                cur = arabicEngine.left_brackets[arabicEngine.index_of (arabicEngine.right_brackets, cur)];
                
            if(arabicEngine.index_of(arabicEngine.form_0,prv) >= 0 || inTxt.charCodeAt(inTxt.length-i) == 13 || arabicEngine.index_of (arabicEngine.spec_char, cur) >=0 || arabicEngine.index_of (arabicEngine.left_brackets, cur) >= 0 || arabicEngine.index_of (arabicEngine.right_brackets, cur) >= 0 || prv < 0){
                if(arabicEngine.index_of (arabicEngine.spec_char, cur) >= 0 || arabicEngine.index_of (arabicEngine.left_brackets, cur) >= 0 || arabicEngine.index_of (arabicEngine.right_brackets, cur) >= 0 || inTxt.charCodeAt(inTxt.length-i) == 13)
                    conTxt += temp + cur;
                else
                    conTxt += cur + temp;
                temp = "";
            }else
                temp = cur + temp;
                
        }else if((cur == 'ا' && prv == 'ل')||(cur == 'أ' && prv == 'ل')||(cur == 'إ' && prv == 'ل')||(cur == 'آ' && prv == 'ل'))
            continue;
        else if(cur == 'ل' && nxt == 'ا' && !arabicEngine.check_con(prv))
            conTxt+='\uFEFB';
        else if(cur == 'ل' && nxt == 'ا' && arabicEngine.check_con(prv))
            conTxt+='\uFEFC';
        else if(cur == 'ل' && nxt == 'أ' && !arabicEngine.check_con(prv))
            conTxt+='\uFEF7';
        else if(cur == 'ل' && nxt == 'أ' && arabicEngine.check_con(prv))
            conTxt+='\uFEF8';
        else if(cur == 'ل' && nxt == 'إ' && !arabicEngine.check_con(prv))
            conTxt+='\uFEF9';
        else if(cur == 'ل' && nxt == 'إ' && arabicEngine.check_con(prv))
            conTxt+='\uFEFA';
        else if(cur == 'ل' && nxt == 'آ' && !arabicEngine.check_con(prv))
            conTxt+='\uFEF5';
        else if(cur == 'ل' && nxt == 'آ' && arabicEngine.check_con(prv))
            conTxt+='\uFEF6';
        else if(!arabicEngine.check_con(prv) && arabicEngine.index_of(arabicEngine.form_0,nxt)<0)     
            conTxt+=arabicEngine.form_0[indx_cur];
        else if(!arabicEngine.check_con(prv) && arabicEngine.index_of(arabicEngine.form_0,nxt)>=0)
            conTxt+=arabicEngine.form_2[indx_cur];
        else if(arabicEngine.check_con(prv) && arabicEngine.index_of(arabicEngine.form_0,nxt)>=0)
            conTxt+=arabicEngine.form_3[indx_cur];
        else if(arabicEngine.check_con(prv) && arabicEngine.index_of(arabicEngine.form_0,nxt)<0)
            conTxt+=arabicEngine.form_1[indx_cur];

    }
    return conTxt;

}

//#endregion

export { arabicEngine };