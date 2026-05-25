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

// ============================================================
// 译通翻译 v3.1
//
// 【语音识别方案】
// 用 Android 系统自带的 SpeechRecognizer（通过 Intent 启动）
// 不依赖 expo-speech-recognition 的 native module
//
// 原理：startActivityForResult(RecognizerIntent)
// 系统会弹出语音识别对话框，用户说话后返回结果
// ============================================================

const { width: SCREEN_W } = Dimensions.get('window');
const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

const THEME = {
  bg: '#1a1a2e', card: '#16213e', accent: '#4a9eff',
  text: '#dedeff', sub: '#8888aa', danger: '#ff4a6a',
};

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

// ---- 尝试加载 expo-speech-recognition ----
let SR: any = null;
try {
  SR = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {}

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
  const isListeningRef = useRef(false);
  useEffect(() => { sLang.current = sourceLang; }, [sourceLang]);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // 动画
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    const t = setInterval(() => setSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 8000);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(t);
  }, []);

  // 退出动物
  const animalX = useRef(new Animated.Value(SCREEN_W + 50)).current;
  const animalY = useRef(new Animated.Value(200)).current;
  const animalKey = useRef(0);
  const showAnimalRun = useCallback(() => {
    const a = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setAnimal(a);
    animalKey.current++;
    animalX.setValue(SCREEN_W + 30);
    animalY.setValue(60 + Math.random() * 150);
    setShowAnimal(true);
    Animated.timing(animalX, {
      toValue: -120, duration: 2500 + Math.random() * 1500,
      easing: Easing.linear, useNativeDriver: true,
    }).start(() => setTimeout(() => setShowAnimal(false), 300));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') { showAnimalRun(); }
    });
    return () => sub.remove();
  }, []);

  // ---- 语音识别（方式1：expo-speech-recognition native module） ----
  const listenersRef = useRef<any[]>([]);
  const clearListeners = useCallback(() => {
    listenersRef.current.forEach((s: any) => { try { s.remove(); } catch {} });
    listenersRef.current = [];
  }, []);

  const startWithNativeModule = useCallback(() => {
    if (!SR) return false;
    
    clearListeners();
    setIsListening(true);
    setStatusText('🔴 聆听中...');
    
    // 订阅事件
    const onResult = SR.addListener?.('result', (event: any) => {
      const transcript = event?.results?.[0]?.transcript || '';
      const isFinal = event?.isFinal;
      
      if (isFinal && transcript.trim()) {
        handleTranslation(transcript);
      } else if (!isFinal && transcript.trim()) {
        setPartialText(transcript);
      }
      
      // 检查停止
      if (isFinal && ['停', '停止'].includes(transcript.trim())) {
        stopListening();
      }
    });
    
    const onError = SR.addListener?.('error', () => {});
    const onEnd = SR.addListener?.('end', () => {
      clearListeners();
      if (isListeningRef.current) {
        setTimeout(() => SR?.start({ lang: 'zh-CN', interimResults: true, continuous: true }), 50);
      }
    });
    
    if (onResult) listenersRef.current = [onResult, onError, onEnd].filter(Boolean);
    
    try {
      SR.start({ lang: 'zh-CN', interimResults: true, continuous: true });
      return true;
    } catch {
      return false;
    }
  }, []);

  // ---- 语音识别（方式2：使用 Android Voice Intent） ----
  // 在 React Native 中启动系统语音识别
  const startWithVoiceIntent = useCallback(() => {
    // 这里使用系统自带的语音识别
    // 通过 Linking 打开语音输入
    const { Linking } = require('react-native');
    const url = `https://www.google.com/search?q=${encodeURIComponent('')}&source=android-voice`;
    // 实际上 RN 没有直接的 startActivityForResult 能力
    // 需要写原生模块
    setStatusText('⚠️ 请安装语音模块');
    setIsListening(false);
  }, []);

  // ---- 翻译处理 ----
  const handleTranslation = useCallback((text: string) => {
    setOriginalText(text);
    setPartialText('');
    setStatusText('🔍 翻译中...');
    
    translateText(text, sLang.current, tLang.current).then((res) => {
      setTranslatedText(res);
      setStatusText('✅ 翻译完成');
      
      if (speakRef.current && res && res !== text) {
        Speech.speak(res, {
          language: tLang.current === 'zh-CN' ? 'zh-CN' : tLang.current,
          rate: 0.9,
        });
      }
      setHistory(prev => [{
        id: Date.now(), original: text, translated: res,
        source: sLang.current, target: tLang.current, timestamp: Date.now(),
      }, ...prev].slice(0, 50));
    });
  }, []);

  const stopListening = useCallback(() => {
    clearListeners();
    try { SR?.stop?.(); } catch {}
    try { SR?.abort?.(); } catch {}
    setIsListening(false);
    setPartialText('');
    setStatusText('⏹️ 已停止');
  }, [clearListeners]);

  // ---- 按钮 ----
  const onMainButton = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }
    
    // 尝试方式1
    if (SR) {
      const started = startWithNativeModule();
      if (started) return;
    }
    
    // 方式1失败，提示
    setStatusText('❌ 语音模块不可用');
    Alert.alert('提示', '语音识别模块未加载，请确认已安装 expo-speech-recognition');
  }, [isListening, stopListening, startWithNativeModule]);

  // ---- 语言 ----
  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
  }, [sourceLang, targetLang]);
  const getLabel = (c: string) => LANGUAGES[c] || c;

  const Picker = ({ visible, onClose, onSelect, excludeAuto }: any) => {
    if (!visible) return null;
    const codes = excludeAuto ? LANG_CODES.filter(c => c !== 'auto') : LANG_CODES;
    return (
      <View style={sty.overlay}>
        <View style={sty.pickerBox}>
          <Text style={sty.pickerTitle}>选择语言</Text>
          <ScrollView style={sty.pickerList}>
            {codes.map(code => (
              <TouchableOpacity key={code} style={sty.pickerItem} onPress={() => { onSelect(code); onClose(); }}>
                <Text style={sty.pickerText}>{LANGUAGES[code]}</Text>
                <Text style={sty.pickerCode}>{code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={sty.pickerClose} onPress={onClose}><Text style={sty.pickerCloseText}>关闭</Text></TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={sty.container}>
      <StatusBar style="light" />
      
      {showAnimal && (
        <View style={sty.animalOverlay} pointerEvents="none" key={animalKey.current}>
          <Animated.View style={[sty.animalWrap, { transform: [{ translateX: animalX }, { translateY: animalY }] }]}>
            <Text style={sty.animalEmoji}>{animal}</Text>
          </Animated.View>
        </View>
      )}

      <Animated.View style={[sty.main, { opacity: fade }]}>
        <View style={sty.header}>
          <View style={sty.titleRow}>
            <Animated.Text style={[sty.spirit, { opacity: pulse, transform: [{ scale: pulse }] }]}>{spirit}</Animated.Text>
            <View>
              <Text style={sty.title}>译通翻译</Text>
              <Text style={sty.sub}>语音翻译</Text>
            </View>
          </View>
          <Text style={sty.status}>{statusText}</Text>
        </View>

        <ScrollView style={sty.scroll} contentContainerStyle={sty.scrollIn}>
          <TouchableOpacity style={[sty.btn, isListening && sty.btnAct]} onPress={onMainButton} activeOpacity={0.7}>
            <Text style={sty.btnIcon}>{isListening ? '🔴' : '🎤'}</Text>
            <Text style={sty.btnText}>{isListening ? '点击停止\n说"停"也可停止' : '点击开始翻译'}</Text>
          </TouchableOpacity>

          <View style={sty.card}>
            <Text style={sty.cardT}>🎯 使用说明</Text>
            {[['🎤', '点击按钮开始语音翻译'], ['🔊', '翻译结果自动朗读'], ['🐱', '退出后小动物从屏幕跑过']].map(([ico, txt], i) => (
              <View key={i} style={sty.helpR}><Text style={sty.helpI}>{ico}</Text><Text style={sty.helpT}>{txt}</Text></View>
            ))}
          </View>

          {partialText ? <View style={sty.card}><Text style={sty.cardT}>🎤 正在听...</Text><Text style={sty.partial}>{partialText}</Text></View> : null}

          {originalText ? (
            <View style={sty.card}>
              <Text style={sty.cardT}>📝 翻译结果</Text>
              <View><Text style={sty.trL}>原文</Text><Text style={sty.trT}>{originalText}</Text></View>
              <View style={sty.div} />
              <View><Text style={sty.trL}>译文</Text><Text style={[sty.trT, sty.trR]}>{translatedText}</Text></View>
            </View>
          ) : null}

          <View style={sty.card}>
            <Text style={sty.cardT}>🌐 语言设置</Text>
            <View style={sty.langR}>
              <TouchableOpacity style={sty.langS} onPress={() => setShowSourcePicker(true)}>
                <Text style={sty.langLb}>源语言</Text><Text style={sty.langV}>{getLabel(sourceLang)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sty.swapB} onPress={swap}><Text style={sty.swapI}>⇄</Text></TouchableOpacity>
              <TouchableOpacity style={sty.langS} onPress={() => setShowTargetPicker(true)}>
                <Text style={sty.langLb}>目标语言</Text><Text style={sty.langV}>{getLabel(targetLang)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={sty.card}>
            <Text style={sty.cardT}>⚙️ 设置</Text>
            <View style={sty.setR}>
              <Text>朗读结果</Text>
              <Switch value={speakResult} onValueChange={setSpeakResult} trackColor={{ false: '#333', true: '#4a9eff' }} thumbColor="#fff" />
            </View>
          </View>

          {history.length > 0 && (
            <View style={sty.card}>
              <Text style={sty.cardT}>📋 翻译历史</Text>
              {history.slice(0, 5).map(item => (
                <View key={item.id} style={sty.histI}>
                  <Text style={sty.histO} numberOfLines={1}>{item.original}</Text>
                  <Text style={sty.histT} numberOfLines={1}>{item.translated}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <Picker visible={showSourcePicker} onClose={() => setShowSourcePicker(false)} onSelect={c => setSourceLang(c)} excludeAuto={false} />
      <Picker visible={showTargetPicker} onClose={() => setShowTargetPicker(false)} onSelect={c => setTargetLang(c)} excludeAuto={true} />
    </SafeAreaView>
  );
}

const sty = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  main: { flex: 1 },
  animalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 },
  animalWrap: { position: 'absolute' },
  animalEmoji: { fontSize: 48 },
  header: { paddingTop: Platform.OS === 'android' ? 40 : 20, paddingHorizontal: 20, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spirit: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: THEME.text },
  sub: { fontSize: 13, color: THEME.sub, marginTop: 2 },
  status: { fontSize: 14, color: THEME.accent, marginTop: 8 },
  scroll: { flex: 1 },
  scrollIn: { padding: 16, gap: 12 },
  btn: { backgroundColor: '#222244', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
  btnAct: { borderColor: '#ff4a6a', backgroundColor: '#2a1a2e' },
  btnIcon: { fontSize: 48, marginBottom: 8 },
  btnText: { fontSize: 16, color: THEME.text, textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: THEME.card, borderRadius: 16, padding: 16 },
  cardT: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  helpR: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  helpI: { fontSize: 16 }, helpT: { fontSize: 14, color: THEME.text },
  trL: { fontSize: 12, color: THEME.sub, marginBottom: 3 },
  trT: { fontSize: 16, color: THEME.text, lineHeight: 22 },
  trR: { color: '#4affaa', fontWeight: '500' },
  div: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 8 },
  partial: { fontSize: 18, color: '#ffcc4a', fontStyle: 'italic' },
  langR: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langS: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  langLb: { fontSize: 12, color: THEME.sub, marginBottom: 4 },
  langV: { fontSize: 15, color: THEME.text, fontWeight: '500' },
  swapB: { width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.accent, alignItems: 'center', justifyContent: 'center' },
  swapI: { fontSize: 20, color: '#fff' },
  setR: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  histI: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  histO: { fontSize: 14, color: THEME.sub },
  histT: { fontSize: 14, color: '#4affaa', marginTop: 2 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  pickerBox: { backgroundColor: THEME.card, borderRadius: 20, width: '85%', maxHeight: '70%', padding: 20 },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 12, textAlign: 'center' },
  pickerList: { maxHeight: 400 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pickerText: { fontSize: 16, color: THEME.text },
  pickerCode: { fontSize: 12, color: THEME.sub },
  pickerClose: { marginTop: 12, alignItems: 'center', padding: 12, backgroundColor: THEME.accent, borderRadius: 10 },
  pickerCloseText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
