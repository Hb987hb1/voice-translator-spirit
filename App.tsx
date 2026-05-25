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
  NativeEventEmitter,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { requireNativeModule } from 'expo-modules-core';

// ============================================================
// 译通翻译 v4.1
// 使用 requireNativeModule 直接获取 native 语音模块
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

// ---- 获取 native 语音模块 ----
let SRModule: any = null;
let SREvents: NativeEventEmitter | null = null;
try {
  SRModule = requireNativeModule('ExpoSpeechRecognition');
  if (SRModule) {
    SREvents = new NativeEventEmitter(SRModule);
  }
} catch (e) {
  console.warn('ExpoSpeechRecognition native module not found:', e);
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('🎤 点击开始翻译');
  const [history, setHistory] = useState<any[]>([]);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [spirit, setSpirit] = useState(SPIRITS[0]);
  const [partialText, setPartialText] = useState('');
  const [showAnimal, setShowAnimal] = useState(false);
  const [animal, setAnimal] = useState('🐱');

  const sLang = useRef(sourceLang);
  const tLang = useRef(targetLang);
  const speakRef = useRef(speakResult);
  const isListenRef = useRef(false);
  const subsRef = useRef<any[]>([]);

  useEffect(() => { sLang.current = sourceLang; }, [sourceLang]);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);
  useEffect(() => { isListenRef.current = isListening; }, [isListening]);

  // 动画
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    const t = setInterval(() => setSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 8000);
    return () => clearInterval(t);
  }, []);

  // 退出动物
  const animalX = useRef(new Animated.Value(SCREEN_W + 50)).current;
  const animKey = useRef(0);
  const doExitAnim = useCallback(() => {
    const a = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setAnimal(a);
    animKey.current++;
    animalX.setValue(SCREEN_W + 30);
    setShowAnimal(true);
    Animated.timing(animalX, {
      toValue: -120, duration: 2500 + Math.random() * 1500,
      easing: Easing.linear, useNativeDriver: true,
    }).start(() => setTimeout(() => setShowAnimal(false), 300));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') { stopListen(); doExitAnim(); }
    });
    return () => sub.remove();
  }, []);

  // ---- 语音识别 ----
  const clearSubs = useCallback(() => {
    subsRef.current.forEach((s: any) => { try { s.remove(); } catch {} });
    subsRef.current = [];
  }, []);

  const startListen = useCallback(() => {
    if (!SRModule || !SREvents) {
      setStatusText('❌ 语音模块未加载');
      return;
    }

    clearSubs();
    setIsListening(true);
    isListenRef.current = true;
    setStatusText('🔴 聆听中...说"停"停止');

    // 注册事件
    const onR = SREvents.addListener('result', (e: any) => {
      const text = e?.results?.[0]?.transcript || '';
      const isFinal = e?.isFinal;
      if (isFinal && text.trim()) {
        const lower = text.trim().toLowerCase();
        if (lower === '停' || lower === '停止') { stopListen(); return; }
        handleTranslate(text);
      } else if (!isFinal && text.trim()) {
        setPartialText(text);
      }
    });

    const onE = SREvents.addListener('error', () => {});
    const onEnd = SREvents.addListener('end', () => {
      clearSubs();
      if (isListenRef.current) {
        setTimeout(startListen, 100);
      }
    });

    subsRef.current = [onR, onE, onEnd];

    try {
      SRModule.start({
        lang: sLang.current === 'auto' ? 'zh-CN' : sLang.current,
        interimResults: true,
        continuous: true,
      });
    } catch (e: any) {
      setIsListening(false);
      isListenRef.current = false;
      setStatusText('❌ 启动失败');
    }
  }, []);

  const stopListen = useCallback(() => {
    clearSubs();
    try { SRModule?.stop?.(); } catch {}
    try { SRModule?.abort?.(); } catch {}
    setIsListening(false);
    isListenRef.current = false;
    setPartialText('');
    setStatusText('⏹️ 已停止');
  }, [clearSubs]);

  const handleTranslate = useCallback((text: string) => {
    setOriginalText(text);
    setPartialText('');
    setStatusText('🔍 翻译中...');
    translateText(text, sLang.current, tLang.current).then((res) => {
      setTranslatedText(res);
      setStatusText('✅ 翻译完成');
      if (speakRef.current && res && res !== text) {
        Speech.speak(res, { language: tLang.current === 'zh-CN' ? 'zh-CN' : tLang.current, rate: 0.9 });
      }
      setHistory(prev => [{ id: Date.now(), original: text, translated: res, source: sLang.current, target: tLang.current, timestamp: Date.now() }, ...prev].slice(0, 50));
    });
  }, []);

  const onMain = useCallback(() => {
    if (isListening) stopListen();
    else startListen();
  }, [isListening, stopListen, startListen]);

  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
  }, [sourceLang, targetLang]);

  const Picker = (props: { visible: boolean; onClose: () => void; onSelect: (c: string) => void; excludeAuto: boolean }) => {
    if (!props.visible) return null;
    const codes = props.excludeAuto ? LANG_CODES.filter(c => c !== 'auto') : LANG_CODES;
    return (
      <View style={s.over}><View style={s.pb}>
        <Text style={s.pt}>选择语言</Text>
        <ScrollView style={s.pl}>{codes.map(code => (
          <TouchableOpacity key={code} style={s.pi} onPress={() => { props.onSelect(code); props.onClose(); }}>
            <Text style={s.pit}>{LANGUAGES[code]}</Text><Text style={s.pic}>{code}</Text>
          </TouchableOpacity>
        ))}</ScrollView>
        <TouchableOpacity style={s.pc} onPress={props.onClose}><Text style={s.pct}>关闭</Text></TouchableOpacity>
      </View></View>
    );
  };

  return (
    <SafeAreaView style={s.c}>
      <StatusBar style="light" />
      {showAnimal && (
        <View style={s.ao} pointerEvents="none" key={animKey.current}>
          <Animated.View style={[s.aw, { transform: [{ translateX: animalX }] }]}>
            <Text style={s.ae}>{animal}</Text>
          </Animated.View>
        </View>
      )}
      <View style={s.h}>
        <View style={s.tr}>
          <Animated.Text style={[s.si, { opacity: pulse, transform: [{ scale: pulse }] }]}>{spirit}</Animated.Text>
          <View>
            <Text style={s.t}>译通翻译</Text>
            <Text style={s.sub}>语音翻译 · 说"停"停止</Text>
          </View>
        </View>
        <Text style={s.st}>{statusText}</Text>
      </View>
      <ScrollView style={s.sc} contentContainerStyle={s.sci}>
        <TouchableOpacity style={[s.b, isListening && s.ba]} onPress={onMain} activeOpacity={0.7}>
          <Text style={s.bi}>{isListening ? '🔴' : '🎤'}</Text>
          <Text style={s.bt}>{isListening ? '点击停止\n说"停"也可停止' : '点击开始翻译'}</Text>
        </TouchableOpacity>
        <View style={s.cd}><Text style={s.ct}>🎯 使用说明</Text>
          {[['🎤','点击开始语音翻译'],['🔊','结果自动朗读'],['⏹️','说"停"停止'],['🐱','退出后小动物跑过屏幕']].map(([ico,txt],i)=>(
            <View key={i} style={s.hr}><Text>{ico}</Text><Text style={s.ht}>{txt}</Text></View>
          ))}
        </View>
        {partialText ? <View style={s.cd}><Text style={s.ct}>🎤 正在听...</Text><Text style={s.pt}>{partialText}</Text></View> : null}
        {originalText ? (
          <View style={s.cd}>
            <Text style={s.ct}>📝 翻译结果</Text>
            <View><Text style={s.tl}>原文</Text><Text style={s.tt}>{originalText}</Text></View>
            <View style={s.d} />
            <View><Text style={s.tl}>译文</Text><Text style={[s.tt, s.trr]}>{translatedText}</Text></View>
          </View>
        ) : null}
        <View style={s.cd}><Text style={s.ct}>🌐 语言设置</Text>
          <View style={s.lr}>
            <TouchableOpacity style={s.ls} onPress={() => setShowSourcePicker(true)}>
              <Text style={s.ll}>源语言</Text><Text style={s.lv}>{LANGUAGES[sourceLang] || sourceLang}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sb} onPress={swap}><Text>⇄</Text></TouchableOpacity>
            <TouchableOpacity style={s.ls} onPress={() => setShowTargetPicker(true)}>
              <Text style={s.ll}>目标语言</Text><Text style={s.lv}>{LANGUAGES[targetLang] || targetLang}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.cd}><Text style={s.ct}>⚙️ 设置</Text>
          <View style={s.sr}><Text>朗读结果</Text>
            <Switch value={speakResult} onValueChange={setSpeakResult} trackColor={{false:'#333',true:'#4a9eff'}} thumbColor="#fff" />
          </View>
        </View>
        {history.length > 0 && (
          <View style={s.cd}><Text style={s.ct}>📋 翻译历史</Text>
            {history.slice(0,5).map(item => (
              <View key={item.id} style={s.hi}><Text style={s.ho} numberOfLines={1}>{item.original}</Text><Text style={s.htr} numberOfLines={1}>{item.translated}</Text></View>
            ))}
          </View>
        )}
      </ScrollView>
      <Picker visible={showSourcePicker} onClose={()=>setShowSourcePicker(false)} onSelect={c=>setSourceLang(c)} excludeAuto={false} />
      <Picker visible={showTargetPicker} onClose={()=>setShowTargetPicker(false)} onSelect={c=>setTargetLang(c)} excludeAuto={true} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c:{flex:1,backgroundColor:'#1a1a2e'}, ao:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:9999},
  aw:{position:'absolute',bottom:100}, ae:{fontSize:48},
  h:{paddingTop:Platform.OS==='android'?40:20,paddingHorizontal:20,paddingBottom:10},
  tr:{flexDirection:'row',alignItems:'center',gap:12}, si:{fontSize:40},
  t:{fontSize:24,fontWeight:'bold',color:'#dedeff'}, sub:{fontSize:13,color:'#8888aa',marginTop:2},
  st:{fontSize:14,color:'#4a9eff',marginTop:8},
  sc:{flex:1}, sci:{padding:16,gap:12},
  b:{backgroundColor:'#222244',borderRadius:16,padding:24,alignItems:'center',borderWidth:1,borderColor:'rgba(74,158,255,0.3)'},
  ba:{borderColor:'#ff4a6a',backgroundColor:'#2a1a2e'}, bi:{fontSize:48,marginBottom:8},
  bt:{fontSize:16,color:'#dedeff',textAlign:'center',lineHeight:22},
  cd:{backgroundColor:'#16213e',borderRadius:16,padding:16},
  ct:{fontSize:15,fontWeight:'bold',color:'#dedeff',marginBottom:12},
  hr:{flexDirection:'row',alignItems:'center',paddingVertical:5,gap:10}, ht:{fontSize:14,color:'#dedeff'},
  pt:{fontSize:18,color:'#ffcc4a',fontStyle:'italic'},
  tl:{fontSize:12,color:'#8888aa',marginBottom:3}, tt:{fontSize:16,color:'#dedeff',lineHeight:22},
  trr:{color:'#4affaa',fontWeight:'500'}, d:{height:1,backgroundColor:'rgba(255,255,255,0.1)',marginVertical:8},
  lr:{flexDirection:'row',alignItems:'center',gap:8},
  ls:{flex:1,backgroundColor:'rgba(255,255,255,0.05)',borderRadius:10,padding:12},
  ll:{fontSize:12,color:'#8888aa',marginBottom:4}, lv:{fontSize:15,color:'#dedeff',fontWeight:'500'},
  sb:{width:44,height:44,borderRadius:22,backgroundColor:'#4a9eff',alignItems:'center',justifyContent:'center'},
  sr:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8},
  hi:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  ho:{fontSize:14,color:'#8888aa'}, htr:{fontSize:14,color:'#4affaa',marginTop:2},
  over:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'center',alignItems:'center',zIndex:999},
  pb:{backgroundColor:'#16213e',borderRadius:20,width:'85%',maxHeight:'70%',padding:20},
  pt:{fontSize:18,fontWeight:'bold',color:'#dedeff',marginBottom:12,textAlign:'center'},
  pl:{maxHeight:400}, pi:{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  pit:{fontSize:16,color:'#dedeff'}, pic:{fontSize:12,color:'#8888aa'},
  pc:{marginTop:12,alignItems:'center',padding:12,backgroundColor:'#4a9eff',borderRadius:10},
  pct:{fontSize:16,color:'#fff',fontWeight:'600'},
});
