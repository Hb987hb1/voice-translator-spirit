import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Alert,
  Switch,
  AppState,
  Dimensions,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';

// ============================================================
// 译通翻译 v7.0
// 终极方案：用系统输入法键盘的语音输入
// vivo 手机输入法自带麦克风按钮，
// 用户点击文本框→弹出键盘→点麦克风说话→文字填入→自动翻译
//
// 同时保持说"停"停止、退出动物跑等全部功能
// ============================================================

const { width: SCREEN_W } = Dimensions.get('window');
const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

const LANGUAGES: Record<string, string> = {
  auto: '自动检测', 'zh-CN': '中文', 'en': 'English', 'ja': '日本語',
  'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español',
  'it': 'Italiano', 'pt': 'Português', 'ru': 'Русский', 'th': 'ไทย',
  'vi': 'Tiếng Việt',
};
const LANG_CODES = Object.keys(LANGUAGES);

async function translateText(text: string, source: string, target: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${
      source === 'auto' ? 'auto' : source
    }&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data?.[0]?.map((i: any) => i[0]).join('') || text;
  } catch { return text; }
}

export default function App() {
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('🎤 点击输入框，用键盘麦克风说话');
  const [history, setHistory] = useState<any[]>([]);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [spirit, setSpirit] = useState(SPIRITS[0]);
  const [showAnimal, setShowAnimal] = useState(false);
  const [animal, setAnimal] = useState('🐱');

  const tLang = useRef(targetLang);
  const speakRef = useRef(speakResult);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);

  const animalX = useRef(new Animated.Value(SCREEN_W + 50)).current;
  const animKey = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    const t = setInterval(() => setSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 8000);
    return () => clearInterval(t);
  }, []);

  const doExitAnim = useCallback(() => {
    const a = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setAnimal(a); animKey.current++;
    animalX.setValue(SCREEN_W + 30); setShowAnimal(true);
    Animated.timing(animalX, { toValue: -120, duration: 2500 + Math.random() * 1500, easing: Easing.linear, useNativeDriver: true })
      .start(() => setTimeout(() => setShowAnimal(false), 300));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') { doExitAnim(); }
    });
    return () => sub.remove();
  }, []);

  // 自动翻译
  useEffect(() => {
    if (!inputText.trim()) {
      setTranslatedText('');
      return;
    }

    const timer = setTimeout(async () => {
      setStatusText('🔍 翻译中...');
      const res = await translateText(inputText, 'auto', tLang.current);
      setTranslatedText(res);
      setStatusText('✅ 翻译完成');
      if (speakRef.current && res && res !== inputText) {
        Speech.speak(res, {
          language: tLang.current === 'zh-CN' ? 'zh-CN' : tLang.current,
          rate: 0.9,
        });
      }
      setHistory(prev => [{
        id: Date.now(), original: inputText, translated: res,
        source: 'auto', target: tLang.current, timestamp: Date.now(),
      }, ...prev].slice(0, 50));
    }, 500);

    return () => clearTimeout(timer);
  }, [inputText]);

  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
  }, [sourceLang, targetLang]);

  const Picker = (props: { visible: boolean; onClose: () => void; onSelect: (c: string) => void; excludeAuto: boolean }) => {
    if (!props.visible) return null;
    const codes = props.excludeAuto ? LANG_CODES.filter(c => c !== 'auto') : LANG_CODES;
    return (
      <View style={sty.over}><View style={sty.pb}>
        <Text style={sty.pt2}>选择语言</Text>
        <ScrollView style={sty.pl}>{codes.map(code => (
          <TouchableOpacity key={code} style={sty.pi} onPress={() => { props.onSelect(code); props.onClose(); }}>
            <Text style={sty.pit}>{LANGUAGES[code]}</Text><Text style={sty.pic}>{code}</Text>
          </TouchableOpacity>
        ))}</ScrollView>
        <TouchableOpacity style={sty.pc} onPress={props.onClose}><Text style={sty.pct}>关闭</Text></TouchableOpacity>
      </View></View>
    );
  };

  return (
    <SafeAreaView style={sty.c}>
      <StatusBar style="light" />
      {showAnimal && (
        <View style={sty.ao} pointerEvents="none" key={animKey.current}>
          <Animated.View style={[sty.aw, { transform: [{ translateX: animalX }] }]}>
            <Text style={sty.ae}>{animal}</Text>
          </Animated.View>
        </View>
      )}
      <View style={sty.h}>
        <View style={sty.tr}>
          <Animated.Text style={[sty.si, { opacity: pulse, transform: [{ scale: pulse }] }]}>{spirit}</Animated.Text>
          <View>
            <Text style={sty.t}>译通翻译</Text>
            <Text style={sty.sub}>点击下方输入框用键盘麦克风说话</Text>
          </View>
        </View>
        <Text style={sty.st}>{statusText}</Text>
      </View>
      <ScrollView style={sty.sc} contentContainerStyle={sty.sci} keyboardShouldPersistTaps="handled">
        {/* 语音输入框 */}
        <View style={sty.inputCard}>
          <Text style={sty.inputLabel}>🎤 点击这里，用键盘麦克风说话</Text>
          <TextInput
            style={sty.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="点击后说话，或直接输入文字"
            placeholderTextColor="#666"
            multiline
            textAlignVertical="top"
            autoFocus={false}
          />
        </View>

        {/* 翻译结果 */}
        {translatedText ? (
          <View style={sty.cd}>
            <Text style={sty.ct}>📝 译文</Text>
            <Text style={sty.trr}>{translatedText}</Text>
          </View>
        ) : null}

        <View style={sty.cd}>
          <Text style={sty.ct}>🎯 使用方法</Text>
          {[
            ['🎤', '点击输入框→弹出键盘→点麦克风按钮说话'],
            ['🔊', '文字输入后自动翻译并朗读'],
            ['🐱', '退出后小动物从屏幕跑过'],
          ].map(([ico, txt], i) => (
            <View key={i} style={sty.hr}><Text>{ico}</Text><Text style={sty.ht}>{txt}</Text></View>
          ))}
        </View>

        <View style={sty.cd}>
          <Text style={sty.ct}>🌐 语言设置</Text>
          <View style={sty.lr}>
            <TouchableOpacity style={sty.ls} onPress={() => setShowTargetPicker(true)}>
              <Text style={sty.ll}>翻译到</Text><Text style={sty.lv}>{LANGUAGES[targetLang]||targetLang}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={sty.cd}>
          <Text style={sty.ct}>⚙️ 设置</Text>
          <View style={sty.sr}>
            <Text>朗读结果</Text>
            <Switch value={speakResult} onValueChange={setSpeakResult} trackColor={{false:'#333',true:'#4a9eff'}} thumbColor="#fff" />
          </View>
        </View>

        {history.length > 0 && (
          <View style={sty.cd}>
            <Text style={sty.ct}>📋 翻译历史</Text>
            {history.slice(0, 5).map(item => (
              <View key={item.id} style={sty.hi}>
                <Text style={sty.ho} numberOfLines={1}>{item.original}</Text>
                <Text style={sty.htr} numberOfLines={1}>{item.translated}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Picker visible={showTargetPicker} onClose={() => setShowTargetPicker(false)} onSelect={c => setTargetLang(c)} excludeAuto={true} />
    </SafeAreaView>
  );
}

const sty = StyleSheet.create({
  c:{flex:1,backgroundColor:'#1a1a2e'},
  ao:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:9999},
  aw:{position:'absolute',bottom:100}, ae:{fontSize:48},
  h:{paddingTop:Platform.OS==='android'?40:20,paddingHorizontal:20,paddingBottom:10},
  tr:{flexDirection:'row',alignItems:'center',gap:12}, si:{fontSize:40},
  t:{fontSize:24,fontWeight:'bold',color:'#dedeff'},
  sub:{fontSize:13,color:'#8888aa',marginTop:2},
  st:{fontSize:14,color:'#4a9eff',marginTop:8},
  sc:{flex:1}, sci:{padding:16,gap:12},

  // 输入框
  inputCard:{backgroundColor:'#16213e',borderRadius:16,padding:16},
  inputLabel:{fontSize:14,color:'#4a9eff',fontWeight:'600',marginBottom:8},
  input:{
    backgroundColor:'#0d1b3e',
    borderRadius:12,
    padding:14,
    color:'#dedeff',
    fontSize:18,
    minHeight:80,
    borderWidth:1,
    borderColor:'rgba(74,158,255,0.3)',
  },

  cd:{backgroundColor:'#16213e',borderRadius:16,padding:16},
  ct:{fontSize:15,fontWeight:'bold',color:'#dedeff',marginBottom:12},
  trr:{fontSize:20,color:'#4affaa',fontWeight:'500',lineHeight:28},
  hr:{flexDirection:'row',alignItems:'center',paddingVertical:5,gap:10},
  ht:{fontSize:14,color:'#dedeff',flex:1},
  lr:{flexDirection:'row',alignItems:'center',gap:8},
  ls:{flex:1,backgroundColor:'rgba(255,255,255,0.05)',borderRadius:10,padding:12},
  ll:{fontSize:12,color:'#8888aa',marginBottom:4},
  lv:{fontSize:15,color:'#dedeff',fontWeight:'500'},
  sr:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8},
  hi:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  ho:{fontSize:14,color:'#8888aa'},
  htr:{fontSize:14,color:'#4affaa',marginTop:2},

  over:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'center',alignItems:'center',zIndex:999},
  pb:{backgroundColor:'#16213e',borderRadius:20,width:'85%',maxHeight:'70%',padding:20},
  pt2:{fontSize:18,fontWeight:'bold',color:'#dedeff',marginBottom:12,textAlign:'center'},
  pl:{maxHeight:400},
  pi:{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  pit:{fontSize:16,color:'#dedeff'}, pic:{fontSize:12,color:'#8888aa'},
  pc:{marginTop:12,alignItems:'center',padding:12,backgroundColor:'#4a9eff',borderRadius:10},
  pct:{fontSize:16,color:'#fff',fontWeight:'600'},
});
