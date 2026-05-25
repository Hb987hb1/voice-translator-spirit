package expo.modules.voicetranslator

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class VoiceTranslatorModule : Module(), RecognitionListener {
    private var speech: SpeechRecognizer? = null
    private var isListening = false
    private var wakewordMode = false

    override fun definition() = ModuleDefinition {
        Name("VoiceTranslator")

        Events(
            "onResult",      // 语音识别结果 {text: string, isFinal: boolean}
            "onError",       // 错误 {message: string}
            "onStart",       // 开始监听
            "onEnd",         // 监听结束
            "onVolume",      // 音量变化 {rmsdB: float}
        )

        // 检查麦克风权限
        Function("checkPermission") {
            return@Function hasPermission()
        }

        // 请求权限
        AsyncFunction("requestPermission") { promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "No react context")
                return@AsyncFunction
            }
            val perm = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            if (perm == PackageManager.PERMISSION_GRANTED) {
                promise.resolve(true)
            } else {
                // 使用 Expo 权限 API
                askForPermissions(promise)
            }
        }

        // 开始语音识别
        Function("startListening") { options: Map<String, Any> ->
            val lang = options["language"] as? String ?: "zh-CN"
            val continuous = options["continuous"] as? Boolean ?: false
            val interimResults = options["interimResults"] as? Boolean ?: false
            wakewordMode = options["wakewordMode"] as? Boolean ?: false
            startSpeechRecognition(lang, continuous, interimResults)
        }

        // 停止
        Function("stopListening") {
            stop()
        }
    }

    private fun hasPermission(): Boolean {
        val context = appContext.reactContext ?: return false
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    private fun askForPermissions(promise: Promise) {
        val context = appContext.reactContext ?: run {
            promise.reject("NO_CONTEXT", "No react context")
            return
        }
        
        val permissionsManager = appContext.permissions
        if (permissionsManager != null) {
            permissionsManager.askForPermissions(
                { permissionsMap ->
                    val granted = permissionsMap?.get(Manifest.permission.RECORD_AUDIO)?.status == "granted"
                    promise.resolve(granted)
                },
                Manifest.permission.RECORD_AUDIO
            )
        } else {
            promise.reject("NO_PERM_MANAGER", "Permissions manager not available")
        }
    }

    private fun startSpeechRecognition(language: String, continuous: Boolean, interimResults: Boolean) {
        val context = appContext.reactContext ?: return
        
        if (!hasPermission()) {
            sendEvent("onError", mapOf("message" to "麦克风权限未授予"))
            return
        }

        // 销毁旧的
        speech?.destroy()
        speech = null

        try {
            speech = SpeechRecognizer.createSpeechRecognizer(context)
            speech?.setRecognitionListener(this)

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interimResults)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                // 连续模式：设置超长静默时间
                if (continuous) {
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 600000)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 600000)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 600000)
                }
            }

            isListening = true
            speech?.startListening(intent)
            Log.d("VoiceTranslator", "Speech recognition started. lang=$language continuous=$continuous")
        } catch (e: Exception) {
            Log.e("VoiceTranslator", "Failed to start: ${e.message}")
            sendEvent("onError", mapOf("message" to "启动失败: ${e.message}"))
            isListening = false
        }
    }

    private fun stop() {
        try {
            speech?.stopListening()
        } catch (_: Exception) {}
        try {
            speech?.cancel()
        } catch (_: Exception) {}
        try {
            speech?.destroy()
        } catch (_: Exception) {}
        speech = null
        isListening = false
        sendEvent("onEnd", null)
    }

    override fun onReadyForSpeech(params: Bundle?) {
        sendEvent("onStart", null)
        Log.d("VoiceTranslator", "onReadyForSpeech")
    }

    override fun onBeginningOfSpeech() {
        Log.d("VoiceTranslator", "onBeginningOfSpeech")
    }

    override fun onRmsChanged(rmsdB: Float) {
        sendEvent("onVolume", mapOf("rmsdB" to rmsdB))
    }

    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {
        Log.d("VoiceTranslator", "onEndOfSpeech")
    }

    override fun onError(error: Int) {
        val msg = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "音频错误"
            SpeechRecognizer.ERROR_CLIENT -> "客户端错误"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "权限不足"
            SpeechRecognizer.ERROR_NETWORK -> "网络错误"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "网络超时"
            SpeechRecognizer.ERROR_NO_MATCH -> "未识别到语音"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "识别器正忙"
            SpeechRecognizer.ERROR_SERVER -> "服务器错误"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "语音超时"
            SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "语言不支持"
            SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "语言不可用"
            SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "请求太频繁"
            else -> "未知错误($error)"
        }
        Log.d("VoiceTranslator", "onError: $msg")
        sendEvent("onError", mapOf("message" to msg))
        
        // 如果是"未识别到语音"或"语音超时"，不结束监听
        if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            sendEvent("onEnd", null)
            isListening = false
        }
    }

    override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = if (!matches.isNullOrEmpty()) matches[0] else ""
        Log.d("VoiceTranslator", "onResults: $text")
        sendEvent("onResult", mapOf("text" to text, "isFinal" to true))
        // Android 每次 onResults 后自动结束，发送 end 事件
        sendEvent("onEnd", null)
        isListening = false
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = if (!matches.isNullOrEmpty()) matches[0] else ""
        if (text.isNotEmpty()) {
            sendEvent("onResult", mapOf("text" to text, "isFinal" to false))
        }
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
}
