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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';

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
const LANGUAGE_VALUES = Object.values(LANGUAGES);

const SPIRITS = ['🌸', '✨', '🌟', '🦋', '🍀', '🌙', '⭐', '💫', '🌈', '🕊️'];

// ---- 语音识别 Handler（抽象层） ----
// 在真机上可以用 expo-speech-recognition，
// 目前先用模拟数据展示 UI
let SpeechRecognition: any = null;
try {
  SpeechRecognition = require('expo-speech-recognition');
} catch {}

// ---- 主题颜色 ----
const THEME = {
  bg: '#1a1a2e',
  card: '#16213e',
  accent: '#4a9eff',
  text: '#dedeff',
  sub: '#8888aa',
  danger: '#ff4a6a',
  success: '#4aff8a',
};

// ---- 翻译引擎 ----
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
    // 离线时返回原文
    return `[待翻译] ${text}`;
  }
}

// ---- 类型定义 ----
interface TranslationItem {
  id: number;
  original: string;
  translated: string;
  source: string;
  target: string;
  timestamp: number;
}

// ====== 主组件 ======
export default function App() {
  // ---- 状态 ----
  const [isListening, setIsListening] = useState(false);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [statusText, setStatusText] = useState('✨ 点击启动开始翻译');
  const [history, setHistory] = useState<TranslationItem[]>([]);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [speakResult, setSpeakResult] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [currentSpirit, setCurrentSpirit] = useState(SPIRITS[0]);
  const [spiritVisible, setSpiritVisible] = useState(true);
  const [partialText, setPartialText] = useState('');

  // ---- 动画 ----
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spiritOpacity = useRef(new Animated.Value(1)).current;

  // 小精灵脉冲动画
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // 定期换精灵
    const spiritTimer = setInterval(() => {
      setCurrentSpirit(SPIRITS[Math.floor(Math.random() * SPIRITS.length)]);
    }, 8000);

    return () => {
      pulse.stop();
      clearInterval(spiritTimer);
    };
  }, []);

  // 进场动画
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // ---- 语音识别 ----
  const startListening = useCallback(async () => {
    if (!SpeechRecognition) {
      // 模拟模式（开发/Web 时）
      setIsListening(true);
      setStatusText('🎤 正在聆听...');
      return;
    }

    try {
      const { status } =
        await SpeechRecognition.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请在设置中允许麦克风权限');
        return;
      }

      setIsListening(true);
      setStatusText('🎤 正在聆听...');

      SpeechRecognition.startListening({
        lang: sourceLang === 'auto' ? 'zh-CN' : sourceLang,
        interimResults: true,
        onResult: (result: any) => {
          if (result.isFinal) {
            const text = result.value;
            setOriginalText(text);
            setPartialText('');
            setIsListening(false);
            setStatusText('🔍 正在翻译...');
            doTranslate(text);
          } else {
            setPartialText(result.value);
          }
        },
        onError: (error: any) => {
          setIsListening(false);
          setStatusText(`❌ 识别错误: ${error.error}`);
        },
      });
    } catch (error) {
      setIsListening(false);
      setStatusText('❌ 启动失败');
    }
  }, [sourceLang]);

  const stopListening = useCallback(() => {
    if (SpeechRecognition) {
      try {
        SpeechRecognition.stopListening();
      } catch {}
    }
    setIsListening(false);
    setStatusText('⏹️ 已停止');
  }, []);

  // ---- 翻译 ----
  const doTranslate = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setStatusText('✨ 点击启动开始翻译');
        return;
      }

      try {
        const result = await translateText(text, sourceLang, targetLang);
        setTranslatedText(result);
        setStatusText('✅ 翻译完成');

        // 添加到历史
        const item: TranslationItem = {
          id: Date.now(),
          original: text,
          translated: result,
          source: sourceLang,
          target: targetLang,
          timestamp: Date.now(),
        };
        setHistory((prev) => [item, ...prev].slice(0, 50));

        // TTS 朗读
        if (speakResult && result && result !== text) {
          Speech.speak(result, {
            language: targetLang === 'zh-CN' ? 'zh-CN' : targetLang,
            rate: 0.9,
          });
        }
      } catch (error) {
        setStatusText('❌ 翻译失败');
      }
    },
    [sourceLang, targetLang, speakResult]
  );

  // ---- 切换监听 ----
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // ---- 语言互换 ----
  const swapLanguages = useCallback(() => {
    if (sourceLang !== 'auto') {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  }, [sourceLang, targetLang]);

  // ---- 模拟语音输入（开发时用） ----
  const simulateVoiceInput = useCallback(() => {
    if (isListening) return;

    const sampleTexts = [
      '你好，今天天气怎么样？',
      'I love traveling to Japan.',
      'Bonjour, comment allez-vous?',
      '这家餐厅的菜很好吃。',
      'Can you help me find the nearest subway station?',
    ];

    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    setOriginalText(text);
    setStatusText('🔍 正在翻译...');
    setIsListening(true);
    setTimeout(() => {
      setIsListening(false);
      doTranslate(text);
    }, 1500);
  }, [isListening, doTranslate]);

  // ---- 获取语言显示名 ----
  const getLangLabel = (code: string) => LANGUAGES[code] || code;

  // ---- 语言选择器弹窗 ----
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
                onPress={() => {
                  onSelect(code);
                  onClose();
                }}>
                <Text style={styles.pickerItemText}>
                  {LANGUAGES[code]}
                </Text>
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

      {/* 背景装饰 */}
      <View style={styles.bgDecorator} />

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
              <Text style={styles.title}>语音翻译小精灵</Text>
              <Text style={styles.subtitle}>
                实时翻译 · 全语言 · 语音播报
              </Text>
            </View>
          </View>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        {/* ====== 主内容区 ====== */}
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}>
          {/* ---- 启动按钮 ---- */}
          <TouchableOpacity
            style={[
              styles.startButton,
              isListening && styles.startButtonActive,
            ]}
            onPress={toggleListening}
            onLongPress={simulateVoiceInput}
            activeOpacity={0.7}>
            <Animated.Text
              style={[
                styles.startButtonIcon,
                isListening && { opacity: pulseAnim },
              ]}>
              {isListening ? '🔴' : '🎤'}
            </Animated.Text>
            <Text style={styles.startButtonText}>
              {isListening
                ? '正在聆听...\n点击停止'
                : '点击启动翻译\n长按模拟语音输入'}
            </Text>
          </TouchableOpacity>

          {/* ---- 实时语音转写 ---- */}
          {partialText ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🎤 实时语音</Text>
              <Text style={styles.partialText}>{partialText}</Text>
            </View>
          ) : null}

          {/* ---- 翻译结果显示 ---- */}
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
                <Text style={styles.langValue}>
                  {getLangLabel(sourceLang)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.swapButton}
                onPress={swapLanguages}>
                <Text style={styles.swapIcon}>⇄</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.langSelector}
                onPress={() => setShowTargetPicker(true)}>
                <Text style={styles.langLabel}>目标语言</Text>
                <Text style={styles.langValue}>
                  {getLangLabel(targetLang)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ---- 设置 ---- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚙️ 设置</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>自动翻译</Text>
              <Switch
                value={autoTranslate}
                onValueChange={setAutoTranslate}
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

      {/* 语言选择器弹窗 */}
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
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  bgDecorator: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(74, 158, 255, 0.05)',
  },
  mainContent: {
    flex: 1,
  },

  // 头部
  header: {
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spiritIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.text,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.sub,
    marginTop: 2,
  },
  statusText: {
    fontSize: 14,
    color: THEME.accent,
    marginTop: 8,
  },

  // 滚动内容
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    gap: 12,
  },

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
  startButtonIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  startButtonText: {
    fontSize: 16,
    color: THEME.text,
    textAlign: 'center',
    lineHeight: 22,
  },

  // 卡片
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

  // 翻译结果
  translateRow: {
    marginVertical: 4,
  },
  translateLabel: {
    fontSize: 12,
    color: THEME.sub,
    marginBottom: 4,
  },
  translateText: {
    fontSize: 16,
    color: THEME.text,
    lineHeight: 22,
  },
  translatedText: {
    color: '#4affaa',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
  },
  partialText: {
    fontSize: 18,
    color: '#ffcc4a',
    fontStyle: 'italic',
  },

  // 语言选择
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langSelector: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
  },
  langLabel: {
    fontSize: 12,
    color: THEME.sub,
    marginBottom: 4,
  },
  langValue: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '500',
  },
  swapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapIcon: {
    fontSize: 20,
    color: '#fff',
  },

  // 设置
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 15,
    color: THEME.text,
  },

  // 翻译历史
  historyItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyOriginal: {
    fontSize: 14,
    color: THEME.sub,
  },
  historyTranslated: {
    fontSize: 14,
    color: '#4affaa',
    marginTop: 2,
  },

  // 语言选择器弹窗
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pickerItemText: {
    fontSize: 16,
    color: THEME.text,
  },
  pickerItemCode: {
    fontSize: 12,
    color: THEME.sub,
  },
  pickerClose: {
    marginTop: 12,
    alignItems: 'center',
    padding: 12,
    backgroundColor: THEME.accent,
    borderRadius: 10,
  },
  pickerCloseText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
