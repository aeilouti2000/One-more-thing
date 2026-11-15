package expo.modules.receiptocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    // Reading a receipt takes seconds. As a coroutine on a background
    // dispatcher it doesn't hold up the queue every other Expo module's calls
    // (haptics, storage, the photo picker) wait on.
    AsyncFunction("extractText") Coroutine { uri: String, preferArabic: Boolean ->
      withContext(Dispatchers.Default) {
        val bitmap = decodeBitmap(uri)
        try {
          if (preferArabic) {
            val arabic = readWithTesseract(bitmap)
            if (arabic.isNotEmpty()) arabic else readWithMlKit(bitmap)
          } else {
            val latin = readWithMlKit(bitmap)
            if (priceCount(latin) >= 2) latin else {
              val arabic = readWithTesseract(bitmap)
              if (priceCount(arabic) > priceCount(latin)) arabic else latin.ifEmpty { arabic }
            }
          }
        } finally {
          bitmap.recycle()
        }
      }
    }
  }

  private fun decodeBitmap(uri: String): Bitmap {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val (file, temporary) = materialize(context, uri)
    try {
      val decoded = decodeSampled(file.absolutePath)
        ?: throw IllegalArgumentException("Could not read the photo")
      return try {
        upright(decoded, file.absolutePath)
      } catch (error: Throwable) {
        // Don't leave the full photo in memory when turning it upright fails.
        if (!decoded.isRecycled) decoded.recycle()
        throw error
      }
    } finally {
      if (temporary) file.delete()
    }
  }

  private fun materialize(context: android.content.Context, uri: String): Pair<File, Boolean> {
    val parsed = Uri.parse(uri)
    val scheme = parsed.scheme
    if (scheme == null || scheme == "file") {
      val path = if (scheme == null) uri else parsed.path ?: uri.removePrefix("file://")
      val file = File(path)
      if (file.exists() && file.length() > 0L) return file to false
    }
    val out = File(context.cacheDir, "receipt-ocr-${System.currentTimeMillis()}.img")
    val stream = context.contentResolver.openInputStream(parsed)
      ?: throw IllegalArgumentException("Could not read the photo")
    try {
      stream.use { input ->
        FileOutputStream(out).use { output -> input.copyTo(output) }
      }
    } catch (error: Throwable) {
      out.delete()
      throw error
    }
    if (!out.exists() || out.length() == 0L) {
      out.delete()
      throw IllegalArgumentException("Could not read the photo")
    }
    return out to true
  }

  private fun decodeSampled(path: String): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sample = 1
    // Halve only while the result stays at least 1800 px on its long side;
    // upright() does the exact scale down. Going one step further (4000 px
    // down to 1000) left the text too small to read.
    val longSide = max(bounds.outWidth, bounds.outHeight)
    while (longSide / (sample * 2) >= 1800) {
      sample *= 2
    }
    val opts = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return BitmapFactory.decodeFile(path, opts)
  }

  private fun upright(source: Bitmap, path: String?): Bitmap {
    val rotation = path?.let { orientationDegrees(it) } ?: 0
    val maxSide = max(source.width, source.height).toFloat()
    val scale = if (maxSide > 1800f) 1800f / maxSide else 1f
    val argb = if (source.config == Bitmap.Config.ARGB_8888) source else {
      source.copy(Bitmap.Config.ARGB_8888, false).also { source.recycle() }
    }
    if (rotation == 0 && scale == 1f) return argb
    val matrix = Matrix()
    if (rotation != 0) matrix.postRotate(rotation.toFloat())
    if (scale != 1f) matrix.postScale(scale, scale)
    return Bitmap.createBitmap(argb, 0, 0, argb.width, argb.height, matrix, true).also {
      if (it != argb) argb.recycle()
    }
  }

  private fun orientationDegrees(path: String): Int {
    val exif = ExifInterface(path)
    return when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
  }

  private fun readWithMlKit(bitmap: Bitmap): List<String> {
    val image = InputImage.fromBitmap(bitmap, 0)
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    return try {
      val result = Tasks.await(recognizer.process(image), 30, TimeUnit.SECONDS)
      result.text.lines().map { it.trim() }.filter { it.isNotEmpty() }
    } catch (_: Throwable) {
      emptyList()
    } finally {
      recognizer.close()
    }
  }

  private fun readWithTesseract(bitmap: Bitmap): List<String> {
    val context = appContext.reactContext ?: return emptyList()
    val api = try {
      TessBaseAPI()
    } catch (_: Throwable) {
      return emptyList()
    }
    return try {
      val dataPath = prepareTessdata(context)
      if (!api.init(dataPath, "ara+eng")) return emptyList()
      api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
      api.setImage(bitmap)
      api.getUTF8Text()?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
    } catch (_: Throwable) {
      emptyList()
    } finally {
      api.recycle()
    }
  }

  private fun prepareTessdata(context: android.content.Context): String {
    synchronized(prepareLock) {
      val root = File(context.filesDir, "receipt-ocr")
      val tess = File(root, "tessdata")
      if (!tess.exists()) tess.mkdirs()
      for (name in listOf("eng.traineddata", "ara.traineddata")) {
        val out = File(tess, name)
        if (out.exists() && out.length() > 0L) continue
        // Copy beside it, then rename: a copy cut short (app closed mid-way)
        // must never be mistaken for the finished file.
        val partial = File(tess, "$name.tmp")
        context.assets.open("tessdata/$name").use { input ->
          FileOutputStream(partial).use { output -> input.copyTo(output) }
        }
        if (!partial.renameTo(out)) {
          partial.delete()
          throw IllegalStateException("Could not prepare $name")
        }
      }
      return root.absolutePath + "/"
    }
  }

  private fun priceCount(lines: List<String>): Int {
    return lines.count { PRICE.containsMatchIn(it) }
  }

  companion object {
    private val prepareLock = Any()
    private val PRICE = Regex("""\d+[.,]\d{2,3}""")
  }
}
