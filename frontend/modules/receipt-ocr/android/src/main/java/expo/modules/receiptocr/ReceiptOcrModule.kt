package expo.modules.receiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.arabic.ArabicTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("extractText") { uri: String, preferArabic: Boolean ->
      val context = appContext.reactContext ?: throw IllegalStateException("No React context")
      val parsed = when {
        uri.startsWith("content://") || uri.startsWith("file://") -> Uri.parse(uri)
        else -> Uri.fromFile(File(uri))
      }
      val image = InputImage.fromFilePath(context, parsed)
      val primary = if (preferArabic) arabicRecognizer() else latinRecognizer()
      val secondary = if (preferArabic) latinRecognizer() else arabicRecognizer()
      val first = runCatching { recognize(primary, image) }.getOrElse { emptyList() }
      if (first.isNotEmpty()) first else runCatching { recognize(secondary, image) }.getOrDefault(emptyList())
    }
  }

  private fun latinRecognizer() = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  private fun arabicRecognizer() =
    TextRecognition.getClient(ArabicTextRecognizerOptions.Builder().build())

  private suspend fun recognize(recognizer: TextRecognizer, image: InputImage): List<String> =
    try {
      suspendCancellableCoroutine { continuation ->
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val lines = result.textBlocks.flatMap { block -> block.lines.map { it.text } }
            continuation.resume(lines)
          }
          .addOnFailureListener { error ->
            if (continuation.isActive) continuation.resumeWithException(error)
          }
      }
    } finally {
      recognizer.close()
    }
}
