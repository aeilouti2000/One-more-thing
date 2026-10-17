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
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("extractText") { uri: String, preferArabic: Boolean ->
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

  private fun decodeBitmap(uri: String): Bitmap {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val (file, temporary) = materialize(context, uri)
    try {
      val decoded = decodeSampled(file.absolutePath)
        ?: throw IllegalArgumentException("Could not read the photo")
      return upright(decoded, file.absolutePath)
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
    stream.use { input ->
      FileOutputStream(out).use { output -> input.copyTo(output) }
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
    while (bounds.outWidth / sample > 1800 || bounds.outHeight / sample > 1800) {
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
      val result = Tasks.await(recognizer.process(image))
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
        context.assets.open("tessdata/$name").use { input ->
          FileOutputStream(out).use { output -> input.copyTo(output) }
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
