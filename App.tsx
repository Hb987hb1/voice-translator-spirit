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
  Vibration,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';

// ============================================================
// 译通翻译 v3.0 — 终极修复版
//
// 【语音识别方案】
// 使用 expo-speech-recognition 的 ExpoSpeechRecognitionModule
// 直连 native 层，正确 API：
//   - start(options) 启动识别
//   - stop() / abort() 停止
//   - addListener('result', cb) 监听结果
//   - addListener('error', cb) 监听错误
//   - addListener('end', cb) 监听结束
// ============================================================

const { width: SCREEN_W } = Dimensions.get('window');
const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

const THEME = {
  bg: '#1a1a2e', card: '#16213e', accent: '#4a9eff',
  text: '#dedeff', sub: '#8888aa', danger: '#ff4a6a',
};

// ---- 语言 ----
const LANGUAGES: Record<string, string> = {
  auto: '自动检测', 'zh-CN': '中文', 'en': 'English', 'ja': '日本語',
  'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español',
  'it': 'Italiano', 'pt': 'Português', 'ru': 'Русский', 'th': 'ไทย',
  'vi': 'Tiếng Việt',
};
const LANG_CODES = Object.keys(LANGUAGES);

// ---- 翻译 ----
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

interface TItem {
  id: number; original: string; translated: string;
  source: string; target: string; timestamp: number;
}

// ---- 获取 native 模块 ----
let SRModule: any = null;
let SREvents: NativeEventEmitter | null = null;
try {
  SRModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  if (SRModule) {
    SREvents = new NativeEventEmitter(SRModule);
  }
} catch (e) {
  console.warn('SR module not available:', e);
}

export default function App() {
  // ---- 状态 ----
  const [mode, setMode] = useState<'idle' | 'listening'>('idle');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('🎤 点击开始翻译');
  const [history, setHistory] = useState<TItem[]>([]);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [spirit, setSpirit] = useState(SPIRITS[0]);
  const [partialText, setPartialText] = useState('');
  const [showAnimal, setShowAnimal] = useState(false);
  const [animal, setAnimal] = useState('🐱');

  // refs
  const modeRef = useRef(mode);
  const sLang = useRef(sourceLang);
  const tLang = useRef(targetLang);
  const speakRef = useRef(speakResult);
  const isListening = useRef(false);
  const subRef = useRef<any[]>([]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sLang.current = sourceLang; }, [sourceLang]);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);

  // ---- 动画 ----
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const listenPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    const t = setInterval(() => setSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 8000);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (mode === 'listening') {
      Animated.loop(Animated.sequence([
        Animated.timing(listenPulse, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(listenPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    }
  }, [mode]);

  // ---- 退出动物 ----
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
      if (state === 'background') { stopRecognizer(); showAnimalRun(); }
    });
    return () => sub.remove();
  }, []);

  // ---- 语音识别核心 ----
  const startRecognizer = useCallback(() => {
    if (!SRModule || isListening.current) return;

    // 清除旧订阅
    subRef.current.forEach(s => { try { s.remove(); } catch {} });
    subRef.current = [];

    isListening.current = true;
    setMode('listening');
    setStatusText('🔴 正在聆听...说"停"停止');

    // 订阅结果事件
    const onResult = SREvents?.addListener('result', (event: any) => {
      if (!isListening.current) return;
      const results = event?.results;
      if (!results?.length) return;

      const transcript = results[0]?.transcript || '';
      const isFinal = event?.isFinal;

      // 检查停止命令
      if (isFinal && (transcript.toLowerCase().trim() === '停' || transcript.toLowerCase().trim() === '停止' || transcript.toLowerCase().includes('停'))) {
        stopRecognizer();
        return;
      }

      if (isFinal && transcript.trim()) {
        setOriginalText(transcript);
        setPartialText('');
        setStatusText('🔍 翻译中...');

        translateText(transcript, sLang.current, tLang.current).then((res) => {
          if (!isListening.current) return;
          setTranslatedText(res);
          setStatusText('🔴 翻译完成，继续聆听...');

          if (speakRef.current && res && res !== transcript) {
            Speech.speak(res, {
              language: tLang.current === 'zh-CN' ? 'zh-CN' : tLang.current,
              rate: 0.9,
            });
          }
          setHistory(prev => [{
            id: Date.now(), original: transcript, translated: res,
            source: sLang.current, target: tLang.current, timestamp: Date.now(),
          }, ...prev].slice(0, 50));
        });
      } else if (!isFinal && transcript.trim()) {
        setPartialText(transcript);
      }
    });

    // 订阅错误
    const onError = SREvents?.addListener('error', (event: any) => {
      const err = event?.error || '';
      if (err === 'no-match' || err === 'no-speech') return; // 静默忽略
      console.warn('SR error:', err, event?.message);
    });

    // 订阅结束 — Android 每次 onResults 后自动结束，需要重启
    const onEnd = SREvents?.addListener('end', () => {
      subRef.current.forEach(s => { try { s.remove(); } catch {} });
      subRef.current = [];
      if (isListening.current) {
        // 重新启动
        setTimeout(() => {
          if (isListening.current) {
            startRecognizerInternal();
          }
        }, 50);
      }
    });

    subRef.current = [onResult, onError, onEnd].filter(Boolean);

    // 启动 native
    startRecognizerInternal();
  }, []);

  const startRecognizerInternal = useCallback(() => {
    if (!SRModule) return;
    try {
      SRModule.start({
        lang: sLang.current === 'auto' ? 'zh-CN' : sLang.current,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
      });
    } catch (e: any) {
      console.warn('SR start failed:', e);
      isListening.current = false;
      setMode('idle');
      setStatusText('❌ 启动失败: ' + (e?.message || 'unknown'));
    }
  }, []);

  const stopRecognizer = useCallback(() => {
    isListening.current = false;
    subRef.current.forEach(s => { try { s.remove(); } catch {} });
    subRef.current = [];
    try { SRModule?.stop(); } catch {}
    try { SRModule?.abort(); } catch {}
    setMode('idle');
    setPartialText('');
    setStatusText('⏹️ 已停止');
  }, []);

  // ---- 按钮 ----
  const onMainButton = useCallback(() => {
    if (mode === 'listening') {
      stopRecognizer();
    } else {
      // 请求权限后再启动
      if (SRModule?.requestPermissionsAsync) {
        SRModule.requestPermissionsAsync().then((result: any) => {
          if (result?.granted || result?.status === 'granted') {
            startRecognizer();
          } else {
            Alert.alert('需要权限', '请在设置中允许麦克风权限');
          }
        }).catch(() => startRecognizer()); // 即使权限请求失败也试试
      } else {
        startRecognizer();
      }
    }
  }, [mode, startRecognizer, stopRecognizer]);

  // ---- 语言 ----
  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
  }, [sourceLang, targetLang]);
  const getLabel = (c: string) => LANGUAGES[c] || c;

  // ---- 弹窗 ----
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

      {/* 动物 */}
      {showAnimal && (
        <View style={sty.animalOverlay} pointerEvents="none" key={animalKey.current}>
          <Animated.View style={[sty.animalWrap, { transform: [{ translateX: animalX }, { translateY: animalY }] }]}>
            <Text style={sty.animalEmoji}>{animal}</Text>
          </Animated.View>
        </View>
      )}

      <Animated.View style={[sty.main, { opacity: fade }]}>
        {/* 头部 */}
        <View style={sty.header}>
          <View style={sty.titleRow}>
            <Animated.Text style={[sty.spirit, { opacity: pulse, transform: [{ scale: pulse }] }]}>{spirit}</Animated.Text>
            <View>
              <Text style={sty.title}>译通翻译</Text>
              <Text style={sty.sub}>语音翻译 · 持续聆听</Text>
            </View>
          </View>
          <Text style={sty.status}>{statusText}</Text>
        </View>

        <ScrollView style={sty.scroll} contentContainerStyle={sty.scrollIn} showsVerticalScrollIndicator={false}>
          {/* 主按钮 */}
          <TouchableOpacity style={[sty.btn, mode === 'listening' && sty.btnAct]} onPress={onMainButton} activeOpacity={0.7}>
            <Animated.Text style={[sty.btnIcon, mode === 'listening' && { opacity: listenPulse }]}>
              {mode === 'listening' ? '🔴' : '🎤'}
            </Animated.Text>
            <Text style={sty.btnText}>
              {mode === 'listening' ? '点击停止\n说"停"也可停止' : '点击开始翻译'}
            </Text>
          </TouchableOpacity>

          {/* 说明 */}
          <View style={sty.card}>
            <Text style={sty.cardT}>🎯 使用说明</Text>
            {[
              ['🎤', '点击按钮或说"停"控制翻译'],
              ['🌐', '支持中/英/日/韩等多语言互译'],
              ['🔊', '翻译结果自动朗读'],
              ['🐱', '挂后台后小动物从屏幕跑过'],
            ].map(([ico, txt], i) => (
              <View key={i} style={sty.helpR}><Text style={sty.helpI}>{ico}</Text><Text style={sty.helpT}>{txt}</Text></View>
            ))}
          </View>

          {/* 实时语音 */}
          {partialText ? (
            <View style={sty.card}><Text style={sty.cardT}>🎤 正在听...</Text><Text style={sty.partial}>{partialText}</Text></View>
          ) : null}

          {/* 翻译结果 */}
          {originalText ? (
            <View style={sty.card}>
              <Text style={sty.cardT}>📝 翻译结果</Text>
              <View><Text style={sty.trL}>原文</Text><Text style={sty.trT}>{originalText}</Text></View>
              <View style={sty.div} />
              <View><Text style={sty.trL}>译文</Text><Text style={[sty.trT, sty.trR]}>{translatedText}</Text></View>
            </View>
          ) : null}

          {/* 语言 */}
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

          {/* 设置 */}
          <View style={sty.card}>
            <Text style={sty.cardT}>⚙️ 设置</Text>
            <View style={sty.setR}>
              <Text style={sty.setL}>朗读结果</Text>
              <Switch value={speakResult} onValueChange={setSpeakResult}
                trackColor={{ false: '#333', true: '#4a9eff' }} thumbColor="#fff" />
            </View>
          </View>

          {/* 历史 */}
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
          <View style={{ height: 40 }} />
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
  helpI: { fontSize: 16 },
  helpT: { fontSize: 14, color: THEME.text },

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
  setL: { fontSize: 15, color: THEME.text },

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
