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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';

// ============================================================
// 译通翻译 v2.3
//
// 【重要】Android 语音识别策略
// 使用 ExpoSpeechRecognitionModule 直接 native 调用
// 避免 ExpoWebSpeechRecognition 兼容层的私有成员问题
//
// 所有功能：
// 1. 唤醒词"译通" — 低功耗后台监听
// 2. 说"开始翻译"→持续翻译，说"停"→停止
// 3. 45秒无语音自动休眠
// 4. 挂后台→小动物从右往左直线跑过（整个动物身体）
// 5. 拍照翻译（入口，完整功能后续）
// ============================================================

const { width: SCREEN_W } = Dimensions.get('window');
const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

const THEME = {
  bg: '#1a1a2e', card: '#16213e', accent: '#4a9eff',
  text: '#dedeff', sub: '#8888aa', danger: '#ff4a6a',
};

// ---- 语音识别模块 ----
// 直接导入 native module，跳过 Web API 兼容层
let SR: any = null;
let SR_AVAILABLE = false;
try {
  const mod = require('expo-speech-recognition');
  SR = mod.ExpoSpeechRecognitionModule;
  if (SR && typeof SR.start === 'function') {
    SR_AVAILABLE = true;
  }
} catch (e) {
  console.warn('SpeechRecognition not available:', e);
}

// ---- 语言 ----
const LANGUAGES: Record<string, string> = {
  auto: '自动检测', 'zh-CN': '中文', 'en': 'English', 'ja': '日本語',
  'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español',
  'it': 'Italiano', 'pt': 'Português', 'ru': 'Русский', 'ar': 'العربية',
  'th': 'ไทย', 'vi': 'Tiếng Việt',
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

export default function App() {
  // ---- 核心状态 ----
  const [mode, setMode] = useState<'idle' | 'listen'>('idle');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('🎯 说"译通"唤醒我');
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
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sLang.current = sourceLang; }, [sourceLang]);
  useEffect(() => { tLang.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);

  // native 事件监听器引用
  const listenersRef = useRef<any[]>([]);
  const isListeningRef = useRef(false);
  const sleepTimerRef = useRef<any>(null);
  const wokeByWakewordRef = useRef(false);

  // 清除所有监听器
  const clearListeners = useCallback(() => {
    listenersRef.current.forEach((sub: any) => {
      try { sub.remove(); } catch {}
    });
    listenersRef.current = [];
  }, []);

  // 停止语音
  const stopSR = useCallback(() => {
    clearListeners();
    isListeningRef.current = false;
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    try { if (SR?.abort) SR.abort(); } catch {}
    try { if (SR?.stop) SR.stop(); } catch {}
    setPartialText('');
  }, [clearListeners]);

  // 回到待命
  const goIdle = useCallback((msg?: string) => {
    stopSR();
    setMode('idle');
    setStatusText(msg || '🎯 说"译通"唤醒我');
  }, [stopSR]);

  // ---- 退出动物动画 ----
  const animalX = useRef(new Animated.Value(SCREEN_W + 50)).current;
  const animalY = useRef(new Animated.Value(200)).current;
  const animalKey = useRef(0);

  const showAnimalRun = useCallback(() => {
    const a = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setAnimal(a);
    animalKey.current++;
    animalX.setValue(SCREEN_W + 30);
    animalY.setValue(60 + Math.random() * (250 - 60));
    setShowAnimal(true);
    Animated.timing(animalX, {
      toValue: -120, duration: 2500 + Math.random() * 1500,
      easing: Easing.linear, useNativeDriver: true,
    }).start(() => {
      setTimeout(() => setShowAnimal(false), 300);
    });
  }, []);

  // ---- AppState 监听 ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        stopSR();
        setMode('idle');
        showAnimalRun();
      }
    });
    return () => sub.remove();
  }, []);

  // ---- 动画 ----
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

  // ---- ⭐ 核心：唤醒词监听 + 持续翻译 (二合一模式) ----
  // 使用 ExpoSpeechRecognitionModule 的 addListener 直接监听 native 事件
  // 全程只保持一个 recognizer 实例

  const startListening = useCallback((isWakewordMode: boolean) => {
    if (!SR_AVAILABLE || isListeningRef.current) return;

    clearListeners();
    isListeningRef.current = true;
    wokeByWakewordRef.current = false;

    // 订阅结果事件
    const onResult = SR.addListener('result', (event: any) => {
      if (!isListeningRef.current) return;

      const results = event?.results;
      if (!results?.length) return;

      const transcript = results[0]?.transcript || '';
      const isFinal = event?.isFinal;
      const lower = transcript.toLowerCase().trim();

      if (isWakewordMode) {
        // === 唤醒模式 ===
        if (isFinal) {
          // 检测唤醒词
          if (lower.includes('译通') || lower.includes('一通') || lower.includes('意通')) {
            Vibration.vibrate(100);
            setSpirit('👋');
            setTimeout(() => setSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 1500);
            Speech.speak('我在！', { language: 'zh-CN', rate: 0.9 });
            setStatusText('🎯 我在！说"开始翻译"');
            wokeByWakewordRef.current = true;
            // 切换到翻译模式
            try { SR.stop(); } catch {}
            isListeningRef.current = false;
            clearListeners();
            setTimeout(() => startListening(false), 300);
            return;
          }
        }
      } else {
        // === 翻译模式 ===
        // 检查停止命令
        if (isFinal && (lower === '停' || lower === '停止' || lower.includes('停'))) {
          goIdle('⏹️ 已停止');
          return;
        }

        if (isFinal && transcript) {
          // 重置休眠计时器
          if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
          sleepTimerRef.current = setTimeout(() => {
            if (modeRef.current === 'listen') {
              goIdle('😴 长时间无语音，自动休眠');
            }
          }, 45000);

          setOriginalText(transcript);
          setPartialText('');
          setStatusText('🔍 翻译中...');

          translateText(transcript, sLang.current, tLang.current).then((res) => {
            if (!isListeningRef.current) return;
            setTranslatedText(res);
            setStatusText('🔴 翻译完成');

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
        } else if (!isFinal && transcript) {
          setPartialText(transcript);
        }
      }
    });

    // 订阅错误事件
    const onError = SR.addListener('error', (event: any) => {
      const err = event?.error || 'unknown';
      // 忽略"no-match"和"aborted"（正常）
      if (err === 'no-match' || err === 'aborted' || err === 'no-speech') return;
      console.warn('SR error:', err);
    });

    // 订阅结束事件 - 重启监听
    const onEnd = SR.addListener('end', () => {
      // Android 每次 onResults 后自动结束，需要重启
      if (isListeningRef.current) {
        // 清理旧订阅
        try { onResult?.remove(); } catch {}
        try { onError?.remove(); } catch {}
        try { onEnd?.remove(); } catch {}
        // 重新 start（短暂延迟避免死循环）
        setTimeout(() => {
          if (isListeningRef.current) {
            startListening(isWakewordMode);
          }
        }, 50);
      }
    });

    listenersRef.current = [onResult, onError, onEnd];

    // 启动 native
    try {
      SR.start({
        lang: isWakewordMode ? 'zh-CN' : (sLang.current === 'auto' ? 'zh-CN' : sLang.current),
        interimResults: !isWakewordMode, // 翻译模式需要中间结果
        continuous: true,
        maxAlternatives: 1,
      });
    } catch (e: any) {
      isListeningRef.current = false;
      setStatusText('❌ 启动失败: ' + (e?.message || 'unknown'));
      clearListeners();
    }
  }, [clearListeners, goIdle]);

  // ---- 启动 ----
  useEffect(() => {
    if (!SR_AVAILABLE) {
      setStatusText('⚠️ 语音模块不可用');
      return;
    }
    // App 启动后进入唤醒模式
    const t = setTimeout(() => startListening(true), 500);
    return () => { clearTimeout(t); stopSR(); };
  }, []);

  // ---- 按钮切换 ----
  const toggleTranslate = useCallback(() => {
    if (!SR_AVAILABLE) { Alert.alert('提示', '语音模块不可用'); return; }

    if (mode === 'listen' && !wokeByWakewordRef.current) {
      // 已经在听但没有唤醒词唤醒——先停
      goIdle('⏹️ 已停止');
    } else if (mode === 'listen' && wokeByWakewordRef.current) {
      // 唤醒词唤醒了，正在等命令——直接开始翻译
      // 已经在翻译模式了
    } else {
      // idle → 直接进翻译模式
      wokeByWakewordRef.current = true;
      setMode('listen');
      setStatusText('🔴 翻译中...说"停"停止');
      startListening(false);
    }
  }, [mode, goIdle, startListening]);

  // 实际上要重新设计模式逻辑：按钮点击和语音切换之间的协调
  // 修复：按钮按下时根据当前状态决定
  const onMainButton = useCallback(() => {
    if (mode === 'listen') {
      // 正在翻译或命令监听中 → 停止
      goIdle('⏹️ 已停止');
      // 重新启动唤醒
      setTimeout(() => startListening(true), 300);
    } else {
      // idle → 直接开始翻译
      setMode('listen');
      setStatusText('🔴 翻译中...说"停"停止');
      startListening(false);
    }
  }, [mode, goIdle, startListening]);

  // 监听 mode 变化来更新唤醒/翻译切换
  useEffect(() => {
    if (mode === 'idle') {
      // 空闲时开启唤醒监听
      if (SR_AVAILABLE && !isListeningRef.current) {
        setTimeout(() => startListening(true), 200);
      }
    }
  }, [mode]);

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

      {/* 动物跑过 */}
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
              <Text style={sty.sub}>说"译通"唤醒 · 持续翻译</Text>
            </View>
          </View>
          <View style={sty.statRow}>
            <Text style={sty.status}>{statusText}</Text>
            {mode === 'idle' && SR_AVAILABLE && (
              <View style={sty.badge}><View style={sty.badgeDot} /><Text style={sty.badgeText}>译通待命</Text></View>
            )}
            {mode === 'listen' && (
              <View style={sty.actBadge}><Text style={sty.actBadgeText}>翻译中</Text></View>
            )}
          </View>
        </View>

        <ScrollView style={sty.scroll} contentContainerStyle={sty.scrollIn} showsVerticalScrollIndicator={false}>
          {/* 主按钮 */}
          <TouchableOpacity style={[sty.btn, mode === 'listen' && sty.btnAct]} onPress={onMainButton} activeOpacity={0.7}>
            <Text style={sty.btnIcon}>{mode === 'listen' ? '🔴' : '🎤'}</Text>
            <Text style={sty.btnText}>
              {mode === 'listen' ? '停止翻译\n说"停"也可停止' : '点击开始翻译\n或说"译通"+"开始翻译"'}
            </Text>
          </TouchableOpacity>

          {/* 说明 */}
          <View style={sty.card}>
            <Text style={sty.cardT}>🎯 语音控制</Text>
            {[
              ['🎤', '① 说"译通"唤醒我'],
              ['▶️', '② 说"开始翻译"进入持续翻译'],
              ['⏹️', '③ 说"停"停止翻译'],
              ['😴', '④ 45秒无语音自动休眠'],
              ['🐱', '⑤ 挂后台→小动物从右往左跑过'],
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
              <Text>朗读结果</Text>
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
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  status: { fontSize: 14, color: THEME.accent, flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(74,255,138,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4aff8a', marginRight: 5 },
  badgeText: { fontSize: 11, color: '#4aff8a', fontWeight: '600' },
  actBadge: { backgroundColor: 'rgba(255,74,106,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  actBadgeText: { fontSize: 11, color: '#ff4a6a', fontWeight: '600' },

  scroll: { flex: 1 },
  scrollIn: { padding: 16, gap: 12 },

  btn: { backgroundColor: '#222244', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
  btnAct: { borderColor: '#ff4a6a', backgroundColor: '#2a1a2e' },
  btnIcon: { fontSize: 48, marginBottom: 8 },
  btnText: { fontSize: 16, color: THEME.text, textAlign: 'center', lineHeight: 22 },

  card: { backgroundColor: THEME.card, borderRadius: 16, padding: 16 },
  cardT: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  helpR: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
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
