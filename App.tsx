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
// expo-speech-recognition 56.0.0 Web Speech API 兼容模式
import { ExpoWebSpeechRecognition } from 'expo-speech-recognition';

// ============================================================
// 译通翻译 v2.2 — 全面修复版
//
// 【Android 语音识别核心机制】
// Android SpeechRecognizer 每次 onResults() 后自动 teardownAndEnd()
// 所以 continuous:true 的效果是：每句话识别完→触发 end→我们重新 start()
// 这是正常行为，不是 bug
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
  } catch { return `[待翻译] ${text}`; }
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
  const [mode, setMode] = useState<'idle' | 'wakeword' | 'cmd_listen' | 'continuous'>('idle');
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
  const [exitAnimKey, setExitAnimKey] = useState(0);

  // 退出动画值
  const exitX = useRef(new Animated.Value(-200)).current;
  const exitY = useRef(new Animated.Value(SCREEN_H * 0.5)).current;

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

  // 自动休眠定时器引用
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 重置自动休眠定时器（连续模式下每收到结果就重置）
  const resetSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    // 45秒无语音自动休眠
    sleepTimerRef.current = setTimeout(() => {
      if (modeRef.current === 'continuous') {
        stopAllAndGoIdle('😴 长时间无语音，自动休眠');
      }
    }, 45000);
  }, []);

  // ---- 动画 ----
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contPulseAnim = useRef(new Animated.Value(1)).current;

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
        Animated.timing(contPulseAnim, { toValue: 0.3, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(contPulseAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    } else { contPulseAnim.setValue(1); }
  }, [mode]);

  // ---- 退出动画：整个动物从右往左直线跑过（不是一闪一闪） ----
  const runExitAnimation = useCallback(() => {
    const animal = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setExitAnimal(animal);
    setExitAnimKey(k => k + 1);

    // 随机起始位置（上中下随机）
    const startY = 80 + Math.random() * (SCREEN_H - 250);
    const startX = SCREEN_W + 50;

    exitX.setValue(startX);
    exitY.setValue(startY);

    setShowExitAnim(true);

    // 整个动物从右往左直线跑到屏幕外
    // 随机速度：2~4秒跑完
    const duration = 2000 + Math.random() * 2000;

    Animated.timing(exitX, {
      toValue: -150,
      duration: duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      // 跑完后停留一会，然后消失
      setTimeout(() => setShowExitAnim(false), 500);
    });
  }, []);

  // ---- AppState：按 Home 挂后台就显示动物跑 ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // 不管是否在翻译，挂后台就跑动物
        stopAllInternal();
        runExitAnimation();
      }
    });
    return () => sub.remove();
  }, []);

  // ---- 停止所有并回到待命 ----
  const stopAllAndGoIdle = useCallback((msg?: string) => {
    // 清除所有语音识别
    if (wakeRec.current) { try { wakeRec.current.abort(); } catch {} wakeRec.current = null; }
    if (cmdRec.current) { try { cmdRec.current.abort(); } catch {} cmdRec.current = null; }
    if (contRec.current) { try { contRec.current.abort(); } catch {} contRec.current = null; }
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setMode('idle');
    setPartialText('');
    setStatusText(msg || '🎯 说"译通"唤醒我');
    // 自动重启唤醒监听
    setTimeout(() => { if (wakeRef.current && modeRef.current === 'idle') startWakewordListen(); }, 300);
  }, []);

  const stopAllInternal = useCallback(() => {
    if (wakeRec.current) { try { wakeRec.current.abort(); } catch {} wakeRec.current = null; }
    if (cmdRec.current) { try { cmdRec.current.abort(); } catch {} cmdRec.current = null; }
    if (contRec.current) { try { contRec.current.abort(); } catch {} contRec.current = null; }
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setMode('idle');
    setPartialText('');
  }, []);

  // ---- 语音识别器引用 ----
  const wakeRec = useRef<ExpoWebSpeechRecognition | null>(null);
  const cmdRec = useRef<ExpoWebSpeechRecognition | null>(null);
  const contRec = useRef<ExpoWebSpeechRecognition | null>(null);

  // ====== 1. 唤醒词监听（"译通"） ======
  // Android 端每次 onResults 后自动结束→触发 onend→我们重新 start()
  const startWakewordListen = useCallback(() => {
    if (!wakeRef.current || modeRef.current !== 'idle') return;
    try {
      const sr = new ExpoWebSpeechRecognition();
      sr.lang = 'zh-CN';
      sr.continuous = true;
      sr.interimResults = false;
      wakeRec.current = sr;

      sr.onresult = (event: any) => {
        if (!event?.results?.[0]) return;
        const result = event.results[0];
        const text = result[0]?.transcript?.toLowerCase() || '';

        // 唤醒词检测
        if (text.includes('译通') || text.includes('一通') || text.includes('意通')) {
          Vibration.vibrate(100);
          setCurrentSpirit('👋');
          setTimeout(() => setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]), 1500);

          // 语音回应
          Speech.speak('我在！', { language: 'zh-CN', rate: 0.9 });

          setStatusText('🎯 我在！说"开始翻译"');
          // 切换到命令监听模式
          try { wakeRec.current?.abort(); wakeRec.current = null; } catch {}
          setMode('cmd_listen');
          startCmdListen();
        }
      };

      sr.onerror = () => {
        // 重新启动唤醒
        wakeRec.current = null;
        if (wakeRef.current && modeRef.current === 'idle') {
          setTimeout(startWakewordListen, 1000);
        }
      };

      sr.onend = () => {
        // Android: onResults 后自动 end，如果是 idle 模式就重启
        if (wakeRef.current && modeRef.current === 'idle') {
          wakeRec.current = null;
          setTimeout(startWakewordListen, 100);
        }
      };

      sr.start();
    } catch {
      setTimeout(startWakewordListen, 2000);
    }
  }, []);

  // ====== 2. 命令监听（等"开始翻译"） ======
  const startCmdListen = useCallback(() => {
    try {
      const sr = new ExpoWebSpeechRecognition();
      sr.lang = 'zh-CN';
      sr.continuous = false;
      sr.interimResults = false;
      cmdRec.current = sr;

      sr.onresult = (event: any) => {
        if (!event?.results?.[0]) return;
        const result = event.results[0];
        const text = result[0]?.transcript?.toLowerCase() || '';

        if (text.includes('开始翻译') || text.includes('翻译') || text.includes('开始')) {
          try { sr.abort(); } catch {}
          cmdRec.current = null;
          startContinuousTranslate();
          return;
        }
        if (text.includes('停') || text.includes('停止')) {
          stopAllAndGoIdle('⏹️ 已停止');
          return;
        }
      };

      sr.onerror = () => {
        cmdRec.current = null;
        // 出错回到唤醒
        stopAllAndGoIdle('🎯 说"译通"唤醒我');
      };

      sr.onend = () => {
        cmdRec.current = null;
        // 自然结束但还没收到命令，回到唤醒
        if (modeRef.current === 'cmd_listen') {
          stopAllAndGoIdle('🎯 说"译通"唤醒我');
        }
      };

      sr.start();
    } catch {
      stopAllAndGoIdle('🎯 说"译通"唤醒我');
    }
  }, []);

  // ====== 3. 持续翻译模式 ======
  const startContinuousTranslate = useCallback(() => {
    setMode('continuous');
    setStatusText('🔴 持续翻译中...说"停"停止');
    resetSleepTimer();

    const doListen = () => {
      if (modeRef.current !== 'continuous') return;

      try {
        const sr = new ExpoWebSpeechRecognition();
        sr.lang = langRef.current === 'auto' ? 'zh-CN' : langRef.current;
        sr.continuous = true;
        sr.interimResults = true;
        contRec.current = sr;

        sr.onresult = (event: any) => {
          if (!event?.results?.length || modeRef.current !== 'continuous') return;

          // 取最后一个结果
          const lastIdx = event.results.length - 1;
          const result = event.results[lastIdx];
          const text = result[0]?.transcript || '';
          const isFinal = result.isFinal;

          // 检查停止命令（实时检查，包括 partial 结果）
          const lower = (text || '').toLowerCase();
          if (lower.includes('停') || lower.includes('停止') || lower.trim() === '停' || lower.trim() === '停止') {
            stopAllAndGoIdle('✅ 翻译已停止，说"译通"唤醒我');
            return;
          }

          if (isFinal && text.trim()) {
            resetSleepTimer();
            setOriginalText(text);
            setPartialText('');
            setStatusText('🔍 翻译中...');

            translateText(text, langRef.current, targetRef.current).then((tResult) => {
              if (modeRef.current !== 'continuous') return;
              setTranslatedText(tResult);
              setStatusText('🔴 翻译完成，继续聆听...');

              if (speakRef.current && tResult && tResult !== text) {
                Speech.speak(tResult, {
                  language: targetRef.current === 'zh-CN' ? 'zh-CN' : targetRef.current,
                  rate: 0.9,
                });
              }
              const item: TranslationItem = {
                id: Date.now(), original: text, translated: tResult,
                source: langRef.current, target: targetRef.current, timestamp: Date.now(),
              };
              setHistory(prev => [item, ...prev].slice(0, 50));
            });
          } else if (!isFinal && text.trim()) {
            setPartialText(text);
          }
        };

        sr.onerror = () => {
          contRec.current = null;
          if (modeRef.current === 'continuous') {
            // 出错后重启
            setTimeout(doListen, 500);
          }
        };

        sr.onend = () => {
          contRec.current = null;
          // Android: onResults 后自动 teardownAndEnd → onend
          // 如果是 continuous 模式就立即重启
          if (modeRef.current === 'continuous') {
            setTimeout(doListen, 100);
          }
        };

        sr.start();
      } catch {
        contRec.current = null;
        if (modeRef.current === 'continuous') {
          setTimeout(doListen, 1000);
        }
      }
    };

    doListen();
  }, [resetSleepTimer, stopAllAndGoIdle]);

  // ---- 启动唤醒监听 ----
  useEffect(() => {
    if (wakewordOn && mode === 'idle') {
      const t = setTimeout(startWakewordListen, 800);
      return () => { clearTimeout(t); if (wakeRec.current) { try { wakeRec.current.abort(); } catch {} wakeRec.current = null; } };
    }
  }, [wakewordOn, mode, startWakewordListen]);

  // ---- 按钮切换 ----
  const toggleTranslate = useCallback(() => {
    if (mode === 'continuous') {
      stopAllAndGoIdle('⏹️ 已停止');
    } else {
      startContinuousTranslate();
    }
  }, [mode, stopAllAndGoIdle, startContinuousTranslate]);

  // ---- 语言 ----
  const swap = useCallback(() => {
    if (sourceLang !== 'auto') { setSourceLang(targetLang); setTargetLang(sourceLang); }
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

      {/* 退出动物动画 — 整个动物从右往左直线跑过 */}
      {showExitAnim && (
        <View style={s.exitOverlay} pointerEvents="none" key={exitAnimKey}>
          <Animated.View style={[s.exitWrap, { transform: [{ translateX: exitX }, { translateY: exitY }] }]}>
            <Text style={s.exitEmoji}>{exitAnimal}</Text>
          </Animated.View>
        </View>
      )}

      {/* 拍照翻译 — 功能入口（expo-camera 已安装） */}
      {/* 后续可以扩展为完整拍照→OCR→翻译 */}

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
                <Animated.View style={[s.contDot, { opacity: contPulseAnim }]} />
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
            <Animated.Text style={[s.mainBtnIcon, mode === 'continuous' && { opacity: contPulseAnim }]}>
              {mode === 'continuous' ? '🔴' : '🎤'}
            </Animated.Text>
            <Text style={s.mainBtnText}>
              {mode === 'continuous'
                ? '持续翻译中...\n点击停止\n说"停"也可停止'
                : '点击开始翻译\n或说"译通"+"开始翻译"'}
            </Text>
          </TouchableOpacity>

          {/* 使用说明 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🎯 语音控制说明</Text>
            {[
              ['🎤', '说"译通"唤醒我'],
              ['▶️', '说"开始翻译"进入持续翻译'],
              ['⏹️', '说"停"停止翻译'],
              ['😴', '45秒无语音自动休眠'],
              ['🐱', '挂后台/退出→小动物从右往左跑过'],
            ].map(([icon, txt], i) => (
              <View key={i} style={s.helpRow}><Text style={s.helpIcon}>{icon}</Text><Text style={s.helpText}>{txt}</Text></View>
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
                if (!v) { stopAllInternal(); setStatusText('✨ 唤醒词已关闭'); }
                else { setStatusText('🎯 说"译通"唤醒我'); setTimeout(startWakewordListen, 300); }
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

  // 退出动画 — 整个动物身体，从右往左直线跑过
  exitOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999 },
  exitWrap: { position: 'absolute' },
  exitEmoji: { fontSize: 72 },

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

  mainBtn: { backgroundColor: '#222244', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,158,255,0.3)' },
  mainBtnActive: { borderColor: '#ff4a6a', backgroundColor: '#2a1a2e' },
  mainBtnIcon: { fontSize: 48, marginBottom: 8 },
  mainBtnText: { fontSize: 16, color: THEME.text, textAlign: 'center', lineHeight: 22 },

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
