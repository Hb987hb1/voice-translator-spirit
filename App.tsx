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
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';

// ============================================================
// 译通翻译 v4.0
// 自定义 Android 原生模块 VoiceTranslator
// 直接调用 Android SpeechRecognizer
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

// ---- 自定义原生模块 ----
const VT = NativeModules.VoiceTranslator;
let VTEvent: NativeEventEmitter | null = null;
try {
  if (VT) VTEvent = new NativeEventEmitter(VT);
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
  const startListen = useCallback(() => {
    if (!VT) { setStatusText('❌ 语音模块未加载'); return; }

    // 先检查权限
    VT.checkPermission().then((granted: boolean) => {
      if (granted) {
        doStart();
      } else {
        // 请求权限
        VT.requestPermission().then((ok: boolean) => {
          if (ok) doStart();
          else Alert.alert('需要权限', '请允许麦克风权限');
        }).catch(() => doStart());
      }
    });
  }, []);

  const doStart = useCallback(() => {
    if (!VT) return;

    // 清除旧的监听器
    subsRef.current.forEach((s: any) => s.remove());
    subsRef.current = [];

    setIsListening(true);
    isListenRef.current = true;
    setStatusText('🔴 聆听中...说"停"停止');

    // 监听事件
    const onResult = VTEvent?.addListener('onResult', (e: any) => {
      const text = e?.text || '';
      const isFinal = e?.isFinal;

      if (isFinal && text.trim()) {
        // 检查停止命令
        const lower = text.trim().toLowerCase();
        if (lower === '停' || lower === '停止' || lower === 'ting') {
          stopListen();
          return;
        }
        handleTranslate(text);
      } else if (!isFinal && text.trim()) {
        setPartialText(text);
      }
    });

    const onError = VTEvent?.addListener('onError', (e: any) => {
      const msg = e?.message || '';
      if (msg.includes('未识别') || msg.includes('超时')) return;
      console.warn('VT Error:', msg);
    });

    const onEnd = VTEvent?.addListener('onEnd', () => {
      // Android 每次结果后自动结束，自动重启实现持续翻译
      setTimeout(() => {
        if (isListenRef.current && VT) {
          doStart();
        }
      }, 100);
    });

    subsRef.current = [onResult, onError, onEnd].filter(Boolean);

    // 启动识别
    try {
      VT.startListening({
        language: sLang.current === 'auto' ? 'zh-CN' : sLang.current,
        continuous: true,
        interimResults: true,
        wakewordMode: false,
      });
    } catch (e: any) {
      setIsListening(false);
      isListenRef.current = false;
      setStatusText('❌ 启动失败');
    }
  }, []);

  const stopListen = useCallback(() => {
    subsRef.current.forEach((s: any) => s.remove());
    subsRef.current = [];
    try { VT?.stopListening?.(); } catch {}
    setIsListening(false);
    isListenRef.current = false;
    setPartialText('');
    setStatusText('⏹️ 已停止');
  }, []);

  const handleTranslate = useCallback((text: string) => {
    setOriginalText(text);
    setPartialText('');
    setStatusText('🔍 翻译中...');

    translateText(text, sLang.current, tLang.current).then((res) => {
      setTranslatedText(res);
      setStatusText('🔴 翻译完成');
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

  // ---- 按钮 ----
  const onMain = useCallback(() => {
    if (isListening) { stopListen(); }
    else { startListen(); }
  }, [isListening, stopListen, startListen]);

  // ---- 语言 ----
  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
  }, [sourceLang, targetLang]);
  const gl = (c: string) => LANGUAGES[c] || c;

  const Picker = ({ visible, onClose, onSelect, excludeAuto }: { visible: boolean; onClose: () => void; onSelect: (c: string) => void; excludeAuto: boolean }) => {
    if (!visible) return null;
    const codes = excludeAuto ? LANG_CODES.filter(c => c !== 'auto') : LANG_CODES;
    return (
      <View style={st.overlay}>
        <View style={st.pickerBox}>
          <Text style={st.pickerTitle}>选择语言</Text>
          <ScrollView style={st.pickerList}>
            {codes.map(code => (
              <TouchableOpacity key={code} style={st.pickerItem} onPress={() => { onSelect(code); onClose(); }}>
                <Text style={st.pickerText}>{LANGUAGES[code]}</Text>
                <Text style={st.pickerCode}>{code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={st.pickerClose} onPress={onClose}><Text style={st.pickerCloseText}>关闭</Text></TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.c}>
      <StatusBar style="light" />

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
          <View>
            <Text style={st.t}>译通翻译</Text>
            <Text style={st.su}>语音翻译 · 说"停"停止</Text>
          </View>
        </View>
        <Text style={st.st}>{statusText}</Text>
      </View>

      <ScrollView style={st.s} contentContainerStyle={st.si2}>
        <TouchableOpacity style={[st.b, isListening && st.ba]} onPress={onMain} activeOpacity={0.7}>
          <Text style={st.bi}>{isListening ? '🔴' : '🎤'}</Text>
          <Text style={st.bt}>{isListening ? '点击停止\n说"停"也可停止' : '点击开始翻译'}</Text>
        </TouchableOpacity>

        <View style={st.cd}>
          <Text style={st.ct}>🎯 使用说明</Text>
          {[['🎤', '点击按钮开始语音识别'], ['🔊', '翻译结果自动朗读'], ['⏹️', '说"停"或点按钮停止'], ['🐱', '退出后小动物跑过屏幕']].map(([ico, txt], i) => (
            <View key={i} style={st.hr}><Text>{ico}</Text><Text style={st.ht}>{txt}</Text></View>
          ))}
        </View>

        {partialText ? <View style={st.cd}><Text style={st.ct}>🎤 正在听...</Text><Text style={st.pt}>{partialText}</Text></View> : null}

        {originalText ? (
          <View style={st.cd}>
            <Text style={st.ct}>📝 翻译结果</Text>
            <View><Text style={st.tl}>原文</Text><Text style={st.tt}>{originalText}</Text></View>
            <View style={st.d} />
            <View><Text style={st.tl}>译文</Text><Text style={[st.tt, st.trr]}>{translatedText}</Text></View>
          </View>
        ) : null}

        <View style={st.cd}>
          <Text style={st.ct}>🌐 语言设置</Text>
          <View style={st.lr}>
            <TouchableOpacity style={st.ls} onPress={() => setShowSourcePicker(true)}>
              <Text style={st.ll}>源语言</Text><Text style={st.lv}>{gl(sourceLang)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sb} onPress={swap}><Text>⇄</Text></TouchableOpacity>
            <TouchableOpacity style={st.ls} onPress={() => setShowTargetPicker(true)}>
              <Text style={st.ll}>目标语言</Text><Text style={st.lv}>{gl(targetLang)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={st.cd}>
          <Text style={st.ct}>⚙️ 设置</Text>
          <View style={st.sr}><Text>朗读结果</Text>
            <Switch value={speakResult} onValueChange={setSpeakResult} trackColor={{ false: '#333', true: '#4a9eff' }} thumbColor="#fff" />
          </View>
        </View>

        {history.length > 0 && (
          <View style={st.cd}>
            <Text style={st.ct}>📋 翻译历史</Text>
            {history.slice(0, 5).map(item => (
              <View key={item.id} style={st.hi}>
                <Text style={st.ho} numberOfLines={1}>{item.original}</Text>
                <Text style={st.htr} numberOfLines={1}>{item.translated}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Picker visible={showSourcePicker} onClose={() => setShowSourcePicker(false)} onSelect={c => setSourceLang(c)} excludeAuto={false} />
      <Picker visible={showTargetPicker} onClose={() => setShowTargetPicker(false)} onSelect={c => setTargetLang(c)} excludeAuto={true} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#1a1a2e' },
  ao: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 },
  aw: { position: 'absolute', bottom: 100 },
  ae: { fontSize: 48 },
  h: { paddingTop: Platform.OS === 'android' ? 40 : 20, paddingHorizontal: 20, paddingBottom: 10 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  si: { fontSize: 40 },
  t: { fontSize: 24, fontWeight: 'bold', color: '#dedeff' },
  su: { fontSize: 13, color: '#8888aa', marginTop: 2 },
  st: { fontSize: 14, color: '#4a9eff', marginTop: 8 },
  s: { flex: 1 },
  si2: { padding: 16, gap: 12 },
  b: { backgroundColor: '#222244', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
  ba: { borderColor: '#ff4a6a', backgroundColor: '#2a1a2e' },
  bi: { fontSize: 48, marginBottom: 8 },
  bt: { fontSize: 16, color: '#dedeff', textAlign: 'center', lineHeight: 22 },
  cd: { backgroundColor: '#16213e', borderRadius: 16, padding: 16 },
  ct: { fontSize: 15, fontWeight: 'bold', color: '#dedeff', marginBottom: 12 },
  hr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  ht: { fontSize: 14, color: '#dedeff' },
  pt: { fontSize: 18, color: '#ffcc4a', fontStyle: 'italic' },
  tl: { fontSize: 12, color: '#8888aa', marginBottom: 3 },
  tt: { fontSize: 16, color: '#dedeff', lineHeight: 22 },
  trr: { color: '#4affaa', fontWeight: '500' },
  d: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 8 },
  lr: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ls: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  ll: { fontSize: 12, color: '#8888aa', marginBottom: 4 },
  lv: { fontSize: 15, color: '#dedeff', fontWeight: '500' },
  sb: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4a9eff', alignItems: 'center', justifyContent: 'center' },
  sr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  hi: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  ho: { fontSize: 14, color: '#8888aa' },
  htr: { fontSize: 14, color: '#4affaa', marginTop: 2 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  pickerBox: { backgroundColor: '#16213e', borderRadius: 20, width: '85%', maxHeight: '70%', padding: 20 },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', color: '#dedeff', marginBottom: 12, textAlign: 'center' },
  pickerList: { maxHeight: 400 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pickerText: { fontSize: 16, color: '#dedeff' },
  pickerCode: { fontSize: 12, color: '#8888aa' },
  pickerClose: { marginTop: 12, alignItems: 'center', padding: 12, backgroundColor: '#4a9eff', borderRadius: 10 },
  pickerCloseText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
