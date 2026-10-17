import ExpoModulesCore
import UIKit
import Vision

public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("extractText") { (uri: String, preferArabic: Bool) -> [String] in
      let url = receiptFileURL(uri)
      let data = try Data(contentsOf: url)
      guard let image = UIImage(data: data), let cgImage = image.cgImage else {
        throw ReceiptReadError()
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      let languages = recognitionLanguages(preferArabic: preferArabic)
      if !languages.isEmpty {
        request.recognitionLanguages = languages
      }

      let orientation = CGImagePropertyOrientation(image.imageOrientation)
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
      do {
        try handler.perform([request])
      } catch {
        request.recognitionLanguages = ["en-US"]
        try handler.perform([request])
      }

      let observations = request.results ?? []
      return observations
        .sorted { $0.boundingBox.midY > $1.boundingBox.midY }
        .compactMap { $0.topCandidates(1).first?.string }
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    }
  }
}

private struct ReceiptReadError: Error, LocalizedError {
  var errorDescription: String? { "Could not read the receipt photo" }
}

private func receiptFileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.isFileURL {
    return url
  }
  let path = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
  return URL(fileURLWithPath: path)
}

private func recognitionLanguages(preferArabic: Bool) -> [String] {
  let supported = (try? VNRecognizeTextRequest.supportedRecognitionLanguages(
    for: .accurate,
    revision: VNRecognizeTextRequest.currentRevision
  )) ?? []
  func first(_ codes: [String]) -> String? {
    codes.first { supported.contains($0) }
  }
  let arabic = first(["ar-SA", "ar"])
  let english = first(["en-US", "en-GB", "en"])
  let ordered = preferArabic ? [arabic, english] : [english, arabic]
  return ordered.compactMap { $0 }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up:
      self = .up
    case .down:
      self = .down
    case .left:
      self = .left
    case .right:
      self = .right
    case .upMirrored:
      self = .upMirrored
    case .downMirrored:
      self = .downMirrored
    case .leftMirrored:
      self = .leftMirrored
    case .rightMirrored:
      self = .rightMirrored
    @unknown default:
      self = .up
    }
  }
}
