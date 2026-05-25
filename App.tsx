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
  Modal,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { ExpoWebSpeechRecognition } from 'expo-speech-recognition';

// ============================================================
// 译通翻译 v2.1
// 正确使用 expo-speech-recognition 56.0.0 Web Speech API
// - 唤醒词"译通"
// - 持续翻译（说"开始翻译"→翻到说"停"）
// - 退出随机路线动物动画
// - 拍照翻译
// ============================================================

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---- 语言 ----
const LANGUAGES: Record<string, string> = {
  auto: '自动检测', 'zh-CN': '中文(简体)', 'zh-TW': '中文(繁体)',
  en: 'English', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano',
  pt: 'Português', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी',
  th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
  tr: 'Türkçe', nl: 'Nederlands', pl: 'Polski', sv: 'Svenska',
};
const LANGUAGE_CODES = Object.keys(LANGUAGES);
const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

const THEME = {
  bg: '#1a1a2e', card: '#16213e', accent: '#4a9eff',
  text: '#dedeff', sub: '#8888aa', danger: '#ff4a6a', success: '#4aff8a',
};

// ---- 翻译 ----
async function translateText(text: string, source: string, target: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${
      source === 'auto' ? 'auto' : source
    }&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data?.[0]?.map((item: any) => item[0]).join('') || text;
  } catch {
    return `[待翻译] ${text}`;
  }
}

interface TranslationItem {
  id: number;
  original: string;
  translated: string;
  source: string;
  target: string;
  timestamp: number;
}

// ============================================================
export default function App() {
  // ---- 状态 ----
  const [mode, setMode] = useState<'idle' | 'wakeword' | 'continuous'>('idle');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('🎯 说"译通"唤醒我');
  const [history, setHistory] = useState<TranslationItem[]>([]);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [currentSpirit, setCurrentSpirit] = useState(SPIRITS[0]);
  const [partialText, setPartialText] = useState('');
  const [wakewordOn, setWakewordOn] = useState(true);
  const [showExitAnim, setShowExitAnim] = useState(false);
  const [exitAnimal, setExitAnimal] = useState('🐱');
  const [showCamera, setShowCamera] = useState(false);

  // 退出动画动画值（不固定路线）
  const exitX = useRef(new Animated.Value(-200)).current;
  const exitY = useRef(new Animated.Value(SCREEN_H * 0.6)).current;
  const exitScale = useRef(new Animated.Value(0.5)).current;
  const exitRotate = useRef(new Animated.Value(0)).current;

  // refs
  const modeRef = useRef(mode);
  const langRef = useRef(sourceLang);
  const targetRef = useRef(targetLang);
  const speakRef = useRef(speakResult);
  const wakeRef = useRef(wakewordOn);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { langRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetRef.current = targetLang; }, [targetLang]);
  useEffect(() => { speakRef.current = speakResult; }, [speakResult]);
  useEffect(() => { wakeRef.current = wakewordOn; }, [wakewordOn]);

  // ---- 动画 ----
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    const t = setInterval(() => setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 8000);
    return () => { clearInterval(t); };
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (mode === 'continuous') {
      Animated.loop(Animated.sequence([
        Animated.timing(contPulse, { toValue: 0.4, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(contPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    } else { contPulse.setValue(1); }
  }, [mode]);

  // ---- 退出动画：随机路径跑过屏幕 ----
  const doExitAnimation = useCallback(() => {
    const animal = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setExitAnimal(animal);
    setShowExitAnim(true);

    // 随机起始位置和终点
    const startY = 100 + Math.random() * (SCREEN_H - 300);
    const endY = 50 + Math.random() * (SCREEN_H - 200);
    const endX = SCREEN_W + 100;

    exitX.setValue(-150);
    exitY.setValue(startY);
    exitScale.setValue(0.3 + Math.random() * 0.4);
    exitRotate.setValue(0);

    // 随机跑过：左右晃动 + 旋转 + 缩放弹跳
    Animated.parallel([
      Animated.timing(exitX, {
        toValue: endX, duration: 2500 + Math.random() * 1500,
        easing: Easing.linear, useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(exitY, { toValue: endY, duration: 800, easing: Easing.quad, useNativeDriver: true }),
        Animated.timing(exitY, { toValue: endY - 60, duration: 600, easing: Easing.quad, useNativeDriver: true }),
        Animated.timing(exitY, { toValue: endY + 30, duration: 500, easing: Easing.quad, useNativeDriver: true }),
        Animated.timing(exitY, { toValue: endY - 20, duration: 400, easing: Easing.quad, useNativeDriver: true }),
        Animated.timing(exitY, { toValue: endY + 10, duration: 300, easing: Easing.quad, useNativeDriver: true }),
        Animated.timing(exitY, { toValue: endY, duration: 200, easing: Easing.quad, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(exitScale, { toValue: 1.0, duration: 300, useNativeDriver: true }),
        Animated.timing(exitScale, { toValue: 0.8, duration: 400, useNativeDriver: true }),
        Animated.timing(exitScale, { toValue: 0.9, duration: 300, useNativeDriver: true }),
      ]),
      Animated.timing(exitRotate, {
        toValue: Math.random() > 0.5 ? 1 : -1, duration: 2000,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => setShowExitAnim(false), 800);
    });
  }, []);

  const rotateInterp = exitRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // ---- 退出检测 ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (modeRef.current !== 'idle') {
          // 停止所有语音识别
          stopAll();
        }
        doExitAnimation();
      }
    });
    return () => sub.remove();
  }, []);

  // ---- 语音识别核心 ----
  const wakeRecognizerRef = useRef<ExpoWebSpeechRecognition | null>(null);
  const contRecognizerRef = useRef<ExpoWebSpeechRecognition | null>(null);

  const stopAll = useCallback(() => {
    try { wakeRecognizerRef.current?.abort(); } catch {}
    try { contRecognizerRef.current?.abort(); } catch {}
    setMode('idle');
    setPartialText('');
  }, []);

  // ---- 唤醒词监听 ----
  const startWakeword = useCallback(() => {
    if (!wakewordOn || mode !== 'idle') return;

    try {
      const sr = new ExpoWebSpeechRecognition();
      sr.lang = 'zh-CN';
      sr.continuous = true;
      sr.interimResults = false;

      sr.onresult = (event) => {
        if (!event?.results?.[0]) return;
        const text = event.results[0][0]?.transcript?.toLowerCase() || '';
        const isFinal = event.results[0].isFinal;

        if (!isFinal) return;

        // 唤醒词检测
        if (text.includes('译通') || text.includes('一通') || text.includes('意通') || text.includes('易通')) {
          Vibration.vibrate(100);
          setCurrentSpirit('👋');
          setTimeout(() => setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 1200);
          Speech.speak('我在！', { language: 'zh-CN', rate: 1.0 });
          setStatusText('🎯 我在！说"开始翻译"');
          // 停止唤醒监听，启动命令监听
          try { sr.abort(); } catch {}
          startCommandListener();
          return;
        }
      };

      sr.onerror = () => {
        // 出错自动重试
        if (wakeRef.current && modeRef.current === 'idle') {
          setTimeout(startWakeword, 1500);
        }
      };

      sr.onend = () => {
        // 自然结束后，如果还在 idle 就重启
        if (wakeRef.current && modeRef.current === 'idle') {
          setTimeout(startWakeword, 500);
        }
      };

      sr.start();
      wakeRecognizerRef.current = sr;
    } catch (e) {
      // 权限问题等
      setTimeout(startWakeword, 2000);
    }
  }, [mode, wakewordOn]);

  // ---- 命令监听（唤醒后等"开始翻译"） ----
  const startCommandListener = useCallback(() => {
    try {
      const sr = new ExpoWebSpeechRecognition();
      sr.lang = 'zh-CN';
      sr.continuous = false;
      sr.interimResults = false;

      sr.onresult = (event) => {
        if (!event?.results?.[0]?.isFinal) return;
        const text = event.results[0][0]?.transcript?.toLowerCase() || '';

        if (text.includes('开始翻译') || text.includes('翻译') || text.includes('开始')) {
          startContinuous();
          return;
        }
        if (text.includes('停') || text.includes('停止')) {
          stopAll();
          setStatusText('⏹️ 已停止');
          setTimeout(startWakeword, 500);
          return;
        }
        // 没听清，再听一次
        try { sr.abort(); } catch {}
        setTimeout(startCommandListener, 300);
      };

      sr.onerror = () => {
        setTimeout(startWakeword, 500);
      };

      sr.start();
      contRecognizerRef.current = sr;
    } catch {
      setTimeout(startWakeword, 500);
    }
  }, []);

  // ---- 持续翻译 ----
  const startContinuous = useCallback(async () => {
    try {
      const sr = new ExpoWebSpeechRecognition();
      sr.lang = langRef.current === 'auto' ? 'zh-CN' : langRef.current;
      sr.continuous = true;
      sr.interimResults = true;

      setMode('continuous');
      setStatusText('🔴 持续翻译中...说"停"停止');

      sr.onresult = (event) => {
        if (!event?.results?.length || !modeRef.current) return;

        const lastIdx = event.results.length - 1;
        const result = event.results[lastIdx];
        const text = result[0]?.transcript || '';
        const isFinal = result.isFinal;

        // 检查停止命令
        const lower = text.toLowerCase();
        if (isFinal && (lower.includes('停') || lower.includes('停止') || lower === '停')) {
          stopAll();
          setStatusText('✅ 已停止，说"译通"唤醒我');
          setTimeout(startWakeword, 500);
          return;
        }

        if (isFinal && text.trim()) {
          setOriginalText(text);
          setPartialText('');
          setStatusText('🔍 翻译中...');
          // 立即翻译
          translateText(text, langRef.current, targetRef.current).then((result) => {
            if (!modeRef.current) return;
            setTranslatedText(result);
            setStatusText('✅ 翻译完成');
            if (speakRef.current && result && result !== text) {
              Speech.speak(result, {
                language: targetRef.current === 'zh-CN' ? 'zh-CN' : targetRef.current,
                rate: 0.9,
              });
            }
            const item: TranslationItem = {
              id: Date.now(),
              original: text,
              translated: result,
              source: langRef.current,
              target: targetRef.current,
              timestamp: Date.now(),
            };
            setHistory((prev) => [item, ...prev].slice(0, 50));
          });
        } else if (!isFinal) {
          setPartialText(text);
        }
      };

      sr.onerror = () => {
        if (modeRef.current === 'continuous') {
          // 错误重试
          setTimeout(startContinuous, 1000);
        }
      };

      sr.onend = () => {
        if (modeRef.current === 'continuous') {
          setTimeout(startContinuous, 500);
        }
      };

      sr.start();
      contRecognizerRef.current = sr;
    } catch {
      setMode('idle');
      setStatusText('❌ 启动失败，请检查麦克风权限');
    }
  }, []);

  // ---- 启动唤醒监听 ----
  useEffect(() => {
    if (wakewordOn && mode === 'idle') {
      const t = setTimeout(startWakeword, 1000);
      return () => { clearTimeout(t); try { wakeRecognizerRef.current?.abort(); } catch {} };
    }
  }, [wakewordOn, mode, startWakeword]);

  // ---- 按钮切换 ----
  const toggleTranslate = useCallback(() => {
    if (mode === 'continuous') {
      stopAll();
      setStatusText('⏹️ 已停止');
      setTimeout(startWakeword, 500);
    } else {
      startContinuous();
    }
  }, [mode, stopAll, startContinuous, startWakeword]);

  // ---- 语言 ----
  const swap = useCallback(() => {
    if (sourceLang !== 'auto') {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
    }
  }, [sourceLang, targetLang]);
  const getLabel = (c: string) => LANGUAGES[c] || c;

  // ---- 语言选择弹窗 ----
  const renderPicker = (visible: boolean, onClose: () => void, onSelect: (c: string) => void, excludeAuto: boolean) => {
    if (!visible) return null;
    const codes = excludeAuto ? LANGUAGE_CODES.filter(c => c !== 'auto') : LANGUAGE_CODES;
    return (
      <View style={s.pickerOverlay}>
        <View style={s.pickerBox}>
          <Text style={s.pickerTitle}>选择语言</Text>
          <ScrollView style={s.pickerList}>
            {codes.map(code => (
              <TouchableOpacity key={code} style={s.pickerItem} onPress={() => { onSelect(code); onClose(); }}>
                <Text style={s.pickerText}>{LANGUAGES[code]}</Text>
                <Text style={s.pickerCode}>{code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.pickerClose} onPress={onClose}><Text style={s.pickerCloseText}>关闭</Text></TouchableOpacity>
        </View>
      </View>
    );
  };

  // ====== 渲染 ======
  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="light" />

      {/* 退出动物动画 */}
      {showExitAnim && (
        <View style={s.exitOverlay} pointerEvents="none">
          <Animated.View style={[
            s.exitWrap,
            { transform: [
              { translateX: exitX },
              { translateY: exitY },
              { scale: exitScale },
              { rotate: rotateInterp },
            ]}
          ]}>
            <Text style={s.exitEmoji}>{exitAnimal}</Text>
            <Text style={s.exitText}>译通退出啦~</Text>
          </Animated.View>
        </View>
      )}

      {/* 拍照翻译弹窗 */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={() => setShowCamera(false)}>
        <View style={s.camContainer}>
          <Text style={s.camPlaceholder}>📷 拍照翻译</Text>
          <Text style={s.camInfo}>拍照翻译需要 expo-camera 模块支持</Text>
          <Text style={s.camInfo}>此功能将在下一版本启用</Text>
          <TouchableOpacity style={s.camButton} onPress={() => setShowCamera(false)}>
            <Text style={s.camButtonText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Animated.View style={[s.main, { opacity: fadeAnim }]}>
        {/* 头部 */}
        <View style={s.header}>
          <View style={s.titleRow}>
            <Animated.Text style={[s.spiritIcon, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]}>
              {currentSpirit}
            </Animated.Text>
            <View>
              <Text style={s.title}>译通翻译</Text>
              <Text style={s.subtitle}>说"译通"唤醒 · 持续翻译 · 语音控制</Text>
            </View>
          </View>
          <View style={s.statusRow}>
            <Text style={s.statusText}>{statusText}</Text>
            {wakewordOn && mode === 'idle' && (
              <View style={s.wakeBadge}>
                <View style={s.wakeDot} />
                <Text style={s.wakeBadgeText}>译通待命</Text>
              </View>
            )}
            {mode === 'continuous' && (
              <View style={s.contBadge}>
                <Animated.View style={[s.contDot, { opacity: contPulse }]} />
                <Text style={s.contBadgeText}>翻译中</Text>
              </View>
            )}
          </View>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
          {/* 主按钮 */}
          <TouchableOpacity
            style={[s.mainBtn, mode === 'continuous' && s.mainBtnActive]}
            onPress={toggleTranslate}
            activeOpacity={0.7}>
            <Animated.Text style={[s.mainBtnIcon, mode === 'continuous' && { opacity: contPulse }]}>
              {mode === 'continuous' ? '🔴' : '🎤'}
            </Animated.Text>
            <Text style={s.mainBtnText}>
              {mode === 'continuous'
                ? '持续翻译中...\n点击停止'
                : '点击开始翻译\n或说"译通"+"开始翻译"'}
            </Text>
          </TouchableOpacity>

          {/* 拍照翻译按钮 */}
          <TouchableOpacity style={s.cameraBtn} onPress={() => setShowCamera(true)}>
            <Text style={s.cameraBtnIcon}>📷</Text>
            <Text style={s.cameraBtnText}>拍照翻译</Text>
          </TouchableOpacity>

          {/* 使用说明 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🎯 语音控制</Text>
            {[
              ['🎤', '说"译通"唤醒我'],
              ['▶️', '说"开始翻译"进入持续翻译'],
              ['⏹️', '说"停"停止翻译'],
              ['🐱', '退出后小动物随机路线跑过屏幕'],
            ].map(([icon, txt], i) => (
              <View key={i} style={s.helpRow}>
                <Text style={s.helpIcon}>{icon}</Text>
                <Text style={s.helpText}>{txt}</Text>
              </View>
            ))}
          </View>

          {/* 实时语音 */}
          {partialText ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>🎤 正在听...</Text>
              <Text style={s.partialText}>{partialText}</Text>
            </View>
          ) : null}

          {/* 翻译结果 */}
          {originalText ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>📝 翻译结果</Text>
              <View style={s.trRow}><Text style={s.trLabel}>原文</Text><Text style={s.trText}>{originalText}</Text></View>
              <View style={s.divider} />
              <View style={s.trRow}><Text style={s.trLabel}>译文</Text><Text style={[s.trText, s.trResult]}>{translatedText}</Text></View>
            </View>
          ) : null}

          {/* 语言 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🌐 语言设置</Text>
            <View style={s.langRow}>
              <TouchableOpacity style={s.langBtn} onPress={() => setShowSourcePicker(true)}>
                <Text style={s.langLabel}>源语言</Text>
                <Text style={s.langValue}>{getLabel(sourceLang)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.swapBtn} onPress={swap}><Text style={s.swapIcon}>⇄</Text></TouchableOpacity>
              <TouchableOpacity style={s.langBtn} onPress={() => setShowTargetPicker(true)}>
                <Text style={s.langLabel}>目标语言</Text>
                <Text style={s.langValue}>{getLabel(targetLang)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 设置 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>⚙️ 设置</Text>
            <View style={s.setRow}>
              <Text style={s.setLabel}>唤醒词监听</Text>
              <Switch value={wakewordOn} onValueChange={v => {
                setWakewordOn(v);
                if (!v) { stopAll(); setStatusText('✨ 唤醒词已关闭'); }
                else setStatusText('🎯 说"译通"唤醒我');
              }} trackColor={{ false: '#333', true: '#4a9eff' }} thumbColor="#fff" />
            </View>
            <View style={s.setRow}>
              <Text style={s.setLabel}>朗读结果</Text>
              <Switch value={speakResult} onValueChange={setSpeakResult}
                trackColor={{ false: '#333', true: '#4a9eff' }} thumbColor="#fff" />
            </View>
          </View>

          {/* 历史 */}
          {history.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>📋 翻译历史</Text>
              {history.slice(0, 5).map(item => (
                <View key={item.id} style={s.histItem}>
                  <Text style={s.histOrig} numberOfLines={1}>{item.original}</Text>
                  <Text style={s.histTrans} numberOfLines={1}>{item.translated}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>

      {renderPicker(showSourcePicker, () => setShowSourcePicker(false), c => setSourceLang(c), false)}
      {renderPicker(showTargetPicker, () => setShowTargetPicker(false), c => setTargetLang(c), true)}
    </SafeAreaView>
  );
}

// ====== 样式 ======
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  main: { flex: 1 },

  // 退出动画
  exitOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  exitWrap: { alignItems: 'center', position: 'absolute', bottom: 100 },
  exitEmoji: { fontSize: 70 },
  exitText: { fontSize: 14, color: '#fff', marginTop: 8, fontWeight: 'bold' },

  // 拍照翻译
  camContainer: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  camPlaceholder: { fontSize: 40, marginBottom: 20 },
  camInfo: { fontSize: 16, color: '#888', marginBottom: 8 },
  camButton: { marginTop: 30, backgroundColor: THEME.accent, borderRadius: 12, padding: 14, paddingHorizontal: 40 },
  camButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },

  // 头部
  header: { paddingTop: Platform.OS === 'android' ? 40 : 20, paddingHorizontal: 20, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spiritIcon: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: THEME.text },
  subtitle: { fontSize: 13, color: THEME.sub, marginTop: 2 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statusText: { fontSize: 14, color: THEME.accent, flex: 1 },
  wakeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(74,255,138,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  wakeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4aff8a', marginRight: 5 },
  wakeBadgeText: { fontSize: 11, color: '#4aff8a', fontWeight: '600' },
  contBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,74,106,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  contDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4a6a', marginRight: 5 },
  contBadgeText: { fontSize: 11, color: '#ff4a6a', fontWeight: '600' },

  scroll: { flex: 1 },
  scrollInner: { padding: 16, gap: 12 },

  // 主按钮
  mainBtn: { backgroundColor: '#222244', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
  mainBtnActive: { borderColor: '#ff4a6a', backgroundColor: '#2a1a2e' },
  mainBtnIcon: { fontSize: 48, marginBottom: 8 },
  mainBtnText: { fontSize: 16, color: THEME.text, textAlign: 'center', lineHeight: 22 },

  // 拍照按钮
  cameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2a1e', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(74,255,138,0.3)', gap: 8 },
  cameraBtnIcon: { fontSize: 24 },
  cameraBtnText: { fontSize: 16, color: '#4aff8a', fontWeight: '600' },

  card: { backgroundColor: THEME.card, borderRadius: 16, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: THEME.text, marginBottom: 12 },
  helpRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  helpIcon: { fontSize: 18 },
  helpText: { fontSize: 14, color: THEME.text },

  trRow: { marginVertical: 3 },
  trLabel: { fontSize: 12, color: THEME.sub, marginBottom: 3 },
  trText: { fontSize: 16, color: THEME.text, lineHeight: 22 },
  trResult: { color: '#4affaa', fontWeight: '500' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 8 },
  partialText: { fontSize: 18, color: '#ffcc4a', fontStyle: 'italic' },

  langRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  langLabel: { fontSize: 12, color: THEME.sub, marginBottom: 4 },
  langValue: { fontSize: 15, color: THEME.text, fontWeight: '500' },
  swapBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.accent, alignItems: 'center', justifyContent: 'center' },
  swapIcon: { fontSize: 20, color: '#fff' },

  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  setLabel: { fontSize: 15, color: THEME.text },

  histItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  histOrig: { fontSize: 14, color: THEME.sub },
  histTrans: { fontSize: 14, color: '#4affaa', marginTop: 2 },

  // 选择器
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  pickerBox: { backgroundColor: THEME.card, borderRadius: 20, width: '85%', maxHeight: '70%', padding: 20 },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', color: THEME.text, marginBottom: 12, textAlign: 'center' },
  pickerList: { maxHeight: 400 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pickerText: { fontSize: 16, color: THEME.text },
  pickerCode: { fontSize: 12, color: THEME.sub },
  pickerClose: { marginTop: 12, alignItems: 'center', padding: 12, backgroundColor: THEME.accent, borderRadius: 10 },
  pickerCloseText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
