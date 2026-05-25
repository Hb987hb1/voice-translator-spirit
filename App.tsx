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
// 译通翻译 v2.0
// 功能：唤醒词"译通"、语音命令、持续翻译、退出变动物
// ============================================================

// ---- 语言数据 ----
const LANGUAGES: Record<string, string> = {
  auto: '自动检测',
  'zh-CN': '中文(简体)',
  'zh-TW': '中文(繁体)',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  nl: 'Nederlands',
  pl: 'Polski',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  cs: 'Čeština',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  uk: 'Українська',
  el: 'Ελληνικά',
  he: 'עברית',
  ms: 'Bahasa Melayu',
  tl: 'Filipino',
  sw: 'Kiswahili',
};

const LANGUAGE_CODES = Object.keys(LANGUAGES);

const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];

// 退出后的动物角色
const EXIT_ANIMALS = ['🐱', '🐶', '🐰', '🐧', '🦊', '🐼', '🐹', '🦁'];

// ---- 语音识别 ----
let SpeechRecognition: any = null;
try {
  SpeechRecognition = require('expo-speech-recognition');
} catch {}

// ---- 主题 ----
const THEME = {
  bg: '#1a1a2e',
  card: '#16213e',
  accent: '#4a9eff',
  text: '#dedeff',
  sub: '#8888aa',
  danger: '#ff4a6a',
  success: '#4aff8a',
  warn: '#ffcc4a',
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---- 翻译 ----
async function translateText(
  text: string,
  source: string,
  target: string
): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${
      source === 'auto' ? 'auto' : source
    }&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data[0]) {
      return data[0].map((item: any[]) => item[0]).join('');
    }
    return text;
  } catch {
    return `[待翻译] ${text}`;
  }
}

// ---- 类型 ----
interface TranslationItem {
  id: number;
  original: string;
  translated: string;
  source: string;
  target: string;
  timestamp: number;
}

// ============================================================
// 主组件
// ============================================================
export default function App() {
  // ---- 状态 ----
  const [isListening, setIsListening] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false); // 持续翻译模式
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('✨ 说"译通"唤醒我');
  const [history, setHistory] = useState<TranslationItem[]>([]);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [currentSpirit, setCurrentSpirit] = useState(SPIRITS[0]);
  const [partialText, setPartialText] = useState('');
  const [wakewordActive, setWakewordActive] = useState(true); // 唤醒词监听开关
  const [showExitAnimation, setShowExitAnimation] = useState(false);
  const [exitAnimal, setExitAnimal] = useState('🐱');
  const [exitAnimX, setExitAnimX] = useState(new Animated.Value(0));

  // 引用
  const isListeningRef = useRef(false);
  const isContinuousRef = useRef(false);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const speakResultRef = useRef(speakResult);
  const wakewordActiveRef = useRef(true);

  // 同步 ref
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isContinuousRef.current = isContinuousMode; }, [isContinuousMode]);
  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);
  useEffect(() => { speakResultRef.current = speakResult; }, [speakResult]);
  useEffect(() => { wakewordActiveRef.current = wakewordActive; }, [wakewordActive]);

  // ---- 动画 ----
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listenPulse = useRef(new Animated.Value(1)).current;

  // 脉冲动画
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7, duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    const spiritTimer = setInterval(() => {
      setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]);
    }, 8000);

    return () => { pulse.stop(); clearInterval(spiritTimer); };
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 600, useNativeDriver: true,
    }).start();
  }, []);

  // 监听脉冲（持续模式专用）
  useEffect(() => {
    if (isContinuousMode) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(listenPulse, {
            toValue: 0.5, duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(listenPulse, {
            toValue: 1, duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      listenPulse.setValue(1);
    }
  }, [isContinuousMode]);

  // ---- 退出检测（App 进入后台） ----
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // App 进入后台——显示退出动画
        if (isContinuousRef.current || isListeningRef.current) {
          // 如果正在翻译，先停止
          stopListeningInternal();
        }
        triggerExitAnimation();
      }
    });
    return () => subscription.remove();
  }, []);

  const triggerExitAnimation = useCallback(() => {
    const animal = EXIT_ANIMALS[Math.floor(Math.random() * EXIT_ANIMALS.length)];
    setExitAnimal(animal);
    setShowExitAnimation(true);
    exitAnimX.setValue(-100);

    // 小狗/小猫从左边跑到右边
    Animated.sequence([
      Animated.timing(exitAnimX, {
        toValue: SCREEN_W + 100,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.delay(500),
    ]).start(() => {
      setShowExitAnimation(false);
    });
  }, []);

  // ---- 语音识别 ----
  const stopListeningInternal = useCallback(() => {
    if (SpeechRecognition) {
      try { SpeechRecognition.stopListening(); } catch {}
    }
    setIsListening(false);
    setIsContinuousMode(false);
    setStatusText('⏹️ 已停止');
  }, []);

  const speakTranslated = useCallback((text: string, lang: string) => {
    if (speakResultRef.current && text) {
      Speech.speak(text, {
        language: lang === 'zh-CN' ? 'zh-CN' : lang,
        rate: 0.9,
      });
    }
  }, []);

  const doContinuousTranslation = useCallback(async (text: string) => {
    if (!text.trim() || !isContinuousRef.current) return;

    try {
      const result = await translateText(text, sourceLangRef.current, targetLangRef.current);
      setTranslatedText(result);
      setOriginalText(text);

      // 朗读
      speakTranslated(result, targetLangRef.current);

      // 加到历史
      const item: TranslationItem = {
        id: Date.now(),
        original: text,
        translated: result,
        source: sourceLangRef.current,
        target: targetLangRef.current,
        timestamp: Date.now(),
      };
      setHistory((prev) => [item, ...prev].slice(0, 50));
    } catch {}
  }, [speakTranslated]);

  // ---- 唤醒词监听 ----
  const startWakewordListening = useCallback(async () => {
    if (!SpeechRecognition || !wakewordActiveRef.current) return;

    try {
      const { status } = await SpeechRecognition.requestPermissionsAsync();
      if (status !== 'granted') return;
    } catch {}

    const listenLoop = () => {
      if (!wakewordActiveRef.current || isContinuousRef.current) return;

      SpeechRecognition.startListening({
        lang: 'zh-CN',
        interimResults: false,
        onResult: (result: any) => {
          if (!result.isFinal) return;
          const text = (result.value || '').toLowerCase();

          // 检查唤醒词"译通"
          if (text.includes('译通') || text.includes('一通') || text.includes('意通') || text.includes('易通')) {
            setStatusText('🎯 我在呢！说"开始翻译"');
            // 短震动反馈
            setCurrentSpirit('👋');
            setTimeout(() => {
              setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]);
            }, 1000);
            // 语音回应
            Speech.speak('我在！', { language: 'zh-CN', rate: 1.0 });

            // 等待下一步命令
            listenForCommand();
            return;
          }

          // 持续模式结束后重新唤醒监听
          listenLoop();
        },
        onError: () => {
          setTimeout(listenLoop, 1000);
        },
      });
    };

    const listenForCommand = () => {
      if (!SpeechRecognition) return;
      SpeechRecognition.startListening({
        lang: 'zh-CN',
        interimResults: false,
        onResult: (result: any) => {
          if (!result.isFinal) return;
          const text = (result.value || '').toLowerCase();

          // 命令：开始翻译
          if (text.includes('开始翻译') || text.includes('翻译') || text.includes('开始')) {
            startContinuousTranslation();
            return;
          }
          // 命令：停止
          if (text.includes('停') || text.includes('停止') || text.includes('退出')) {
            setStatusText('⏹️ 已停止');
            if (isContinuousRef.current) {
              stopListeningInternal();
            }
            // 回到唤醒监听
            setTimeout(listenLoop, 500);
            return;
          }
          // 听不懂再听一次
          if (wakewordActiveRef.current) {
            listenForCommand();
          }
        },
        onError: () => {
          setTimeout(listenLoop, 500);
        },
      });
    };

    listenLoop();
  }, []);

  // ---- 持续翻译 ----
  const startContinuousTranslation = useCallback(async () => {
    if (!SpeechRecognition) {
      Alert.alert('提示', '需要语音识别模块');
      return;
    }

    try {
      const { status } = await SpeechRecognition.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请在设置中允许麦克风权限');
        return;
      }
    } catch {}

    setIsContinuousMode(true);
    setIsListening(true);
    setStatusText('🔴 持续翻译中...说"停"停止');

    const doContinuousListen = () => {
      if (!isContinuousRef.current) return;

      SpeechRecognition.startListening({
        lang: sourceLangRef.current === 'auto' ? 'zh-CN' : sourceLangRef.current,
        interimResults: true,
        onResult: (result: any) => {
          if (!isContinuousRef.current) return;

          const text = result.value || '';
          const textLower = text.toLowerCase();

          // 检查停止命令
          if (result.isFinal && (textLower.includes('停') || textLower.includes('停止'))) {
            stopListeningInternal();
            setStatusText('✅ 翻译已停止，说"译通"唤醒我');
            // 重新启动唤醒监听
            setTimeout(startWakewordListening, 300);
            return;
          }

          if (result.isFinal && text.trim()) {
            setOriginalText(text);
            setPartialText('');
            setStatusText('🔍 翻译中...');
            doContinuousTranslation(text);

            // 立即继续监听下一段
            setTimeout(doContinuousListen, 100);
          } else if (!result.isFinal) {
            setPartialText(text);
          }
        },
        onError: (error: any) => {
          if (isContinuousRef.current && error.error !== 'no-match') {
            // 出错后重试
            setTimeout(doContinuousListen, 500);
          }
        },
      });
    };

    doContinuousListen();
  }, [startWakewordListening, doContinuousTranslation, stopListeningInternal]);

  // 启动唤醒词监听
  useEffect(() => {
    if (SpeechRecognition && wakewordActive) {
      const timer = setTimeout(startWakewordListening, 1000);
      return () => clearTimeout(timer);
    }
  }, [wakewordActive, startWakewordListening]);

  // ---- 手动启动翻译 ----
  const toggleListening = useCallback(() => {
    if (isContinuousMode || isListening) {
      stopListeningInternal();
      setStatusText('⏹️ 已停止');
      setTimeout(startWakewordListening, 500);
    } else {
      startContinuousTranslation();
    }
  }, [isContinuousMode, isListening, stopListeningInternal, startContinuousTranslation, startWakewordListening]);

  // ---- 语言互换 ----
  const swapLanguages = useCallback(() => {
    if (sourceLang !== 'auto') {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  }, [sourceLang, targetLang]);

  // ---- 获取语言显示名 ----
  const getLangLabel = (code: string) => LANGUAGES[code] || code;

  // ---- 语言选择器 ----
  const renderLanguagePicker = (
    visible: boolean,
    onClose: () => void,
    onSelect: (code: string) => void,
    excludeAuto: boolean
  ) => {
    if (!visible) return null;
    const codes = excludeAuto
      ? LANGUAGE_CODES.filter((c) => c !== 'auto')
      : LANGUAGE_CODES;

    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>选择语言</Text>
          <ScrollView style={styles.pickerList}>
            {codes.map((code) => (
              <TouchableOpacity
                key={code}
                style={styles.pickerItem}
                onPress={() => { onSelect(code); onClose(); }}>
                <Text style={styles.pickerItemText}>{LANGUAGES[code]}</Text>
                <Text style={styles.pickerItemCode}>{code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
            <Text style={styles.pickerCloseText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ====== 渲染 UI ======
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* 退出动物动画层 */}
      {showExitAnimation && (
        <View style={styles.exitOverlay} pointerEvents="none">
          <Animated.View
            style={[
              styles.exitAnimalWrap,
              { transform: [{ translateX: exitAnimX }] },
            ]}>
            <Text style={styles.exitAnimalText}>{exitAnimal}</Text>
            <Text style={styles.exitLabelText}>译通已退出~</Text>
          </Animated.View>
        </View>
      )}

      <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
        {/* ====== 头部 ====== */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Animated.Text
              style={[
                styles.spiritIcon,
                { opacity: pulseAnim, transform: [{ scale: pulseAnim }] },
              ]}>
              {currentSpirit}
            </Animated.Text>
            <View>
              <Text style={styles.title}>译通翻译</Text>
              <Text style={styles.subtitle}>
                说"译通"唤醒 · 持续翻译 · 语音控制
              </Text>
            </View>
          </View>

          {/* 状态 + 唤醒状态指示 */}
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>{statusText}</Text>
            {wakewordActive && !isContinuousMode && (
              <View style={styles.wakeBadge}>
                <View style={styles.wakeDot} />
                <Text style={styles.wakeBadgeText}>译通待命</Text>
              </View>
            )}
          </View>
        </View>

        {/* ====== 主内容 ====== */}
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}>

          {/* ---- 主按钮 ---- */}
          <TouchableOpacity
            style={[
              styles.startButton,
              isContinuousMode && styles.startButtonActive,
            ]}
            onPress={toggleListening}
            activeOpacity={0.7}>
            <Animated.Text
              style={[
                styles.startButtonIcon,
                isContinuousMode && { opacity: listenPulse },
              ]}>
              {isContinuousMode ? '🔴' : '🎤'}
            </Animated.Text>
            <Text style={styles.startButtonText}>
              {isContinuousMode
                ? '持续翻译中...\n点击停止'
                : '点击开始翻译\n或说"译通"+"开始翻译"'}
            </Text>
          </TouchableOpacity>

          {/* ---- 使用说明 ---- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🎯 语音控制说明</Text>
            <View style={styles.helpItem}>
              <Text style={styles.helpIcon}>🎤</Text>
              <Text style={styles.helpText}>说"译通"唤醒我</Text>
            </View>
            <View style={styles.helpItem}>
              <Text style={styles.helpIcon}>▶️</Text>
              <Text style={styles.helpText}>说"开始翻译"进入持续翻译</Text>
            </View>
            <View style={styles.helpItem}>
              <Text style={styles.helpIcon}>⏹️</Text>
              <Text style={styles.helpText}>说"停"停止翻译</Text>
            </View>
            <View style={styles.helpItem}>
              <Text style={styles.helpIcon}>🐱</Text>
              <Text style={styles.helpText}>退出后小动物在屏幕跑过</Text>
            </View>
          </View>

          {/* ---- 实时语音 ---- */}
          {partialText ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🎤 正在听...</Text>
              <Text style={styles.partialText}>{partialText}</Text>
            </View>
          ) : null}

          {/* ---- 翻译结果 ---- */}
          {originalText ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📝 翻译结果</Text>
              <View style={styles.translateRow}>
                <Text style={styles.translateLabel}>原文</Text>
                <Text style={styles.translateText}>{originalText}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.translateRow}>
                <Text style={styles.translateLabel}>译文</Text>
                <Text style={[styles.translateText, styles.translatedText]}>
                  {translatedText}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ---- 语言设置 ---- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌐 语言设置</Text>
            <View style={styles.langRow}>
              <TouchableOpacity
                style={styles.langSelector}
                onPress={() => setShowSourcePicker(true)}>
                <Text style={styles.langLabel}>源语言</Text>
                <Text style={styles.langValue}>{getLangLabel(sourceLang)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.swapButton} onPress={swapLanguages}>
                <Text style={styles.swapIcon}>⇄</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.langSelector}
                onPress={() => setShowTargetPicker(true)}>
                <Text style={styles.langLabel}>目标语言</Text>
                <Text style={styles.langValue}>{getLangLabel(targetLang)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ---- 设置 ---- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚙️ 设置</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>唤醒词监听</Text>
              <Switch
                value={wakewordActive}
                onValueChange={(v) => {
                  setWakewordActive(v);
                  if (!v) setStatusText('✨ 唤醒词已关闭');
                  else setStatusText('🎯 说"译通"唤醒我');
                }}
                trackColor={{ false: '#333', true: '#4a9eff' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>朗读结果</Text>
              <Switch
                value={speakResult}
                onValueChange={setSpeakResult}
                trackColor={{ false: '#333', true: '#4a9eff' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* ---- 翻译历史 ---- */}
          {history.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📋 翻译历史</Text>
              {history.slice(0, 5).map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <Text style={styles.historyOriginal} numberOfLines={1}>
                    {item.original}
                  </Text>
                  <Text style={styles.historyTranslated} numberOfLines={1}>
                    {item.translated}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>

      {/* 语言选择器 */}
      {renderLanguagePicker(
        showSourcePicker,
        () => setShowSourcePicker(false),
        (code) => setSourceLang(code),
        false
      )}
      {renderLanguagePicker(
        showTargetPicker,
        () => setShowTargetPicker(false),
        (code) => setTargetLang(code),
        true
      )}
    </SafeAreaView>
  );
}

// ====== 样式 ======
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  mainContent: { flex: 1 },

  // 退出动画
  exitOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  exitAnimalWrap: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 100,
  },
  exitAnimalText: { fontSize: 80 },
  exitLabelText: {
    fontSize: 14,
    color: '#fff',
    marginTop: 8,
    fontWeight: 'bold',
  },

  // 头部
  header: {
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spiritIcon: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: THEME.text },
  subtitle: { fontSize: 13, color: THEME.sub, marginTop: 2 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: { fontSize: 14, color: THEME.accent, flex: 1 },
  wakeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74,255,138,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wakeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4aff8a',
    marginRight: 5,
  },
  wakeBadgeText: { fontSize: 11, color: '#4aff8a', fontWeight: '600' },

  // 滚动内容
  scrollContent: { flex: 1 },
  scrollInner: { padding: 16, gap: 12 },

  // 启动按钮
  startButton: {
    backgroundColor: '#222244',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.3)',
  },
  startButtonActive: {
    borderColor: '#ff4a6a',
    backgroundColor: '#2a1a2e',
  },
  startButtonIcon: { fontSize: 48, marginBottom: 8 },
  startButtonText: {
    fontSize: 16,
    color: THEME.text,
    textAlign: 'center',
    lineHeight: 22,
  },

  // 帮助
  card: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.text,
    marginBottom: 12,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  helpIcon: { fontSize: 18 },
  helpText: { fontSize: 14, color: THEME.text },

  // 翻译结果
  translateRow: { marginVertical: 4 },
  translateLabel: { fontSize: 12, color: THEME.sub, marginBottom: 4 },
  translateText: { fontSize: 16, color: THEME.text, lineHeight: 22 },
  translatedText: { color: '#4affaa', fontWeight: '500' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
  },
  partialText: { fontSize: 18, color: '#ffcc4a', fontStyle: 'italic' },

  // 语言选择
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langSelector: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
  },
  langLabel: { fontSize: 12, color: THEME.sub, marginBottom: 4 },
  langValue: { fontSize: 15, color: THEME.text, fontWeight: '500' },
  swapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapIcon: { fontSize: 20, color: '#fff' },

  // 设置
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: { fontSize: 15, color: THEME.text },

  // 历史
  historyItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyOriginal: { fontSize: 14, color: THEME.sub },
  historyTranslated: {
    fontSize: 14,
    color: '#4affaa',
    marginTop: 2,
  },

  // 语言选择器
  pickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  pickerContainer: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerList: { maxHeight: 400 },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pickerItemText: { fontSize: 16, color: THEME.text },
  pickerItemCode: { fontSize: 12, color: THEME.sub },
  pickerClose: {
    marginTop: 12,
    alignItems: 'center',
    padding: 12,
    backgroundColor: THEME.accent,
    borderRadius: 10,
  },
  pickerCloseText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
