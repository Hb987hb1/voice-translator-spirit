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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { WebView } from 'react-native-webview';

// ============================================================
// 译通翻译 v6.0
// Web Speech API 方案 — 用内置 WebView 做语音识别
// 因为 vivo 手机不兼容标准 Android SpeechRecognizer
// WebView 里的 Web Speech API 在不同手机上都可用
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

const HTML_SPEECH = `<!DOCTYPE html><html><body><script>
let recognition = null;
let isListening = false;

function startRec(lang) {
  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'不支持语音识别'})); return; }
    recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = function(e) {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        const isFinal = e.results[i].isFinal;
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'result',text:transcript,isFinal:isFinal}));
      }
    };
    recognition.onerror = function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:e.error}));
    };
    recognition.onend = function() {
      if (isListening) { recognition.start(); }
    };
    isListening = true;
    recognition.start();
  } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:e.message})); }
}

function stopRec() {
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch{} recognition = null; }
}
</script></body></html>`;

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

  const webRef = useRef<any>(null);
  const sLang = useRef(sourceLang);
  const tLang = useRef(targetLang);
  const speakRef = useRef(speakResult);
  const isListenRef = useRef(false);

  useEffect(() => { sLang.current = sourceLang; }, [sourceLang]);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);
  useEffect(() => { isListenRef.current = isListening; }, [isListening]);

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
      if (state === 'background') { stopListen(); doExitAnim(); }
    });
    return () => sub.remove();
  }, []);

  // WebView 消息处理
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'result') {
        const text = data.text || '';
        const isFinal = data.isFinal;

        if (isFinal && text.trim()) {
          const lower = text.trim().toLowerCase();
          if (lower === '停' || lower === '停止') { stopListen(); return; }
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
        } else if (!isFinal && text.trim()) {
          setPartialText(text);
        }
      } else if (data.type === 'error') {
        console.warn('WebSpeech error:', data.msg);
      }
    } catch {}
  }, []);

  const startListen = useCallback(() => {
    setIsListening(true);
    isListenRef.current = true;
    setStatusText('🔴 聆听中...说"停"停止');
    const lang = sLang.current === 'auto' ? 'zh-CN' : sLang.current;
    webRef.current?.injectJavaScript(`startRec('${lang}');true;`);
  }, []);

  const stopListen = useCallback(() => {
    webRef.current?.injectJavaScript('stopRec();true;');
    setIsListening(false);
    isListenRef.current = false;
    setPartialText('');
    setStatusText('⏹️ 已停止');
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
      <View style={st.over}><View style={st.pb}>
        <Text style={st.pt2}>选择语言</Text>
        <ScrollView style={st.pl}>{codes.map(code => (
          <TouchableOpacity key={code} style={st.pi} onPress={() => { props.onSelect(code); props.onClose(); }}>
            <Text style={st.pit}>{LANGUAGES[code]}</Text><Text style={st.pic}>{code}</Text>
          </TouchableOpacity>
        ))}</ScrollView>
        <TouchableOpacity style={st.pc} onPress={props.onClose}><Text style={st.pct}>关闭</Text></TouchableOpacity>
      </View></View>
    );
  };

  return (
    <SafeAreaView style={st.c}>
      <StatusBar style="light" />
      {/* 隐藏的 WebView 用于语音识别 */}
      <WebView
        ref={webRef}
        source={{ html: HTML_SPEECH }}
        style={{ height: 0, width: 0, opacity: 0 }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        androidLayerType="hardware"
      />
      {showAnimal && (
        <View style={st.ao} pointerEvents="none" key={animKey.current}>
          <Animated.View style={[st.aw, { transform: [{ translateX: animalX }] }]}>
            <Text style={st.ae}>{animal}</Text>
          </Animated.View>
        </View>
      )}
      <View style={st.h}>
        <View style={st.tr}>
          <Animated.Text style={[st.si, { opacity: pulse, transform: [{ scale: pulse }] }]}>{spirit}</Animated.Text>
          <View><Text style={st.t}>译通翻译</Text><Text style={st.sub}>Web Speech 语音识别</Text></View>
        </View>
        <Text style={st.st}>{statusText}</Text>
      </View>
      <ScrollView style={st.sc} contentContainerStyle={st.sci}>
        <TouchableOpacity style={[st.b, isListening && st.ba]} onPress={onMain} activeOpacity={0.7}>
          <Text style={st.bi}>{isListening ? '🔴' : '🎤'}</Text>
          <Text style={st.bt}>{isListening ? '点击停止\n说"停"停止' : '点击开始翻译'}</Text>
        </TouchableOpacity>
        {partialText ? <View style={st.cd}><Text style={st.ct}>🎤 正在听...</Text><Text style={st.pt}>{partialText}</Text></View> : null}
        {originalText ? (
          <View style={st.cd}>
            <Text style={st.ct}>📝 翻译结果</Text>
            <View><Text style={st.tl}>原文</Text><Text style={st.tt}>{originalText}</Text></View>
            <View style={st.d} />
            <View><Text style={st.tl}>译文</Text><Text style={[st.tt, st.trr]}>{translatedText}</Text></View>
          </View>
        ) : null}
        <View style={st.cd}><Text style={st.ct}>🌐 语言</Text>
          <View style={st.lr}>
            <TouchableOpacity style={st.ls} onPress={() => setShowSourcePicker(true)}>
              <Text style={st.ll}>源语言</Text><Text style={st.lv}>{LANGUAGES[sourceLang]||sourceLang}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sb} onPress={swap}><Text>⇄</Text></TouchableOpacity>
            <TouchableOpacity style={st.ls} onPress={() => setShowTargetPicker(true)}>
              <Text style={st.ll}>目标语言</Text><Text style={st.lv}>{LANGUAGES[targetLang]||targetLang}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={st.cd}><Text style={st.ct}>⚙️ 设置</Text>
          <View style={st.sr}><Text>朗读结果</Text>
            <Switch value={speakResult} onValueChange={setSpeakResult} trackColor={{false:'#333',true:'#4a9eff'}} thumbColor="#fff" />
          </View>
        </View>
        {history.length > 0 && (
          <View style={st.cd}><Text style={st.ct}>📋 历史</Text>
            {history.slice(0,5).map(item => (
              <View key={item.id} style={st.hi}><Text style={st.ho} numberOfLines={1}>{item.original}</Text><Text style={st.htr} numberOfLines={1}>{item.translated}</Text></View>
            ))}
          </View>
        )}
      </ScrollView>
      <Picker visible={showSourcePicker} onClose={()=>setShowSourcePicker(false)} onSelect={c=>setSourceLang(c)} excludeAuto={false} />
      <Picker visible={showTargetPicker} onClose={()=>setShowTargetPicker(false)} onSelect={c=>setTargetLang(c)} excludeAuto={true} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  c:{flex:1,backgroundColor:'#1a1a2e'},
  ao:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:9999},
  aw:{position:'absolute',bottom:100}, ae:{fontSize:48},
  h:{paddingTop:Platform.OS==='android'?40:20,paddingHorizontal:20,paddingBottom:10},
  tr:{flexDirection:'row',alignItems:'center',gap:12}, si:{fontSize:40},
  t:{fontSize:24,fontWeight:'bold',color:'#dedeff'}, sub:{fontSize:13,color:'#8888aa',marginTop:2},
  st:{fontSize:14,color:'#4a9eff',marginTop:8}, sc:{flex:1}, sci:{padding:16,gap:12},
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
  pt2:{fontSize:18,fontWeight:'bold',color:'#dedeff',marginBottom:12,textAlign:'center'},
  pl:{maxHeight:400},
  pi:{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  pit:{fontSize:16,color:'#dedeff'}, pic:{fontSize:12,color:'#8888aa'},
  pc:{marginTop:12,alignItems:'center',padding:12,backgroundColor:'#4a9eff',borderRadius:10},
  pct:{fontSize:16,color:'#fff',fontWeight:'600'},
});
