package com.novelbuilder.flutter

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * The app, with one thing of its own: LISTEN (`lib/features/write/listen.dart`) reads a chapter aloud with the device's
 * own text-to-speech engine, over the channel `novel_builder/speech`:
 *
 * - `available` → whether an engine is there and ready;
 * - `speak {text, rate}` → an id for what is being said (null when it cannot be said); `done(id)` is sent back when it
 *   has been said (or could not be);
 * - `stop` → silence. What was being said is not reported as done.
 *
 * The text is spoken and nothing else: it is not kept, sent or changed.
 */
class MainActivity : FlutterActivity() {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var channel: MethodChannel? = null
    private var said = 0
    private val waiting = mutableListOf<(Boolean) -> Unit>()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val speech = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "novel_builder/speech")
        channel = speech
        speech.setMethodCallHandler { call, result ->
            when (call.method) {
                "available" -> whenReady { ok -> result.success(ok) }
                "speak" -> {
                    val text = call.argument<String>("text") ?: ""
                    val rate = call.argument<Double>("rate") ?: 1.0
                    whenReady { ok ->
                        val engine = tts
                        if (!ok || engine == null) {
                            result.success(null)
                        } else {
                            engine.setSpeechRate(rate.toFloat())
                            val id = "a-${++said}"
                            val r = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
                            result.success(if (r == TextToSpeech.SUCCESS) id else null)
                        }
                    }
                }
                "stop" -> {
                    tts?.stop()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    /** Starts the engine the first time it is wanted, then answers everyone waiting for it. */
    private fun whenReady(then: (Boolean) -> Unit) {
        if (tts != null && ready) return then(true)
        waiting.add(then)
        if (tts != null) return
        tts = TextToSpeech(this) { status ->
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}

                    override fun onDone(utteranceId: String?) {
                        runOnUiThread { channel?.invokeMethod("done", utteranceId) }
                    }

                    @Deprecated("Kept for the engines that still call it.")
                    override fun onError(utteranceId: String?) {
                        runOnUiThread { channel?.invokeMethod("done", utteranceId) }
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        runOnUiThread { channel?.invokeMethod("done", utteranceId) }
                    }
                })
            } else {
                tts?.shutdown()
                tts = null
            }
            val answer = waiting.toList()
            waiting.clear()
            answer.forEach { it(ready) }
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.onDestroy()
    }
}
